import express from 'express';
import Item from '../models/Item.js';
import User from '../models/User.js';
import History from '../models/History.js';

const router = express.Router();

// Obtener todos los items
router.get('/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener inventario" });
    }
});

// REGISTRAR PRÉSTAMO (QR Worker + Item ID)
router.post('/loan', async (req, res) => {
    const { itemObjectId, workerCustomId } = req.body;

    try {
        const worker = await User.findOne({ customId: workerCustomId });
        if (!worker) return res.status(404).json({ message: "Trabajador no encontrado con ese QR" });

        const item = await Item.findById(itemObjectId);
        if (!item || item.stock <= 0) {
            return res.status(400).json({ message: "No hay stock disponible" });
        }

        const newHistory = new History({
            item: item._id,
            worker: worker._id,
            action: 'LOAN',
            status: 'PENDING'
        });

        await newHistory.save();
        await Item.findByIdAndUpdate(itemObjectId, { $inc: { stock: -1 } });

        res.json({ success: true, message: `Préstamo registrado a: ${worker.name} ${worker.lastName}` });
    } catch (error) {
        res.status(500).json({ message: "Error al procesar préstamo" });
    }
});

// GET: api/inventory/active-loans
router.get('/active-loans', async (req, res) => {
    try {
        const loans = await History.find({ status: 'PENDING', action: 'LOAN' })
            .populate('item', 'name customId') // Trae nombre y ID del item
            .populate('worker', 'name lastName customId') // Trae datos del trabajador
            .sort({ createdAt: -1 });
        res.json(loans);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener préstamos activos" });
    }
});

// PUT: api/inventory/return/:loanId
router.put('/return/:loanId', async (req, res) => {
    try {
        const { loanId } = req.params;
        
        // 1. Buscamos el registro de préstamo
        const loan = await History.findById(loanId);
        if (!loan || loan.status === 'COMPLETED') {
            return res.status(404).json({ message: "Préstamo no encontrado o ya devuelto" });
        }

        // 2. Marcamos como completado
        loan.status = 'COMPLETED';
        loan.action = 'RETURN'; // Opcional: puedes crear un nuevo registro o actualizar este
        await loan.save();

        // 3. Devolvemos el stock al Item
        await Item.findByIdAndUpdate(loan.item, { $inc: { stock: 1 } });

        res.json({ success: true, message: "Devolución registrada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al procesar devolución" });
    }
});

export default router;