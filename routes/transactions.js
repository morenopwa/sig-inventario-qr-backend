import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;
        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName.trim().toUpperCase();
        const numericQuantity = parseInt(quantity);

        // MAPEO DE CATEGORÍAS (Para que coincidan con las pestañas del frontend)
        const categoryMap = {
            'EPP': 'EPP',
            'MAQUINARIA': 'Maquinaria',
            'HERRAMIENTAS': 'Herramientas',
            'CONSUMIBLES': 'Consumibles'
        };
        const finalCategory = categoryMap[category?.toUpperCase()] || 'Consumibles';

        // 1. Buscar o Crear Item
        let item = await Item.findOne({ name: normalizedItemName });
        if (!item) {
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: finalCategory,
                qrCode: `QR-${Date.now()}`
            });
            await item.save();
        }

        // 2. Validar Stock en Salidas
        if (type === 'OUT' && item.stock < numericQuantity) {
            return res.status(400).json({ success: false, message: "Stock insuficiente" });
        }

        // 3. Actualizar Stock
        item.stock += (type === 'IN' ? numericQuantity : -numericQuantity);

        // 4. Registro para el Chat
        const newTx = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type,
            timestamp: new Date()
        });

        // 5. Registro para el Kardex
        const newKardex = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: type === 'IN' ? 'Compra' : 'Salida',
            quantity: numericQuantity,
            workerName: normalizedPersonName,
            date: new Date(),
            destination: 'ALMACÉN CENTRAL'
        });

        // 6. Guardar Todo (Atomic)
        await Promise.all([newTx.save(), newKardex.save(), item.save()]);

        res.status(201).json({ success: true, data: newTx });
    } catch (err) {
        console.error("Error en Transacción:", err);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
});

// GET Historial del Chat
router.get('/', async (req, res) => {
    try {
        const txs = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(txs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;