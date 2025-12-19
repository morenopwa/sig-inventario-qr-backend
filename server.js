// --- RUTAS PARA EL FRONTEND ---

// 1. Registrar transacciones (La que te da el error 404)
app.post('/api/transactions', async (req, res) => {
  try {
    const { cantidad, itemName, persona, tipo, timestamp } = req.body;
    
    // Guardar el registro del movimiento
    const transaction = new Transaction({
      cantidad,
      itemName: itemName.toUpperCase(),
      persona,
      tipo,
      timestamp
    });
    await transaction.save();

    // ACTUALIZACIÓN DE INVENTARIO AUTOMÁTICA
    // Si es ingreso suma, si es salida resta
    const valorCambio = tipo === 'ingreso' ? cantidad : -cantidad;
    
    await Inventory.findOneAndUpdate(
      { name: itemName.toUpperCase() },
      { $inc: { stock: valorCambio } },
      { upsert: true } // Si el producto no existe, lo crea
    );

    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ message: "Error al guardar", error });
  }
});

// 2. Obtener el inventario (Para el cuadro de saldos)
app.get('/api/inventory', async (req, res) => {
  try {
    const items = await Inventory.find();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Datos para los botones de atajo
app.get('/api/frequent-data', async (req, res) => {
  try {
    const items = await Inventory.find().select('name');
    const people = await Transaction.distinct('persona');
    res.json({ items, people });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});