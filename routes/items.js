import express from 'express';
import Item from '../models/Item.js';
import History from '../models/History.js'; // Importante para registrar el fin del préstamo

const router = express.Router();

// DEVOLVER HERRAMIENTA O ITEM
router.put('/devolver/:historyId', async (req, res) => {
    try {
        const { historyId } = req.params;
        const { itemId, quantity } = req.body;

        // 1. Aumentamos el stock en la colección Item
        await Item.findByIdAndUpdate(itemId, { $inc: { stock: quantity } });

        // 2. Actualizamos el estado en la colección History (Préstamo completado)
        // Buscamos por el ID del registro de la tabla History
        const updatedHistory = await History.findByIdAndUpdate(
            historyId,
            { $set: { status: "COMPLETED" } },
            { new: true }
        );

        // 3. Opcional: También podrías actualizar el history interno del Item si lo usas
        await Item.updateOne(
            { _id: itemId, "history._id": historyId },
            { $set: { "history.$.action": "RETURN" } }
        ).catch(() => {}); // Si no existe el subdocumento, lo ignoramos

        res.json({ success: true, message: "Devolución registrada y stock actualizado", data: updatedHistory });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al procesar devolución" });
    }
});

export default router;