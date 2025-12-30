import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado (ESM)"))
    .catch(err => console.error("❌ Error de conexión:", err));

// --- MODELOS DE DATOS ---
const ItemSchema = new mongoose.Schema({
    qrCode: { type: String, unique: true },
    name: { type: String, required: true, uppercase: true },
    category: { type: String, default: 'General' },
    stock: { type: Number, default: 0 },
    history: [{
        action: String,
        quantity: Number,
        user: String,
        timestamp: { type: Date, default: Date.now }
    }]
});
const Item = mongoose.model('Item', ItemSchema);

const TransactionSchema = new mongoose.Schema({
    cantidad: Number,
    itemName: { type: String, uppercase: true },
    persona: String,
    tipo: String, // 'ingreso' o 'salida'
    timestamp: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    password: { type: String, required: true }, 
    role: { type: String, default: 'Operario' }
});
const User = mongoose.model('User', UserSchema);

// --- CONTROL DE DUPLICADOS ---
let lastRequest = { time: 0, body: "" };

// --- RUTAS ---

// 1. LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { name, password } = req.body;
        const user = await User.findOne({ name: name.trim(), password: password });
        if (user) {
            res.json({ success: true, user: { name: user.name, role: user.role } });
        } else {
            res.status(401).json({ success: false, message: "Nombre o PIN incorrectos" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. TRANSACCIONES (Auto-registro integrado)
app.post('/api/transactions', async (req, res) => {
    const currentReq = JSON.stringify(req.body);
    const now = Date.now();
    
    if (currentReq === lastRequest.body && (now - lastRequest.time) < 2000) {
        return res.status(200).json({ success: true, message: "Duplicado ignorado" });
    }
    lastRequest = { time: now, body: currentReq };

    try {
        const { cantidad, itemName, persona, tipo } = req.body;
        const nombreLimpio = itemName.trim().toUpperCase();
        const numCantidad = parseInt(cantidad) || 0;

        let item = await Item.findOne({ name: nombreLimpio });
        
        if (!item) {
            item = new Item({
                name: nombreLimpio,
                qrCode: `QR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                stock: 0,
                category: 'Nuevo'
            });
        }

        const factor = (tipo === 'ingreso') ? numCantidad : -numCantidad;
        item.stock += factor;
        item.history.push({
            action: tipo,
            quantity: numCantidad,
            user: persona || 'Admin',
            timestamp: new Date()
        });

        await item.save();

        const newTx = new Transaction({
            cantidad: numCantidad,
            itemName: nombreLimpio,
            persona: persona || 'Admin',
            tipo: tipo,
            timestamp: new Date()
        });
        await newTx.save();

        res.status(201).json({ success: true, item });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. INVENTARIO
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/items/:id', async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. ATAJOS Y CHAT
app.get('/api/frequent-data', async (req, res) => {
    try {
        const items = await Item.find().sort({ _id: -1 }).limit(15).select('name');
        const recentTxs = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        const people = [...new Set(recentTxs.map(t => t.persona))].slice(0, 10);
        res.json({ items, people });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/frequent-data/item/:name', async (req, res) => {
    try { res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/transactions', async (req, res) => {
    try {
        const txs = await Transaction.find().sort({ timestamp: -1 }).limit(30);
        res.json(txs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- LANZAMIENTO ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ESM activo en puerto ${PORT}`);
});