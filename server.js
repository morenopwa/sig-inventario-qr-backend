import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// IMPORTACIONES ÚNICAS
import inventoryRoutes from './routes/inventory.js';
import salaryRoutes from './routes/salary.js';
import userRoutes from './routes/users.js';
import Transaction from './models/Transaction.js';
import Item from './models/Item.js';
import attendanceRoutes from './routes/attendance.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// CONEXIÓN DB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ DB Conectada"))
    .catch(err => console.error("❌ Error DB:", err));

// RUTAS MODULARES
app.use('/api/inventory', inventoryRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);

// RUTA TRANSACCIONES (Para el Chat)
app.post('/api/transactions', async (req, res) => {
    try {
        const { cantidad, itemName, persona, tipo } = req.body;
        const nombreLimpio = itemName.trim().toUpperCase();
        
        let item = await Item.findOne({ name: nombreLimpio });
        if (!item) {
            item = new Item({ name: nombreLimpio, qrCode: `QR-${Date.now()}`, stock: 0, category: 'General' });
        }

        const factor = (tipo === 'ingreso') ? parseInt(cantidad) : -parseInt(cantidad);
        item.stock += factor;
        item.history.push({ action: tipo, quantity: cantidad, user: persona, timestamp: new Date() });
        await item.save();

        const newTx = new Transaction({ cantidad, itemName: nombreLimpio, persona, tipo, timestamp: new Date() });
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

// Ruta para obtener datos frecuentes (frecuencia de uso)
app.get('/api/frequent-data', async (req, res) => {
    try {
        // Esto busca los 5 items más repetidos en las transacciones
        const items = await Transaction.aggregate([
            { $group: { _id: "$itemName", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);
        
        // Formateamos para el frontend
        const formattedItems = items.map(i => ({ name: i._id }));
        
        res.json({ items: formattedItems, people: [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));