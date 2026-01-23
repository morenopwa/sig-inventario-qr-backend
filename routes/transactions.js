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
                name: normalizedItemName, 
                stock: 0, 
                totalStock: 0, 
                category: category || 'Consumibles',
                unit: unit || 'UND',
                activeLoans: [] // Inicializar array de préstamos
            });
        }

        if (type === 'OUT' || type === 'SALIDA') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Stock insuficiente. Solo quedan ${item.stock} unidades.` 
                });
            }
            item.stock -= numericQuantity;

            // --- AGREGADO: Registrar a quién se le presta ---
            item.activeLoans.push({
                workerName: normalizedPersonName,
                quantity: numericQuantity,
                date: new Date()
            });
            // -----------------------------------------------

        } else {
            item.stock += numericQuantity;
            if (operationType === 'COMPRA' || !item.totalStock) {
                item.totalStock += numericQuantity;
            }

            // --- AGREGADO: Si es devolución, limpiar el préstamo ---
            if (operationType === 'DEVOLUCION' || type === 'IN') {
                const loanIndex = item.activeLoans.findIndex(l => l.workerName === normalizedPersonName);
                if (loanIndex !== -1) {
                    item.activeLoans[loanIndex].quantity -= numericQuantity;
                    if (item.activeLoans[loanIndex].quantity <= 0) {
                        item.activeLoans.splice(loanIndex, 1);
                    }
                }
            }
            // -------------------------------------------------------
        }

        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            unit: item.unit,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: (type === 'IN' || type === 'ENTRADA') ? 'IN' : 'OUT',
            operationType: operationType,
            timestamp: new Date() // Aseguramos que tenga fecha para el sort
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

        res.status(201).json({ success: true, message: "Registro completado con éxito" });

    } catch (err) {
        console.error("Error en transacción:", err);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
});

router.get('/', async (req, res) => {
    try {
        // Asegúrate de que el modelo Transaction tenga el campo timestamp
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;