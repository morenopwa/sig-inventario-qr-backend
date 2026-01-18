import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Datos incompletos." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "ALMACEN";
        const numericQuantity = parseInt(quantity);

        // 1. Buscar el Item
        let item = await Item.findOne({ name: normalizedItemName });
        
        // 2. Si NO existe, lo creamos con los campos exactos de tu modelo
        if (!item) {
            // Generamos el customId obligatorio
            const generatedId = `ITM-${Date.now()}`;
            
            item = new Item({ 
                customId: generatedId,
                name: normalizedItemName, 
                category: category || 'General',
                stock: 0,
                minStock: 5,
                unit: 'Unit', // USAMOS 'Unit' PORQUE ES LO QUE PERMITE TU ENUM
                history: []
            });
            
            await item.save();
        }

        // 3. Lógica de Stock
        if (type === 'OUT') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Stock insuficiente: ${item.stock} disponibles.` 
                });
            }
            item.stock -= numericQuantity;
        } else {
            item.stock += numericQuantity;
        }

        // 4. Actualizar el historial interno del Item (Tu modelo tiene un array history)
        item.history.push({
            action: type, // 'IN' o 'OUT'
            quantity: numericQuantity,
            user: normalizedPersonName,
            timestamp: new Date()
        });

        // 5. Crear registros externos (Chat y Kardex)
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
            date: new Date()
        });

        // 6. Guardar cambios
        await item.save();
        await newTransaction.save();
        
        try {
            await newKardexEntry.save();
        } catch (e) { console.log("Kardex no guardado, pero stock sí."); }

        res.status(201).json({ 
            success: true, 
            message: "Registro exitoso", 
            data: newTransaction 
        });

    } catch (err) {
        console.error("❌ ERROR CRÍTICO EN TRANSACCIÓN:", err);
        res.status(500).json({ 
            success: false, 
            message: `Error de validación: ${err.message}` 
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