import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos requeridos." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const numericQuantity = parseInt(quantity);

        // 1. Buscar el Item
        let item = await Item.findOne({ name: normalizedItemName });
        
        // 2. Si no existe, lo creamos (CORRECCIÓN DE LA VARIABLE PREFIX)
        if (!item) {
            // Definimos el prefijo según la categoría para que no sea undefined
            const currentPrefix = category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'General',
                customId: `${currentPrefix}-${Date.now()}`, // Aquí ya no será undefined
                unit: 'Unit'
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

        // 4. Crear el registro para el CHAT
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type, 
            timestamp: new Date()
        });

        // 5. Crear el registro para el KARDEX
        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: type === 'IN' ? 'Compra' : 'Salida', 
            quantity: numericQuantity,
            workerName: normalizedPersonName,
            date: new Date()
        });

        // 6. Guardar todo (Línea que lanzaba el error)
        await item.save(); 
        await newTransaction.save();
        await newKardexEntry.save();

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

router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;