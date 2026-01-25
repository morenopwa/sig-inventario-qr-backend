import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, unit, itemName, personName, type, category, operationType, timestamp, customId } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos obligatorios." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "SISTEMA";
        const numericQuantity = parseFloat(quantity);
        const finalDate = timestamp ? new Date(timestamp) : new Date();

        let item = await Item.findOne({ name: normalizedItemName });
        
        // Prioridad: 1. Categoría enviada, 2. Categoría existente, 3. 'Consumibles' (por defecto)
        const finalCategory = category || (item ? item.category : 'Consumibles');

        if (!item) {
            item = new Item({ 
                customId: customId || `ITM-${Date.now()}`,
                name: normalizedItemName, 
                stock: 0, 
                totalStock: 0, 
                category: finalCategory, 
                unit: unit || 'UND'
            });
        } else {
            // Si el ítem ya existe pero su categoría es 'General' o distinta a la enviada, la actualizamos
            if (category && item.category !== category) {
                item.category = category;
            }
        }

        // --- LÓGICA DE STOCK ---
        if (type === 'OUT' || type === 'SALIDA') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ success: false, message: `Solo hay ${item.stock} disponibles.` });
            }
            item.stock -= numericQuantity;
            item.activeLoans.push({ workerName: normalizedPersonName, quantity: numericQuantity });
        } else {
            item.stock += numericQuantity;
            if (operationType === 'COMPRA' || !item.totalStock || item.totalStock === 0) {
                item.totalStock += numericQuantity;
            }
            // Devolución
            const loanIndex = item.activeLoans.findIndex(l => l.workerName === normalizedPersonName);
            if (loanIndex !== -1) {
                item.activeLoans[loanIndex].quantity -= numericQuantity;
                if (item.activeLoans[loanIndex].quantity <= 0) item.activeLoans.splice(loanIndex, 1);
            }
        }

        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            unit: item.unit,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: (type === 'IN' || type === 'ENTRADA') ? 'IN' : 'OUT',
            operationType,
            timestamp: finalDate
        });

        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: operationType || (type === 'IN' ? 'ENTRADA' : 'SALIDA'), 
            quantity: numericQuantity,
            unit: item.unit,
            workerName: normalizedPersonName,
            date: finalDate
        });

        await item.save();
        await newTransaction.save();
        await newKardexEntry.save();

        res.status(201).json({ success: true, message: "Registro completado con éxito" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};
        if (date) {
            const start = new Date(date + 'T00:00:00');
            const end = new Date(date + 'T23:59:59');
            query.timestamp = { $gte: start, $lte: end };
        }
        const transactions = await Transaction.find(query).sort({ timestamp: 1 });
        res.json(transactions);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;