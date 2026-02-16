import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// 1. REPORTE DE NÓMINA (Cálculos mensuales)
export const getPayrollReport = async (req, res) => {
    const { month } = req.query;
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
                    _id: uid, name: log.worker.name, lastName: log.worker.lastName,
                    role: log.worker.role, hourlyRate: Number(log.worker.hourlyRate) || 0,
                    totalHours: 0, daysCount: 0, dailyDetails: []
                };
            }

            let hoursForThisDay = 0;
            const hasManual = log.manualHours !== undefined && log.manualHours !== null;
            if (hasManual) {
                hoursForThisDay = Number(log.manualHours);
            } else if (log.checkIn && log.checkOut) {
                const diff = new Date(log.checkOut) - new Date(log.checkIn);
                hoursForThisDay = diff / (1000 * 60 * 60);
            }

            if (hoursForThisDay >= 0 || hasManual) {
                reportMap[uid].totalHours += hoursForThisDay;
                if (hoursForThisDay > 0) reportMap[uid].daysCount += 1;
                reportMap[uid].dailyDetails.push({
                    attendanceId: log._id,
                    date: log.date,
                    dayName: format(new Date(log.date + "T12:00:00"), "EEEE dd", { locale: es }),
                    hours: Number(hoursForThisDay.toFixed(2)),
                    isManual: hasManual
                });
            }
        });
        res.json(Object.values(reportMap));
    } catch (error) {
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// 2. EDITAR ASISTENCIA (CheckIn / CheckOut) - La que usaremos en tu nueva tabla
export const manualEdit = async (req, res) => {
    const { attendanceId, workerId, date, field, value } = req.body;
    try {
        let attendance;
        if (attendanceId) {
            attendance = await Attendance.findByIdAndUpdate(attendanceId, { [field]: value }, { new: true });
        } else {
            attendance = await Attendance.findOneAndUpdate(
                { worker: workerId, date: date },
                { [field]: value },
                { upsert: true, new: true }
            );
        }
        res.json({ message: "✅ Actualizado", attendance });
    } catch (error) {
        res.status(500).json({ message: "Error al editar" });
    }
};

// 3. REGISTRAR ASISTENCIA (QR / Manual)
export const registrarAsistencia = async (req, res) => {
    const { workerId } = req.body;
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        const user = await User.findOne({
            $or: [{ customId: workerId?.trim() }, { dni: workerId?.toString().trim() }, 
                 ...(workerId?.length === 24 ? [{ _id: workerId }] : [])]
        });

        if (!user) return res.status(404).json({ message: "No encontrado" });

        let registro = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        if (!registro) {
            registro = new Attendance({ worker: user._id, dni: user.dni, date: hoyPeru, checkIn: ahora });
            await registro.save();
            return res.json({ success: true, message: `Entrada: ${user.name}`, type: 'IN' });
        } else if (!registro.checkOut) {
            registro.checkOut = ahora;
            await registro.save();
            return res.json({ success: true, message: `Salida: ${user.name}`, type: 'OUT' });
        }
        res.status(400).json({ message: "Jornada ya completada" });
    } catch (error) {
        res.status(500).json({ message: "Error de servidor" });
    }
};

// 4. OBTENER ASISTENCIAS POR FECHA (Para la tabla principal)
export const getAttendanceByDate = async (req, res) => {
    const { date } = req.query;
    try {
        const asistencias = await Attendance.find(date ? { date } : {})
            .populate('worker', 'name lastName dni')
            .sort({ createdAt: -1 });
        res.json(asistencias);
    } catch (error) {
        res.status(500).json({ message: "Error al cargar datos" });
    }
};