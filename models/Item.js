import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
    customId: { type: String, unique: true, required: true },
    name: { type: String, required: true, uppercase: true },
    alias: { type: String, default: "" },
    category: { type: String, default: 'General' },
    stock: { type: Number, default: 0 },      // Lo que hay en el estante
    totalStock: { type: Number, default: 0 }, // Patrimonio (No baja en préstamos)
    minStock: { type: Number, default: 5 },
    unit: { type: String, uppercase: true, default: 'UND' },
    
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