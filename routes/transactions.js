import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';

const router = express.Router();

// @route   POST /api/transactions
// @desc    Registrar un movimiento (IN/OUT) y actualizar el stock del item
router.post('/', async (req, res) => {
    try {
        // Recibimos los datos. Nota: Usamos nombres en inglés para las variables internas
        const { quantity, itemName, personName, type } = req.body;

        // Validación preventiva para el programador
        if (!quantity || isNaN(quantity)) {
            return res.status(400).json({ message: "La cantidad debe ser un número válido." });
        }
        if (!type || !['IN', 'OUT'].includes(type)) {
            return res.status(400).json({ message: "El tipo debe ser 'IN' o 'OUT'." });
        }

        const normalizedName = itemName.trim().toUpperCase();
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

        // Convertimos a número de forma segura
        const numericQuantity = parseInt(quantity);
        const factor = type === 'IN' ? numericQuantity : -numericQuantity;

        // Crear la transacción con los campos exactos de tu Schema (personName, quantity, type)
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedName,
            personName: personName || "OPERARIO",
            type: type, // Aquí llegará 'IN' o 'OUT'
            timestamp: new Date()
        });

        item.stock += factor;
        await Promise.all([newTransaction.save(), item.save()]);

        res.status(201).json({ success: true, data: newTransaction });

    } catch (err) {
        console.error("Error detallado en el registro:", err);
        res.status(500).json({ success: false, message: "Error en la validación de datos", error: err.message });
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