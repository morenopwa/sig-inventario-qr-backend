import express from 'express';
import mongoose from 'mongoose';
// IMPORTANTE: Importa el modelo directamente para evitar errores de "MissingSchema"
import User from '../models/User.js'; 

const router = express.Router();


router.post('/asistencia', async (req, res) => {
    // Aceptamos workerId (DNI o ID) desde el body
    const { workerId } = req.body;

    try {
        if (!workerId) {
            return res.status(400).json({ message: "No se recibió un código válido" });
        }

        // 1. Buscar al usuario (por DNI o por ID de MongoDB)
        const user = await User.findOne({ 
            $or: [
                { dni: workerId.toString().trim() }, 
                { _id: (workerId.length === 24) ? workerId : null }
            ].filter(condition => condition.dni || condition._id)
        });

        if (!user) {
            return res.status(404).json({ message: "Trabajador no registrado" });
        }

        // 2. Obtener fecha de Perú (YYYY-MM-DD)
        const ahora = new Date();
        const hoyPeru = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(ahora);

        // 3. Inicializar el array de asistencia si no existe (Evita el Error 500)
        if (!user.attendance) {
            user.attendance = [];
        }

        // 4. Buscar registro de hoy
        let registroHoy = user.attendance.find(a => a.date === hoyPeru);

        if (!registroHoy) {
            // REGISTRAR ENTRADA
            user.attendance.push({
                date: hoyPeru,
                entryTime: ahora,
                observations: "Entrada QR"
            });
            await user.save();
            return res.json({ success: true, message: "Entrada marcada" });
        } 
        
        if (!registroHoy.exitTime) {
            // REGISTRAR SALIDA
            registroHoy.exitTime = ahora;
            // Forzamos a Mongoose a notar el cambio en el array
            user.markModified('attendance');
            await user.save();
            return res.json({ success: true, message: "Salida marcada" });
        }

        // Si ya tiene entrada y salida
        return res.status(400).json({ message: "Ya registró entrada y salida hoy" });

    } catch (error) {
        console.error("ERROR EN BACKEND:", error);
        res.status(500).json({ 
            message: "Error interno en el servidor", 
            details: error.message 
        });
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