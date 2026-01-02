import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();
const User = mongoose.model('User');


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
            console.log(`✅ Apellido encontrado. Su password en DB es: ${existeApellido.password}`);
            console.log(`🤔 Password ingresado: ${password}`);
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
                role: user.role,
                sueldoBase: user.sueldoBase
                
            } });
        } else {
            console.log("❌ Usuario no encontrado en la DB");
            res.status(401).json({ success: false, message: "Nombre o PIN incorrectos" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});


export default router;