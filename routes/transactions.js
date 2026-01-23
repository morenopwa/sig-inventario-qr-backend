import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, unit, itemName, personName, type, category, operationType } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos requeridos." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const finalUnit = unit ? unit.toUpperCase() : "UND";
        const numericQuantity = parseFloat(quantity);

        if (isNaN(numericQuantity)) {
            return res.status(400).json({ success: false, message: "La cantidad debe ser un número válido." });
        }

        // 1. Buscar o Crear el Item
        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            const currentPrefix = category?.toUpperCase() === 'EPP' ? 'EPP' : 'GEN';
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'Consumibles',
                customId: `${currentPrefix}-${Date.now()}`, 
                unit: finalUnit 
            });
            await item.save();
        }

        // 2. LÓGICA DE ACTUALIZACIÓN DE STOCK (DESCUENTO AUTOMÁTICO)
        if (type === 'OUT' || type === 'SALIDA') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Stock insuficiente. Disponible: ${item.stock} ${item.unit}` 
                });
            }
            item.stock -= numericQuantity; // Aquí ocurre el descuento
        } else {
            item.stock += numericQuantity; // Aquí ocurre el aumento (Entrada/Compra)
        }

        // 3. Guardar historial en el Item
        item.history.push({
            action: type,
            quantity: numericQuantity,
            user: normalizedPersonName,
            timestamp: new Date()
        });

        // 4. Guardar Transacción (Para el Chat)
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            unit: finalUnit,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type === 'IN' || type === 'ENTRADA' ? 'IN' : 'OUT',
            operationType: operationType 
        });

        // 5. KARDEX (Para InventoryPage -> Kardex Activo)
        const finalKardexType = operationType || (type === 'IN' ? 'ENTRADA' : 'SALIDA');
        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: finalKardexType, 
            quantity: numericQuantity,
            unit: finalUnit,
            workerName: normalizedPersonName,
            date: new Date(),
            unitCost: 0,
            destination: operationType === 'SIMA' ? 'SIMA' : 'ALMACEN' 
        });

        // 6. Guardado Final
        await item.save();
        await newTransaction.save();
        await newKardexEntry.save();

        res.status(201).json({ success: true, message: "Stock actualizado y registro procesado" });

    } catch (err) {
        console.error("❌ ERROR:", err);
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