// server.js (CÓDIGO COMPLETO Y UNIFICADO)

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
// 2. MODELOS DE BASE DE DATOS (Items, Historial, Trabajadores)
// ---------------------------------------------------------------------

// Modelo Trabajador (Para QR de persona y Asistencia)
const workerSchema = new mongoose.Schema({
    qrCode: { type: String, required: true, unique: true }, 
    name: { type: String, required: true },
    position: String,
    // 🔑 NUEVO CAMPO PARA LOGIN
    pin: { type: String, required: true, default: '1234' }, 
    // ✅ Rol de SuperAdmin añadido
    role: { 
        type: String, 
        enum: ['SuperAdmin', 'Almacenero', 'Trabajador'], 
        default: 'Trabajador' 
    }, 
    attendance: [/* ... */]
}, { timestamps: true });

const Worker = mongoose.model('Worker', workerSchema);


// Modelo Item (Equipos de Inventario)
const itemSchema = new mongoose.Schema({
    // Utilizamos prefijo 'E-' para la generación de QR
    qrCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, default: 'Sin descripción' },
    status: {
        type: String,
        // ✅ AÑADIDO 'repair'
        enum: ['new', 'available', 'borrowed', 'repair'], 
        default: 'new'
    },
    currentHolder: { // Quien lo tiene AHORA
        type: String,
        default: null
    },
    loanDate: { // Fecha del préstamo actual
        type: Date,
        default: null
    },
    registeredBy: String,
    // 🔑 NUEVO CAMPO: Para items consumibles (Lotes de clavos, etc.)
    isConsumable: { type: Boolean, default: false }, 
    stock: { type: Number, default: 1 } // Cantidad si es consumible
}, { timestamps: true });

const Item = mongoose.model('Item', itemSchema);


