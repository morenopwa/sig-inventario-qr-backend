import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT) || 5001;
// El HOST '0.0.0.0' es crucial para Render
const HOST = '0.0.0.0';

// ---------------------------------------------------------------------
// 1. MIDDLEWARE
// ---------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------
// 2. MODELOS DE BASE DE DATOS (Mongoose Schemas)
// ---------------------------------------------------------------------

// Modelo Trabajador (Worker)
const workerSchema = new mongoose.Schema({
    qrCode: { type: String, required: true, unique: true }, 
    name: { type: String, required: true },
    position: String,
    pin: { type: String, required: true, default: '1234' }, 
    role: { 
        type: String, 
        enum: ['SuperAdmin', 'Almacenero', 'Trabajador'], 
        default: 'Trabajador' 
    }, 
    attendance: [{
        action: { type: String, enum: ['IN', 'OUT'] },
        timestamp: { type: Date, default: Date.now },
        notes: String
    }]
}, { timestamps: true });

const Worker = mongoose.model('Worker', workerSchema);


// Modelo Item (Equipos de Inventario)
const itemSchema = new mongoose.Schema({
    qrCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, default: 'Sin descripción' },
    status: {
        type: String,
        enum: ['new', 'available', 'borrowed', 'repair'],
        default: 'new'
    },
    currentHolder: {
        type: String,
        default: null
    },
    loanDate: {
        type: Date,
        default: null
    },
    registeredBy: String,
    isConsumible: { type: Boolean, default: false }, 
    stock: { type: Number, default: 1 }
}, { timestamps: true });

const Item = mongoose.model('Item', itemSchema);


// Modelo Historial (History)
const historySchema = new mongoose.Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    action: {
        type: String,
        enum: ['borrow', 'return', 'register', 'repair', 'consumption'],
        required: true
    },
    person: {
        type: String,
        required: true
    },
    validatedBy: {
        type: String,
        default: 'Sistema' 
    },
    quantity: {
        type: Number,
        default: 1
    },
    notes: { type: String, default: '' },
}, { timestamps: true });

const History = mongoose.model('History', historySchema);


// ---------------------------------------------------------------------
// 3. RUTAS DE INVENTARIO (ITEM)
// ---------------------------------------------------------------------

// GET /api/items - Listar todos los ítems
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔑 CLAVE CORREGIDA: POST /api/items - Registrar nuevo ítem
// Esta ruta sustituye a /api/register y maneja datos de consumibles.
app.post('/api/items', async (req, res) => {
    try {
        const { qrCode, name, category, description, registeredBy, isConsumible, stock } = req.body;
        
        // 1. Validar si el QR ya existe
        const existingItem = await Item.findOne({ qrCode });
        if (existingItem) {
            return res.status(400).json({ error: 'El QR ya está registrado' });
        }
        
        // 2. Crear nuevo ítem
        const newItem = new Item({
            qrCode,
            name,
            category,
            description,
            status: 'available', // Siempre 'available' (o 'new') al registrar
            registeredBy,
            isConsumible: isConsumible || false,
            // Si es consumible, usar el stock provisto; si no, usar 1.
            stock: isConsumible ? parseInt(stock) : 1 
        });
        await newItem.save();

        // 3. Registrar en Historial
        const history = new History({
            itemId: newItem._id,
            action: 'register',
            person: registeredBy,
            validatedBy: registeredBy,
            notes: `Registro inicial por ${registeredBy}`
        });
        await history.save();

        res.json({ message: 'Item registrado exitosamente', item: newItem });
    } catch (error) {
        console.error('Error al registrar ítem:', error);
        res.status(500).json({ error: error.message });
    }
});


