const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado"))
    .catch(err => console.error("❌ Error de conexión:", err));

// --- MODELOS DE DATOS ---
const ItemSchema = new mongoose.Schema({
    qrCode: { type: String, unique: true },
    name: { type: String, required: true, uppercase: true },
    category: { type: String, default: 'General' },
    stock: { type: Number, default: 0 },
    history: [{
        action: String,
        quantity: Number,
        user: String,
        timestamp: { type: Date, default: Date.now }
    }]
});
const Item = mongoose.model('Item', ItemSchema);

const TransactionSchema = new mongoose.Schema({
    cantidad: Number,
    itemName: { type: String, uppercase: true },
    persona: String,
    tipo: String, // 'ingreso' o 'salida'
    timestamp: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    password: { type: String, required: true }, // Aquí se guarda el PIN
    role: { type: String, default: 'Operario' }
});
const User = mongoose.model('User', UserSchema);

// --- VARIABLE PARA EVITAR REGISTROS DOBLES ---
let lastRequest = { time: 0, body: "" };

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/api/login', async (req, res) => {
    try {
        const { name, password } = req.body;
        // Buscamos usuario exacto (trim elimina espacios accidentales)
        const user = await User.findOne({ name: name.trim(), password: password });

        if (user) {
            res.json({ success: true, user: { name: user.name, role: user.role } });
        } else {
            res.status(401).json({ success: false, message: "Nombre o PIN incorrectos" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- RUTA UNIFICADA DE TRANSACCIONES (PARA CHAT Y TABLA) ---

app.post('/api/transactions', async (req, res) => {
    // Protección contra el "Doble Click" o "Doble Enter"
    const currentReq = JSON.stringify(req.body);
    const now = Date.now();
    if (currentReq === lastRequest.body && (now - lastRequest.time) < 2000) {
        return res.status(200).json({ success: true, message: "Petición duplicada bloqueada" });
    }
    lastRequest = { time: now, body: currentReq };

    try {
        const { cantidad, itemName, persona, tipo } = req.body;
        const nombreLimpio = itemName.trim().toUpperCase();
        const numCantidad = parseInt(cantidad) || 0;

        // 1. LÓGICA DE AUTO-REGISTRO: Buscar ítem, si no existe lo creamos
        let item = await Item.findOne({ name: nombreLimpio });
        
        if (!item) {
            console.log(`✨ Registrando nuevo item automáticamente: ${nombreLimpio}`);
            item = new Item({
                name: nombreLimpio,
                qrCode: `QR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                stock: 0,
                category: 'General'
            });
        }

        // 2. ACTUALIZAR STOCK
        const factor = (tipo === 'ingreso') ? numCantidad : -numCantidad;
        item.stock += factor;
        
        // 3. AGREGAR AL HISTORIAL DEL ITEM
        item.history.push({
            action: tipo,
            quantity: numCantidad,
            user: persona || 'Admin',
            timestamp: new Date()
        });

        await item.save();

        // 4. REGISTRAR LA TRANSACCIÓN GLOBAL (Para el Chat)
        const newTx = new Transaction({
            cantidad: numCantidad,
            itemName: nombreLimpio,
            persona: persona || 'Admin',
            tipo: tipo,
            timestamp: new Date()
        });
        await newTx.save();

        res.status(201).json({ success: true, item });
    } catch (err) {
        console.error("Error en transacción:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- RUTAS DE INVENTARIO (TABLA) ---

// Obtener todos los items
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Borrar item permanentemente
app.delete('/api/items/:id', async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- RUTAS DE DATOS FRECUENTES (ATAJOS DEL CHAT) ---

app.get('/api/frequent-data', async (req, res) => {
    try {
        // Obtenemos los últimos 12 items registrados/usados
        const items = await Item.find().sort({ _id: -1 }).limit(12).select('name');
        
        // Obtenemos las últimas personas que hicieron movimientos
        const recentTxs = await Transaction.find().sort({ timestamp: -1 }).limit(40);
        const people = [...new Set(recentTxs.map(t => t.persona))].slice(0, 8);
        
        res.json({ items, people });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta para borrar atajo (del front "Long Press")
app.delete('/api/frequent-data/item/:name', async (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name).toUpperCase();
        // Nota: Aquí podrías ocultar el item si tuvieras un campo "hidden"
        // Por ahora, devolvemos éxito para que el front refresque
        res.json({ success: true, message: `Atajo ${name} gestionado` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener transacciones para las burbujas del Chat
app.get('/api/transactions', async (req, res) => {
    try {
        const txs = await Transaction.find().sort({ timestamp: -1 }).limit(25);
        res.json(txs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});