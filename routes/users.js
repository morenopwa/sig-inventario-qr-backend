import express from 'express';
import mongoose from 'mongoose';
// IMPORTANTE: Importa el modelo directamente para evitar errores de "MissingSchema"
import User from '../models/User.js'; 

const router = express.Router();


// RUTA POST: REGISTRAR ASISTENCIA (ENTRADA/SALIDA)
router.post('/asistencia', async (req, res) => {
    const { workerId } = req.body; // El QR envía el ID del usuario (o DNI)

    try {
        // 1. Buscar al usuario
        // Usamos $or por si el QR envía el _id o el DNI
        const user = await User.findOne({ 
            $or: [{ _id: workerId }, { dni: workerId }] 
        });

        if (!user) {
            return res.status(404).json({ message: "Trabajador no encontrado" });
        }

        // 2. OBTENER HORA Y FECHA ACTUAL EN PERÚ
        // Esto asegura que no importa donde esté el servidor, siempre use hora Lima
        const ahora = new Date();
        const opciones = { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' };
        
        // Genera "YYYY-MM-DD" para Perú
        const [dia, mes, anio] = ahora.toLocaleDateString('es-PE', opciones).split('/');
        const hoyPeruStr = `${anio}-${mes}-${dia}`; 
        
        // 3. BUSCAR SI YA TIENE REGISTRO HOY
        // Buscamos dentro del array 'attendance' un objeto que tenga la fecha de hoy
        if (!user.attendance) user.attendance = [];
        let registroHoy = user.attendance.find(a => a.date === hoyPeruStr);

        if (!registroHoy) {
            // A. NO TIENE ENTRADA: Creamos el registro del día
            user.attendance.push({
                date: hoyPeruStr,
                entryTime: ahora, // Guardamos el objeto Date completo
                observations: "Entrada registrada"
            });
            await user.save();
            return res.status(200).json({ success: true, message: "Entrada registrada correctamente" });
        } 
        
        if (!registroHoy.exitTime) {
            // B. TIENE ENTRADA PERO NO SALIDA: Registramos salida
            registroHoy.exitTime = ahora;
            await user.save();
            return res.status(200).json({ success: true, message: "Salida registrada correctamente" });
        } 
        
        // C. YA TIENE AMBAS MARCAS
        return res.status(400).json({ 
            message: "El trabajador ya cuenta con registro de entrada y salida para hoy." 
        });

    } catch (error) {
        console.error("Error en asistencia:", error);
        res.status(500).json({ message: "Error interno del servidor" });
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