import express from 'express';
import Item from '../models/Item.js';
import History from '../models/History.js';

const router = express.Router();

// POST /api/scan - Escanear QR
router.post('/scan', async (req, res) => {
  try {
    const { qrCode } = req.body;

    if (!qrCode) {
      return res.status(400).json({ error: 'QR code es requerido' });
    }

    const item = await Item.findOne({ qrCode });

    if (!item) {
      return res.json({
        status: 'new',
        message: 'Item no registrado. Proceder a registro.'
      });
    }

    if (item.status === 'available') {
      return res.json({
        status: 'available',
        item: item,
        message: 'Item disponible. Proceder a préstamo.'
      });
    }

    if (item.status === 'borrowed') {
      return res.json({
        status: 'borrowed',
        item: item,
        message: 'Item prestado. Proceder a devolución.'
      });
    }

    res.status(400).json({ error: 'Estado desconocido' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/register - Registrar nuevo item
router.post('/register', async (req, res) => {
  try {
    const { qrCode, name, category, description, registeredBy } = req.body;

    if (!qrCode || !name || !category || !description || !registeredBy) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const existingItem = await Item.findOne({ qrCode });
    if (existingItem) {
      return res.status(400).json({ error: 'El QR ya está registrado' });
    }

    const newItem = new Item({
      qrCode,
      name,
      category,
      description,
      status: 'available',
      registeredBy
    });

    await newItem.save();

    const history = new History({
      itemId: newItem._id,
      action: 'register',
      person: registeredBy,
      notes: `Registro inicial por ${registeredBy}`
    });

    await history.save();

    res.json({
      message: 'Item registrado exitosamente',
      item: newItem
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/borrow - Prestar item
router.post('/borrow', async (req, res) => {
  try {
    const { qrCode, person, notes } = req.body;

    if (!qrCode || !person) {
      return res.status(400).json({ error: 'QR code y persona son requeridos' });
    }

    const item = await Item.findOne({ qrCode });
    if (!item) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    if (item.status !== 'available') {
      return res.status(400).json({ error: 'Item no está disponible para préstamo' });
    }

    item.status = 'borrowed';
    await item.save();

    const history = new History({
      itemId: item._id,
      action: 'borrow',
      person: person,
      notes: notes || ''
    });

    await history.save();

    res.json({
      message: 'Item prestado exitosamente',
      item: item
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/return - Devolver item
router.post('/return', async (req, res) => {
  try {
    const { qrCode, person, notes } = req.body;

    if (!qrCode || !person) {
      return res.status(400).json({ error: 'QR code y persona son requeridos' });
    }

    const item = await Item.findOne({ qrCode });
    if (!item) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    if (item.status !== 'borrowed') {
      return res.status(400).json({ error: 'Item no está prestado' });
    }

    item.status = 'available';
    await item.save();

    const history = new History({
      itemId: item._id,
      action: 'return',
      person: person,
      notes: notes || ''
    });

    await history.save();

    res.json({
      message: 'Item devuelto exitosamente',
      item: item
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/items - Listar todos los items
router.get('/items', async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/history/:id - Historial de un item
router.get('/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await History.find({ itemId: id })
      .populate('itemId')
      .sort({ timestamp: -1 });
    
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;