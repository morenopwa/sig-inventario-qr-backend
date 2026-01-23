import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { quantity, unit, itemName, personName, type, category, operationType } = req.body;

        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos obligatorios." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const numericQuantity = parseFloat(quantity);

        let item = await Item.findOne({ name: normalizedItemName });
        
        if (!item) {
            // Si el item no existe, lo creamos con stock inicial
            item = new Item({ 
                customId: `ITM-${Date.now()}`,
                name: normalizedItemName, 
                stock: 0, 
                totalStock: 0, 
                category: category || 'Herramientas',
                unit: unit || 'UND'
            });
        }

        // --- LÓGICA DE CONTROL DE STOCK ---
        if (type === 'OUT' || type === 'SALIDA') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Solo hay ${item.stock} disponibles en almacén.` 
                });
            }
            // 1. Descontamos del stock disponible (estante)
            item.stock -= numericQuantity;
            
            // 2. Registramos quién se lo lleva (Préstamo activo)
            item.activeLoans.push({
                workerName: normalizedPersonName,
                quantity: numericQuantity,
                date: new Date()
            });
            // El totalStock NO se toca, la herramienta sigue siendo de la empresa.

        } else if (type === 'IN' || type === 'ENTRADA') {
            // 1. Aumentamos el stock disponible
            item.stock += numericQuantity;

            // 2. Si es una COMPRA o INGRESO, sube el patrimonio total
            if (operationType === 'COMPRA' || !item.totalStock || item.totalStock === 0) {
                item.totalStock += numericQuantity;
            }

            // 3. Si es una DEVOLUCION, buscamos el préstamo activo para cancelarlo
            if (operationType === 'DEVOLUCION' || type === 'IN') {
                const loanIndex = item.activeLoans.findIndex(l => l.workerName === normalizedPersonName);
                if (loanIndex !== -1) {
                    item.activeLoans[loanIndex].quantity -= numericQuantity;
                    // Si ya devolvió todo, eliminamos el registro del préstamo
                    if (item.activeLoans[loanIndex].quantity <= 0) {
                        item.activeLoans.splice(loanIndex, 1);
                    }
                }
            }
        }

        // Guardar auditoría
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: (type === 'IN' || type === 'ENTRADA') ? 'IN' : 'OUT',
            operationType: operationType 
        });

        await item.save();
        await newTransaction.save();

        res.status(201).json({ success: true, message: "Inventario actualizado correctamente" });

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ success: false, message: "Error en el servidor" });
    }
});

export default router;