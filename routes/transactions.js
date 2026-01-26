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

        // Convertimos el string de fecha local a objeto Date de JS
        // Al no tener una 'Z' al final, Node.js lo trata como hora del sistema
        const finalDate = new Date(timestamp);

        const normalizedItem = itemName.trim().toUpperCase();
        const normalizedPerson = personName.trim().toUpperCase();

        let item = await Item.findOne({ name: normalizedItem });
        
        if (!item) {
            item = new Item({ 
                name: normalizedItem, 
                stock: 0, 
                totalStock: 0,
                category: category || 'CONSUMIBLES', 
                unit: unit || 'UND' 
            });
        }

        const numericQty = parseFloat(quantity);
        const isSalida = type === 'OUT' || type === 'SALIDA';

        // Lógica de Stock
        if (isSalida) {
            item.stock -= numericQty;
            item.activeLoans.push({ workerName: normalizedPerson, quantity: numericQty });
        } else {
            item.stock += numericQty;
            // Si viene de SIMA o es una COMPRA, aumenta el stock histórico
            if (normalizedPerson === 'SIMA' || operationType === 'COMPRA') {
                item.totalStock = (item.totalStock || 0) + numericQty;
            }
            // Si el trabajador está devolviendo, reducir su deuda
            const loanIndex = item.activeLoans.findIndex(l => l.workerName === normalizedPerson);
            if (loanIndex !== -1) {
                item.activeLoans[loanIndex].quantity -= numericQty;
                if (item.activeLoans[loanIndex].quantity <= 0) item.activeLoans.splice(loanIndex, 1);
            }
        }

        const newTx = new Transaction({
            itemId: item._id,
            quantity: numericQty,
            unit: item.unit,
            itemName: item.name,
            personName: normalizedPerson,
            type: isSalida ? 'OUT' : 'IN',
            operationType: normalizedPerson === 'SIMA' ? 'ENTRADA SIMA' : operationType,
            timestamp: finalDate
        });

        const newKardex = new Movement({
            itemId: item._id,
            materialName: item.name,
            unit: item.unit,
            quantity: numericQty,
            workerName: normalizedPerson,
            type: normalizedPerson === 'SIMA' ? 'ENTRADA SIMA' : (isSalida ? 'SALIDA' : 'ENTRADA'),
            date: finalDate,
            inputQuantity: isSalida ? 0 : numericQty,
            outputQuantity: isSalida ? numericQty : 0
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
            // Buscamos registros que coincidan con el día local
            const start = new Date(`${date}T00:00:00`);
            const end = new Date(`${date}T23:59:59`);
            query.timestamp = { $gte: start, $lte: end };
        }
        const transactions = await Transaction.find(query).sort({ timestamp: -1 });
        res.json(transactions);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;