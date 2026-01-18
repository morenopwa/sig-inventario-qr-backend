import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos requeridos." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const numericQuantity = parseInt(quantity);

        // 1. Buscar el Item
        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            const currentPrefix = category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'General',
                customId: `${currentPrefix}-${Date.now()}`, 
                unit: 'Unit'
            });
            await item.save();
        }

        // Reparación de items antiguos (GEN-OLD...)
        if (!item.customId) {
            const repairPrefix = item.category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            item.customId = `${repairPrefix}-OLD-${Date.now()}`;
        }

        // 3. Lógica de Stock
        if (type === 'OUT') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ success: false, message: `Stock insuficiente: ${item.stock}` });
            }
            item.stock -= numericQuantity;
        } else {
            item.stock += numericQuantity;
        }

        item.history.push({
            action: type,
            quantity: numericQuantity,
            user: normalizedPersonName,
            timestamp: new Date()
        });

        // 4. Preparar documentos
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type
        });

        // 5. KARDEX (Movement) - REVISIÓN DE CAMPOS
        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: type === 'IN' ? 'Compra' : 'Salida', 
            quantity: numericQuantity,
            workerName: normalizedPersonName,
            date: new Date(),
            unitCost: 0,
            destination: 'ALMACEN' 
        });

        // 6. GUARDADO SECUENCIAL PARA LOCALIZAR ERROR
        console.log("--- Iniciando guardado de datos ---");
        
        await item.save();
        console.log("✅ Item guardado");

        await newTransaction.save();
        console.log("✅ Transacción (Chat) guardada");

        // Intentar guardar Kardex capturando error específico
        try {
            await newKardexEntry.save();
            console.log("✅ Kardex (Movement) guardado exitosamente");
        } catch (kardexError) {
            console.error("❌ ERROR ESPECÍFICO EN KARDEX:", kardexError.message);
            // No bloqueamos la respuesta al usuario si solo falla el kardex
        }

        res.status(201).json({ 
            success: true, 
            message: "Registro procesado", 
            data: newTransaction 
        });

    } catch (err) {
        console.error("❌ ERROR GENERAL:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/transactions
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;