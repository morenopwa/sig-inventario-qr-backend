import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import inventoryRoutes from './routes/inventory.js';
import salaryRoutes from './routes/salary.js';
import userRoutes from './routes/users.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/inventory', inventoryRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/users', userRoutes);
// --- CONEXIÓN A MONGODB ---

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ Servidor Modular Conectado"))
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
    tipo: String, 
    timestamp: { type: Date, default: Date.now }
    
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    password: { type: String, required: true }, 
    role: { type: String, default: 'Operario' },
    sueldoBase: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

// --- MIDDLEWARE DE AUTENTICACIÓN (SIMPLIFICADO PARA ESTA ETAPA) ---
// Si necesitas JWT estricto, aquí deberías validar el token. 
// Por ahora, dejamos la función para que no de error el código.
const authenticateJWT = (req, res, next) => {
    // Lógica de validación de token aquí
    next(); 
};

// --- VARIABLE PARA EVITAR DUPLICADOS ---
let lastRequest = { time: 0, body: "" };




// --- RUTA DE TRANSACCIONES (CON AUTO-REGISTRO Y ANTI-DUPLICADOS) ---

app.post('/api/transactions', async (req, res) => {
    const currentReq = JSON.stringify(req.body);
    const now = Date.now();
    
    if (currentReq === lastRequest.body && (now - lastRequest.time) < 2000) {
        return res.status(200).json({ success: true, message: "Duplicado bloqueado" });
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
                qrCode: `QR-${Date.now()}`,
                stock: 0,
                category: 'General'
            });
        }

        const factor = (tipo === 'ingreso' || tipo === 'entrada') ? numCantidad : -numCantidad;
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
            tipo,
            timestamp: new Date()
        });
        await newTx.save();

        res.status(201).json({ success: true, item });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RUTAS DE INVENTARIO ---

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

// --- RUTAS DE CHAT Y DATOS FRECUENTES ---

app.get('/api/frequent-data', async (req, res) => {
    try {
        const items = await Item.find().sort({ _id: -1 }).limit(15).select('name');
        const recentTxs = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        const people = [...new Set(recentTxs.map(t => t.persona))].slice(0, 10);
        res.json({ items, people });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/transactions', async (req, res) => {
    try {
        const txs = await Transaction.find().sort({ timestamp: -1 }).limit(30);
        res.json(txs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ruta de cortesía para el inicio
app.get('/', (req, res) => {

    res.send('🚀 Servidor de Inventario QR - Estado: ONLINE');

});

// --- LANZAMIENTO ---

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor activo en puerto ${PORT}`);
});

