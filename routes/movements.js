import express from 'express';
import Movement from '../models/Movement.js';

const router = express.Router();

// ... (tus otras rutas GET)

// NUEVA RUTA: Actualizar un movimiento (Destino, Alias, etc.)
router.put('/:id', async (req, res) => {
    try {
        const { destination, alias, unit } = req.body;
        const updatedMovement = await Movement.findByIdAndUpdate(
            req.params.id,
            { $set: { destination, alias, unit } },
            { new: true } // Para que devuelva el objeto ya actualizado
        );
        
        if (!updatedMovement) return res.status(404).json({ error: "Movimiento no encontrado" });
        
        res.json(updatedMovement);
    } catch (err) {
        console.error("❌ Error al actualizar movimiento:", err);
        res.status(500).json({ error: "Error al actualizar el registro" });
    }
});

export default router;