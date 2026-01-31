import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const getPayrollReport = async (req, res) => {
    const { month } = req.query; 
    
    try {
        // Buscamos los registros del mes
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
            // IMPORTANTE: Verificar explícitamente si existe ajuste manual
            const hasManual = log.manualHours !== undefined && log.manualHours !== null;

            if (hasManual) {
                // Forzamos que sea número para evitar concatenación de strings
                hoursForThisDay = Number(log.manualHours);
            } else if (log.checkIn && log.checkOut) {
                const diff = new Date(log.checkOut) - new Date(log.checkIn);
                hoursForThisDay = diff / (1000 * 60 * 60);
            }

            // Si el día tiene horas (o ajuste 0), lo procesamos
            if (hoursForThisDay >= 0 || hasManual) {
                // Sumamos al total acumulado del trabajador ANTES del redondeo visual
                reportMap[uid].totalHours += hoursForThisDay;
                
                if (hoursForThisDay > 0) {
                    reportMap[uid].daysCount += 1;
                }
                
                reportMap[uid].dailyDetails.push({
                    attendanceId: log._id,
                    date: log.date,
                    dayName: format(new Date(log.date + "T12:00:00"), "EEEE dd", { locale: es }),
                    hours: Number(hoursForThisDay.toFixed(2)), // Redondeo para la vista diaria
                    isManual: hasManual
                });
            }
        });

        // Formateo final para enviar al Frontend
        const finalReport = Object.values(reportMap).map(worker => {
            // Ordenar por fecha
            worker.dailyDetails.sort((a, b) => a.date.localeCompare(b.date));
            // REDONDEO FINAL: Clave para que el sueldo sea exacto
            worker.totalHours = Number(worker.totalHours.toFixed(2));
            return worker;
        });

        res.json(finalReport);
    } catch (error) {
        console.error("Error en reporte de nómina:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};