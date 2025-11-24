import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Modelos de MongoDB
const itemSchema = new mongoose.Schema({
  qrCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['new', 'available', 'borrowed'], default: 'new' },
  registeredBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const historySchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  action: { type: String, enum: ['borrow', 'return', 'register'], required: true },
  person: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  notes: { type: String, default: '' }
});

const Item = mongoose.model('Item', itemSchema);
const History = mongoose.model('History', historySchema);

// Conexión a MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado a MongoDB Atlas'))
.catch(err => {
  console.error('❌ Error conectando a MongoDB Atlas:', err.message);
  process.exit(1);
});

// RUTAS API
app.post('/api/scan', async (req, res) => {
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

app.post('/api/register', async (req, res) => {
  try {
    const { qrCode, name, category, description, registeredBy } = req.body;

    if (!qrCode || !name || !category || !description || !registeredBy) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const existingItem = await Item.findOne({ qrCode });
    if (existingItem) {
      return res.status(400).json({ error: 'El QR ya está registrado' });
    }

    const newItem = await Item.create({
      qrCode,
      name,
      category,
      description,
      status: 'available',
      registeredBy
    });

    await History.create({
      itemId: newItem._id,
      action: 'register',
      person: registeredBy,
      notes: `Registro inicial por ${registeredBy}`
    });

    res.json({
      message: 'Item registrado exitosamente en MongoDB Atlas',
      item: newItem
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/borrow', async (req, res) => {
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

    await History.create({
      itemId: item._id,
      action: 'borrow',
      person: person,
      notes: notes || ''
    });

    res.json({
      message: 'Item prestado exitosamente',
      item: item
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/return', async (req, res) => {
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

    await History.create({
      itemId: item._id,
      action: 'return',
      person: person,
      notes: notes || ''
    });

    res.json({
      message: 'Item devuelto exitosamente',
      item: item
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await History.find({ itemId: id }).sort({ timestamp: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 SIG INVENTARIO QR API funcionando con MongoDB Atlas',
    database: 'MongoDB Atlas (Nube)',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🔊 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`☁️  Conectado a MongoDB Atlas`);
});