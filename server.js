import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// 1. IMPORTACIONES ÚNICAS (Sin duplicados)
import inventoryRoutes from './routes/inventory.js';
import salaryRoutes from './routes/salary.js';
import userRoutes from './routes/users.js';
import Transaction from './models/Transaction.js';
import Item from './models/Item.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// 2. CONEXIÓN A DB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ DB Conectada"))
    .catch(err => console.error("❌ Error DB:", err));

// 3. RUTAS MODULARES
app.use('/api/inventory', inventoryRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/users', userRoutes);

// 4. RUTAS DIRECTAS PARA EL CHAT (TransactionView)
app.post('/api/transactions', async (req, res) => {
    try {
        const { cantidad, itemName, persona, tipo } = req.body;
        const nombreLimpio = itemName.trim().toUpperCase();
        const numCantidad = parseInt(cantidad) || 0;

        let item = await Item.findOne({ name: nombreLimpio });
        if (!item) {
            item = new Item({ name: nombreLimpio, qrCode: `QR-${Date.now()}`, stock: 0, category: 'General' });
        }

        const factor = (tipo === 'ingreso') ? numCantidad : -numCantidad;
        item.stock += factor;
        item.history.push({ action: tipo, quantity: numCantidad, user: persona, timestamp: new Date() });
        await item.save();

        const newTx = new Transaction({ cantidad: numCantidad, itemName: nombreLimpio, persona, tipo, timestamp: new Date() });
        await newTx.save();

        res.status(201).json({ success: true, item });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/transactions', async (req, res) => {
    try {
        const txs = await Transaction.find().sort({ timestamp: -1 }).limit(30);
        res.json(txs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/frequent-data', async (req, res) => {
    try {
        const items = await Item.find().sort({ _id: -1 }).limit(15).select('name');
        const recentTxs = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        const people = [...new Set(recentTxs.map(t => t.persona))].slice(0, 10);
        res.json({ items, people });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));