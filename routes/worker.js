import express from 'express';
import Item from '../models/Item.js';
import Attendance from '../models/Attendance.js';
// import verifyToken from '../middleware/verifyToken.js'; // Asegúrate de tener este middleware

const router = express.Router();

// Obtener préstamos del trabajador logueado
router.get('/my-loans', async (req, res) => {
    try {
        const { workerName } = req.query; // Por ahora por query hasta que asegures el middleware
        if (!workerName) return res.status(400).json({ message: "Nombre requerido" });

        const items = await Item.find({ "activeLoans.workerName": workerName.toUpperCase() });
        const myLoans = items.map(item => {
            const loan = item.activeLoans.find(l => l.workerName === workerName.toUpperCase());
            return {
                name: item.name,
                unit: item.unit,
                quantity: loan.quantity,
                date: loan.date
            };
        });
        res.json(myLoans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener asistencia y pagos del trabajador
router.get('/my-stats', async (req, res) => {
    try {
        const { workerId, workerName } = req.query;
        const attendance = await Attendance.find({ workerId });
        // Aquí podrías buscar pagos en tu tabla de transacciones
        res.json({ attendance, payments: [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;