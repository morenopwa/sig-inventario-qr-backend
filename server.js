import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// ✅ CORRECTO: Usar process.env.PORT
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // ✅ Importante para Render

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
app.get('/', (req, res) => {
  res.json({ 
    message: 'Servidor funcionando correctamente',
    port: PORT,
    environment: process.env.NODE_ENV
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    database: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'
  });
});

// Conexión MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log('✅ Conectado exitosamente a MongoDB Atlas');
  console.log('📊 Base de datos: sig-inventario-qr');
})
.catch(error => {
  console.error('❌ Error MongoDB:', error);
});

// ✅✅✅ IMPORTANTE: Usar HOST y template literal con ${PORT}
app.listen(PORT, HOST, () => {
  console.log(`🔊 Servidor corriendo en puerto ${PORT}`); // ← ${PORT} no "PORT"
  console.log(`🌐 Entorno: ${process.env.NODE_ENV || 'development'}`);
});