import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';

const router = express.Router();

// @route   POST /api/transactions
router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;
        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName.trim().toUpperCase();
        const numericQuantity = parseInt(quantity);

        // 1. Buscar el Item o crearlo automáticamente
        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            // Generar prefijo de QR según categoría para el nuevo ítem
            const prefix = {
                'HERRAMIENTA': 'HER-',
                'CONSUMIBLE': 'CON-',
                'MAQUINARIA': 'MAQ-',
                'EPP': 'EPP-'
            }[category?.toUpperCase()] || 'GEN-';

            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'General',
                qrCode: `${prefix}${Date.now()}`
            });
            await item.save();
        }

        // 2. Validar Stock si es salida (OUT)
        if (type === 'OUT' && item.stock < numericQuantity) {
            return res.status(400).json({ 
                success: false, 
                message: `Stock insuficiente de ${normalizedItemName}. Disponible: ${item.stock}` 
            });
        }

        // 3. Crear el registro de la Transacción (Asignación)
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type, // 'IN' o 'OUT'
            timestamp: new Date()
        });

        // 4. Actualizar Stock del Item
        const stockFactor = type === 'IN' ? numericQuantity : -numericQuantity;
        item.stock += stockFactor;

        // 5. Guardar en historial interno del item para trazabilidad
        item.history.push({
            action: type,
            quantity: numericQuantity,
            user: normalizedPersonName,
            timestamp: new Date()
        });

        await Promise.all([newTransaction.save(), item.save()]);

        res.status(201).json({ 
            success: true, 
            message: "Movimiento registrado con éxito",
            data: newTransaction 
        });

    } catch (err) {
        console.error("Error en servidor:", err);
        res.status(500).json({ success: false, message: "Error interno", error: err.message });
    }
});

// @route   GET /api/transactions
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;