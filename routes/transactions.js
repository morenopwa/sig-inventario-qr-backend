import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { 
            quantity, 
            unit, 
            itemName, 
            personName, 
            type, 
            category, 
            timestamp 
        } = req.body;

        // Validación básica
        if (!itemName || quantity === undefined) {
            return res.status(400).json({ success: false, message: "Datos incompletos (nombre o cantidad)" });
        }

        const finalDate = new Date(timestamp);
        const normalizedItem = itemName.trim().toUpperCase();
        const normalizedPerson = personName.trim().toUpperCase();
        const numericQty = parseFloat(quantity);

        // 1. BUSCAR O CREAR EL ÍTEM
        let item = await Item.findOne({ name: normalizedItem });
        
        if (!item) {
            // Si no existe, lo creamos con valores por defecto
            item = new Item({ 
                customId: `ITM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                name: normalizedItem, 
                stock: 0, 
                totalStock: 0,
                category: category || 'CONSUMIBLES', 
                unit: unit || 'UND',
                activeLoans: [] 
            });
            // Guardamos inicialmente para obtener el _id si es nuevo
            await item.save();
        }

        // 2. LÓGICA DE MOVIMIENTO (Salida por defecto vs Entrada SIMA)
        const isSima = normalizedPerson === 'SIMA';
        // Prioridad: Si no es SIMA y el tipo es OUT (o no se definió), es SALIDA
        const isSalida = !isSima && (type === 'OUT' || type === 'SALIDA' || !type);

        if (isSima) {
            // ENTRADA DESDE PROVEEDOR (SIMA)
            item.stock += numericQty;
            item.totalStock = (item.totalStock || 0) + numericQty;
        } else if (isSalida) {
            // SALIDA A TRABAJADOR
            item.stock -= numericQty;
            item.activeLoans.push({ 
                workerName: normalizedPerson, 
                quantity: numericQty, 
                date: finalDate 
            });
        } else {
            // ENTRADA (Devolución del trabajador)
            item.stock += numericQty;
            const loanIndex = item.activeLoans.findIndex(l => l.workerName === normalizedPerson);
            if (loanIndex !== -1) {
                item.activeLoans[loanIndex].quantity -= numericQty;
                if (item.activeLoans[loanIndex].quantity <= 0) {
                    item.activeLoans.splice(loanIndex, 1);
                }
            }
        }

        // 3. DEFINIR TIPOS DE OPERACIÓN PARA LOGS
        const finalOpType = isSima ? 'ENTRADA SIMA' : (isSalida ? 'SALIDA' : 'ENTRADA');

        // 4. CREAR REGISTRO DE TRANSACCIÓN (Para el Chat)
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

        // 5. CREAR REGISTRO EN KARDEX (Movements)
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

        // 6. PERSISTENCIA FINAL
        await item.save();
        await newTx.save();
        await newKardex.save();

        res.status(201).json({ success: true, data: newTx });
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
        const transactions = await Transaction.find(query).sort({ timestamp: 1 });
        res.json(transactions);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

export default router;