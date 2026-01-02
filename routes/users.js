import express from 'express';
import mongoose from 'mongoose';
// IMPORTANTE: Importa el modelo directamente para evitar errores de "MissingSchema"
import User from '../models/User.js'; 

const router = express.Router();

// --- 1. RUTA DE ASISTENCIA INTELIGENTE ---
// routes/users.js
router.post('/asistencia', async (req, res) => {
    try {
        const { workerId } = req.body; // Aquí llega "98765432"
        console.log("🔍 Buscando DNI:", workerId);

        // Buscamos al usuario por DNI
        const user = await User.findOne({ dni: workerId });

        if (!user) {
            return res.status(404).json({ message: "Trabajador no encontrado" });
        }

        if (!user.attendance || !Array.isArray(user.attendance)) {
            user.attendance = []; 
        }

        // --- SOLUCIÓN AL ERROR ---
        // Si el usuario no tiene el campo attendance, lo creamos como un array vacío
        if (!user.attendance) {
            user.attendance = [];
        }

        const ahora = new Date();
        const hoy = ahora.toISOString().split('T')[0];

        // Agregamos la asistencia
        user.attendance.push({
            date: new Date().toISOString().split('T')[0],
            timestamp: new Date(),
            type: 'scan_qr'
        });

        // Guardamos los cambios en MongoDB
        await user.save();
        
        console.log(`✅ Asistencia registrada para: ${user.name}`);
        res.json({ success: true, message: user.name });

    } catch (error) {
        console.error("❌ Error en servidor:", error);
        res.status(500).json({ error: "Error interno al guardar asistencia" });
    }
});

// --- 2. LOGIN OPTIMIZADO ---
router.post('/login', async (req, res) => {
    try {
        const { lastName, password } = req.body;
        const lName = lastName.trim();
        const pass = password.trim();

        const user = await User.findOne({ lastName: lName, password: pass });

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

// --- 3. CRUD BÁSICO ---

// Obtener todos
router.get('/', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crear trabajador
router.post('/', async (req, res) => {
    try {
        const newUser = new User(req.body);
        await newUser.save();
        res.status(201).json({ success: true, user: newUser });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Eliminar
router.delete('/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;