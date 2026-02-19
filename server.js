import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Importación de Rutas
import inventoryRoutes from './routes/inventory.js';
import salaryRoutes from './routes/salary.js';
import userRoutes from './routes/users.js';
import attendanceRoutes from './routes/attendance.js';
import transactionRoutes from './routes/transactions.js';
import movementRoutes from './routes/movements.js';
import workerRoutes from './routes/worker.js';
import Transaction from './models/Transaction.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// CONEXIÓN DB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ DB Conectada"))
    .catch(err => console.error("❌ Error DB:", err));

// RUTAS MODULARES
app.use('/api/worker', workerRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/transactions', transactionRoutes);

// Datos frecuentes
app.get('/api/frequent-data', async (req, res) => {
    try {
        const items = await Transaction.aggregate([
            { $group: { _id: "$itemName", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);
        const formattedItems = items.map(i => ({ name: i._id }));
        res.json({ items: formattedItems, people: [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));