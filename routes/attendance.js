import express from 'express';
import User from '../models/User.js'; // IMPORTANTE: Debes importar el modelo User
import Attendance from '../models/Attendance.js'; // IMPORTANTE: Debes importar el modelo Attendance
import { 
    getPayrollReport, 
    manualEdit, 
    registrarAsistencia, 
    getAttendanceByDate,
    getAttendanceByWorker
} from '../controllers/attendanceController.js';

const router = express.Router();

// --- RUTAS EXISTENTES ---

// Obtener asistencias de un día específico (GET /api/attendance?date=...)
router.get('/', getAttendanceByDate);

// Registro vía QR o botón (POST /api/attendance/registrar)
router.post('/registrar', registrarAsistencia);

// Edición manual de campos (PATCH /api/attendance/editar)
router.patch('/editar', manualEdit);

// Reporte mensual consolidado (GET /api/attendance/payroll-report?month=...)
router.get('/payroll-report', getPayrollReport);

// Obtener historial del trabajador para "Mis Pagos"
router.get('/worker/:workerId', getAttendanceByWorker);

// --- NUEVA RUTA DE CÁLCULO ---

router.get('/calculate-daily/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        // Definimos el inicio y fin del día actual para la búsqueda
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const attendance = await Attendance.findOne({ 
            userId: user._id, 
            date: { $gte: start, $lte: end } // Buscamos en el rango del día de hoy
        });

        // REGLA: Si no hay asistencia pero es Domingo, se calcula el pago legal
        const isSunday = new Date().getDay() === 0;

        if (attendance || isSunday) {
            // Si es domingo y no vino, asumimos 8h base. Si vino, usamos sus horas reales.
            const horas = attendance ? (attendance.totalHours || 0) : (isSunday ? 8 : 0);
            const sueldoBase = horas * user.hourlyRate;
            
            // Sumamos el adicional (Cena/Pasaje)
            const pagoDelDia = sueldoBase + (user.additionalDaily || 0);

            return res.json({
                trabajador: `${user.name} ${user.lastName}`,
                fecha: new Date().toLocaleDateString('es-PE'),
                sueldoBase: sueldoBase.toFixed(2),
                bonoAdicional: (user.additionalDaily || 0).toFixed(2),
                total: pagoDelDia.toFixed(2),
                isSunday
            });
        }

        res.status(404).json({ message: "No hay registro de asistencia para hoy" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el cálculo del pago diario" });
    }
});

export default router;