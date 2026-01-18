import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan campos requeridos." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const numericQuantity = parseInt(quantity);

        // 1. Buscar el Item
        let item = await Item.findOne({ name: normalizedItemName });
        
        // 2. Si no existe, lo creamos asegurando el customId
        if (!item) {
            // Definimos el prefijo según la categoría para el customId
            const prefix = category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            const generatedCustomId = `${prefix}-${Date.now()}`;

            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'General',
                customId: generatedCustomId, // ESTO ES LO QUE FALTA
                unit: 'Unit'
            });
            // Guardamos el item nuevo para que ya tenga existencia y un _id
            await item.save();
        }

        // 3. Validar y actualizar Stock
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

        // 5. Crear el registro para el KARDEX (Movement)
        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: type === 'IN' ? 'Compra' : 'Salida', 
            quantity: numericQuantity,
            workerName: normalizedPersonName,
            date: new Date(),
            destination: 'ALMACÉN'
        });

        // 6. Guardar todo
        // Nota: Asegúrate de que esta sea la línea 85 aproximadamente
        await Promise.all([
            newTransaction.save(), 
            newKardexEntry.save(), 
            item.save() // Aquí se guarda el nuevo stock
        ]);

        res.status(201).json({ 
            success: true, 
            message: "Registro completado con éxito",
            data: newTransaction 
        });

    } catch (err) {
        console.error("❌ ERROR CRÍTICO EN TRANSACCIÓN:", err);
        res.status(500).json({ success: false, message: err.message });
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