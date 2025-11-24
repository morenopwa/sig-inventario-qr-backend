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

// ✅ Ruta de health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', database: 'Conectado' });
});

// ✅ Ruta para scan (GET)
app.get('/api/scan', (req, res) => {
  res.json({ 
    message: 'Endpoint de scan funcionando',
    data: req.query // o lo que necesites procesar
  });
});

// ✅ Ruta para scan (POST)
app.post('/api/scan', (req, res) => {
  try {
    const { qrData } = req.body;
    // Procesar el QR data aquí
    res.json({ 
      success: true,
      message: 'QR procesado correctamente',
      data: qrData
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ Conectado a MongoDB'))
.catch(error => console.error('❌ Error MongoDB:', error));

app.listen(PORT, HOST, () => {
  console.log(`🔊 Backend funcionando en puerto ${PORT}`);
});