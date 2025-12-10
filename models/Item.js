// models/Item.js (CÓDIGO AÑADIDO Y MODIFICADO)

import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  qrCode: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: 'Sin descripción' // Lo hice default para simplificar el registro
  },
  status: {
    type: String,
    // ✅ AÑADIDO EL ESTADO 'repair' (Reparación)
    enum: ['new', 'available', 'borrowed', 'repair'], 
    default: 'new'
  },
  // 🔑 NUEVO CAMPO: ¿Quién lo tiene AHORA?
  currentHolder: {
    type: String,
    default: null
  },
  // 🔑 NUEVO CAMPO: Fecha del último préstamo
  loanDate: {
    type: Date,
    default: null
  },
  registeredBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Item', itemSchema);