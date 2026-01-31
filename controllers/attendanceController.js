import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const getPayrollReport = async (req, res) => {
    const { month } = req.query; // Espera "2026-01"
    
    try {
        // Filtramos usando regex para que coincida con cualquier fecha que empiece con el mes elegido
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
                    hourlyRate: log.worker.hourlyRate || 0,
                    totalHours: 0,
                    daysCount: 0,
                    dailyDetails: []
                };
            }

            let hoursForThisDay = 0;
            
            // CORRECCIÓN DE LÓGICA: 
            // Verificamos si existe un ajuste manual (incluso si es 0)
            const hasManualAdjustment = log.manualHours !== undefined && log.manualHours !== null;

            if (hasManualAdjustment) {
                hoursForThisDay = Number(log.manualHours);
            } else if (log.checkIn && log.checkOut) {
                const diff = new Date(log.checkOut) - new Date(log.checkIn);
                hoursForThisDay = Math.max(0, diff / (1000 * 60 * 60));
            }

            // Solo sumamos al reporte si hubo actividad o hay un ajuste manual
            if (hoursForThisDay > 0 || hasManualAdjustment) {
                reportMap[uid].totalHours += hoursForThisDay;
                // Solo contamos el día si realmente trabajó o se le asignaron horas
                if (hoursForThisDay > 0) reportMap[uid].daysCount += 1;
                
                reportMap[uid].dailyDetails.push({
                    attendanceId: log._id,
                    date: log.date,
                    dayName: format(new Date(log.date + "T12:00:00"), "EEEE dd", { locale: es }),
                    hours: Number(hoursForThisDay.toFixed(2)),
                    isManual: hasManualAdjustment
                });
            }
        });

        const finalReport = Object.values(reportMap).map(worker => {
            // Ordenamos los días del 1 al 31
            worker.dailyDetails.sort((a, b) => a.date.localeCompare(b.date));
            return worker;
        });

        res.json(finalReport);
    } catch (error) {
        console.error("Error en reporte de nómina:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};