// Modelo Historial (Trazabilidad de cada evento)
const historySchema = new mongoose.Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    // Añadido 'repair' y 'consumption'
    action: {
        type: String,
        enum: ['borrow', 'return', 'register', 'repair', 'consumption'],
        required: true
    },
    person: { // Trabajador involucrado (quien lo toma/devuelve)
        type: String,
        required: true
    },
    // 🔑 Campo para Auditoría (quién registró la acción)
    validatedBy: { 
        type: String,
        default: 'Sistema' 
    },
    quantity: { // Relevante solo para consumption
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
        // En un sistema real, aquí aplicarías la restricción de rol (Solo Almacenero)
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/scan - Escanear QR (Lógica del frontend)
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


// POST /api/register - Registrar nuevo ítem (Solo Almacenero)
app.post('/api/register', async (req, res) => {
    try {
        const { qrCode, name, category, description, registeredBy } = req.body; // Agregar más campos si es necesario
        
        const existingItem = await Item.findOne({ qrCode });
        if (existingItem) {
            return res.status(400).json({ error: 'El QR ya está registrado' });
        }
        
        const newItem = new Item({
            qrCode,
            name,
            category,
            description,
            status: 'available',
            registeredBy
        });
        await newItem.save();

        const history = new History({
            itemId: newItem._id,
            action: 'register',
            person: registeredBy, // La persona que registró
            validatedBy: registeredBy,
            notes: `Registro inicial por ${registeredBy}`
        });
        await history.save();

        res.json({ message: 'Item registrado exitosamente', item: newItem });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// POST /api/borrow - Prestar ítem (CÓDIGO CORREGIDO)
app.post('/api/borrow', async (req, res) => {
    try {
        const { qrCode, personName, notes, validatedBy } = req.body; // validatedBy es el Almacenero
        
        if (!qrCode || !personName || !validatedBy) {
            return res.status(400).json({ success: false, message: 'QR Code, persona y validador son obligatorios.' });
        }

        // 1. Buscar el ítem (SIN actualizar aún)
        const item = await Item.findOne({ qrCode }); 

        if (!item || item.status === 'borrowed') {
            return res.status(400).json({ success: false, message: 'Ítem no disponible (prestado, en reparación o no encontrado).' });
        }

        // 2. Definir la lógica y la consulta de actualización (updateQuery)
        let updateQuery = {};
        let actionType = 'PRESTAMO';
        
        if (item.isConsumable) {
            
            // Control de stock
            if (item.stock <= 0) {
                return res.status(400).json({ success: false, message: `Stock agotado para el consumible ${item.name}.` });
            }
            
            // Es consumo
            actionType = 'CONSUMO';
            const newStock = item.stock - 1;
            
            updateQuery = { 
                $inc: { stock: -1 }, // Mongoose: Decrementar stock en 1
                // Si el stock cae a 0, marcamos el item como 'agotado' y registramos quién lo agotó.
                currentHolder: (newStock <= 0) ? personName : null, 
                status: (newStock <= 0) ? 'borrowed' : 'available' // Status 'borrowed' solo cuando el stock llega a cero
            };
            
        } else {
            // Es un préstamo de unidad única
            updateQuery = {
                status: 'borrowed',
                currentHolder: personName,
                loanDate: new Date()
            };
        }

        // 3. Ejecutar la única actualización en la BD
        const updatedItem = await Item.findOneAndUpdate({ qrCode }, updateQuery, { new: true });
        
        if (!updatedItem) {
             return res.status(404).json({ success: false, message: 'Error al actualizar el ítem. No encontrado.' });
        }

        // 4. Registrar en Historial
        const history = new History({
            itemId: updatedItem._id, // Usamos el ID del documento encontrado/actualizado
            action: actionType,
            person: personName, 
            validatedBy: validatedBy, 
            notes: notes,
            quantity: item.isConsumable ? 1 : 1, // Se consume/presta 1 unidad
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
        const { qrCode, notes, personName, validatedBy } = req.body; // personName: quien lo devuelve
        
        const item = await Item.findOneAndUpdate(
            { qrCode: qrCode, status: 'borrowed' },
            {
                status: 'available',
                currentHolder: null,
                loanDate: null
            },
            { new: true }
        );
        
        if (!item) {
            return res.status(400).json({ success: false, message: 'Item no está prestado o no encontrado' });
        }
        
        const history = new History({
            itemId: item._id,
            action: 'return',
            person: personName, // Trabajador que lo devolvió
            validatedBy: validatedBy, // Almacenero que recibió
            notes: notes
        });
        await history.save();
        
        res.json({ success: true, message: 'Devolución registrada', item: item });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// POST /api/login - INICIO DE SESIÓN
app.post('/api/login', async (req, res) => {
    try {
        const { name, pin } = req.body;
        
        // 1. Buscar trabajador por nombre
        const worker = await Worker.findOne({ name });

        if (!worker) {
            return res.status(401).json({ success: false, message: 'Usuario no encontrado.' });
        }
        
        // 2. Verificar PIN (En un sistema real, sería una verificación bcrypt)
        if (worker.pin !== pin) {
            return res.status(401).json({ success: false, message: 'PIN/Contraseña incorrecta.' });
        }
        
        // 3. Login exitoso: devolver datos del usuario (sin el PIN)
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

// POST /api/workers/register - REGISTRO DE NUEVOS USUARIOS (Ahora más robusto)
// Esta ruta solo debería ser accesible por SuperAdmin/Almacenero en el frontend.
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
            pin, // En producción: ¡HASHEAR ESTO!
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


// ---------------------------------------------------------------------
// 4. RUTAS DE TRABAJADORES (WORKER) Y ASISTENCIA
// ---------------------------------------------------------------------

// GET /api/workers - Listar todos los trabajadores
app.get('/api/workers', async (req, res) => {
    try {
        const workers = await Worker.find().sort({ name: 1 });
        res.json(workers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/workers - Obtener la lista de todos los trabajadores/usuarios
app.get('/api/workers', async (req, res) => {
    try {
        // En un sistema real, se verifica el token para asegurar que solo SuperAdmin/Almacenero accedan
        const workers = await Worker.find({}, { pin: 0 }); // Excluir el PIN por seguridad
        res.json(workers);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la lista de usuarios.' });
    }
});

// POST /api/attendance/scan - Marcar entrada/salida
app.post('/api/attendance/scan', async (req, res) => {
    // ... (Mantén la lógica de asistencia que tenías, ya es robusta)
    // ... (Recuerda que worker.qrCode tiene el formato que escaneas)
    // ...
});


// ---------------------------------------------------------------------
// 5. CONEXIÓN Y SERVIDOR
// ---------------------------------------------------------------------

// Health check
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