import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// 1. OBTENER ASISTENCIAS POR FECHA
export const getAttendanceByDate = async (req, res) => {
    const { date } = req.query; // Formato esperado: YYYY-MM-DD
    try {
        const query = date ? { date } : {};
        const asistencias = await Attendance.find(query)
            .populate('worker', 'name lastName dni')
            .sort({ createdAt: -1 });

        res.json(asistencias);
    } catch (error) {
        console.error("Error en getAttendanceByDate:", error);
        res.status(500).json({ message: "Error al cargar datos de asistencia" });
    }
};

// 2. REGISTRAR ASISTENCIA (QR / BOTÓN)
export const registrarAsistencia = async (req, res) => {
    const { workerId } = req.body;
    const ahora = new Date();
    // Fecha local para Perú (en-CA devuelve YYYY-MM-DD)
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        // Buscar usuario por ID de MongoDB, DNI o CustomID (QR)
        const user = await User.findOne({
            $or: [
                { customId: workerId?.trim() },
                { dni: workerId?.toString().trim() },
                ...(workerId?.length === 24 ? [{ _id: workerId }] : [])
            ]
        });

        if (!user) {
            return res.status(404).json({ message: "Trabajador no encontrado" });
        }

        let registro = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        if (!registro) {
            // Primer registro del día: ENTRADA
            registro = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: hoyPeru,
                checkIn: ahora.toISOString()
            });
            await registro.save();
            return res.json({ 
                success: true, 
                message: `Entrada registrada: ${user.name} ${user.lastName}`, 
                type: 'IN' 
            });
        } else if (!registro.checkOut) {
            // Segundo registro del día: SALIDA
            registro.checkOut = ahora.toISOString();
            await registro.save();
            return res.json({ 
                success: true, 
                message: `Salida registrada: ${user.name} ${user.lastName}`, 
                type: 'OUT' 
            });
        }

        res.status(400).json({ message: "El trabajador ya tiene registradas entrada y salida hoy." });
    } catch (error) {
        console.error("Error en registrarAsistencia:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

export const getAttendanceByWorker = async (req, res) => {
    try {
        const { workerId } = req.params;
        // Buscamos todas las marcas de ese trabajador
        const history = await Attendance.find({ worker: workerId });
        res.json(history);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener historial" });
    }
};

// 3. EDITAR ASISTENCIA (MANUAL DESDE LA TABLA)
export const manualEdit = async (req, res) => {
    const { attendanceId, workerId, date, field, value } = req.body;
    
    try {
        let attendance;
        
        if (attendanceId) {
            // Si ya existe un registro de asistencia, lo actualizamos
            attendance = await Attendance.findByIdAndUpdate(
                attendanceId, 
                { [field]: value }, 
                { new: true }
            );
        } else {
            // Si no existe (estaba AUSENTE), creamos un registro nuevo
            const user = await User.findById(workerId);
            if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

            attendance = await Attendance.findOneAndUpdate(
                { worker: workerId, date: date },
                { 
                    [field]: value,
                    dni: user.dni
                },
                { upsert: true, new: true }
            );
        }

        res.json({ message: "✅ Cambios guardados", attendance });
    } catch (error) {
        console.error("Error en manualEdit:", error);
        res.status(500).json({ message: "Error al actualizar registro manual" });
    }
};

// 4. REPORTE DE NÓMINA (PARA EXCEL MENSUAL)
export const getPayrollReport = async (req, res) => {
    const { month } = req.query; // Formato YYYY-MM
    try {
        const logs = await Attendance.find({
            date: { $regex: new RegExp(`^${month}`) }
        }).populate('worker', 'name lastName role hourlyRate');

        const reportMap = {};

        logs.forEach(log => {
            if (!log.worker) return;
            const uid = log.worker._id.toString();

            if (!reportMap[uid]) {
                reportMap[uid] = {
                    _id: uid,
                    name: log.worker.name,
                    lastName: log.worker.lastName,
                    role: log.worker.role,
                    hourlyRate: Number(log.worker.hourlyRate) || 0,
                    totalHours: 0,
                    daysCount: 0,
                    dailyDetails: []
                };
            }

            let hoursForThisDay = 0;
            if (log.manualHours !== undefined && log.manualHours !== null) {
                hoursForThisDay = Number(log.manualHours);
            } else if (log.checkIn && log.checkOut) {
                const diff = new Date(log.checkOut) - new Date(log.checkIn);
                hoursForThisDay = diff / (1000 * 60 * 60);
            }

            if (hoursForThisDay >= 0) {
                reportMap[uid].totalHours += hoursForThisDay;
                if (hoursForThisDay > 0) reportMap[uid].daysCount += 1;
                reportMap[uid].dailyDetails.push({
                    attendanceId: log._id,
                    date: log.date,
                    hours: Number(hoursForThisDay.toFixed(2))
                });
            }
        });

        res.json(Object.values(reportMap));
    } catch (error) {
        res.status(500).json({ error: "Error al generar reporte de nómina" });
    }
};