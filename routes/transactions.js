import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos obligatorios." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const numericQuantity = parseInt(quantity);

        // 1. Buscar el Item
        let item = await Item.findOne({ name: normalizedItemName });
        
        // 2. Si no existe, lo creamos cumpliendo con 'customId'
        if (!item) {
            const prefix = category?.toUpperCase() === 'EPP' ? 'EPP' : 'INV';
            const timestamp = Date.now();
            
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'Consumibles',
                // AQUÍ ESTABA EL ERROR: Tu modelo pide 'customId', no 'qrCode'
                customId: `${prefix}-${timestamp}`, 
                qrCode: `${prefix}-${timestamp}`, // Por si acaso usas ambos
                unit: 'und'
            });
            
            // Guardar el item para que exista en la DB
            await item.save();
        }

        // 3. Validar Stock si es salida (OUT)
        if (type === 'OUT') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Stock insuficiente. ${normalizedItemName} tiene ${item.stock} unidades.` 
                });
            }
            item.stock -= numericQuantity; 
        } else {
            item.stock += numericQuantity; 
        }

        // 4. Crear los registros de historial
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type, 
            timestamp: new Date()
        });

        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: type === 'IN' ? 'Compra' : 'Salida', 
            quantity: numericQuantity,
            workerName: normalizedPersonName,
            date: new Date(),
            destination: 'ALMACÉN CENTRAL'
        });

        // 5. Guardar todo
        await Promise.all([
            newTransaction.save(), 
            newKardexEntry.save(), 
            item.save() // Confirmar el nuevo stock
        ]);

        res.status(201).json({ 
            success: true, 
            message: "Registro completado con éxito",
            data: newTransaction 
        });

    } catch (err) {
        console.error("❌ ERROR CRÍTICO EN TRANSACCIÓN:", err);
        res.status(500).json({ 
            success: false, 
            message: "Error de validación: Asegúrese de enviar todos los campos obligatorios." 
        });
    }
});

// GET /api/transactions
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;