import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, unit, itemName, personName, type, category, operationType, timestamp } = req.body;

        if (!itemName || !quantity) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        // Fecha local recibida del cliente
        const finalDate = new Date(timestamp);
        const normalizedItem = itemName.trim().toUpperCase();
        const normalizedPerson = personName.trim().toUpperCase();
        const numericQty = parseFloat(quantity);

        let item = await Item.findOne({ name: normalizedItem });
        
        // Crear ítem si no existe con customId obligatorio
        if (!item) {
            item = new Item({ 
                customId: `ITM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                name: normalizedItem, 
                stock: 0, 
                totalStock: 0,
                category: category || 'CONSUMIBLES', 
                unit: unit || 'UND' 
            });
        }

        const isSalida = type === 'OUT' || type === 'SALIDA';

        // Lógica de Stock y Patrimonio
        if (isSalida) {
            item.stock -= numericQty;
            item.activeLoans.push({ 
                workerName: normalizedPerson, 
                quantity: numericQty, 
                date: finalDate 
            });
        } else {
            item.stock += numericQty;
            // Si es SIMA o COMPRA, aumenta el totalStock (Patrimonio)
            if (normalizedPerson === 'SIMA' || operationType === 'COMPRA') {
                item.totalStock = (item.totalStock || 0) + numericQty;
            }
            
            // Reducir deuda de préstamo si el trabajador devuelve
            const loanIndex = item.activeLoans.findIndex(l => l.workerName === normalizedPerson);
            if (loanIndex !== -1) {
                item.activeLoans[loanIndex].quantity -= numericQty;
                if (item.activeLoans[loanIndex].quantity <= 0) {
                    item.activeLoans.splice(loanIndex, 1);
                }
            }
        }

        // Definir el tipo de movimiento para el historial y Kardex
        const finalOpType = normalizedPerson === 'SIMA' ? 'ENTRADA SIMA' : (operationType || (isSalida ? 'SALIDA' : 'ENTRADA'));

        const newTx = new Transaction({
            itemId: item._id,
            quantity: numericQty,
            unit: item.unit,
            itemName: item.name,
            personName: normalizedPerson,
            type: isSalida ? 'OUT' : 'IN',
            operationType: finalOpType,
            timestamp: finalDate
        });

        const newKardex = new Movement({
            itemId: item._id,
            materialName: item.name,
            unit: item.unit,
            quantity: numericQty,
            workerName: normalizedPerson,
            type: finalOpType,
            date: finalDate,
            inputQuantity: isSalida ? 0 : numericQty,
            outputQuantity: isSalida ? numericQty : 0,
            destination: isSalida ? 'OBRA' : 'ALMACÉN'
        });

        await item.save();
        await newTx.save();
        await newKardex.save();

        res.status(201).json({ success: true });
    } catch (err) {
        console.error("Error en registro:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};
        if (date) {
            const start = new Date(`${date}T00:00:00`);
            const end = new Date(`${date}T23:59:59`);
            query.timestamp = { $gte: start, $lte: end };
        }
        const transactions = await Transaction.find(query).sort({ timestamp: -1 });
        res.json(transactions);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

export default router;