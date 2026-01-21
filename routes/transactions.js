import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        // Recibimos operationType desde el frontend
        const { quantity, itemName, personName, type, category, operationType } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos requeridos." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        
        // 1. CAMBIO CRUCIAL: Usar parseFloat en lugar de parseInt para detectar kilos/decimales
        const numericQuantity = parseFloat(quantity);

        if (isNaN(numericQuantity)) {
            return res.status(400).json({ success: false, message: "La cantidad debe ser un número válido." });
        }

        // 2. Buscar el Item
        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            const currentPrefix = category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'Consumibles',
                customId: `${currentPrefix}-${Date.now()}`, 
                unit: 'Unit'
            });
            await item.save();
        }

        // 3. Lógica de Stock (Ahora acepta decimales)
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

        // 4. Preparar documentos de Transacción (Chat)
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type,
            operationType: operationType // Guardamos si es SIMA, COMPRA, etc.
        });

        // 5. KARDEX (Movement) - Mejoramos el mapeo de tipos
        // Si el frontend envió un operationType, lo usamos, si no, usamos el genérico
        const finalKardexType = operationType || (type === 'IN' ? 'ENTRADA' : 'SALIDA');

        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: finalKardexType, 
            quantity: numericQuantity,
            workerName: normalizedPersonName,
            date: new Date(),
            unitCost: 0,
            destination: operationType === 'SIMA' ? 'SIMA' : 'ALMACEN' 
        });

        // 6. Guardado secuencial
        console.log(`--- Procesando: ${numericQuantity} de ${normalizedItemName} (${finalKardexType}) ---`);
        
        await item.save();
        await newTransaction.save();

        try {
            await newKardexEntry.save();
            console.log("✅ Kardex actualizado con tipo:", finalKardexType);
        } catch (kardexError) {
            console.error("❌ ERROR EN KARDEX:", kardexError.message);
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