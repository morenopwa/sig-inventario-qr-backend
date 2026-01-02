import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();
const User = mongoose.model('User');

// Ruta para registrar asistencia mediante QR
router.post('/asistencia', async (req, res) => {
    try {
        const { workerId } = req.body;
        // Buscamos al usuario por su ID de trabajador o QR
        const user = await User.findOne({ $or: [{ workerId: workerId }, { qrCode: workerId }] });

        if (!user) {
            return res.status(404).json({ message: "Trabajador no encontrado" });
        }

        // Lógica de entrada/salida simple
        const ahora = new Date();
        const hoy = ahora.toISOString().split('T')[0];

        // Aquí podrías guardar en una colección de 'Attendance' 
        // o en un array dentro del usuario. Ejemplo simple:
        user.attendance.push({
            date: hoy,
            timestamp: ahora,
            type: 'scan_qr'
        });

        await user.save();
        res.json({ success: true, message: `Asistencia registrada: ${user.name}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Obtener todos los usuarios
router.get('/', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crear nuevo usuario (Trabajador)
router.post('/', async (req, res) => {
    try {
        const newUser = new User(req.body);
        await newUser.save();
        res.status(201).json({ success: true, user: newUser });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Actualizar perfil (La ruta que te daba error)
router.put('/:id/update-profile', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedUser = await User.findByIdAndUpdate(id, req.body, { new: true });
        res.json({ success: true, user: updatedUser });
    } catch (err) {
        res.status(500).json({ error: "Error al actualizar perfil" });
    }
});

// Eliminar usuario
router.delete('/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RUTAS DE AUTENTICACIÓN ---

router.post('/login', async (req, res) => {
    try {
        const { lastName, password } = req.body;

        // 1. Buscamos SOLO por apellido para ver si existe
        const existeApellido = await User.findOne({ lastName: lastName.trim() });
        
        if (!existeApellido) {
            console.log(`❌ El apellido "${lastName}" no existe en la columna lastName`);
        } else {
            console.log(`✅ Apellido encontrado.`);
        }

        const user = await User.findOne({
             lastName: lastName.trim(),
             password: password.trim()});

        if (user) {
            res.json({ success: true, user: { 
                _id: user._id, 
                name: user.name, 
                lastName: user.lastName, 
                dni: user.dni, 
                phone: user.phone,
                mail:user.mail,
                tipo:user.tipo,
                rol: user.rol,  
                nivelAcceso: user.nivelAcceso,
                sueldoBase: user.sueldoBase
                
            } });
        } else {
            console.log("❌ Usuario no encontrado en la DB");
            res.status(401).json({ success: false, message: "Nombre o PIN incorrectos" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});


export default router;