import express from 'express';
import { 
    getPayrollReport, 
    manualEdit, 
    registrarAsistencia, 
    getAttendanceByDate 
} from '../controllers/attendanceController.js';

const router = express.Router();

// Ruta para la tabla principal (obtener marcas de un día)
router.get('/', getAttendanceByDate);

// Ruta para el escáner QR
router.post('/registrar', registrarAsistencia);

// Ruta para edición manual de horas (PATCH)
router.patch('/editar', manualEdit);

// Ruta para reportes mensuales de nómina
router.get('/payroll-report', getPayrollReport);

export default router;