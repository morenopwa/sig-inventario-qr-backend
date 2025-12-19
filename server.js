const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

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
app.post('/api/transactions', async (req, res) => {
  try {
    const { cantidad, itemName, tipo, persona, timestamp } = req.body;
    
    // Guardar el log del movimiento
    const newLog = new Transaction({ cantidad, itemName, persona, tipo, timestamp });
    await newLog.save();

    // Actualizar o Crear el item en el inventario
    const factor = tipo === 'ingreso' ? cantidad : -cantidad;
    await Inventory.findOneAndUpdate(
      { name: itemName.toUpperCase() },
      { $inc: { stock: factor } },
      { upsert: true, new: true }
    );

    res.status(201).json(newLog);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Ruta para los botones de atajo (Items y Personas frecuentes)
app.get('/api/frequent-data', async (req, res) => {
  try {
    const items = await Inventory.find().select('name');
    const transactions = await Transaction.find().distinct('persona');
    
    res.json({
      items: items.map(i => ({ _id: i._id, name: i.name })),
      people: transactions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));