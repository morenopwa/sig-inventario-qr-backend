import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const getPayrollReport = async (req, res) => {
    const { month } = req.query; // "2026-01"
    
    try {
        // Ajustamos el rango de búsqueda para abarcar todo el mes
        const startOfMonth = new Date(`${month}-01T00:00:00`);
        const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59);

        // 1. Buscamos asistencias. Nota: usa 'worker' o 'userId' según tu modelo real.
        // En tu routes/attendance.js usas 'worker', así que lo corregimos aquí:
        const logs = await Attendance.find({
            date: { $gte: month + "-01", $lte: month + "-31" } // Filtro por string de fecha YYYY-MM-DD
        }).populate('worker', 'name lastName role hourlyRate');

        const reportMap = {};

        logs.forEach(log => {
            if (!log.worker) return;
            const uid = log.worker._id.toString();

            // Si el trabajador no está en el mapa, lo inicializamos
            if (!reportMap[uid]) {
                reportMap[uid] = {
                    _id: uid,
                    name: log.worker.name,
                    lastName: log.worker.lastName,
                    role: log.worker.role,
                    hourlyRate: log.worker.hourlyRate || 0,
                    totalHours: 0,
                    daysCount: 0,
                    dailyDetails: [] // Aquí guardamos el desglose diario
                };
            }

            // Calculamos horas del registro actual
            let hoursForThisDay = 0;
            
            // Prioridad: 1. Horas manuales (ajustadas), 2. Cálculo automático entrada/salida
            if (log.manualHours !== undefined) {
                hoursForThisDay = log.manualHours;
            } else if (log.checkIn && log.checkOut) {
                const diff = new Date(log.checkOut) - new Date(log.checkIn);
                hoursForThisDay = Math.max(0, diff / (1000 * 60 * 60));
            }

            if (hoursForThisDay > 0) {
                reportMap[uid].totalHours += hoursForThisDay;
                reportMap[uid].daysCount += 1;
                
                // Agregamos al desglose diario para el "acordeón" del frontend
                reportMap[uid].dailyDetails.push({
                    attendanceId: log._id,
                    date: log.date, // YYYY-MM-DD
                    dayName: format(new Date(log.date + "T12:00:00"), "EEEE dd", { locale: es }),
                    hours: Number(hoursForThisDay.toFixed(2)),
                    isManual: log.manualHours !== undefined
                });
            }
        });

        // Ordenar los detalles diarios por fecha para que el usuario los vea en orden
        const finalReport = Object.values(reportMap).map(worker => {
            worker.dailyDetails.sort((a, b) => a.date.localeCompare(b.date));
            return worker;
        });

        res.json(finalReport);
    } catch (error) {
        console.error("Error en reporte de nómina:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};