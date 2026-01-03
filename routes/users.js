import express from 'express';
import mongoose from 'mongoose';
// IMPORTANTE: Importa el modelo directamente para evitar errores de "MissingSchema"
import User from '../models/User.js'; 
import Attendance from '../models/Attendance.js';

const router = express.Router();


router.post('/asistencia', async (req, res) => {
    const { workerId } = req.body;
    const ahora = new Date();
    const hoyPeru = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    try {
        // 1. Validar que el usuario existe
        const user = await User.findOne({ $or: [{ dni: workerId }, { _id: workerId.length === 24 ? workerId : null }] });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        // 2. Buscar si ya existe un registro de asistencia para este usuario HOY
        let registroHoy = await Attendance.findOne({ worker: user._id, date: hoyPeru });

        if (!registroHoy) {
            // ENTRADA: Crear nuevo documento en la colección Attendance
            const nuevaAsistencia = new Attendance({
                worker: user._id,
                dni: user.dni,
                date: hoyPeru,
                entryTime: ahora
            });
            await nuevaAsistencia.save();
            return res.json({ success: true, message: "Entrada registrada" });
        } 
        
        if (!registroHoy.exitTime) {
            // SALIDA: Actualizar el documento existente
            registroHoy.exitTime = ahora;
            await registroHoy.save();
            return res.json({ success: true, message: "Salida registrada" });
        }

        return res.status(400).json({ message: "Ya marcó entrada y salida hoy" });
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});



// --- 2. LOGIN OPTIMIZADO ---
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
                    rol: user.rol,
                    nivelAcceso: user.nivelAcceso 
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

// Crear trabajador
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
        console.error("Error en POST /users:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Eliminar
router.delete('/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        // 🛠️ Validación de seguridad para el campo mail
        // Si el mail viene vacío o solo espacios, lo eliminamos del objeto
        // para que MongoDB/Mongoose no lance error de duplicado por string vacío.
        if (updateData.mail === "" || (updateData.mail && updateData.mail.trim() === "")) {
            updateData.mail = undefined; 
        }

        const updatedUser = await User.findByIdAndUpdate(
            id, 
            { $set: updateData }, 
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        res.json(updatedUser);
    } catch (error) {
        console.error("Error al actualizar usuario:", error);
        
        // Manejo específico para error de duplicado (DNI o Mail)
        if (error.code === 11000) {
            return res.status(400).json({ 
                message: "Error: El DNI o Correo ya están registrados por otro usuario." 
            });
        }
        
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

export default router;