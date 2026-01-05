import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';

const router = express.Router();

// @route   POST /api/transactions
// @desc    Registrar un movimiento (IN/OUT) y actualizar el stock del item
router.post('/', async (req, res) => {
    try {
        // Extraemos los datos enviados por el frontend
        const { quantity, itemName, personName, type } = req.body;
        const normalizedName = itemName.trim().toUpperCase();
        
        // 1. Buscar el Item (o crearlo automáticamente si no existe)
        let item = await Item.findOne({ name: normalizedName });
        if (!item) {
            item = new Item({ 
                name: normalizedName, 
                stock: 0, 
                category: 'General',
                qrCode: `AUTO-${Date.now()}`
            });
            await item.save();
        }

        // 2. Calcular el impacto en el inventario según el tipo (IN aumenta, OUT resta)
        const factor = type === 'IN' ? parseInt(quantity) : -parseInt(quantity);

        // 3. Crear la nueva transacción con los campos exactos del modelo
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: parseInt(quantity),
            itemName: normalizedName,
            personName: personName || "OPERARIO",
            type: type, // 'IN' o 'OUT'
            timestamp: new Date()
        });

        // 4. Actualizar el stock del Item y guardar
        item.stock += factor;
        
        // Guardamos la transacción y la actualización del item simultáneamente
        await Promise.all([newTransaction.save(), item.save()]);

        // Respuesta de éxito al cliente
        res.status(201).json({ 
            success: true, 
            message: "Movimiento registrado correctamente",
            data: newTransaction 
        });

    } catch (err) {
        // Error detallado para el programador
        console.error("Error en la ruta de transacciones:", err);
        res.status(500).json({ 
            success: false, 
            message: "Error interno del servidor al procesar el registro",
            error: err.message 
        });
    }
});

// @route   GET /api/transactions
// @desc    Obtener el historial reciente de movimientos
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(30);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            message: "No se pudo obtener el historial",
            error: err.message 
        });
    }
});

export default router;