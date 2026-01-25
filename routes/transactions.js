import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

// --- POST: REGISTRAR TRANSACCIÓN ---
router.post('/', async (req, res) => {
    try {
        const { quantity, unit, itemName, personName, type, category, operationType, timestamp } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos obligatorios." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        // CAMBIO AQUÍ: Ya no ponemos "GENERAL" por defecto si personName viene vacío, 
        // dejamos que el frontend maneje la lógica del usuario actual.
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "DESCONOCIDO";
        const numericQuantity = parseFloat(quantity);
        
        // Usamos la fecha enviada por el frontend o la actual si no existe
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

        // --- LÓGICA DE STOCK Y PRÉSTAMOS ---
        if (type === 'OUT' || type === 'SALIDA') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ success: false, message: `Solo hay ${item.stock} disponibles.` });
            }
            item.stock -= numericQuantity; 
            item.activeLoans.push({ workerName: normalizedPersonName, quantity: numericQuantity });
        } else {
            // Es ENTRADA (IN)
            item.stock += numericQuantity;
            
            if (operationType === 'COMPRA' || !item.totalStock || item.totalStock === 0) {
                item.totalStock += numericQuantity;
            }

            // Lógica de devolución: Buscamos al trabajador en préstamos activos
            const loanIndex = item.activeLoans.findIndex(l => l.workerName === normalizedPersonName);
            if (loanIndex !== -1) {
                item.activeLoans[loanIndex].quantity -= numericQuantity;
                if (item.activeLoans[loanIndex].quantity <= 0) item.activeLoans.splice(loanIndex, 1);
            }
        }

        // Guardar logs para el Chat
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            unit: item.unit,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: (type === 'IN' || type === 'ENTRADA') ? 'IN' : 'OUT',
            operationType,
            timestamp: finalDate // Guardamos con la fecha seleccionada
        });

        // Guardar en el Kardex (Movimientos)
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

// --- GET: OBTENER TRANSACCIONES (FILTRADO POR FECHA) ---
router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};

        if (date) {
            // Creamos el rango de inicio y fin del día para la consulta
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);

            query.timestamp = { $gte: start, $lte: end };
        }

        // Si no hay fecha, devuelve las últimas 50 por defecto
        const transactions = await Transaction.find(query).sort({ timestamp: 1 });
        res.json(transactions);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

export default router;