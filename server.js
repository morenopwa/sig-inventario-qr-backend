import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json());

// Modelo de Equipo
const equipmentSchema = new mongoose.Schema({
  qrCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: String,
  status: { type: String, enum: ['disponible', 'prestado'], default: 'disponible' },
  currentHolder: String,
  history: [{
    action: { type: String, enum: ['préstamo', 'devolución'] },
    person: String,
    timestamp: { type: Date, default: Date.now },
    notes: String
  }]
}, { timestamps: true });

const Equipment = mongoose.model('Equipment', equipmentSchema);

// Rutas

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', database: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado' });
});

// Obtener todos los equipos
app.get('/api/equipments', async (req, res) => {
  try {
    const equipments = await Equipment.find().sort({ updatedAt: -1 });
    res.json(equipments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Procesar QR - Buscar equipo
app.post('/api/scan', async (req, res) => {
  try {
    const { qrData } = req.body;
    
    console.log('📥 Buscando equipo con QR:', qrData);
    
    const equipment = await Equipment.findOne({ qrCode: qrData });
    
    if (!equipment) {
      return res.json({
        success: true,
        equipmentFound: false,
        message: 'Equipo no encontrado en la base de datos',
        qrData: qrData
      });
    }
    
    res.json({
      success: true,
      equipmentFound: true,
      equipment: equipment,
      message: 'Equipo encontrado'
    });
    
  } catch (error) {
    console.error('❌ Error en /api/scan:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar el QR',
      error: error.message
    });
  }
});

// Registrar préstamo
app.post('/api/loan', async (req, res) => {
  try {
    const { qrCode, personName, notes } = req.body;
    
    const equipment = await Equipment.findOneAndUpdate(
      { qrCode: qrCode },
      {
        status: 'prestado',
        currentHolder: personName,
        $push: {
          history: {
            action: 'préstamo',
            person: personName,
            notes: notes
          }
        }
      },
      { new: true }
    );
    
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipo no encontrado' });
    }
    
    res.json({
      success: true,
      message: 'Préstamo registrado correctamente',
      equipment: equipment
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Registrar devolución
app.post('/api/return', async (req, res) => {
  try {
    const { qrCode, notes } = req.body;
    
    const equipment = await Equipment.findOneAndUpdate(
      { qrCode: qrCode },
      {
        status: 'disponible',
        currentHolder: null,
        $push: {
          history: {
            action: 'devolución',
            person: 'Sistema',
            notes: notes
          }
        }
      },
      { new: true }
    );
    
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipo no encontrado' });
    }
    
    res.json({
      success: true,
      message: 'Devolución registrada correctamente',
      equipment: equipment
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Agregar nuevo equipo
app.post('/api/equipments', async (req, res) => {
  try {
    const { qrCode, name, category } = req.body;
    
    const equipment = new Equipment({
      qrCode,
      name,
      category
    });
    
    await equipment.save();
    
    res.json({
      success: true,
      message: 'Equipo agregado correctamente',
      equipment: equipment
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ Conectado a MongoDB Atlas'))
.catch(error => console.error('❌ Error MongoDB:', error));

app.listen(PORT, HOST, () => {
  console.log(`🔊 Servidor corriendo en puerto ${PORT}`);
});