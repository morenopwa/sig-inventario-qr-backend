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
// MODELOS
// ---------------------------------------------------------------------

const workerSchema = new mongoose.Schema({
    qrCode: { type: String, required: true, unique: true }, 
    name: { type: String, required: true },
    lastName: { type: String, required: true },
    dni: { type: String, required: true, unique: true },
    phone: { type: Number }, 
    email: { type: String },
    password: { type: String, default: '1234' },
    photo: { type: String, default: '' },
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
    loanDate: { type: Date, default: null },
    registeredBy: String,
    isConsumible: { type: Boolean, default: false }, 
    stock: { type: Number, default: 1 }
}, { timestamps: true });

const Item = mongoose.model('Item', itemSchema);

const History = mongoose.model('History', new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    action: { type: String, enum: ['borrow', 'return', 'register', 'repair', 'consumption'], required: true },
    person: { type: String, required: true },
    validatedBy: { type: String, default: 'Sistema' },
    quantity: { type: Number, default: 1 },
    notes: { type: String, default: '' },
}, { timestamps: true }));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
    cantidad: Number, itemName: String, persona: String, tipo: String, timestamp: String
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
// RUTAS DE SUPERADMIN (Permisos Granulares)
// ---------------------------------------------------------------------

app.put('/api/superadmin/toggle-permission', async (req, res) => {
    const { userId, permissionKey, newValue } = req.body;
    try {
        const updateField = {};
        updateField[`permissions.${permissionKey}`] = newValue;
        await Worker.findByIdAndUpdate(userId, { $set: updateField });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/superadmin/change-role', async (req, res) => {
    const { userId, newRole } = req.body;
    try {
        await Worker.findByIdAndUpdate(userId, { role: newRole });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ---------------------------------------------------------------------
// RUTAS ORIGINALES REINTEGRADAS
// ---------------------------------------------------------------------

app.get('/api/frequent-data', async (req, res) => {
    try {
        const recentTxs = await Transaction.find().sort({ _id: -1 }).limit(100);
        const items = [...new Set(recentTxs.map(t => t.itemName))].slice(0, 10);
        const people = [...new Set(recentTxs.map(t => t.persona))].slice(0, 10);
        res.json({ items: items.map(name => ({ name })), people });
    } catch (error) { res.status(500).json({ items: [], people: [] }); }
});

app.get('/api/transactions', async (req, res) => {
    try {
        // Buscamos en la colección de Items todos los historiales
        const items = await Item.find();
        let allTransactions = [];

        items.forEach(item => {
            item.history.forEach(h => {
                allTransactions.push({
                    item: item.name,
                    qrCode: item.qrCode,
                    action: h.action, // 'IN', 'OUT', 'REGISTER'
                    quantity: h.quantity,
                    user: h.user || 'Almacén',
                    date: h.timestamp,
                    notes: h.notes
                });
            });
        });

        // Ordenar por fecha (la más reciente primero)
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(allTransactions);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener transacciones", error });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { cantidad, itemName, persona, tipo, timestamp } = req.body;
        const nombreLimpio = itemName.trim().toUpperCase();
        const newTx = new Transaction({ cantidad, itemName: nombreLimpio, persona, tipo, timestamp });
        await newTx.save();

        const factor = tipo === 'ingreso' ? cantidad : -cantidad;
        const item = await Item.findOneAndUpdate(
            { name: nombreLimpio },
            { $inc: { stock: factor }, $setOnInsert: { qrCode: `E-${Math.random().toString(36).substr(2, 5).toUpperCase()}`, category: 'General', isConsumible: true, status: 'available' } },
            { upsert: true, new: true }
        );

        await new History({ itemId: item._id, action: tipo === 'ingreso' ? 'register' : 'consumption', person: persona, quantity: cantidad, notes: "Vía Chat" }).save();
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
        const newItem = new Item({ qrCode, name, category, description, registeredBy, isConsumible, stock: isConsumible ? parseInt(stock) : 1 });
        await newItem.save();
        res.json({ item: newItem });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/login', async (req, res) => {
    const { name, password } = req.body;
    const worker = await Worker.findOne({ name });
    if (!worker || worker.password !== password) return res.status(401).json({ success: false });
    res.json({ success: true, user: worker });
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

        // Determinar si es IN o OUT basado en el último registro
        const lastRecord = worker.attendance[worker.attendance.length - 1];
        const action = (!lastRecord || lastRecord.action === 'OUT') ? 'IN' : 'OUT';

        // Guardar asistencia
        worker.attendance.push({ action, timestamp: new Date(), notes });
        await worker.save();

        // Calcular sueldo acumulado proyectado
        const diasAsistidos = worker.attendance.filter(a => a.action === 'IN').length;
        const totalAcu = diasAsistidos * worker.tarifaPactada;

        res.json({ 
            success: true, 
            message: `${action === 'IN' ? 'Entrada' : 'Salida'} registrada para ${worker.name}`,
            workerName: worker.name,
            totalAcumulado: totalAcu
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------------------------------------------------------------------
// CONEXIÓN
// ---------------------------------------------------------------------
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado'))
    .catch(err => console.error('❌ Error:', err));

app.listen(PORT, HOST, () => console.log(`🔊 Escuchando en puerto ${PORT}`));