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
    phone: { type: String }, 
    email: { type: String },
    password: { type: String, default: '1234' },
    role: { 
        type: String, 
        enum: ['SuperAdmin', 'Admin', 'Almacenero', 'Calderero', 'Maniobrista', 'Residente', 'Prevencionista', 'Soldador', 'Operario', 'Maestro'], 
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
    history: [{
        action: String,
        quantity: Number,
        user: String,
        timestamp: { type: Date, default: Date.now },
        notes: String
    }]
}, { timestamps: true });

const Item = mongoose.model('Item', itemSchema);

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
// RUTAS SUPERADMIN & GESTIÓN USUARIOS
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

app.delete('/api/users/:id', async (req, res) => {
    try {
        await Worker.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ---------------------------------------------------------------------
// RUTAS INVENTARIO & CHAT
// ---------------------------------------------------------------------

app.get('/api/frequent-data', async (req, res) => {
    try {
        const recentTxs = await Transaction.find().sort({ _id: -1 }).limit(100);
        const items = [...new Set(recentTxs.map(t => t.itemName))].slice(0, 10);
        const people = [...new Set(recentTxs.map(t => t.persona))].slice(0, 10);
        res.json({ items: items.map(name => ({ name })), people });
    } catch (error) { res.json({ items: [], people: [] }); }
});

app.get('/api/transactions', async (req, res) => {
    try {
        // Traemos todos los items para sacar su historial interno
        const items = await Item.find();
        let allHistory = [];

        items.forEach(item => {
            if (item.history && item.history.length > 0) {
                item.history.forEach(h => {
                    allHistory.push({
                        _id: h._id,
                        itemName: item.name,        // Antes era 'item'
                        qrCode: item.qrCode,
                        tipo: h.action,             // Antes era 'action'
                        cantidad: h.quantity,       // Antes era 'quantity'
                        persona: h.user || 'Sistema', // Antes era 'user'
                        timestamp: h.timestamp || h.createdAt
                    });
                });
            }
        });

        // También traemos la colección Transaction (por si hay registros directos)
        const directTxs = await Transaction.find().limit(50);
        directTxs.forEach(t => {
            allHistory.push({
                _id: t._id,
                itemName: t.itemName,
                qrCode: 'N/A',
                tipo: t.tipo,
                cantidad: t.cantidad,
                persona: t.persona,
                timestamp: t.timestamp
            });
        });

        // Ordenar por fecha (más reciente primero)
        allHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(allHistory.slice(0, 100)); // Enviamos los últimos 100
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { cantidad, itemName, persona, tipo } = req.body;
        const nombreLimpio = itemName.trim().toUpperCase();
        const numCantidad = parseInt(cantidad) || 0;

        // 1. Intentar buscar el ítem en el inventario
        let item = await Item.findOne({ name: nombreLimpio });

        // 2. SI NO EXISTE, LO CREAMOS AUTOMÁTICAMENTE
        if (!item) {
            console.log(`✨ Creando nuevo ítem: ${nombreLimpio}`);
            item = new Item({
                name: nombreLimpio,
                category: "General", // Categoría por defecto
                stock: 0,           // Empezamos en 0 para luego sumar/restar
                qrCode: `QR-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
                history: []
            });
            await item.save();
        }

        // 3. Definir el factor (Ingreso suma, Salida resta)
        const factor = (tipo.toLowerCase() === 'ingreso' || tipo.toLowerCase() === 'entrada') 
            ? numCantidad 
            : -numCantidad;

        // 4. Actualizar el ítem (Stock e Historial)
        item.stock += factor;
        item.history.push({
            action: tipo,
            quantity: numCantidad,
            user: persona,
            timestamp: new Date(),
            notes: "Registro automático vía transacción"
        });

        await item.save();

        // 5. Guardar el log en la colección de Transacciones global
        const newTx = new Transaction({ 
            cantidad: numCantidad, 
            itemName: nombreLimpio, 
            persona, 
            tipo, 
            timestamp: new Date() 
        });
        await newTx.save();

        res.status(201).json({ 
            success: true, 
            message: item.isNew ? "Ítem creado y stock actualizado" : "Stock actualizado",
            item 
        });

    } catch (err) {
        console.error("🔴 Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/items', async (req, res) => {
    const items = await Item.find().sort({ name: 1 });
    res.json(items);
});

app.post('/api/items', async (req, res) => {
    try {
        const { name, category, stock } = req.body;
        
        // Buscamos si ya existe (para evitar duplicados)
        let item = await Item.findOne({ name: name.toUpperCase() });
        
        if (item) {
            return res.status(400).json({ error: "Este elemento ya existe en el inventario." });
        }

        // Si no existe, lo CREAMOS
        const newItem = new Item({
            name: name.toUpperCase(),
            category: category || 'General',
            stock: parseInt(stock) || 0,
            qrCode: `QR-${Date.now()}`, // Generar un código temporal
            history: [{
                action: 'registro',
                quantity: stock,
                user: 'Admin',
                timestamp: new Date()
            }]
        });

        await newItem.save();
        res.status(201).json({ success: true, item: newItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------
// RUTAS LOGIN & PERSONAL
// ---------------------------------------------------------------------

app.post('/api/login', async (req, res) => {
    const { name, password } = req.body;
    try {
        const worker = await Worker.findOne({ name });
        if (!worker || worker.password !== password) return res.status(401).json({ success: false });
        res.json({ success: true, user: worker });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/workers', async (req, res) => {
    const workers = await Worker.find().sort({ name: 1 });
    res.json(workers);
});

app.post('/api/workers/register', async (req, res) => {
    try {
        const qrCode = `W-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
        const newWorker = new Worker({ ...req.body, qrCode });
        await newWorker.save();
        res.json({ success: true, worker: newWorker });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/attendance/scan', async (req, res) => {
    try {
        const worker = await Worker.findOne({ qrCode: req.body.qrCode });
        if (!worker) return res.status(404).json({ message: "No encontrado" });
        const last = worker.attendance[worker.attendance.length - 1];
        const action = (!last || last.action === 'OUT') ? 'IN' : 'OUT';
        worker.attendance.push({ action, timestamp: new Date() });
        await worker.save();
        res.json({ success: true, message: `${action} registrada`, workerName: worker.name });
    } catch (error) { res.status(500).json({ error: error.message }); }
});


// Ruta para eliminar un ÍTEM del inventario
app.delete('/api/items/:id', async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Ítem eliminado" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



// ---------------------------------------------------------------------
// CONEXIÓN
// ---------------------------------------------------------------------
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Base de datos conectada');
        app.listen(PORT, HOST, () => console.log(`🔊 Puerto ${PORT}`));
    })
    .catch(err => console.error('❌ Error:', err));