import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
    customId: { type: String, unique: true, required: true }, // Se usará para el QR de la herramienta
    name: { type: String, required: true, uppercase: true },
    alias: { type: String, default: "" },
    category: { type: String, default: 'General' },
    stock: { type: Number, default: 0 },
    minStock: { type: Number, default: 5 },
    unit: { type: String, uppercase: true, default: 'UND' },
    // El historial interno para cambios rápidos de stock
    history: [{
        action: { type: String, enum: ['IN', 'OUT'] },
        quantity: Number,
        user: String, 
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

export default mongoose.model('Item', ItemSchema);