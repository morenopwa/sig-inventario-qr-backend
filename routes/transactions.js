import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;

        // Validaciones básicas de entrada
        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Datos incompletos." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "ALMACEN";
        const numericQuantity = parseInt(quantity);

        // 1. Buscar o Crear el Item (Aquí es donde fallaba el customId)
        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            // CREACIÓN CORRECTA: Asignamos el customId antes del save
            const newId = `ITM-${Date.now()}`;
            item = new Item({ 
                customId: newId, // CAMPO OBLIGATORIO DE TU MODELO ITEM
                name: normalizedItemName, 
                category: category || 'General',
                stock: 0,
                unit: 'Unit'
            });
            await item.save(); // Ahora no fallará porque tiene el customId
        }

        // 2. Lógica de Stock
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

        // 3. Crear el registro para el CHAT (Transaction)
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type, 
            timestamp: new Date()
        });

        // 4. Crear el registro para el KARDEX (Movement)
        // Usamos los campos exactos de tu modelo Movement
        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            // Mapeamos IN/OUT a los enums de tu Movement: 'Compra' o 'Salida'
            type: type === 'IN' ? 'Compra' : 'Salida', 
            quantity: numericQuantity,
            workerName: normalizedPersonName,
            date: new Date(),
            destination: 'OBRA' // Valor por defecto
        });

        // 5. Guardar todo en orden
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
            message: `Error de servidor: ${err.message}` 
        });
    }
});

// GET /api/transactions (Igual que lo tenías)
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;