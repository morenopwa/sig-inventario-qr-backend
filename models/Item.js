import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
    customId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true, uppercase: true },
    category: { type: String, default: 'General' },
    stock: { type: Number, default: 0 },
    minStock: { type: Number, default: 5 },
    unit: { type: String, enum: ['Kg', 'Pz', 'Lt', 'm', 'Unit'], default: 'Unit' },
    history: [{
        action: String,
        quantity: Number,
        user: String, 
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

export default mongoose.model('Item', ItemSchema);