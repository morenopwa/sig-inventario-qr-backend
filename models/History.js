import mongoose from 'mongoose';

const HistorySchema = new mongoose.Schema({
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['LOAN', 'RETURN'], required: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
    quantity: { type: Number, default: 1 },
    notes: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('History', HistorySchema);