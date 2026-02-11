import express from 'express';
import Item from '../models/Item.js';
import User from '../models/User.js';
import History from '../models/History.js';

const router = express.Router();

// Obtener todos los items
router.get('/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener inventario" });
    }
});
router.post('/items', async (req, res) => {
    try {
        const { name, stock, category, qrCode } = req.body;
        
        // Usamos nombres en inglés para las variables
        const newItem = new Item({
            name: name.toUpperCase(),
            stock: stock || 0,
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

router.get('/movements', async (req, res) => {
    try {
        const movements = await Movement.find().sort({ date: -1 }).limit(100);
        res.json(movements);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener movimientos" });
    }
});

// REGISTRAR PRÉSTAMO (QR Worker + Item ID)
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
        await Item.findByIdAndUpdate(itemObjectId, { $inc: { stock: -1 } });

        res.json({ success: true, message: `Préstamo registrado a: ${worker.name} ${worker.lastName}` });
    } catch (error) {
        res.status(500).json({ message: "Error al procesar préstamo" });
    }
});

// GET: api/inventory/active-loans
router.get('/active-loans', async (req, res) => {
    try {
        const loans = await History.find({ status: 'PENDING', action: 'LOAN' })
            .populate('item', 'name customId') // Trae nombre y ID del item
            .populate('worker', 'name lastName customId') // Trae datos del trabajador
            .sort({ createdAt: -1 });
        res.json(loans);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener préstamos activos" });
    }
});

// PUT: api/inventory/return/:loanId
router.put('/return/:loanId', async (req, res) => {
    try {
        const { loanId } = req.params;
        
        // 1. Buscamos el registro de préstamo
        const loan = await History.findById(loanId);
        if (!loan || loan.status === 'COMPLETED') {
            return res.status(404).json({ message: "Préstamo no encontrado o ya devuelto" });
        }

        // 2. Marcamos como completado
        loan.status = 'COMPLETED';
        loan.action = 'RETURN'; // Opcional: puedes crear un nuevo registro o actualizar este
        await loan.save();

        // 3. Devolvemos el stock al Item
        await Item.findByIdAndUpdate(loan.item, { $inc: { stock: 1 } });

        res.json({ success: true, message: "Devolución registrada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al procesar devolución" });
    }
});

router.get('/my-loans/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Validar que el ID no sea la palabra "undefined" o esté vacío
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