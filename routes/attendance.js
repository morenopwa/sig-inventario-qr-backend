import express from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { getPayrollReport } from '../controllers/attendanceController.js';
import { sendWSMessage } from '../whatsapp.js'; // Nueva importación

const router = express.Router();

router.get('/payroll-report', getPayrollReport);

// Obtener asistencias (General o por fecha)
router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        let query = date ? { date } : {};
        const asistencias = await Attendance.find(query).sort({ date: -1 });
        res.json(asistencias);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener asistencias" });
    }
});

// POST: Registrar entrada/salida y enviar WhatsApp automático
router.post('/registrar', async (req, res) => {
    const { workerId } = req.body;
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const horaMsg = ahora.toLocaleTimeString('es-PE', { 
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Lima' 
    });

    try {
        if (!workerId) return res.status(400).json({ message: "Código QR vacío" });

        // BÚSQUEDA FLEXIBLE
        const user = await User.findOne({
            $or: [
                { customId: workerId.trim() },
                { dni: workerId.toString().trim() },
                ...(workerId.length === 24 ? [{ _id: workerId }] : [])
            ]
        });

        if (!user) return res.status(404).json({ message: `Usuario no encontrado: ${workerId}` });

        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });
        let textoMsg = "";

        if (!registroHoy) {
            // REGISTRAR ENTRADA
            const nuevaAsistencia = new Attendance({
                worker: user._id, dni: user.dni, date: hoyPeru, checkIn: ahora
            });
            await nuevaAsistencia.save();
            
            textoMsg = `✅ *ENTRADA REGISTRADA*\n👤 *Personal:* ${user.lastName}, ${user.name}\n⏰ *Hora:* ${horaMsg}\n📅 *Fecha:* ${hoyPeru}`;
            sendWSMessage(textoMsg); // Envío automático

            return res.json({ success: true, message: `BIENVENIDO ${user.name}, entrada registrada.` });
        } 
        
        if (!registroHoy.checkOut) {
            // REGISTRAR SALIDA
            registroHoy.checkOut = ahora;
            await registroHoy.save();

            textoMsg = `🏁 *SALIDA REGISTRADA*\n👤 *Personal:* ${user.lastName}, ${user.name}\n⏰ *Hora:* ${horaMsg}\n📅 *Fecha:* ${hoyPeru}`;
            sendWSMessage(textoMsg); // Envío automático

            return res.json({ success: true, message: `ADIÓS ${user.name}, salida registrada.` });
        }

        return res.status(400).json({ message: "Ya registraste entrada y salida hoy." });

    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ message: "Error interno en el servidor" });
    }
});

// Reporte mensual
router.get('/reporte', async (req, res) => {
    try {
        const { month } = req.query;
        const registros = await Attendance.find({
            date: { $regex: new RegExp(`^${month}`) }
        });
        res.json(registros);
    } catch (error) {
        res.status(500).json({ message: "Error al generar reporte" });
    }
});

export default router;