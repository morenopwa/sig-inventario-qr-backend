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
router.put('/:id/update-profile', authenticateJWT, async (req, res) => {
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
        const user = await User.findOne({ lastName: lastName.trim(), password: password.trim() });
        if (user) {
            res.json({ success: true, user: { 
                _id: user._id, 
                name: user.name, 
                lastName: user.name, 
                dni: user.name, 
                phone: user.role,
                role: user.role,

            } });
        } else {
            res.status(401).json({ success: false, message: "Nombre o PIN incorrectos" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});


export default router;