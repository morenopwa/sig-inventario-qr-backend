import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js'; // Tu nuevo modelo de Kardex

const router = express.Router();

// @route   POST /api/transactions (Desde el Chat)
router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;
        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName.trim().toUpperCase();
        const numericQuantity = parseInt(quantity);

        // 1. Buscar el Item o crearlo automáticamente
        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            const categoryMap = {
                'HERRAMIENTAS': 'Herramientas',
                'CONSUMIBLES': 'Consumibles',
                'MAQUINARIA': 'Maquinaria',
                'EPP': 'EPP'
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

        // 3. Preparar las actualizaciones
        const stockFactor = type === 'IN' ? numericQuantity : -numericQuantity;
        item.stock += stockFactor;

        // 4. Crear el registro para el CHAT (Burbujas)
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type, // 'IN' o 'OUT'
            timestamp: new Date()
        });

        // 5. Crear el registro para el KARDEX (Auditoría)
        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            // Mapeamos 'IN' a 'Compra' y 'OUT' a 'Salida' para que coincida con tu enum
            type: type === 'IN' ? 'Compra' : 'Salida', 
            quantity: numericQuantity,
            workerName: normalizedPersonName, // Aquí guardamos quién se lo llevó
            date: new Date(),
            unitCost: item.lastCost || 0,
            destination: 'ALMACÉN CENTRAL' // Puedes hacerlo dinámico después
        });

       // 6. Guardar todo
        await Promise.all([
            newTransaction.save(), 
            newKardexEntry.save(), 
            item.save()
        ]);

        res.status(201).json({ 
            success: true, 
            message: "Movimiento y Kardex registrados",
            data: newTransaction 
        });

    } catch (err) {
        console.error("Error en registro:", err);
        res.status(500).json({ success: false, message: "Error interno" });
    }
});

// @route   GET /api/transactions (Para cargar el historial del chat)
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;