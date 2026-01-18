import express from 'express';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

const router = express.Router();

// @route   POST /api/transactions
router.post('/', async (req, res) => {
    try {
        const { quantity, itemName, personName, type, category } = req.body;

        // Validaciones iniciales para evitar que el servidor falle
        if (!itemName || !quantity || !type) {
            return res.status(400).json({ success: false, message: "Faltan datos: nombre, cantidad o tipo." });
        }

        const normalizedItemName = itemName.trim().toUpperCase();
        const normalizedPersonName = personName ? personName.trim().toUpperCase() : "GENERAL";
        const numericQuantity = parseInt(quantity);

        // 1. Buscar el Item
        let item = await Item.findOne({ name: normalizedItemName });
        
        // 2. Si no existe, lo creamos con valores seguros
        if (!item) {
            // Definimos el prefijo según la categoría para el QR
            const prefix = category?.toUpperCase() === 'EPP' ? 'EPP-' : 'INV-';
            
            item = new Item({ 
                name: normalizedItemName, 
                stock: 0, 
                category: category || 'Consumibles',
                qrCode: `${prefix}${Date.now()}`,
                unit: 'und'
            });
            // Guardamos el item nuevo primero para tener un ID válido
            await item.save();
        }

        // 3. Validar Stock si es salida (OUT)
        // Muy importante: Esto es lo que evita que el inventario sea negativo
        if (type === 'OUT') {
            if (item.stock < numericQuantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Stock insuficiente. ${normalizedItemName} solo tiene ${item.stock} unidades.` 
                });
            }
            item.stock -= numericQuantity; // RESTA EL STOCK
        } else {
            item.stock += numericQuantity; // SUMA EL STOCK
        }

        // 4. Crear el registro para el CHAT (Lo que ves en las burbujas)
        const newTransaction = new Transaction({
            itemId: item._id,
            quantity: numericQuantity,
            itemName: normalizedItemName,
            personName: normalizedPersonName,
            type: type, 
            timestamp: new Date()
        });

        // 5. Crear el registro para el KARDEX (Auditoría e Historial)
        const newKardexEntry = new Movement({
            itemId: item._id,
            materialName: normalizedItemName,
            type: type === 'IN' ? 'Compra' : 'Salida', 
            quantity: numericQuantity,
            workerName: normalizedPersonName,
            date: new Date(),
            destination: 'ALMACÉN CENTRAL'
        });

        // 6. GUARDAR TODO (Atomicamente)
        // Usamos Promise.all para que si uno falla, nada se guarde (consistencia)
        await Promise.all([
            newTransaction.save(), 
            newKardexEntry.save(), 
            item.save() // Aquí se confirma la resta/suma en el inventario
        ]);

        res.status(201).json({ 
            success: true, 
            message: "Movimiento registrado con éxito",
            data: newTransaction 
        });

    } catch (err) {
        // Este log es vital para saber POR QUÉ dio error 500
        console.error("❌ ERROR CRÍTICO EN TRANSACCIÓN:", err);
        res.status(500).json({ 
            success: false, 
            message: "Error interno del servidor: " + err.message 
        });
    }
});

// @route   GET /api/transactions
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;