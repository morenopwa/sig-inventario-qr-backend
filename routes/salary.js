import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';

const router = express.Router();
const User = mongoose.model('User');
const Transaction = mongoose.model('Transaction');

// GET /api/salary/:userId
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        // Contamos asistencias (entradas)
        const dias = await Transaction.countDocuments({
            persona: user.name,
            tipo: { $in: ['ingreso', 'entrada', 'IN'] }
        });

        const tarifa = user.sueldoBase || 0;

        res.json({
            totalAcumulado: dias * tarifa,
            diasTrabajados: dias,
            tarifaDiaria: tarifa
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;