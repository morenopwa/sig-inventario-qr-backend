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

        // Procesar fecha local sin conversiones UTC accidentales
        const finalDate = new Date(timestamp);
        const normalizedItem = itemName.trim().toUpperCase();
        const normalizedPerson = personName.trim().toUpperCase();
        const numericQty = parseFloat(quantity);

        let item = await Item.findOne({ name: normalizedItem });
        
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

        // Si la persona es SIMA, forzamos que sea una ENTRADA (IN)
        const isSima = normalizedPerson === 'SIMA';
        const isSalida = !isSima && (type === 'OUT' || type === 'SALIDA');

        if (isSima) {
            // Lógica SIMA: Siempre suma al stock y al patrimonio
            item.stock += numericQty;
            item.totalStock = (item.totalStock || 0) + numericQty;
        } else if (isSalida) {
            // Lógica Salida: Resta stock y agrega a préstamos
            item.stock -= numericQty;
            item.activeLoans.push({ 
                workerName: normalizedPerson, 
                quantity: numericQty, 
                date: finalDate 
            });
        } else {
            // Lógica Entrada (Devolución): Suma stock y descuenta préstamo
            item.stock += numericQty;
            const loanIndex = item.activeLoans.findIndex(l => l.workerName === normalizedPerson);
            if (loanIndex !== -1) {
                item.activeLoans[loanIndex].quantity -= numericQty;
                if (item.activeLoans[loanIndex].quantity <= 0) {
                    item.activeLoans.splice(loanIndex, 1);
                }
            }
        }

        const finalOpType = isSima ? 'ENTRADA SIMA' : (isSalida ? 'SALIDA' : 'ENTRADA');

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
        // ORDENADO DE ARRIBA HACIA ABAJO (Cronológico ascendente)
        const transactions = await Transaction.find(query).sort({ timestamp: 1 });
        res.json(transactions);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

export default router;