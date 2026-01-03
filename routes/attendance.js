import express from 'express';
const router = express.Router();
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';

// Obtener asistencias por fecha
router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        const asistencias = await Attendance.find({ date });
        res.json(asistencias);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener asistencias" });
    }
});

// Registrar entrada/salida
router.post('/registrar', async (req, res) => {
    const { workerId } = req.body;
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        const user = await User.findOne({ 
            $or: [{ dni: workerId }, { _id: workerId.length === 24 ? workerId : null }] 
        });

        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        if (!registroHoy) {
            const nuevaAsistencia = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: hoyPeru,
                entryTime: ahora
            });
            await nuevaAsistencia.save();
            return res.json({ success: true, message: "Entrada registrada" });
        }

        if (!registroHoy.exitTime) {
            registroHoy.exitTime = ahora;
            await registroHoy.save();
            return res.json({ success: true, message: "Salida registrada" });
        }

        res.status(400).json({ message: "Ya marcó entrada y salida hoy" });
    } catch (error) {
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

// REPORTE MENSUAL
router.get('/reporte', async (req, res) => {
    try {
        const { month } = req.query; // Formato "YYYY-MM"
        const registros = await Attendance.find({
            date: { $regex: new RegExp(`^${month}`) }
        });
        res.json(registros);
    } catch (error) {
        res.status(500).json({ message: "Error al generar reporte" });
    }
});

export default router; 