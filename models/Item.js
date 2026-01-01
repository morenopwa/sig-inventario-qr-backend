import mongoose from 'mongoose';

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

// Exportamos el modelo
const Item = mongoose.model('Item', ItemSchema);
export default Item;