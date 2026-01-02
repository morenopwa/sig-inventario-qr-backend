import express from 'express';
import Item from '../models/Item.js';
const router = express.Router();

// POST /api/inventory/scan
router.post('/scan', async (req, res) => {
    try {
        const { qrCode } = req.body;
        const item = await Item.findOne({ qrCode });
        if (!item) return res.json({ status: 'new', message: 'No registrado' });
        
        res.json({ status: 'success', item });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/inventory/items
router.get('/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
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

export default router;