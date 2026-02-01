import express from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { getPayrollReport } from '../controllers/attendanceController.js';

const router = express.Router();

// Reporte de nómina (Cálculos de horas)
router.get('/payroll-report', getPayrollReport);

// OBTENER ASISTENCIAS
router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        let query = date ? { date } : {};
        
        const asistencias = await Attendance.find(query)
            .populate('worker', 'name lastName dni')
            .sort({ createdAt: -1 });

        // Formateamos para enviar nombres completos a la tabla del frontend
        const asistenciasFormateadas = asistencias.map(asist => {
            const user = asist.worker;
            if (!user) return asist;

            return {
                ...asist._doc,
                displayWorkerName: `${user.lastName}, ${user.name}`
            };
        });

        res.json(asistenciasFormateadas);
    } catch (error) {
        console.error("Error al obtener asistencias:", error);
        res.status(500).json({ message: "Error al obtener asistencias" });
    }
});

// REGISTRAR (Entrada/Salida) - LIMPIO DE WHATSAPP
router.post('/registrar', async (req, res) => {
    const { workerId } = req.body;
    const ahora = new Date();
    // Configuración de fecha para Perú (Lima)
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        if (!workerId) return res.status(400).json({ message: "QR o ID vacío" });

        // Buscamos al usuario por CustomID (QR), DNI o ID de Mongo
        const user = await User.findOne({
            $or: [
                { customId: workerId.trim() },
                { dni: workerId.toString().trim() },
                ...(workerId.length === 24 ? [{ _id: workerId }] : [])
            ]
        });

        if (!user) return res.status(404).json({ message: "Trabajador no encontrado" });

        // Buscamos si ya tiene un registro el día de hoy
        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        // CASO 1: No ha marcado entrada
        if (!registroHoy) {
            const nuevaAsistencia = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: hoyPeru,
                checkIn: ahora
            });
            await nuevaAsistencia.save();

            return res.json({ 
                success: true, 
                message: `Entrada registrada: ${user.name} ${user.lastName}`,
                type: 'IN'
            });
        } 
        
        // CASO 2: Ya marcó entrada pero no salida
        if (!registroHoy.checkOut) {
            registroHoy.checkOut = ahora;
            await registroHoy.save();

            return res.json({ 
                success: true, 
                message: `Salida registrada: ${user.name} ${user.lastName}`,
                type: 'OUT'
            });
        }

        // CASO 3: Ya tiene ambos registros
        return res.status(400).json({ message: "El trabajador ya completó su jornada hoy." });

    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ message: "Error de servidor al procesar registro" });
    }
});

// REPORTE MENSUAL
router.get('/reporte', async (req, res) => {
    try {
        const { month } = req.query; // Formato YYYY-MM
        const registros = await Attendance.find({
            date: { $regex: new RegExp(`^${month}`) }
        }).populate('worker', 'name lastName dni');
        
        res.json(registros);
    } catch (error) {
        console.error("Error en reporte:", error);
        res.status(500).json({ message: "Error al generar reporte" });
    }
});

// ACTUALIZAR ASISTENCIA (Para cuadrar horas manualmente)
router.patch('/update-hours/:id', async (req, res) => {
    try {
        const { manualHours } = req.body;
        
        // Convertimos a número. Si es vacío o no es número, enviamos error.
        if (manualHours === undefined || isNaN(Number(manualHours))) {
            return res.status(400).json({ message: "Valor de horas no válido" });
        }

        const updated = await Attendance.findByIdAndUpdate(
            req.params.id, 
            { manualHours: Number(manualHours) },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: "Registro no encontrado" });
        }

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error("Error al actualizar horas:", error);
        res.status(500).json({ message: "Error al actualizar horas" });
    }
});

export default router;