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

// POST: Registrar entrada/salida en routes/attendance.js
router.post('/registrar', async (req, res) => {
    const { workerId } = req.body; // Este es el texto que sale del QR
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        if (!workerId) return res.status(400).json({ message: "Código QR vacío" });

        // 1. BUSQUEDA FLEXIBLE
        // Buscamos al usuario que coincida con el workerId en cualquiera de estos campos:
        const user = await User.findOne({
            $or: [
                { customId: workerId.trim() },       // Prioridad: El nuevo ID del QR
                { dni: workerId.toString().trim() }, // Compatibilidad: Por si el QR tiene el DNI
                // Si workerId tiene 24 caracteres, intentamos buscarlo por _id también
                ...(workerId.length === 24 ? [{ _id: workerId }] : [])
            ]
        });

        if (!user) {
            return res.status(404).json({ 
                message: `Usuario no encontrado. ID leído: ${workerId}` 
            });
        }

        // 2. BUSCAR ASISTENCIA (Igual que antes, usando user._id para la relación)
        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        if (!registroHoy) {
            // MARCAR ENTRADA
            const nuevaAsistencia = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: hoyPeru,
                entryTime: ahora
            });
            await nuevaAsistencia.save();
            return res.json({ success: true, message: `BIENVENIDO ${user.name}, entrada registrada.` });
        } 
        
        if (!registroHoy.exitTime) {
            // MARCAR SALIDA
            registroHoy.exitTime = ahora;
            await registroHoy.save();
            return res.json({ success: true, message: `ADIÓS ${user.name}, salida registrada.` });
        }

        return res.status(400).json({ message: "Ya registraste entrada y salida por hoy." });

    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ message: "Error interno en el servidor" });
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