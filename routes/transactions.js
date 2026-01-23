import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, unit, itemName, personName, type, category, operationType } = req.body;

        // Validaciones básicas
        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos obligatorios." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const numericQuantity = parseFloat(quantity);

        // 1. Buscar el Item o crear uno nuevo si no existe
        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                totalStock: 0, 
                category: category || 'Consumibles',
                unit: unit || 'UND'
            });
        }

        // 2. LÓGICA DE STOCK (SIN WHATSAPP)
        if (type === 'OUT' || type === 'SALIDA') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Stock insuficiente. Solo quedan ${item.stock} unidades.` 
                });
            }
            item.stock -= numericQuantity; // Se descuenta del almacén (préstamo)
            // totalStock no cambia porque el objeto sigue siendo propiedad de la empresa
        } else {
            // Es una entrada (Compra o Devolución)
            item.stock += numericQuantity;
            // Solo aumentamos el patrimonio total si es una "Compra" o "Ingreso inicial"
            if (operationType === 'COMPRA' || !item.totalStock) {
                item.totalStock += numericQuantity;
            }
        }

        // 3. Crear registros de auditoría
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            unit: item.unit,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: (type === 'IN' || type === 'ENTRADA') ? 'IN' : 'OUT',
            operationType: operationType 
        });

        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: operationType || (type === 'IN' ? 'ENTRADA' : 'SALIDA'), 
            quantity: numericQuantity,
            unit: item.unit,
            workerName: normalizedPersonName,
            date: new Date()
        });

        // 4. Guardar todo en la base de datos
        await item.save();
        await newTransaction.save();
        await newKardexEntry.save();

        res.status(201).json({ success: true, message: "Registro completado con éxito" });

    } catch (err) {
        console.error("Error en transacción:", err);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
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