import express from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { getPayrollReport } from '../controllers/attendanceController.js';
import { sendWSMessage } from '../whatsapp.js';

const router = express.Router();

router.get('/payroll-report', getPayrollReport);

// OBTENER ASISTENCIAS (Con la lógica de Inicial de Nombre para apellidos repetidos)
router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        let query = date ? { date } : {};
        
        const asistencias = await Attendance.find(query)
            .populate('worker', 'name lastName dni')
            .sort({ createdAt: -1 });

        // Mapeamos los resultados para aplicar la lógica de la inicial
        const asistenciasFormateadas = await Promise.all(asistencias.map(async (asist) => {
            const user = asist.worker;
            if (!user) return asist;

            // Contamos cuántos usuarios tienen el mismo apellido
            const countRepetidos = await User.countDocuments({ lastName: user.lastName });
            
            // Si hay más de uno, creamos el "Atajo": Apellido + Inicial
            const nombreMostrar = countRepetidos > 1 
                ? `${user.lastName}, ${user.name.charAt(0)}.` 
                : user.lastName;

            return {
                ...asist._doc,
                displayWorkerName: nombreMostrar // Este es el campo que usarás en tu tabla/lista
            };
        }));

        res.json(asistenciasFormateadas);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener asistencias" });
    }
});

// REGISTRAR (Entrada/Salida)
router.post('/registrar', async (req, res) => {
    const { workerId } = req.body;
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const horaMsg = ahora.toLocaleTimeString('es-PE', { 
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Lima' 
    });

    try {
        if (!workerId) return res.status(400).json({ message: "QR vacío" });

        const user = await User.findOne({
            $or: [
                { customId: workerId.trim() },
                { dni: workerId.toString().trim() },
                ...(workerId.length === 24 ? [{ _id: workerId }] : [])
            ]
        });

        if (!user) return res.status(404).json({ message: "No encontrado" });

        // Lógica de Atajo para el mensaje de WhatsApp
        const countRepetidos = await User.countDocuments({ lastName: user.lastName });
        const nombreAtajo = countRepetidos > 1 
            ? `${user.lastName}, ${user.name.charAt(0)}.` 
            : user.lastName;

        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        if (!registroHoy) {
            const nuevaAsistencia = new Attendance({
                worker: user._id, dni: user.dni, date: hoyPeru, checkIn: ahora
            });
            await nuevaAsistencia.save();

            const textoMsg = `✅ *ENTRADA*\n👤 *Personal:* ${nombreAtajo}\n⏰ *Hora:* ${horaMsg}`;
            sendWSMessage(textoMsg);

            return res.json({ success: true, message: `Bienvenido ${user.name}` });
        } 
        
        if (!registroHoy.checkOut) {
            registroHoy.checkOut = ahora;
            await registroHoy.save();

            const textoMsg = `🏁 *SALIDA*\n👤 *Personal:* ${nombreAtajo}\n⏰ *Hora:* ${horaMsg}`;
            sendWSMessage(textoMsg);

            return res.json({ success: true, message: `Adiós ${user.name}` });
        }

        return res.status(400).json({ message: "Ya marcó hoy." });

    } catch (error) {
        res.status(500).json({ message: "Error de servidor" });
    }
});

router.get('/reporte', async (req, res) => {
    try {
        const { month } = req.query;
        const registros = await Attendance.find({
            date: { $regex: new RegExp(`^${month}`) }
        }).populate('worker', 'name lastName dni');
        res.json(registros);
    } catch (error) {
        res.status(500).json({ message: "Error" });
    }
});

export default router;