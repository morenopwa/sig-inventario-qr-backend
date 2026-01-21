import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        // 1. Recibimos 'unit' desde el frontend (IMPORTANTE)
        const { quantity, unit, itemName, personName, type, category, operationType } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos requeridos." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const finalUnit = unit ? unit.toUpperCase() : "UND"; // Fallback a UND si no viene
        
        const numericQuantity = parseFloat(quantity);

        if (isNaN(numericQuantity)) {
            return res.status(400).json({ success: false, message: "La cantidad debe ser un número válido." });
        }

        // 2. Buscar o Crear el Item
        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            const currentPrefix = category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'Consumibles',
                customId: `${currentPrefix}-${Date.now()}`, 
                unit: finalUnit // ✅ Ahora guarda la unidad real (KG, GLN, etc.)
            });
            await item.save();
        } else {
            // Opcional: Actualizar la unidad si el item ya existe pero no tenía una válida
            if (!item.unit || item.unit === 'Unit') {
                item.unit = finalUnit;
            }
        }

        // 3. Lógica de Stock
        if (type === 'OUT') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ success: false, message: `Stock insuficiente: ${item.stock}` });
            }
            item.stock -= numericQuantity;
        } else {
            item.stock += numericQuantity;
        }

        item.history.push({
            action: type,
            quantity: numericQuantity,
            user: normalizedPersonName,
            timestamp: new Date()
        });

        // 4. Guardar Transacción (Lo que lee el Chat)
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            unit: finalUnit, // ✅ GUARDAMOS LA UNIDAD PARA EL CHAT
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type,
            operationType: operationType 
        });

        // 5. KARDEX (Movement)
        const finalKardexType = operationType || (type === 'IN' ? 'ENTRADA' : 'SALIDA');

        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: finalKardexType, 
            quantity: numericQuantity,
            unit: finalUnit, // ✅ TAMBIÉN AL KARDEX
            workerName: normalizedPersonName,
            date: new Date(),
            unitCost: 0,
            destination: operationType === 'SIMA' ? 'SIMA' : 'ALMACEN' 
        });

        // 6. Guardado secuencial
        console.log(`--- Registrando: ${numericQuantity} ${finalUnit} de ${normalizedItemName} ---`);
        
        await item.save();
        await newTransaction.save();

        try {
            await newKardexEntry.save();
            console.log("✅ Kardex y Chat actualizados correctamente.");
        } catch (kardexError) {
            console.error("❌ ERROR EN KARDEX:", kardexError.message);
        }

        res.status(201).json({ 
            success: true, 
            message: "Registro procesado", 
            data: newTransaction 
        });

    } catch (err) {
        console.error("❌ ERROR GENERAL:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/transactions
router.get('/', async (req, res) => {
    try {
        // Asegúrate de que tu modelo Transaction.js tenga el campo 'unit'
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;