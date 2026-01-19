import mongoose from 'mongoose';

const MovementSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    materialName: { type: String, required: true }, // Copiamos el nombre por si el item se borra
    type: { type: String, enum: ['Compra', 'Salida', 'SIMA', 'RECAMBIO', 'COMPRA', 'ENTRADA', 'SALIDA'], required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: 'und' },
    unitCost: { type: Number, default: 0 },
    bottleCode: { type: String }, // El código de las botellas de gas
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    workerName: { type: String, default: 'GENERAL' },
    destination: { type: String, default: 'ALMACEN' }
}, { timestamps: true });

export default mongoose.model('Movement', MovementSchema);