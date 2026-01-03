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
    const { workerId } = req.body;
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        if (!workerId) return res.status(400).json({ message: "Código QR vacío" });

        // 1. Buscamos al usuario de forma segura
        let query = {};
        
        // Si el código tiene 24 caracteres, es un ID de MongoDB
        if (workerId.length === 24) {
            query = { _id: workerId };
        } else {
            // Si no, lo buscamos por DNI (asegurándonos que sea string y sin espacios)
            query = { dni: workerId.toString().trim() };
        }

        const user = await User.findOne(query);

        if (!user) {
            return res.status(404).json({ 
                message: `Usuario no encontrado. El código leído fue: ${workerId}` 
            });
        }

        // 2. Buscar si ya existe asistencia hoy
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
            return res.json({ success: true, message: `Bienvenido ${user.name}, entrada registrada.` });
        } 
        
        if (!registroHoy.exitTime) {
            // MARCAR SALIDA
            registroHoy.exitTime = ahora;
            await registroHoy.save();
            return res.json({ success: true, message: `Adiós ${user.name}, salida registrada.` });
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