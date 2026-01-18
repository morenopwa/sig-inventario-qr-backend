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
        
        // 2. Si NO existe, lo creamos de cero con su customId
        if (!item) {
            const currentPrefix = category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'General',
                customId: `${currentPrefix}-${Date.now()}`, 
                unit: 'Unit'
            });
            await item.save();
        }

        // --- SOLUCIÓN PARA EL ERROR: CURACIÓN DE DATOS ANTIGUOS ---
        // Si el ítem existe pero NO tiene customId (como tu PULIFAN), se lo ponemos ahora.
        // Sin esto, item.save() en la línea 89 fallará siempre.
        if (!item.customId) {
            const repairPrefix = item.category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            item.customId = `${repairPrefix}-OLD-${Date.now()}`;
            console.log(`🔧 Reparando ítem antiguo: ${item.name} asignando ID: ${item.customId}`);
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

        // 4. Actualizar historial interno del ítem
        item.history.push({
            action: type,
            quantity: numericQuantity,
            user: normalizedPersonName,
            timestamp: new Date()
        });

        // 5. Crear registros de auditoría (Chat y Kardex)
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

        // 6. GUARDAR TODO (Ahora sí funcionará)
        await item.save(); // Mongoose ya no llorará por el customId
        await newTransaction.save();
        await newKardexEntry.save();

        res.status(201).json({ 
            success: true, 
            message: "Stock actualizado correctamente", 
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