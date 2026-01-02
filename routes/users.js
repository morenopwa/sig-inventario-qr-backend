import express from 'express';
import mongoose from 'mongoose';
// IMPORTANTE: Importa el modelo directamente para evitar errores de "MissingSchema"
import User from '../models/User.js'; 

const router = express.Router();

// --- 1. RUTA DE ASISTENCIA INTELIGENTE ---
// routes/users.js
router.post('/asistencia', async (req, res) => {
    try {
        const { workerId } = req.body; // Este es el número que llega del escáner (ej: 23456789)
        console.log("🔍 Buscando trabajador con dato:", workerId);

        // IMPORTANTE: Buscamos en 'dni' porque 'workerId' no existe en tu modelo
        const user = await User.findOne({ 
            $or: [
                { dni: workerId },     // Busca coincidencia en la columna DNI
                { qrCode: workerId }   // Por si acaso también en qrCode
            ] 
        });

        if (!user) {
            console.log("❌ No se encontró nadie con ese DNI");
            return res.status(404).json({ message: "Trabajador no encontrado en la base de datos" });
        }

        // Si lo encuentra, registramos la asistencia
        const ahora = new Date();
        user.attendance.push({
            date: ahora.toISOString().split('T')[0],
            timestamp: ahora,
            type: 'scan_qr'
        });

        await user.save();
        console.log("✅ Asistencia marcada para:", user.name);
        
        res.json({ success: true, message: user.name });

    } catch (error) {
        console.error("error en /asistencia:", error);
        res.status(500).json({ error: error.message });
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