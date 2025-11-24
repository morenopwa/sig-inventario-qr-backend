const express = require('express');
const mongoose = require('mongoose');
const app = express();

// ✅ CORREGIR: Usar process.env.PORT, no el string "PORT"
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // ✅ Importante para Render

// Middleware
app.use(express.json());

// Rutas básicas
app.get('/', (req, res) => {
  res.json({ 
    message: 'Servidor funcionando',
    port: PORT,
    environment: process.env.NODE_ENV
  });
});

// Health check para Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    database: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado',
    timestamp: new Date().toISOString()
  });
});

// Conexión a MongoDB (tu código actual)
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Conectado exitosamente a MongoDB Atlas');
  console.log('📊 Base de datos: sig-inventario-qr');
})
.catch((error) => {
  console.error('❌ Error conectando a MongoDB:', error);
});

// ✅ CORREGIR: Vincular al host 0.0.0.0 y puerto correcto
app.listen(PORT, HOST, () => {
  console.log(`🔊 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️ Estado MongoDB: ${mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'}`);
});