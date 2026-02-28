import express from 'express';
import Item from '../models/Item.js';
import User from '../models/User.js';
import History from '../models/History.js';
// Asegúrate de que el modelo Movement existe, o usa History según tu esquema
// import Movement from '../models/Movement.js'; 

const router = express.Router();

// --- OBTENER TODOS LOS ITEMS ---
router.get('/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener inventario" });
    }
});

// --- CREAR NUEVO ITEM ---
router.post('/items', async (req, res) => {
    try {
        const { name, stock, category, qrCode, unit } = req.body;
        
        const newItem = new Item({
            name: name.toUpperCase(),
            stock: stock || 0,
            unit: unit || 'UND', // Agregamos unidad
            category: category || 'General',
            qrCode: qrCode || `QR-${Date.now()}`
        });

        await newItem.save();
        res.status(201).json({ success: true, message: "Item creado con éxito", data: newItem });
    } catch (err) {
        console.error("Error al crear item:", err);
        res.status(500).json({ success: false, message: "Error al guardar el item" });
    }
});

// --- ACTUALIZAR ITEM (RUTA CRUCIAL PARA CORREGIR CATEGORÍAS) ---
// Esta ruta permite al frontend cambiar la categoría de 'Herramientas' a 'Maquinaria', etc.
router.patch('/items/:id', async (req, res) => {
    try {
        const { category, name, stock, unit } = req.body;
        const updateData = {};
        
        if (category) updateData.category = category;
        if (name) updateData.name = name.toUpperCase();
        if (stock !== undefined) updateData.stock = stock;
        if (unit) updateData.unit = unit;

        const updatedItem = await Item.findByIdAndUpdate(
            req.params.id, 
            { $set: updateData }, 
            { new: true }
        );

        if (!updatedItem) return res.status(404).json({ message: "Item no encontrado" });
        
        res.json({ success: true, message: "Categoría/Item actualizado", data: updatedItem });
    } catch (err) {
        res.status(500).json({ message: "Error al actualizar el item" });
    }
});

// --- OBTENER MOVIMIENTOS (KARDEX) ---
router.get('/movements', async (req, res) => {
    try {
        // Asumiendo que usas una colección Movement o similar
        const movements = await Movement.find().sort({ date: -1 }).limit(100);
        res.json(movements);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener movimientos" });
    }
});

// --- REGISTRAR PRÉSTAMO ---
router.post('/loan', async (req, res) => {
    const { itemObjectId, workerCustomId } = req.body;

    try {
        const worker = await User.findOne({ customId: workerCustomId });
        if (!worker) return res.status(404).json({ message: "Trabajador no encontrado con ese QR" });

        const item = await Item.findById(itemObjectId);
        if (!item || item.stock <= 0) {
            return res.status(400).json({ message: "No hay stock disponible" });
        }

        const newHistory = new History({
            item: item._id,
            worker: worker._id,
            action: 'LOAN',
            status: 'PENDING'
        });

        await newHistory.save();

        // Actualizamos stock y el registro de préstamos activos en el Item para el frontend
        await Item.findByIdAndUpdate(itemObjectId, { 
            $inc: { stock: -1 },
            $push: { 
                activeLoans: { 
                    workerName: `${worker.name} ${worker.lastName}`,
                    quantity: 1,
                    date: new Date()
                } 
            }
        });

        res.json({ success: true, message: `Préstamo registrado a: ${worker.name} ${worker.lastName}` });
    } catch (error) {
        res.status(500).json({ message: "Error al procesar préstamo" });
    }
});

// --- OBTENER PRÉSTAMOS ACTIVOS (GENERAL) ---
router.get('/active-loans', async (req, res) => {
    try {
        const loans = await History.find({ status: 'PENDING', action: 'LOAN' })
            .populate('item', 'name customId unit') 
            .populate('worker', 'name lastName customId')
            .sort({ createdAt: -1 });
        res.json(loans);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener préstamos activos" });
    }
});

// --- PROCESAR DEVOLUCIÓN ---
router.put('/return/:loanId', async (req, res) => {
    try {
        const { loanId } = req.params;
        
        const loan = await History.findById(loanId);
        if (!loan || loan.status === 'COMPLETED') {
            return res.status(404).json({ message: "Préstamo no encontrado o ya devuelto" });
        }

        loan.status = 'COMPLETED';
        loan.action = 'RETURN';
        await loan.save();

        // Devolvemos el stock y removemos de activeLoans (opcional según tu lógica de array)
        await Item.findByIdAndUpdate(loan.item, { 
            $inc: { stock: 1 },
            $pull: { activeLoans: { workerName: /.*/ } } // O una lógica más específica por ID
        });

        res.json({ success: true, message: "Devolución registrada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al procesar devolución" });
    }
});

// --- PRÉSTAMOS DE UN USUARIO ESPECÍFICO ---
router.get('/my-loans/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId || userId === 'undefined') {
            return res.status(400).json({ message: "ID de usuario no proporcionado" });
        }

        const myLoans = await History.find({ 
            worker: userId, 
            status: 'PENDING', 
            action: 'LOAN' 
        }).populate('item', 'name unit');

        const result = myLoans.map(loan => ({
            _id: loan._id,
            name: loan.item?.name || 'Item no disponible',
            unit: loan.item?.unit || 'und',
            quantity: 1,
            date: loan.createdAt
        }));

        res.json(result);
    } catch (error) {
        console.error("Error en my-loans:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

export default router;