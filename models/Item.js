import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
    customId: { type: String, unique: true, required: true },
    name: { type: String, required: true, uppercase: true },
    alias: { type: String, default: "" },
    category: { type: String, default: 'General' },
    stock: { type: Number, default: 0 },      // STOCK DISPONIBLE (lo que hay en estante)
    totalStock: { type: Number, default: 0 }, // STOCK TOTAL (patrimonio real de la empresa)
    minStock: { type: Number, default: 5 },
    unit: { type: String, uppercase: true, default: 'UND' },
    
    // Rastreo de quién tiene las herramientas prestadas actualmente
    activeLoans: [{
        workerName: { type: String, uppercase: true },
        quantity: Number,
        date: { type: Date, default: Date.now }
    }],

    history: [{
        action: { type: String, enum: ['IN', 'OUT'] },
        quantity: Number,
        user: String, 
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

export default mongoose.model('Item', ItemSchema);