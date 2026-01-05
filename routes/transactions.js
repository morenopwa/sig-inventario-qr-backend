import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';

const router = express.Router();

// @route   POST /api/transactions
// @desc    Registrar un movimiento (IN/OUT) y actualizar el stock del item
router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;
        const normalizedName = itemName.trim().toUpperCase();
        
        // 1. Buscar el ítem
        let item = await Item.findOne({ name: normalizedName });
        
        // 2. Si no existe, lo creamos con QR automático según categoría
        if (!item) {
            const prefix = {
                'HERRAMIENTA': 'HER-',
                'CONSUMIBLE': 'CON-',
                'MAQUINARIA': 'MAQ-'
            }[category?.toUpperCase()] || 'GEN-';

            item = new Item({ 
                name: normalizedName, 
                stock: 0, 
                category: category || 'General',
                qrCode: `${prefix}${Date.now()}` // Generación automática
            });
            await item.save();
        }

        // 3. Lógica de Stock: Si es 'OUT' (salida/préstamo), restamos.
        const numericQuantity = parseInt(quantity);
        if (type === 'OUT' && item.stock < numericQuantity) {
            return res.status(400).json({ message: `Stock insuficiente. Disponible: ${item.stock}` });
        }

        const factor = type === 'IN' ? numericQuantity : -numericQuantity;
        item.stock += factor; // Aquí es donde ocurre la resta en el inventario

        // 4. Registrar la transacción con el nombre del trabajador (Pepito)
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedName,
            personName: personName || "GENERAL", 
            type: type,
            timestamp: new Date()
        });

        // Guardar cambios
        await Promise.all([newTransaction.save(), item.save()]);

        res.status(201).json({ success: true, data: newTransaction, newStock: item.stock });
    } catch (err) {
        console.error("Error en transacción:", err);
        res.status(500).json({ message: "Error al procesar el registro", error: err.message });
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