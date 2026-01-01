import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
    cantidad: { type: Number, required: true },
    itemName: { type: String, uppercase: true, required: true },
    persona: { type: String, required: true },
    tipo: { type: String, required: true }, 
    timestamp: { type: Date, default: Date.now }
});

// Exportamos el modelo para que otros archivos lo importen
const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;