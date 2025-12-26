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
// 

const workerSchema = new mongoose.Schema({
    qrCode: { type: String, required: true, unique: true }, 
    name: { type: String, required: true },
    lastName: { type: String, required: true },
    dni: { type: String, required: true },
    phone:{type: Number}, 
    email:{type: email}, 
    password: { type: String, default: '1234' },
    role: { 
        type: String, 
        enum: ['SuperAdmin', 'Almacenero', 'Calderero', 'Maniobrista', 'Residente', 'Prevencionista', 'Soldador'], 
        default: 'Operario' 
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
        
        const item = await Item.findOne({ qrCode });
        if (!item) {
            return res.status(404).json({ message: 'Ítem no encontrado.' });
        }
        
        const history = await History.find({ itemId: item._id }).sort({ createdAt: 1 });
        
        return res.json({ history });

    } catch (error) {
        console.error('Error al obtener historial:', error);
        res.status(500).json({ error: error.message });
    }
});


// 1. GET /api/frequent-data - Obtener items y personas más frecuentes
app.get('/api/frequent-data', async (req, res) => {
    try {
        const itemStats = await History.aggregate([
            { $group: { _id: "$itemId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'details' } }
        ]);

        const personStats = await History.aggregate([
            { $group: { _id: "$person", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            items: itemStats.map(i => ({ name: i.details[0]?.name, id: i._id })),
            people: personStats.map(p => p._id)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. PUT /api/history/:id - Editar una transacción
app.put('/api/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { cantidad, itemName, persona, notes } = req.body;

        const record = await History.findById(id);
        if (!record) return res.status(404).json({ message: "Registro no encontrado" });

        // Aquí podrías añadir lógica para revertir el stock anterior y aplicar el nuevo
        // Por ahora, actualizamos los datos del historial
        record.quantity = cantidad;
        record.person = persona;
        record.notes = notes || record.notes;
        await record.save();

        res.json({ success: true, message: "Registro actualizado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. DELETE /api/history/:id - Eliminar transacción (Revierte stock)
app.delete('/api/history/:id', async (req, res) => {
    try {
        const record = await History.findByIdAndDelete(req.params.id);
        if (!record) return res.status(404).json({ message: "No se encontró el registro" });
        
        // Lógica opcional: Devolver el stock si fue una salida
        if (record.action === 'borrow' || record.action === 'consumption') {
            await Item.findByIdAndUpdate(record.itemId, { $inc: { stock: record.quantity } });
        }

        res.json({ success: true, message: "Registro eliminado y stock revertido" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// POST /api/items - Registrar nuevo ítem (Soporta registro por Voz)
app.post('/api/items', async (req, res) => {
    try {
        const { name, category, description, registeredBy, isConsumible, stock } = req.body;
        
        if (!name || !category || !registeredBy) {
            return res.status(400).json({ success: false, message: 'Faltan campos obligatorios: name, category, y registeredBy.' });
        }
        
        const qrCode = await getNextQrCode();

        const newItem = new Item({
            qrCode,
            name,
            category,
            description: description || 'Registrado por voz o formulario simple', // Usa descripción por defecto
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

app.post('/api/stock/add', async (req, res) => {
    try {
        const { qrCode, quantity, validatedBy, notes } = req.body; // Recibe el QR, cantidad, y quién valida
        
        if (!qrCode || !quantity || !validatedBy || typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({ success: false, message: 'QR Code, cantidad válida (>0), y validador son obligatorios.' });
        }

        // Buscar el ítem por QR o Nombre
        const item = await Item.findOne({ 
            $or: [{ qrCode: qrCode }, { name: { $regex: new RegExp(`^${qrCode}$`, 'i') } }]
        }); 

        if (!item) {
            return res.status(404).json({ success: false, message: 'Ítem no encontrado.' });
        }
        
        // Opcional: Si quieres forzar que solo se pueda añadir stock a consumibles
        if (!item.isConsumible) {
             // Puedes cambiar esto, pero tiene sentido solo añadir stock a consumibles
             // Si no es consumible, stock es siempre 1 (unidad única)
             return res.status(400).json({ success: false, message: 'Solo se puede añadir stock a ítems consumibles.' });
        }

        // 1. Actualizar el stock
        const updatedItem = await Item.findOneAndUpdate(
            { _id: item._id },
            { $inc: { stock: quantity } }, // Incrementa el stock
            { new: true }
        );
        
        // 2. Registrar la acción en el historial
        const history = new History({
            itemId: updatedItem._id,
            action: 'register', // O podrías usar 'stock_add' si lo añades al enum
            person: validatedBy, // Quién añade el stock
            validatedBy: validatedBy, 
            notes: notes || `Stock añadido: +${quantity}`,
            quantity: quantity,
        });
        await history.save();
        
        res.json({ 
            success: true, 
            message: `Stock de ${updatedItem.name} actualizado. Nuevo stock: ${updatedItem.stock}.`, 
            item: updatedItem 
        });
        
    } catch (error) {
        console.error("Error en /api/stock/add:", error.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor. ' + error.message });
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
        // En este caso, qrCode puede ser el QR o el nombre si la lógica de voz no captura el QR
        const { qrCode, personName, notes, validatedBy, quantity = 1 } = req.body; 
        
        if (!qrCode || !personName || !validatedBy) {
            return res.status(400).json({ success: false, message: 'QR Code/Nombre, persona y validador son obligatorios.' });
        }

        // Buscar por QR o Nombre
        const item = await Item.findOne({ 
            $or: [{ qrCode: qrCode }, { name: { $regex: new RegExp(`^${qrCode}$`, 'i') } }]
        }); 

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

        const updatedItem = await Item.findOneAndUpdate({ _id: item._id }, updateQuery, { new: true });
        
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
        const { qrCode, notes, personReturning, almaceneroName } = req.body;
        
        if (!qrCode || !personReturning || !almaceneroName) {
            return res.status(400).json({ success: false, message: 'Faltan campos obligatorios: QR Code/Nombre, persona que devuelve, o nombre del almacenero.' });
        }
        
        // Buscar por QR o Nombre
        const item = await Item.findOne({ 
            $or: [{ qrCode: qrCode }, { name: { $regex: new RegExp(`^${qrCode}$`, 'i') } }]
        }); 

        if (!item || item.isConsumible) {
             return res.status(400).json({ success: false, message: 'El ítem no pudo ser devuelto. Es consumible o no existe.' });
        }
        
        if (item.status !== 'borrowed') {
             return res.status(400).json({ success: false, message: 'El ítem no estaba marcado como prestado.' });
        }

        const updatedItem = await Item.findOneAndUpdate(
            { _id: item._id },
            {
                status: 'available',
                currentHolder: null,
                loanDate: null
            },
            { new: true }
        );
        
        const history = new History({
            itemId: updatedItem._id,
            action: 'return',
            person: personReturning,
            validatedBy: almaceneroName,
            notes: notes
        });
        await history.save();
        
        res.json({ success: true, message: 'Devolución registrada', item: updatedItem });
    } catch (error) {
        console.error('Error en /api/return:', error.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor. ' + error.message });
    }
});


// ---------------------------------------------------------------------
// 5. RUTAS DE TRABAJADORES (WORKER) Y AUTENTICACIÓN
// ---------------------------------------------------------------------
// ... (Tus rutas de Worker, Login y Attendance) ...
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
        const { name,dni, phone, email, password, role } = req.body; 

        if (!name || !dni || !phone ||!email ||!password || !role ) {
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos.' });
        }

        const qrCode = `W-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

        const newWorker = new Worker({
            qrCode,
            name,
            dni,
            phone,
            email,
            password,
            role, 
        });

        await newWorker.save();

        res.json({
            success: true,
            message: `${newWorker.role} ${newWorker.name} registrado con éxito.`,
            worker: { 
                name: newWorker.name, 
                dni: newWorker.dni, 
                phone: newWorker.phone,
                email: newWorker.email, 
                password: newWorker.password, 
                role: newWorker.role }
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

app.delete('/api/users/:id', 
    // Si estás usando middleware de autenticación (authMiddleware, roleMiddleware), 
    // debes incluirlos aquí para proteger la ruta:
    // authMiddleware,
    // roleMiddleware(['SuperAdmin']),
    
    async (req, res) => {
        try {
            const userId = req.params.id;

            // 1. Eliminar al usuario de la base de datos
            const deletedUser = await Worker.findByIdAndDelete(userId);

            // 2. Verificar si se encontró y eliminó
            if (!deletedUser) {
                // Si Mongoose no encuentra el ID, devuelve 404
                return res.status(404).json({ message: 'Usuario no encontrado para eliminar.' });
            }

            // 3. Respuesta exitosa
            console.log(`Usuario con ID ${userId} y nombre ${deletedUser.name} ha sido eliminado.`);
            res.status(200).json({ 
                message: `Usuario ${deletedUser.name} eliminado exitosamente.`,
                deletedUser: deletedUser
            });

        } catch (error) {
            // Manejo de errores de servidor o de base de datos
            console.error('Error al intentar eliminar usuario:', error);
            res.status(500).json({ message: 'Error interno del servidor al eliminar el usuario.' });
        }
    }
);

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

app.delete('/api/items/:id', async (req, res) => {
    try {
        const itemId = req.params.id; // Captura el ID desde la URL
        
        // **IMPORTANTE:** Verificar la existencia del ID
        if (!itemId || itemId.length !== 24) { // Asumiendo que usas MongoDB ObjectId
            return res.status(400).json({ message: 'ID de ítem inválido.' });
        }

        // 1. Encontrar el ítem y eliminarlo
        const deletedItem = await Item.findByIdAndDelete(itemId);

        // 2. Si no se encuentra, devolver 404 (Aunque el frontend ya maneja un 404, es buena práctica)
        if (!deletedItem) {
            return res.status(404).json({ message: 'Ítem no encontrado para eliminar.' });
        }

        // 3. Opcional: Si el ítem tiene un código QR asociado que debe liberarse/eliminarse,
        //   la lógica de limpieza (por ejemplo, del historial o de la tabla de códigos QR) iría aquí.

        console.log(`Ítem con QR ${deletedItem.qrCode} eliminado por el sistema.`);

        // 4. Respuesta exitosa
        res.status(200).json({ 
            message: `Ítem ${deletedItem.name} (${deletedItem.qrCode}) eliminado exitosamente.`,
            deletedItem: deletedItem
        });

    } catch (error) {
        console.error('Error al eliminar ítem:', error);
        res.status(500).json({ message: 'Error interno del servidor al eliminar el ítem.' });
    }
});


// GET: Obtener items y personas frecuentes (para los botones de atajo)
app.get('/api/frequent-data', async (req, res) => {
    try {
        // Agregación para contar ítems más usados
        const itemStats = await History.aggregate([
            { $group: { _id: "$itemId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 }
        ]);
        // Agregación para personas más frecuentes
        const personStats = await History.aggregate([
            { $group: { _id: "$person", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Poblar los nombres de los items
        const populatedItems = await Item.find({ 
            _id: { $in: itemStats.map(i => i._id) } 
        }, 'name qrCode');

        res.json({
            items: populatedItems,
            people: personStats.map(p => p._id)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Eliminar un registro del historial (y revertir stock)
app.delete('/api/history/:id', async (req, res) => {
    try {
        const historyRecord = await History.findByIdAndDelete(req.params.id);
        if (!historyRecord) return res.status(404).json({ message: "No encontrado" });

        // Si fue una salida, devolvemos el stock al inventario
        if (historyRecord.action === 'borrow' || historyRecord.action === 'consumption') {
            await Item.findByIdAndUpdate(historyRecord.itemId, { 
                $inc: { stock: historyRecord.quantity } 
            });
        }
        res.json({ success: true, message: "Registro eliminado y stock restaurado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtener items y personas frecuentes para los botones de atajo
app.get('/api/frequent-data', async (req, res) => {
  try {
    const itemStats = await History.aggregate([
      { $group: { _id: "$itemId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);
    
    const personStats = await History.aggregate([
      { $group: { _id: "$person", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const populatedItems = await Item.find({ _id: { $in: itemStats.map(i => i._id) } }, 'name');
    res.json({
      items: populatedItems,
      people: personStats.map(p => p._id)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar un registro y devolver stock
app.delete('/api/history/:id', async (req, res) => {
  try {
    const record = await History.findByIdAndDelete(req.params.id);
    if (record && (record.action === 'borrow' || record.action === 'consumption')) {
      await Item.findByIdAndUpdate(record.itemId, { $inc: { stock: record.quantity } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// IMPORTANTE: Definir el esquema para los movimientos
const TransactionSchema = new mongoose.Schema({
  cantidad: Number,
  itemName: String,
  persona: String,
  tipo: String, // 'ingreso' o 'salida'
  timestamp: String
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

// Esquema para el inventario (Stock actual)
const InventorySchema = new mongoose.Schema({
  name: { type: String, unique: true },
  stock: Number
});
const Inventory = mongoose.model('Inventory', InventorySchema);

// --- RUTAS QUE EL FRONTEND ESTÁ BUSCANDO (404 SOLUCIÓN) ---

// 1. Obtener Inventario Completo
app.get('/api/inventory', async (req, res) => {
  try {
    const items = await Inventory.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Registrar Transacción y Actualizar Stock automáticamente
// LA RUTA DEBE EMPEZAR CON /api
app.post('/api/transactions', async (req, res) => {
  try {
    const { cantidad, itemName, persona, tipo, timestamp } = req.body;
    
    // 1. Guardar el movimiento
    const newTransaction = new Transaction({ 
        cantidad, 
        itemName: itemName.toUpperCase(), 
        persona, 
        tipo, 
        timestamp 
    });
    await newTransaction.save();

    // 2. Actualizar el stock en la colección de Inventario
    const factor = tipo === 'ingreso' ? cantidad : -cantidad;
    await Inventory.findOneAndUpdate(
      { name: itemName.toUpperCase() },
      { $inc: { stock: factor } },
      { upsert: true } // Si no existe el producto, lo crea
    );

    res.status(201).json(newTransaction);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar" });
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