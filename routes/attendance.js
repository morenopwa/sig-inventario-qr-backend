import express from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { getPayrollReport } from '../controllers/attendanceController.js';
import client from '../whatsapp.js'; // Importación del Bot

const router = express.Router();

// CONFIGURACIÓN: Reemplaza con tu número o ID de grupo
const WHATSAPP_TARGET = '51910676918@c.us'; 

router.get('/payroll-report', getPayrollReport);

// Obtener asistencias por fecha (con soporte para query vacío)
router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};
        if (date) {
            query.date = date;
        }
        const asistencias = await Attendance.find(query).sort({ date: -1 });
        res.json(asistencias);
    } catch (error) {
        console.error("Error al obtener asistencias:", error);
        res.status(500).json({ message: "Error al obtener asistencias" });
    }
});

// POST: Registro de Entrada/Salida con Envío de WhatsApp
router.post('/registrar', async (req, res) => {
    const { workerId } = req.body; 
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const horaFormateada = ahora.toLocaleTimeString('es-PE', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true,
        timeZone: 'America/Lima' 
    });

    try {
        if (!workerId) return res.status(400).json({ message: "Código QR vacío" });

        // 1. BUSQUEDA FLEXIBLE (ID, DNI, _id)
        const user = await User.findOne({
            $or: [
                { customId: workerId.trim() },
                { dni: workerId.toString().trim() },
                ...(workerId.length === 24 ? [{ _id: workerId }] : [])
            ]
        });

        if (!user) {
            return res.status(404).json({ 
                message: `Usuario no encontrado. ID leído: ${workerId}` 
            });
        }

        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });
        let msgWS = "";

        if (!registroHoy) {
            // MARCAR ENTRADA
            const nuevaAsistencia = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: hoyPeru,
                checkIn: ahora
            });
            await nuevaAsistencia.save();

            msgWS = `✅ *ENTRADA REGISTRADA*\n👤 *Personal:* ${user.lastName}, ${user.name}\n⏰ *Hora:* ${horaFormateada}\n📅 *Fecha:* ${hoyPeru}`;
            client.sendMessage(WHATSAPP_TARGET, msgWS).catch(e => console.error("Error WS:", e));

            return res.json({ success: true, message: `BIENVENIDO ${user.name}, entrada registrada.` });
        } 
        
        if (!registroHoy.checkOut) {
            // MARCAR SALIDA
            registroHoy.checkOut = ahora;
            await registroHoy.save();

            msgWS = `🏁 *SALIDA REGISTRADA*\n👤 *Personal:* ${user.lastName}, ${user.name}\n⏰ *Hora:* ${horaFormateada}\n📅 *Fecha:* ${hoyPeru}`;
            client.sendMessage(WHATSAPP_TARGET, msgWS).catch(e => console.error("Error WS:", e));

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