import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, unit, itemName, personName, type, category, operationType } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos requeridos." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const finalUnit = unit ? unit.toUpperCase() : "UND";
        const numericQuantity = parseFloat(quantity);

        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            const currentPrefix = category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                totalStock: 0, // Nuevo campo para el total histórico
                category: category || 'Consumibles',
                customId: `${currentPrefix}-${Date.now()}`, 
                unit: finalUnit 
            });
        }

        // --- LÓGICA DE STOCK DOBLE ---
        if (type === 'OUT' || type === 'SALIDA') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `No disponible. Solo hay ${item.stock} en almacén.` 
                });
            }
            item.stock -= numericQuantity; // Se presta: baja el disponible
            // totalStock NO se toca, porque la herramienta sigue siendo de la empresa
        } else {
            item.stock += numericQuantity; // Entra material nuevo
            item.totalStock += numericQuantity; // Sube el patrimonio total
        }

        // Guardar logs
        item.history.push({
            action: type,
            quantity: numericQuantity,
            user: normalizedPersonName,
            timestamp: new Date()
        });

        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            unit: finalUnit,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: (type === 'IN' || type === 'ENTRADA') ? 'IN' : 'OUT',
            operationType: operationType 
        });

        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: operationType || (type === 'IN' ? 'ENTRADA' : 'SALIDA'), 
            quantity: numericQuantity,
            unit: finalUnit,
            workerName: normalizedPersonName,
            date: new Date(),
            destination: operationType === 'SIMA' ? 'SIMA' : 'ALMACEN' 
        });

        await item.save();
        await newTransaction.save();
        await newKardexEntry.save();

        res.status(201).json({ success: true, message: "Inventario actualizado" });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;