// POST /api/scan - Escanear QR (Lógica del frontend: Item o Trabajador)
app.post('/api/scan', async (req, res) => {
    try {
        const { qrCode } = req.body;
        
        // 1. Intentar buscar como ITEM
        const item = await Item.findOne({ qrCode });
        if (item) {
            return res.json({ type: 'item', data: item, status: item.status });
        }

        // 2. Intentar buscar como TRABAJADOR
        const worker = await Worker.findOne({ qrCode });
        if (worker) {
            return res.json({ type: 'worker', data: worker, status: 'found' });
        }

        // 3. No encontrado
        return res.json({ type: 'none', message: 'Código QR no registrado.' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// POST /api/borrow - Prestar ítem (Lógica de préstamo y consumo)
app.post('/api/borrow', async (req, res) => {
    try {
        const { qrCode, personName, notes, validatedBy } = req.body;
        
        if (!qrCode || !personName || !validatedBy) {
            return res.status(400).json({ success: false, message: 'QR Code, persona y validador son obligatorios.' });
        }

        const item = await Item.findOne({ qrCode }); 

        if (!item || (item.status === 'borrowed' && !item.isConsumible) || item.status === 'repair') {
            return res.status(400).json({ success: false, message: 'Ítem no disponible (prestado, en reparación o no encontrado).' });
        }

        let updateQuery = {};
        let actionType = 'borrow';
        
        if (item.isConsumible) {
            
            if (item.stock <= 0) {
                return res.status(400).json({ success: false, message: `Stock agotado para el consumible ${item.name}.` });
            }
            
            actionType = 'consumption';
            const newStock = item.stock - 1;
            
            updateQuery = { 
                $inc: { stock: -1 }, // Decrementar stock
                // Si el stock cae a 0, marcamos el item como 'agotado' y registramos quien lo agotó.
                currentHolder: (newStock <= 0) ? personName : null, 
                status: (newStock <= 0) ? 'borrowed' : 'available'
            };
            
        } else {
            // Préstamo de unidad única
            updateQuery = {
                status: 'borrowed',
                currentHolder: personName,
                loanDate: new Date()
            };
        }

        const updatedItem = await Item.findOneAndUpdate({ qrCode }, updateQuery, { new: true });
        
        if (!updatedItem) {
             return res.status(404).json({ success: false, message: 'Error al actualizar el ítem. No encontrado.' });
        }

        // Registrar en Historial
        const history = new History({
            itemId: updatedItem._id,
            action: actionType,
            person: personName, 
            validatedBy: validatedBy, 
            notes: notes,
            quantity: 1,
        });
        await history.save();
        
        res.json({ success: true, message: 'Transacción registrada', item: updatedItem });
    } catch (error) {
        console.error("Error en /api/borrow:", error.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor. ' + error.message });
    }
});


// POST /api/return - Devolver ítem
app.post('/api/return', async (req, res) => {
    try {
        const { qrCode, notes, personName, validatedBy } = req.body;
        
        const item = await Item.findOneAndUpdate(
            // Solo se puede devolver si estaba 'borrowed' (no si está 'available' o 'repair')
            { qrCode: qrCode, status: 'borrowed' },
            {
                status: 'available',
                currentHolder: null,
                loanDate: null
            },
            { new: true }
        );
        
        if (!item) {
            return res.status(400).json({ success: false, message: 'Item no estaba prestado o no encontrado' });
        }
        
        const history = new History({
            itemId: item._id,
            action: 'return',
            person: personName,
            validatedBy: validatedBy,
            notes: notes
        });
        await history.save();
        
        res.json({ success: true, message: 'Devolución registrada', item: item });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ---------------------------------------------------------------------
// 4. RUTAS DE TRABAJADORES (WORKER) Y AUTENTICACIÓN
// ---------------------------------------------------------------------

// POST /api/login - INICIO DE SESIÓN
app.post('/api/login', async (req, res) => {
    try {
        const { name, pin } = req.body;
        
        const worker = await Worker.findOne({ name });

        if (!worker || worker.pin !== pin) {
            return res.status(401).json({ success: false, message: 'Usuario o PIN incorrecto.' });
        }
        
        const userData = {
            id: worker._id,
            name: worker.name,
            role: worker.role
        };

        return res.json({ success: true, message: 'Login exitoso', user: userData });

    } catch (error) {
        res.status(500).json({ success: false, error: 'Error interno del servidor durante el login.' });
    }
});

// POST /api/workers/register - REGISTRO DE NUEVOS USUARIOS
app.post('/api/workers/register', async (req, res) => {
    try {
        const { name, position, role, pin } = req.body; 

        if (!name || !position || !role || !pin) {
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos.' });
        }

        // Generar QR único
        const qrCode = `W-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

        const newWorker = new Worker({
            qrCode,
            name,
            position,
            role,
            pin, 
        });

        await newWorker.save();

        res.json({
            success: true,
            message: `${newWorker.role} ${newWorker.name} registrado con éxito.`,
            worker: { name: newWorker.name, qrCode: newWorker.qrCode, role: newWorker.role }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// GET /api/workers - Obtener la lista de todos los trabajadores/usuarios
app.get('/api/workers', async (req, res) => {
    try {
        const workers = await Worker.find({}, { pin: 0 }); // Excluir el PIN por seguridad
        res.json(workers);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la lista de usuarios.' });
    }
});

// POST /api/attendance/scan - Marcar entrada/salida
app.post('/api/attendance/scan', async (req, res) => {
    const { qrCode } = req.body;
    try {
        const worker = await Worker.findOne({ qrCode });
        if (!worker) {
            return res.status(404).json({ message: 'Trabajador no encontrado.' });
        }

        const lastAttendance = worker.attendance.length > 0 ? worker.attendance[worker.attendance.length - 1] : null;
        const lastAction = lastAttendance ? lastAttendance.action : 'OUT'; // Asumir OUT si no hay registro

        const newAction = lastAction === 'IN' ? 'OUT' : 'IN';
        
        worker.attendance.push({ action: newAction, timestamp: new Date(), notes: `Marcado ${newAction}` });
        await worker.save();

        res.json({ 
            success: true, 
            message: `Marcado de ${newAction} exitoso para ${worker.name}.`,
            action: newAction
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ---------------------------------------------------------------------
// 5. CONEXIÓN Y SERVIDOR
// ---------------------------------------------------------------------

// Health check para Render
app.get('/health', (req, res) => {
    res.json({ status: 'OK', database: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado' });
});

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ Conectado a MongoDB Atlas'))
.catch(error => console.error('❌ Error MongoDB:', error));

app.listen(PORT, HOST, () => {
    console.log(`🔊 Servidor corriendo en puerto ${PORT}`);
});