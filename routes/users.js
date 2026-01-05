import express from 'express';
import User from '../models/User.js'; 
import Attendance from '../models/Attendance.js';

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
        const { lastName, password } = req.body;
        const user = await User.findOne({ lastName: lastName.trim(), password: password.trim() });

        if (user) {
            res.json({ 
                success: true, 
                user: { 
                    _id: user._id, 
                    name: user.name, 
                    lastName: user.lastName, 
                    role: user.role, // CAMPO RESTAURADO
                    accessLevel: user.accessLevel 
                } 
            });
        } else {
            res.status(401).json({ success: false, message: "Datos incorrectos" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Obtener todos
router.get('/', async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ lastName: 1 });
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crear usuario (con validación de DNI)
router.post('/', async (req, res) => {
    try {
        const { dni } = req.body;
        const existingUser = await User.findOne({ dni });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: `El DNI ${dni} ya pertenece a ${existingUser.name}` 
            });
        }

        const newUser = new User(req.body);
        await newUser.save();
        res.status(201).json({ success: true, user: newUser });
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message });
    }
});

// Editar usuario
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        // Limpieza de email para evitar errores de duplicado si está vacío
        if (updateData.email === "" || (updateData.email && updateData.email.trim() === "")) {
            updateData.email = undefined; 
        }

        const updatedUser = await User.findByIdAndUpdate(
            id, 
            { $set: updateData }, 
            { new: true, runValidators: true }
        );

        if (!updatedUser) return res.status(404).json({ message: "Usuario no encontrado" });
        res.json(updatedUser);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: "Error: DNI o Email ya registrados." });
        }
        res.status(500).json({ message: "Error interno" });
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
        // Suponiendo que tu modelo de Worker tiene un campo 'lastName'
        const workers = await Worker.find({}, 'lastName'); 
        res.json(workers.map(w => w.lastName.toUpperCase()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;