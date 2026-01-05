import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    quantity: { type: Number, required: true },
    itemName: { type: String, uppercase: true, required: true },
    personName: { type: String, required: true }, 
    type: { type: String, enum: ['IN', 'OUT'], required: true }, 
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Transaction', TransactionSchema);