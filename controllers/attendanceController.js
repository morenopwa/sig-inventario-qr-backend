import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const getPayrollReport = async (req, res) => {
    const { month } = req.query; 
    
    try {
        // Buscamos los registros del mes (ej: "2026-01")
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
            const hasManual = log.manualHours !== undefined && log.manualHours !== null;

            if (hasManual) {
                hoursForThisDay = Number(log.manualHours);
            } else if (log.checkIn && log.checkOut) {
                const diff = new Date(log.checkOut) - new Date(log.checkIn);
                hoursForThisDay = diff / (1000 * 60 * 60);
            }

            // Procesamos si hay actividad
            if (hoursForThisDay >= 0 || hasManual) {
                reportMap[uid].totalHours += hoursForThisDay;
                
                if (hoursForThisDay > 0) {
                    reportMap[uid].daysCount += 1;
                }
                
                // Usamos una fecha base segura para el formato
                const dateObj = new Date(log.date + "T12:00:00");
                
                reportMap[uid].dailyDetails.push({
                    attendanceId: log._id,
                    date: log.date,
                    dayName: format(new Date(log.date + "T12:00:00"), "EEEE dd", { locale: es }),                    hours: Number(hoursForThisDay.toFixed(2)),
                    isManual: hasManual
                });
            }
        });

        const finalReport = Object.values(reportMap).map(worker => {
            worker.dailyDetails.sort((a, b) => a.date.localeCompare(b.date));
            worker.totalHours = Number(Number(worker.totalHours).toFixed(2))
            console.log(worker.totalHours);
            return worker;
        });

        res.json(finalReport);
    } catch (error) {
        console.error("Error en reporte de nómina:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};