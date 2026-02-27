import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { 
    format, parseISO, startOfMonth, endOfMonth, 
    eachDayOfInterval, isSunday
} from 'date-fns';

// 1. OBTENER ASISTENCIAS POR FECHA
export const getAttendanceByDate = async (req, res) => {
    const { date } = req.query; 
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

// 2. REGISTRAR ASISTENCIA (QR / BOTÓN) - LÓGICA DE MARCADO INTELIGENTE
export const registrarAsistencia = async (req, res) => {
    const { workerId, date } = req.body; 
    const ahora = new Date();
    
    // Si no viene fecha del frontend, usamos la fecha actual en formato Peruano para la base de datos
    const fechaParaRegistro = date || ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        // 1. Buscamos al usuario por CustomID, DNI o ID de Mongo
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

        // 2. Buscamos si ya existe un registro para ESE trabajador en ESA fecha
        // Usamos user._id (el ID real de la DB) para evitar conflictos con el workerId del QR
        let registro = await Attendance.findOne({ worker: user._id, date: fechaParaRegistro });

        // ESCENARIO A: No ha marcado nada hoy -> Registrar ENTRADA
        if (!registro) {
            registro = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: fechaParaRegistro,
                checkIn: ahora.toISOString()
            });
            await registro.save();
            return res.json({ 
                success: true, 
                message: `Entrada registrada: ${user.name} ${user.lastName}`, 
                type: 'IN' 
            });
        } 

        // ESCENARIO B: Ya tiene entrada pero falta salida -> Registrar SALIDA
        // Verificamos explícitamente que checkIn exista y checkOut sea nulo/vacío
        if (registro.checkIn && !registro.checkOut) {
            registro.checkOut = ahora.toISOString();
            await registro.save();
            return res.json({ 
                success: true, 
                message: `Salida registrada: ${user.name} ${user.lastName}`, 
                type: 'OUT' 
            });
        }

        // ESCENARIO C: Ya tiene AMBOS marcados -> Modo Consulta / Error
        if (registro.checkIn && registro.checkOut) {
            return res.status(400).json({ 
                message: `El trabajador ya completó su jornada el día ${fechaParaRegistro}.`,
                status: 'FULL' 
            });
        }

    } catch (error) {
        console.error("Error en registrarAsistencia:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

// 3. OBTENER HISTORIAL POR TRABAJADOR
export const getAttendanceByWorker = async (req, res) => {
    try {
        const { workerId } = req.params;
        const history = await Attendance.find({ worker: workerId });
        res.json(history);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener historial" });
    }
};

// 4. EDITAR ASISTENCIA (MANUAL DESDE LA TABLA)
export const manualEdit = async (req, res) => {
    const { attendanceId, workerId, date, field, value } = req.body;
    
    try {
        let attendance;
        if (attendanceId) {
            attendance = await Attendance.findByIdAndUpdate(
                attendanceId, 
                { [field]: value }, 
                { new: true }
            );
        } else {
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

// 5. REPORTE DE NÓMINA (INCLUYE BONOS Y DOMINGOS LEGALES)
export const getPayrollReport = async (req, res) => {
    const { month } = req.query; // Formato YYYY-MM
    try {
        const start = startOfMonth(parseISO(`${month}-01`));
        const end = endOfMonth(start);
        const daysInMonth = eachDayOfInterval({ start, end });

        const [users, logs] = await Promise.all([
            User.find({ isActive: true }),
            Attendance.find({
                date: { $regex: new RegExp(`^${month}`) }
            })
        ]);

        const report = users.map(user => {
            let totalNormalHours = 0;
            let totalExtraHours = 0;
            let totalBonos = 0;
            let daysWorkedCount = 0;

            const dailyDetails = daysInMonth.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const log = logs.find(l => 
                    l.worker.toString() === user._id.toString() && l.date === dateStr
                );

                let h = 0;
                let isDom = isSunday(day);

                // Lógica de Domingos: Se pagan siempre 8h según ley
                if (isDom) {
                    h = 8; 
                    totalBonos += (user.additionalDaily || 0);
                } else if (log) {
                    if (log.manualHours !== undefined && log.manualHours !== null) {
                        h = Number(log.manualHours);
                    } else if (log.checkIn && log.checkOut) {
                        const diff = new Date(log.checkOut) - new Date(log.checkIn);
                        h = diff / (1000 * 60 * 60);
                    }
                    if (h > 0) {
                        totalBonos += (user.additionalDaily || 0);
                        daysWorkedCount++;
                    }
                }

                const nH = Math.min(h, 8);
                const eH = Math.max(0, h - 8);
                totalNormalHours += nH;
                totalExtraHours += eH;

                return {
                    date: dateStr,
                    hours: Number(h.toFixed(2)),
                    isSunday: isDom,
                    bonus: (isDom || (log && h > 0)) ? user.additionalDaily : 0
                };
            });

            const paymentNormal = totalNormalHours * user.hourlyRate;
            const paymentExtras = totalExtraHours * (user.hourlyRate * 1.25);

            return {
                workerId: user._id,
                name: user.name,
                lastName: user.lastName,
                role: user.role,
                hourlyRate: user.hourlyRate,
                additionalDaily: user.additionalDaily || 0,
                summary: {
                    totalNormalHours: Number(totalNormalHours.toFixed(2)),
                    totalExtraHours: Number(totalExtraHours.toFixed(2)),
                    totalBonos: Number(totalBonos.toFixed(2)),
                    daysWorked: daysWorkedCount,
                    totalPayment: Number((paymentNormal + paymentExtras + totalBonos).toFixed(2))
                },
                dailyDetails
            };
        });

        res.json(report);
    } catch (error) {
        console.error("Error en getPayrollReport:", error);
        res.status(500).json({ error: "Error al generar reporte de nómina" });
    }
};