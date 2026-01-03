import Attendance from '../models/Attendance.js';
import User from '../models/User.js';

// GET: Obtener asistencias de un día específico
router.get('/', async (req, res) => {
    try {
        const { date } = req.query; // Ejemplo: /api/attendance?date=2026-01-03
        const asistencias = await Attendance.find({ date });
        res.json(asistencias);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener datos" });
    }
});

// POST: Registrar Entrada/Salida
router.post('/registrar', async (req, res) => {
    const { workerId } = req.body;
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        const user = await User.findOne({ $or: [{ dni: workerId }, { _id: workerId.length === 24 ? workerId : null }] });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        if (!registroHoy) {
            const nuevaEntrada = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: hoyPeru,
                entryTime: ahora
            });
            await nuevaEntrada.save();
            return res.json({ success: true, message: "Entrada registrada" });
        } 
        
        if (!registroHoy.exitTime) {
            registroHoy.exitTime = ahora;
            await registroHoy.save();
            return res.json({ success: true, message: "Salida registrada" });
        }

        res.status(400).json({ message: "Ya registró entrada y salida hoy" });
    } catch (error) {
        res.status(500).json({ message: "Error interno" });
    }
});