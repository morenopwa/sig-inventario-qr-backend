import Attendance from '../models/Attendance.js';
import User from '../models/User.js';

export const getPayrollReport = async (req, res) => {
    const { month } = req.query; // Formato esperado: "2026-01"
    
    try {
        const startOfMonth = new Date(`${month}-01T00:00:00`);
        const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59);

        // 1. Obtener todas las asistencias del mes con datos del usuario
        const logs = await Attendance.find({
            date: { $gte: startOfMonth, $lte: endOfMonth }
        }).populate('userId', 'name lastName role hourlyRate');

        // 2. Agrupar por trabajador
        const reportMap = {};

        logs.forEach(log => {
            if (!log.userId) return;
            const uid = log.userId._id.toString();

            if (!reportMap[uid]) {
                reportMap[uid] = {
                    _id: uid,
                    name: log.userId.name,
                    lastName: log.userId.lastName,
                    role: log.userId.role,
                    hourlyRate: log.userId.hourlyRate || 15,
                    totalHours: 0,
                    daysCount: 0
                };
            }

            if (log.entryTime && log.exitTime) {
                const hours = (new Date(log.exitTime) - new Date(log.entryTime)) / (1000 * 60 * 60);
                // Si quieres solo horas completas usa Math.floor(hours)
                reportMap[uid].totalHours += hours > 0 ? hours : 0;
                reportMap[uid].daysCount += 1;
            }
        });

        res.json(Object.values(reportMap));
    } catch (error) {
        console.error("Error en reporte de nómina:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};