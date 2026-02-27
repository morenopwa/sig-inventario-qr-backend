import express from 'express';
import User from '../models/User.js'; 
import Attendance from '../models/Attendance.js';
import verifyToken from '../middleware/verifyToken.js';

const router = express.Router();

// --- 1. REGISTRO DE ASISTENCIA (QR SCANNER) ---
router.post('/asistencia', async (req, res) => {
    const { workerId } = req.body; // Aquí llega el customId (EMP-2026-001)
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        // Buscamos por customId (QR) o por DNI (Backup)
        const user = await User.findOne({ 
            $or: [
                { customId: workerId }, 
                { dni: workerId }
            ] 
        });

        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        if (!registroHoy) {
            const nuevaAsistencia = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: hoyPeru,
                checkIn: ahora
            });
            await nuevaAsistencia.save();
            return res.json({ success: true, message: `Entrada: ${user.name}` });
        } 
        
        if (!registroHoy.checkOut) {
            registroHoy.checkOut = ahora;
            await registroHoy.save();
            return res.json({ success: true, message: `Salida: ${user.name}` });
        }

        return res.status(400).json({ message: "Ya marcó entrada y salida hoy" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// --- 2. LOGIN ---
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Datos incompletos" });

        const search = username.trim().toUpperCase();

        // Búsqueda flexible por nombre o apellido
        const user = await User.findOne({ 
            $or: [
                { name: { $regex: new RegExp('^' + search) } },
                { lastName: { $regex: new RegExp('^' + search) } }
            ],
            password: password.trim() 
        });

        if (user) {
            res.json({ 
                success: true, 
                user: { 
                    _id: user._id, 
                    name: user.name, 
                    lastName: user.lastName, 
                    role: user.role,
                    accessLevel: user.accessLevel 
                } 
            });
        } else {
            res.status(401).json({ success: false, message: "Nombre/Apellido o DNI incorrectos" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Error en el servidor" });
    }
});

// Obtener todos los usuarios
router.get('/', async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ lastName: 1 });
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREAR NUEVO USUARIO (Actualizado con Birthday y WeeklyBonus)
router.post('/', async (req, res) => {
    try {
        const { name, lastName, dni, birthday, weeklyBonus } = req.body;

        const newUser = new User({
            ...req.body,
            name: name.trim().toUpperCase(),
            lastName: lastName.trim().toUpperCase(),
            // Manejo de fecha de cumpleaños
            birthday: birthday ? new Date(birthday) : null,
            // Aseguramos que el bono sea número
            weeklyBonus: parseFloat(weeklyBonus) || 0,
            customId: req.body.customId || `QR-${dni || Date.now()}`.toUpperCase()
        });

        await newUser.save();
        res.status(201).json({ success: true, data: newUser });
    } catch (err) {
        console.error("Error al guardar:", err.message);
        res.status(400).json({ message: "Error de validación: " + err.message });
    }
});

// ACTUALIZAR USUARIO (Actualizado con Birthday y WeeklyBonus)
router.put('/:id', async (req, res) => {
    try {
        const updateData = { ...req.body };
        
        if (updateData.name) updateData.name = updateData.name.trim().toUpperCase();
        if (updateData.lastName) updateData.lastName = updateData.lastName.trim().toUpperCase();
        
        // Convertir fecha si viene en el update
        if (updateData.birthday) updateData.birthday = new Date(updateData.birthday);
        if (updateData.weeklyBonus !== undefined) updateData.weeklyBonus = parseFloat(updateData.weeklyBonus) || 0;

        const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, data: updatedUser });
    } catch (err) {
        res.status(400).json({ message: "Error al actualizar" });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/lastnames', async (req, res) => {
    try {
        // Corregido: Usar 'User' en lugar de 'Worker' si ese es tu modelo
        const users = await User.find({}, 'lastName'); 
        res.json(users.map(u => u.lastName.toUpperCase()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar tarifa por hora
router.patch('/:id/rate', async (req, res) => {
    try {
        const { hourlyRate } = req.body;
        if (isNaN(hourlyRate) || hourlyRate < 0) {
            return res.status(400).json({ message: "La tarifa debe ser un número válido" });
        }

        await User.findByIdAndUpdate(req.params.id, { hourlyRate });
        res.json({ success: true, message: "Tarifa actualizada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar la tarifa" });
    }
});

// Estadísticas del trabajador logueado
router.get('/my-stats', verifyToken, async (req, res) => {
    try {
        const workerId = req.user.id; 
        const workerName = req.user.name.toUpperCase();

        const attendance = await Attendance.find({ worker: workerId });

        // Nota: Asegúrate que el modelo Transaction exista y esté importado si lo usas
        // const payments = await Transaction.find({ 
        //     personName: workerName,
        //     operationType: { $in: ['PAGO', 'ADELANTO'] } 
        // });

        res.json({ attendance, payments: [] }); 
    } catch (err) {
        res.status(500).json({ error: "Error al obtener tus datos" });
    }
});

// Obtener herramientas bajo mi cargo
router.get('/my-loans', verifyToken, async (req, res) => {
    try {
        const workerName = req.user.name.toUpperCase();
        
        // Nota: Requiere importar el modelo 'Item'
        const items = await Item.find({
            "activeLoans.workerName": workerName
        });

        const myLoans = items.map(item => {
            const loan = item.activeLoans.find(l => l.workerName === workerName);
            return {
                name: item.name,
                unit: item.unit,
                quantity: loan.quantity,
                date: loan.date
            };
        });

        res.json(myLoans);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener tus préstamos" });
    }
});

export default router;