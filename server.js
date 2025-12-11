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

// Modelo Trabajador (Worker) - Sin cambios
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


// Modelo Item (Equipos de Inventario) - Sin cambios en el esquema
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


// Modelo Historial (History) - Sin cambios
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
// 3. FUNCIÓN UTILITARIA: Generador de QR Consecutivo
// ---------------------------------------------------------------------

/**
 * Genera el siguiente QR consecutivo (G001, G002, etc.)
 */
// En server.js

const getNextQrCode = async () => {
    // 1. Buscar el último ítem cuyo qrCode empiece con 'G' y sea seguido por dígitos,
    // ORDENANDO DE FORMA DESCENDENTE por la FECHA de creación para encontrar el último registrado.
    const lastItem = await Item.findOne({ qrCode: /^G\d+$/ })
        .sort({ createdAt: -1 }) // 🔑 Mejor ordenar por fecha de creación (createdAt)
        .limit(1);

    let nextNumber = 1;

    if (lastItem && lastItem.qrCode) {
        // 2. Extraer el número del último QR (ej. de 'G005' a 5)
        const numberMatch = lastItem.qrCode.match(/\d+/);
        
        if (numberMatch) {
            // Convertir el match a entero, asegurando que se extraiga el número correctamente
            const lastQrNumber = parseInt(numberMatch[0], 10);
            
            if (!isNaN(lastQrNumber)) {
                 nextNumber = lastQrNumber + 1;
            }
        }
    }

    // 3. Formatear el número a 'G' + 3 dígitos
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
        // ... (resto de la lógica)
    } catch (error) {
        // ...
    }
});




// POST /api/items - Registrar nuevo ítem (CON GENERACIÓN DE QR AUTOMÁTICA)
app.post('/api/items', async (req, res) => {
    try {
        // Quitamos qrCode del body, lo generaremos automáticamente
        const { name, category, description, registeredBy, isConsumible, stock } = req.body;
        
        // 🔑 1. Generar el código QR consecutivo
        const qrCode = await getNextQrCode();

        // 2. Crear nuevo ítem
        const newItem = new Item({
            qrCode, // Usar el QR generado
            name,
            category,
            description,
            status: 'available',
            registeredBy,
            isConsumible: isConsumible || false,
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


// POST /api/scan - Escanear QR (Lógica del frontend: Item o Trabajador) - Sin cambios
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


// POST /api/borrow - Prestar ítem (Lógica de préstamo y consumo MEJORADA)
app.post('/api/borrow', async (req, res) => {
    try {
        // Añadimos quantity para ser robustos, aunque el frontend solo envíe 1
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
            // 🔑 LÓGICA DE CONSUMIBLE: 
            // 1. Siempre se permite consumir mientras haya stock.
            // 2. El status y currentHolder NUNCA se tocan, solo el stock.
            
            if (item.stock < quantity) {
                return res.status(400).json({ success: false, message: `Stock insuficiente. Disponible: ${item.stock}.` });
            }
            
            actionType = 'consumption';
            
            updateQuery = { 
                $inc: { stock: -quantity } // Decrementar stock por la cantidad
                // No tocamos status/currentHolder, el ítem sigue 'available'
            };
            
        } else {
            // Lógica para ítem de unidad única (Herramienta, etc.)
            if (item.status === 'borrowed' || item.status === 'repair') {
                return res.status(400).json({ success: false, message: 'Ítem de unidad única no disponible (prestado o en reparación).' });
            }
            
            actionType = 'borrow';
            updateQuery = {
                status: 'borrowed',
                currentHolder: personName,
                loanDate: new Date()
            };
        }

        // Ejecutar la actualización en la BD
        const updatedItem = await Item.findOneAndUpdate({ qrCode }, updateQuery, { new: true });
        
        // Registrar en Historial
        const history = new History({
            itemId: updatedItem._id,
            action: actionType,
            person: personName, 
            validatedBy: validatedBy, 
            notes: notes,
            quantity: quantity, // Cantidad consumida/prestada
        });
        await history.save();
        
        res.json({ success: true, message: 'Transacción registrada', item: updatedItem });
    } catch (error) {
        console.error("Error en /api/borrow:", error.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor. ' + error.message });
    }
});


// POST /api/return - Devolver ítem (Solo aplica a ítems de unidad única) - Sin cambios
app.post('/api/return', async (req, res) => {
    try {
        const { qrCode, notes, personName, validatedBy } = req.body;
        
        const item = await Item.findOneAndUpdate(
            // Aseguramos que NO sea consumible y que esté prestado
            { qrCode: qrCode, status: 'borrowed', isConsumible: false },
            {
                status: 'available',
                currentHolder: null,
                loanDate: null
            },
            { new: true }
        );
        
        if (!item) {
            return res.status(400).json({ success: false, message: 'Item no estaba prestado, es consumible (no se devuelve) o no encontrado.' });
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
// 5. RUTAS DE TRABAJADORES (WORKER) Y AUTENTICACIÓN - Sin cambios
// ---------------------------------------------------------------------

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
// 6. CONEXIÓN Y SERVIDOR - Sin cambios
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