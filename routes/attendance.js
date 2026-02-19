import express from 'express';
import { 
    getPayrollReport, 
    manualEdit, 
    registrarAsistencia, 
    getAttendanceByDate 
} from '../controllers/attendanceController.js';

const router = express.Router();

// Obtener asistencias de un día específico (GET /api/attendance?date=...)
router.get('/', getAttendanceByDate);

// Registro vía QR o botón (POST /api/attendance/registrar)
router.post('/registrar', registrarAsistencia);

// Edición manual de campos (PATCH /api/attendance/editar)
router.patch('/editar', manualEdit);

// Reporte mensual consolidado (GET /api/attendance/payroll-report?month=...)
router.get('/payroll-report', getPayrollReport);

// NUEVA RUTA: Para que "Mis Pagos" obtenga el historial del trabajador
router.get('/worker/:workerId', getAttendanceByWorker);
export default router;