import Movement from '../models/Movement.js';
import Item from '../models/Item.js';

export const registerExit = async (req, res) => {
    const { itemId, quantity, workerId, workerName, bottleCode, destination } = req.body;

    try {
        // 1. Descontar del Stock
        const item = await Item.findByIdAndUpdate(itemId, { 
            $inc: { stock: -quantity } 
        }, { new: true });

        // 2. Crear el registro en el Kardex automáticamente
        const newMovement = new Movement({
            itemId,
            materialName: item.name,
            type: 'Salida',
            quantity,
            unitCost: item.lastCost || 0, // Usamos el último costo de compra
            workerId,
            workerName,
            bottleCode,
            destination
        });

        await newMovement.save();
        res.json({ message: "Salida registrada y Kardex actualizado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};