import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT) || 5001;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------
// MODELOS (Esquemas integrados para evitar errores de importación)
// ---------------------------------------------------------------------

const workerSchema = new mongoose.Schema({
    qrCode: { type: String, required: true, unique: true }, 
    name: { type: String, required: true },
    lastName: { type: String, required: true },
    dni: { type: String, required: true, unique: true },
    phone: { type: Number }, 
    email: { type: String },
    password: { type: String, default: '1234' },
    role: { 
        type: String, 
        enum: ['SuperAdmin', 'Admin', 'Almacenero', 'Calderero', 'Maniobrista', 'Residente', 'Prevencionista', 'Soldador', 'Operario'], 
        default: 'Operario' 
    },
    tarifaPactada: { type: Number, default: 0 },
    permissions: {
        canEditTarifa: { type: Boolean, default: false },
        canEditRoles: { type: Boolean, default: false },
        canDeleteItems: { type: Boolean, default: false },
        canManageUsers: { type: Boolean, default: false }
    },
    attendance: [{
        action: { type: String, enum: ['IN', 'OUT'] },
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

const Worker = mongoose.model('Worker', workerSchema);

const itemSchema = new mongoose.Schema({
    qrCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, default: 'Sin descripción' },
    status: { type: String, enum: ['new', 'available', 'borrowed', 'repair'], default: 'new' },
    currentHolder: { type: String, default: null },
    stock: { type: Number, default: 1 },
    isConsumible: { type: Boolean, default: false },
    // El historial interno permite que el Chat analice movimientos
    history: [{
        action: String,
        quantity: Number,
        user: String,
        timestamp: { type: Date, default: Date.now },
        notes: String
    }]
}, { timestamps: true });

const Item = mongoose.model('Item', itemSchema);

// Modelos auxiliares para registros rápidos y analítica
const History = mongoose.model('History', new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    action: String,
    person: String,
    quantity: Number,
    notes: String
}, { timestamps: true }));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
    cantidad: Number, 
    itemName: String, 
    persona: String, 
    tipo: String, 
    timestamp: String
}));

// ---------------------------------------------------------------------
// UTILITARIOS
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
// RUTAS DE INVENTARIO Y CHAT
// ---------------------------------------------------------------------

// El Chat llama a esta ruta para "aprender" qué ha pasado
app.get('/api/transactions', async (req, res) => {
    try {
        const items = await Item.find();
        let allHistory = [];

        items.forEach(item => {
            if (item.history && item.history.length > 0) {
                item.history.forEach(h => {
                    allHistory.push({
                        item: item.name,
                        qrCode: item.qrCode,
                        action: h.action,
                        quantity: h.quantity,
                        user: h.user || 'Sistema',
                        createdAt: h.timestamp || h.date
                    });
                });
            }
        });

        allHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(allHistory.slice(0, 50));
    } catch (err) {
        res.status(500).json({ error: "Error en historial", details: err.message });
    }
});

// Registrar transacciones desde el Chat IA
app.post('/api/transactions', async (req, res) => {
    try {
        const { cantidad, itemName, persona, tipo, timestamp } = req.body;
        const nombreLimpio = itemName.trim().toUpperCase();
        
        const newTx = new Transaction({ cantidad, itemName: nombreLimpio, persona, tipo, timestamp });
        await newTx.save();

        const factor = tipo === 'ingreso' ? cantidad : -cantidad;
        const item = await Item.findOneAndUpdate(
            { name: nombreLimpio },
            { 
                $inc: { stock: factor }, 
                $push: { history: { action: tipo, quantity: cantidad, user: persona, notes: "Vía Chat" } },
                $setOnInsert: { qrCode: `E-${Math.random().toString(36).substr(2, 5).toUpperCase()}`, category: 'General', isConsumible: true, status: 'available' } 
            },
            { upsert: true, new: true }
        );

        res.status(201).json(newTx);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/items', async (req, res) => {
    const items = await Item.find().sort({ name: 1 });
    res.json(items);
});

app.post('/api/items', async (req, res) => {
    try {
        const { name, category, description, registeredBy, isConsumible, stock } = req.body;
        const qrCode = await getNextQrCode();
        const newItem = new Item({ 
            qrCode, name, category, description, registeredBy, 
            isConsumible, stock: isConsumible ? parseInt(stock) : 1,
            history: [{ action: 'register', quantity: stock, user: registeredBy, notes: 'Registro inicial' }]
        });
        await newItem.save();
        res.json({ item: newItem });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ---------------------------------------------------------------------
// RUTAS DE USUARIOS Y ASISTENCIA
// ---------------------------------------------------------------------

app.post('/api/login', async (req, res) => {
    const { name, password } = req.body;
    try {
        const worker = await Worker.findOne({ name });
        if (!worker || worker.password !== password) {
            return res.status(401).json({ success: false, message: "Credenciales inválidas" });
        }
        res.json({ success: true, user: worker });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/workers', async (req, res) => {
    const workers = await Worker.find().sort({ name: 1 });
    res.json(workers);
});

app.post('/api/workers/register', async (req, res) => {
    try {
        const { name, lastName, dni, phone, email, password, role } = req.body;
        const qrCode = `W-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
        const newWorker = new Worker({ qrCode, name, lastName, dni, phone, email, password, role });
        await newWorker.save();
        res.json({ success: true, worker: newWorker });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/attendance/scan', async (req, res) => {
    const { qrCode, notes } = req.body;
    try {
        const worker = await Worker.findOne({ qrCode });
        if (!worker) return res.status(404).json({ message: "Trabajador no encontrado" });

        const lastRecord = worker.attendance[worker.attendance.length - 1];
        const action = (!lastRecord || lastRecord.action === 'OUT') ? 'IN' : 'OUT';

        worker.attendance.push({ action, timestamp: new Date() });
        await worker.save();

        const diasAsistidos = worker.attendance.filter(a => a.action === 'IN').length;
        const totalAcu = diasAsistidos * (worker.tarifaPactada || 0);

        res.json({ 
            success: true, 
            message: `${action === 'IN' ? 'Entrada' : 'Salida'} registrada`,
            workerName: worker.name,
            totalAcumulado: totalAcu
        });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Ruta para sugerencias rápidas en el Chat
app.get('/api/frequent-data', async (req, res) => {
    try {
        // Obtenemos los últimos 100 registros de la colección Transaction
        const recentTxs = await Transaction.find().sort({ _id: -1 }).limit(100);
        
        // Extraemos nombres únicos de items y personas
        const items = [...new Set(recentTxs.map(t => t.itemName))].slice(0, 10);
        const people = [...new Set(recentTxs.map(t => t.persona))].slice(0, 10);
        
        res.json({ 
            items: items.map(name => ({ name })), 
            people 
        });
    } catch (error) {
        // Si no hay transacciones aún, devolvemos listas vacías para que el Front no falle
        res.json({ items: [], people: [] });
    }
});

// ---------------------------------------------------------------------
// CONEXIÓN Y ARRANQUE
// ---------------------------------------------------------------------
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Base de datos conectada con éxito');
        app.listen(PORT, HOST, () => console.log(`🔊 Servidor corriendo en http://${HOST}:${PORT}`));
    })
    .catch(err => console.error('❌ Error de conexión:', err));