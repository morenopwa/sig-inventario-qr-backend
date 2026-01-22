import express from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { getPayrollReport } from '../controllers/attendanceController.js'; // Asegúrate que este controlador exista
import { sendWSMessage } from '../whatsapp.js';

const router = express.Router();

// Ruta para el reporte de planilla (Cálculo de horas)
router.get('/payroll-report', getPayrollReport);

// Obtener todas las asistencias o por fecha específica
router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        let query = date ? { date } : {};
        const asistencias = await Attendance.find(query)
            .populate('worker', 'name lastName dni')
            .sort({ createdAt: -1 });
        res.json(asistencias);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener asistencias" });
    }
});

// Registro de entrada y salida (POST)
router.post('/registrar', async (req, res) => {
    const { workerId } = req.body;
    const ahora = new Date();
    
    // Configuración de Tiempo para Perú (UTC-5)
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const horaMsg = ahora.toLocaleTimeString('es-PE', { 
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Lima' 
    });

    try {
        if (!workerId) return res.status(400).json({ message: "El código QR está vacío" });

        // 1. BÚSQUEDA FLEXIBLE DEL TRABAJADOR
        const user = await User.findOne({
            $or: [
                { customId: workerId.trim() },
                { dni: workerId.toString().trim() },
                ...(workerId.length === 24 ? [{ _id: workerId }] : [])
            ]
        });

        if (!user) {
            return res.status(404).json({ message: `Trabajador no encontrado con ID: ${workerId}` });
        }

        // 2. LÓGICA DE APELLIDO + INICIAL (Si se repite el apellido)
        const totalConMismoApellido = await User.countDocuments({ lastName: user.lastName });
        let identificadorVisual = user.lastName;
        
        if (totalConMismoApellido > 1) {
            // Ejemplo: "Perez, J." en lugar de solo "Perez"
            identificadorVisual = `${user.lastName}, ${user.name.charAt(0)}.`;
        }

        // 3. VERIFICAR ESTADO DE ASISTENCIA HOY
        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        if (!registroHoy) {
            // --- REGISTRAR ENTRADA ---
            const nuevaAsistencia = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: hoyPeru,
                checkIn: ahora
            });
            await nuevaAsistencia.save();

            const textoMsg = `✅ *ENTRADA REGISTRADA*\n👤 *Personal:* ${identificadorVisual}\n⏰ *Hora:* ${horaMsg}\n📅 *Fecha:* ${hoyPeru}`;
            sendWSMessage(textoMsg);

            return res.json({ 
                success: true, 
                message: `¡Bienvenido(a) ${user.name}! Entrada registrada.` 
            });
        } 
        
        if (!registroHoy.checkOut) {
            // --- REGISTRAR SALIDA ---
            registroHoy.checkOut = ahora;
            await registroHoy.save();

            const textoMsg = `🏁 *SALIDA REGISTRADA*\n👤 *Personal:* ${identificadorVisual}\n⏰ *Hora:* ${horaMsg}\n📅 *Fecha:* ${hoyPeru}`;
            sendWSMessage(textoMsg);

            return res.json({ 
                success: true, 
                message: `¡Hasta luego ${user.name}! Salida registrada.` 
            });
        }

        // Si ya tiene entrada y salida
        return res.status(400).json({ 
            message: `${user.name}, ya registraste tu entrada y salida el día de hoy.` 
        });

    } catch (error) {
        console.error("Error en proceso de registro:", error);
        res.status(500).json({ message: "Error interno en el servidor al registrar" });
    }
});

// Reporte mensual por filtro de texto (YYYY-MM)
router.get('/reporte', async (req, res) => {
    try {
        const { month } = req.query; // Espera formato "2026-01"
        if (!month) return res.status(400).json({ message: "Mes no especificado" });

        const registros = await Attendance.find({
            date: { $regex: new RegExp(`^${month}`) }
        }).populate('worker', 'name lastName dni');
        
        res.json(registros);
    } catch (error) {
        res.status(500).json({ message: "Error al generar el reporte mensual" });
    }
});

export default router;