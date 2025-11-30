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

// Modelo de Trabajador
const workerSchema = new mongoose.Schema({
  qrCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  position: String,
  department: String,
  attendance: [{
    date: { type: Date, default: Date.now },
    checkIn: Date,
    checkOut: Date,
    hoursWorked: Number,
    status: { type: String, enum: ['presente', 'ausente'], default: 'presente' }
  }]
}, { timestamps: true });

const Worker = mongoose.model('Worker', workerSchema);



// Rutas

// Rutas para trabajadores
app.get('/api/workers', async (req, res) => {
  try {
    const workers = await Worker.find().sort({ name: 1 });
    res.json(workers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workers', async (req, res) => {
  try {
    const { name, position, department } = req.body;
    
    const worker = new Worker({
      qrCode: `WORKER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      position,
      department
    });
    
    await worker.save();
    
    res.json({
      success: true,
      message: 'Trabajador agregado correctamente',
      worker: worker
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Registrar entrada/salida
app.post('/api/attendance/scan', async (req, res) => {
  try {
    const { qrData } = req.body;
    
    const worker = await Worker.findOne({ qrCode: qrData });
    
    if (!worker) {
      return res.json({
        success: false,
        message: 'Trabajador no encontrado'
      });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAttendance = worker.attendance.find(record => 
      new Date(record.date).setHours(0, 0, 0, 0) === today.getTime()
    );
    
    let message = '';
    
    if (!todayAttendance) {
      // Primera vez hoy - registrar entrada
      worker.attendance.push({
        checkIn: new Date(),
        status: 'presente'
      });
      message = `✅ Entrada registrada para ${worker.name}`;
    } else if (todayAttendance.checkIn && !todayAttendance.checkOut) {
      // Ya tiene entrada - registrar salida
      todayAttendance.checkOut = new Date();
      
      // Calcular horas trabajadas
      const hoursWorked = (todayAttendance.checkOut - todayAttendance.checkIn) / (1000 * 60 * 60);
      todayAttendance.hoursWorked = Math.round(hoursWorked * 100) / 100;
      
      message = `✅ Salida registrada para ${worker.name}. Horas: ${todayAttendance.hoursWorked}h`;
    } else {
      // Ya tiene entrada y salida hoy
      message = `ℹ️ ${worker.name} ya completó su jornada hoy`;
    }
    
    await worker.save();
    
    res.json({
      success: true,
      message: message,
      worker: worker,
      attendance: todayAttendance || worker.attendance[worker.attendance.length - 1]
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener reporte de asistencias
app.get('/api/attendance/report', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    const workers = await Worker.aggregate([
      {
        $lookup: {
          from: 'workers',
          localField: '_id',
          foreignField: '_id',
          as: 'attendanceToday'
        }
      },
      {
        $unwind: {
          path: '$attendanceToday',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          $or: [
            { 
              'attendanceToday.date': { 
                $gte: targetDate,
                $lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000)
              }
            },
            { 'attendanceToday': null }
          ]
        }
      }
    ]);
    
    res.json(workers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', database: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado' });
});

// ✅ CORREGIDO: Ruta para items (alias de equipments)
app.get('/api/items', async (req, res) => {
  try {
    const items = await Equipment.find().sort({ updatedAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ También mantener la ruta equipments por compatibilidad
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
    
    // Verificar si ya existe
    const existing = await Equipment.findOne({ qrCode });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un equipo con este código QR'
      });
    }
    
    const equipment = new Equipment({
      qrCode,
      name,
      category: category || 'General'
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

// Favicon
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ Conectado a MongoDB Atlas'))
.catch(error => console.error('❌ Error MongoDB:', error));

app.listen(PORT, HOST, () => {
  console.log(`🔊 Servidor corriendo en puerto ${PORT}`);
});