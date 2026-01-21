import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    quantity: { type: Number, required: true },
    // 🛠️ AÑADIDO: Guardamos la unidad (KG, UND, GLN) para que el chat la muestre
    unit: { type: String, uppercase: true, default: 'UND' }, 
    itemName: { type: String, uppercase: true, required: true },
    personName: { type: String, required: true, uppercase: true }, 
    type: { type: String, enum: ['IN', 'OUT'], required: true }, 
    // 🛠️ AÑADIDO: Para diferenciar si fue una COMPRA, SIMA, etc. en el diseño del chat
    operationType: { type: String, uppercase: true }, 
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Transaction', TransactionSchema);