import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT) || 5001;
const HOST = '0.0.0.0';

// ---------------------------------------------------------------------
// 1. MIDDLEWARE
// ---------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------
// 2. MODELOS DE BASE DE DATOS
// ---------------------------------------------------------------------

// Modelo de Trabajadores
const workerSchema = new mongoose.Schema({
    qrCode: { type: String, required: true, unique: true }, 
    name: { type: String, required: true },
    lastName: { type: String, required: true },
    dni: { type: String, required: true },
    phone: { type: Number }, 
    email: { type: String }, // CORREGIDO: era {type: email}
    password: { type: String, default: '1234' },
    role: { 
        type: String, 
        enum: ['SuperAdmin', 'Almacenero', 'Calderero', 'Maniobrista', 'Residente', 'Prevencionista', 'Soldador', 'Operario'], 
        default: 'Operario' 
    }, 
    attendance: [{
        action: { type: String, enum: ['IN', 'OUT'] },
        timestamp: { type: Date, default: Date.now },
        notes: String
    }]
}, { timestamps: true });
const Worker = mongoose.model('Worker', workerSchema);

// Modelo de Ítems (QR)
const itemSchema = new mongoose.Schema({
    qrCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, default: 'Sin descripción' },
    status: {
        type: String,
        enum: ['new', 'available', 'borrowed', 'repair'],
        default: 'new'
    },
    currentHolder: { type: String, default: null },
    loanDate: { type: Date, default: null },
    registeredBy: String,
    isConsumible: { type: Boolean, default: false }, 
    stock: { type: Number, default: 1 }
}, { timestamps: true });
const Item = mongoose.model('Item', itemSchema);

// Modelo de Historial (QR)
const historySchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    action: { type: String, enum: ['borrow', 'return', 'register', 'repair', 'consumption'], required: true },
    person: { type: String, required: true },
    validatedBy: { type: String, default: 'Sistema' },
    quantity: { type: Number, default: 1 },
    notes: { type: String, default: '' },
}, { timestamps: true });
const History = mongoose.model('History', historySchema);

// Modelos para el Chat (Compatibilidad)
const Transaction = mongoose.model('Transaction', new mongoose.Schema({
    cantidad: Number,
    itemName: String,
    persona: String,
    tipo: String, 
    timestamp: String
}));

const Inventory = mongoose.model('Inventory', new mongoose.Schema({
    name: { type: String, unique: true },
    stock: Number
}));

// ---------------------------------------------------------------------
// 3. FUNCIONES UTILITARIAS
// ---------------------------------------------------------------------
const getNextQrCode = async () => {
    const lastItem = await Item.findOne({ qrCode: /^G\d+$/ }).sort({ createdAt: -1 });
    let nextNumber = 1;
    if (lastItem && lastItem.qrCode) {
        const numberMatch = lastItem.qrCode.match(/\d+/);
        if (numberMatch) nextNumber = parseInt(numberMatch[0], 10) + 1;
    }
    return 'G' + String(nextNumber).padStart(3, '0');
};

// ---------------------------------------------------------------------
// 4. RUTAS DEL CHAT Y DATOS FRECUENTES (Resuelve el 404)
// ---------------------------------------------------------------------

// Obtener datos para los botones del Chat
app.get('/api/frequent-data', async (req, res) => {
    try {
        // Sacamos los items más usados de la tabla Transaction (lo que escribes en el chat)
        const items = await Transaction.distinct('itemName');
        const people = await Transaction.distinct('persona');

        // Limitamos a los últimos 10 para no llenar la pantalla
        res.json({
            items: items.slice(-10).map(name => ({ name })), 
            people: people.slice(-10)
        });
    } catch (error) {
        res.json({ items: [], people: [] });
    }
});

// Obtener historial del Chat
app.get('/api/transactions', async (req, res) => {
  try {
    // 1. Buscamos las últimas 30 transacciones
    // 2. Usamos sort({ createdAt: 1 }) para que la más vieja sea la [0] y la más nueva la última
    const transactions = await Transaction.find().sort({ _id: 1 }).limit(50);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

// Guardar desde el Chat
app.post('/api/transactions', async (req, res) => {
  try {
    const { cantidad, itemName, persona, tipo, timestamp } = req.body;
    const nombreLimpio = itemName.trim().toUpperCase();

    // 1. Guardamos en la tabla de transacciones del chat
    const newTx = new Transaction({ 
        cantidad, itemName: nombreLimpio, persona, tipo, timestamp 
    });
    await newTx.save();

    // 2. ACTUALIZACIÓN DE STOCK CON AUTO-CREACIÓN (Upsert)
    // Buscamos en la colección 'Item' (la del inventario general)
    const factor = tipo === 'ingreso' ? cantidad : -cantidad;
    
    const item = await Item.findOneAndUpdate(
      { name: nombreLimpio },
      { 
        $inc: { stock: factor },
        $setOnInsert: { 
          qrCode: `V-${Math.random().toString(36).substr(2, 5).toUpperCase()}`, // QR genérico para items de voz
          category: 'General',
          isConsumible: true,
          status: 'available'
        }
      },
      { upsert: true, new: true } // Si no existe, lo crea.
    );

    // 3. Registrar en Historial para los reportes
    await new History({
        itemId: item._id,
        action: tipo === 'ingreso' ? 'register' : 'consumption',
        person: persona,
        quantity: cantidad,
        notes: "Registro automático vía Chat"
    }).save();

    res.status(201).json(newTx);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en sincronización" });
  }
});

// ---------------------------------------------------------------------
// 5. RUTAS DE INVENTARIO QR
// ---------------------------------------------------------------------

app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/items', async (req, res) => {
    try {
        const { name, category, description, registeredBy, isConsumible, stock } = req.body;
        const qrCode = await getNextQrCode();
        const newItem = new Item({
            qrCode, name, category, description, status: 'available',
            registeredBy, isConsumible, stock: isConsumible ? parseInt(stock) : 1 
        });
        await newItem.save();
        res.json({ message: 'Item registrado', item: newItem, qrCode });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/items/:id', async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Item eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------------------------------------------------------------------
// 6. TRABAJADORES Y ASISTENCIA
// ---------------------------------------------------------------------

app.post('/api/login', async (req, res) => {
    try {
        const { name, password } = req.body;
        const worker = await Worker.findOne({ name });
        if (!worker || worker.password !== password) {
            return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        }
        res.json({ success: true, user: { id: worker._id, name: worker.name, role: worker.role } });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/workers', async (req, res) => {
    try {
        const workers = await Worker.find();
        res.json(workers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/workers/register', async (req, res) => {
    try {
        const { name, lastName, dni, phone, email, password, role } = req.body; 
        const qrCode = `W-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
        const newWorker = new Worker({ qrCode, name, lastName, dni, phone, email, password, role });
        await newWorker.save();
        res.json({ success: true, worker: newWorker });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---------------------------------------------------------------------
// 7. CONEXIÓN Y SALUD
// ---------------------------------------------------------------------
app.get('/health', (req, res) => res.json({ status: 'OK' }));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB Atlas'))
    .catch(err => console.error('❌ Error MongoDB:', err));

app.listen(PORT, HOST, () => {
    console.log(`🔊 Servidor escuchando en http://${HOST}:${PORT}`);
});