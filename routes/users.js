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

        const hoy = new Date().toISOString().split('T')[0];

        // Buscar si ya tiene una asistencia iniciada hoy que no tenga hora de salida
    let registroHoy = user.attendance.find(a => a.date === hoy && !a.exitTime);

    if (!registroHoy) {
        // ES UNA ENTRADA
        user.attendance.push({
            date: hoy,
            entryTime: new Date(),
            exitTime: null,
            observations: ""
        });
        await user.save();
        return res.json({ success: true, message: `Entrada registrada: ${user.name}` });
    } else {
        // ES UNA SALIDA
        registroHoy.exitTime = new Date();
        await user.save();
        return res.json({ success: true, message: `Salida registrada: ${user.name}` });
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