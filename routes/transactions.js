import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, unit, itemName, personName, type, category, operationType } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos obligatorios." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const numericQuantity = parseFloat(quantity);

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

        // --- LÓGICA DE STOCK Y PRÉSTAMOS ---
        if (type === 'OUT' || type === 'SALIDA') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ success: false, message: `Solo hay ${item.stock} disponibles.` });
            }
            item.stock -= numericQuantity; // Baja el disponible
            // Registrar quién se lo lleva
            item.activeLoans.push({ workerName: normalizedPersonName, quantity: numericQuantity });
        } else {
            // Es ENTRADA
            item.stock += numericQuantity;
            
            // Solo sube el TOTAL si es compra o ingreso inicial
            if (operationType === 'COMPRA' || !item.totalStock || item.totalStock === 0) {
                item.totalStock += numericQuantity;
            }

            // Si es DEVOLUCIÓN, restamos de la deuda del trabajador
            if (operationType === 'DEVOLUCION' || type === 'IN') {
                const loanIndex = item.activeLoans.findIndex(l => l.workerName === normalizedPersonName);
                if (loanIndex !== -1) {
                    item.activeLoans[loanIndex].quantity -= numericQuantity;
                    if (item.activeLoans[loanIndex].quantity <= 0) item.activeLoans.splice(loanIndex, 1);
                }
            }
        }

        // Guardar logs para el Chat y el Kardex
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            unit: item.unit,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: (type === 'IN' || type === 'ENTRADA') ? 'IN' : 'OUT',
            operationType,
            timestamp: new Date()
        });

        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: operationType || (type === 'IN' ? 'ENTRADA' : 'SALIDA'), 
            quantity: numericQuantity,
            unit: item.unit,
            workerName: normalizedPersonName,
            date: new Date()
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;