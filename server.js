import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT) || 5001;
const HOST = '0.0.0.0';

// ---------------------------------------------------------------------
// 1. MIDDLEWARE
// ---------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------
// 2. MODELOS DE BASE DE DATOS (Mongoose Schemas)
// ---------------------------------------------------------------------

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
    person: { // El receptor/que devuelve/que registra
        type: String,
        required: true
    },
    validatedBy: { // El almacenero que valida
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
// 3. FUNCIÓN UTILITARIA: Generador de QR Consecutivo
// ---------------------------------------------------------------------

const getNextQrCode = async () => {
    const lastItem = await Item.findOne({ qrCode: /^G\d+$/ })
        .sort({ createdAt: -1 })
        .limit(1);

    let nextNumber = 1;

    if (lastItem && lastItem.qrCode) {
        const numberMatch = lastItem.qrCode.match(/\d+/);
        
        if (numberMatch) {
            const lastQrNumber = parseInt(numberMatch[0], 10);
            
            if (!isNaN(lastQrNumber)) {
                 nextNumber = lastQrNumber + 1;
            }
        }
    }

    return 'G' + String(nextNumber).padStart(3, '0');
};


// ---------------------------------------------------------------------
// 4. RUTAS DE INVENTARIO (ITEM)
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


// GET /api/items/:qrCode/history - Obtener historial de un ítem específico
app.get('/api/items/:qrCode/history', async (req, res) => {
    try {
        const { qrCode } = req.params;
        
        // 1. Buscar el Ítem por qrCode para obtener el ID
        const item = await Item.findOne({ qrCode });
        if (!item) {
            return res.status(404).json({ message: 'Ítem no encontrado.' });
        }
        
        // 2. Buscar el Historial por itemId, ordenado cronológicamente
        const history = await History.find({ itemId: item._id }).sort({ createdAt: 1 });
        
        // 🔑 NOTA: La propiedad 'person' en el historial ahora contendrá
        // el nombre de la persona a la que se prestó o que devolvió el ítem.
        return res.json({ history });

    } catch (error) {
        console.error('Error al obtener historial:', error);
        res.status(500).json({ error: error.message });
    }
});


// POST /api/items - Registrar nuevo ítem (CON GENERACIÓN DE QR AUTOMÁTICA)
app.post('/api/items', async (req, res) => {
    try {
        const { name, category, description, registeredBy, isConsumible, stock } = req.body;
        
        const qrCode = await getNextQrCode();

        const newItem = new Item({
            qrCode,
            name,
            category,
            description,
            status: 'available',
            registeredBy,
            isConsumible: isConsumible || false,
            stock: isConsumible ? parseInt(stock) : 1 
        });
        await newItem.save();

        const history = new History({
            itemId: newItem._id,
            action: 'register',
            person: registeredBy,
            validatedBy: registeredBy,
            notes: `Registro inicial por ${registeredBy}`
        });
        await history.save();

        res.json({ message: 'Item registrado exitosamente', item: newItem, qrCode: qrCode });
    } catch (error) {
        console.error('Error al registrar ítem:', error);
        res.status(500).json({ error: error.message });
    }
});


// POST /api/scan - Escanear QR
app.post('/api/scan', async (req, res) => {
    try {
        const { qrCode } = req.body;
        
        const item = await Item.findOne({ qrCode });
        if (item) {
            return res.json({ type: 'item', data: item, status: item.status });
        }

        const worker = await Worker.findOne({ qrCode });
        if (worker) {
            return res.json({ type: 'worker', data: worker, status: 'found' });
        }

        return res.json({ type: 'none', message: 'Código QR no registrado.' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// POST /api/borrow - Prestar ítem (Préstamo o Consumo)
app.post('/api/borrow', async (req, res) => {
    try {
        const { qrCode, personName, notes, validatedBy, quantity = 1 } = req.body; 
        
        if (!qrCode || !personName || !validatedBy) {
            return res.status(400).json({ success: false, message: 'QR Code, persona y validador son obligatorios.' });
        }

        const item = await Item.findOne({ qrCode }); 

        if (!item) {
            return res.status(404).json({ success: false, message: 'Ítem no encontrado.' });
        }
        
        let updateQuery = {};
        let actionType = 'borrow';
        
        if (item.isConsumible) {
            if (item.stock < quantity) {
                return res.status(400).json({ success: false, message: `Stock insuficiente. Disponible: ${item.stock}.` });
            }
            
            actionType = 'consumption';
            updateQuery = { 
                $inc: { stock: -quantity } 
            };
            
        } else {
            if (item.status === 'borrowed' || item.status === 'repair') {
                return res.status(400).json({ success: false, message: 'Ítem de unidad única no disponible.' });
            }
            
            actionType = 'borrow';
            updateQuery = {
                status: 'borrowed',
                currentHolder: personName,
                loanDate: new Date()
            };
        }

        const updatedItem = await Item.findOneAndUpdate({ qrCode }, updateQuery, { new: true });
        
        const history = new History({
            itemId: updatedItem._id,
            action: actionType,
            person: personName, 
            validatedBy: validatedBy, 
            notes: notes,
            quantity: quantity,
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
        // 🔑 Usar los nombres de campos que envía el frontend
        const { qrCode, notes, personReturning, almaceneroName } = req.body;
        
        if (!qrCode || !personReturning || !almaceneroName) {
            return res.status(400).json({ success: false, message: 'Faltan campos obligatorios: QR Code, persona que devuelve, o nombre del almacenero.' });
        }

        const item = await Item.findOneAndUpdate(
            { qrCode: qrCode, status: 'borrowed', isConsumible: false },
            {
                status: 'available',
                currentHolder: null,
                loanDate: null
            },
            { new: true }
        );
        
        if (!item) {
            return res.status(400).json({ success: false, message: 'El ítem no pudo ser devuelto. Ya no estaba prestado o es consumible.' });
        }
        
        const history = new History({
            itemId: item._id,
            action: 'return',
            person: personReturning, // La persona que devuelve
            validatedBy: almaceneroName, // El almacenero
            notes: notes
        });
        await history.save();
        
        res.json({ success: true, message: 'Devolución registrada', item: item });
    } catch (error) {
        console.error('Error en /api/return:', error.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor. ' + error.message });
    }
});


// ---------------------------------------------------------------------
// 5. RUTAS DE TRABAJADORES (WORKER) Y AUTENTICACIÓN
// ---------------------------------------------------------------------
// ... (Tus rutas de /api/login, /api/workers/register, /api/workers, /api/attendance/scan) ...
app.post('/api/login', async (req, res) => {
    // Lógica de login
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

// ... (Resto de rutas de Worker) ...

app.post('/api/workers/register', async (req, res) => {
    try {
        const { name, position, role, pin } = req.body; 

        if (!name || !position || !role || !pin) {
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos.' });
        }

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

app.get('/api/workers', async (req, res) => {
    try {
        const workers = await Worker.find({}, { pin: 0 });
        res.json(workers);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la lista de usuarios.' });
    }
});

app.post('/api/attendance/scan', async (req, res) => {
    const { qrCode } = req.body;
    try {
        const worker = await Worker.findOne({ qrCode });
        if (!worker) {
            return res.status(404).json({ message: 'Trabajador no encontrado.' });
        }

        const lastAttendance = worker.attendance.length > 0 ? worker.attendance[worker.attendance.length - 1] : null;
        const lastAction = lastAttendance ? lastAttendance.action : 'OUT'; 

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
// 6. CONEXIÓN Y SERVIDOR
// ---------------------------------------------------------------------

app.get('/health', (req, res) => {
    res.json({ status: 'OK', database: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado' });
});

mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ Conectado a MongoDB Atlas'))
.catch(error => console.error('❌ Error MongoDB:', error));

app.listen(PORT, HOST, () => {
    console.log(`🔊 Servidor corriendo en puerto ${PORT}`);
});