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