import express from 'express';
import Movement from '../models/Movement.js';

const router = express.Router();

// GET /api/movements
router.get('/', async (req, res) => {
    try {
        // Buscamos todos los movimientos
        // .populate('itemId', 'name category') por si necesitas más datos del item
        const movements = await Movement.find()
            .sort({ date: -1 }) // Los más recientes primero
            .limit(100);       // Limitamos a 100 para no saturar
            
        res.json(movements);
    } catch (err) {
        console.error("❌ Error al obtener movimientos:", err);
        res.status(500).json({ error: "Error al obtener el historial del Kardex" });
    }
});

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