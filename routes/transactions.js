import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

// POST: Registrar Transacción
router.post('/', async (req, res) => {
    try {
        const { quantity, unit, itemName, personName, type, category, operationType, timestamp } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos obligatorios." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "SISTEMA";
        const numericQuantity = parseFloat(quantity);
        const finalDate = timestamp ? new Date(timestamp) : new Date();

        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            item = new Item({ 
                customId: `ITM-${Date.now()}`,
                name: normalizedItemName, 
                stock: 0, 
                totalStock: 0, 
                category: category || 'General',
                unit: unit || 'UND'
            });
        }

        // Lógica de Stock
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

        res.status(201).json({ success: true, message: "Inventario actualizado" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET: Obtener con filtro de fecha obligatorio para el chat
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