import mongoose from 'mongoose';

const MovementSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    materialName: { type: String, required: true }, // Copiamos el nombre por si el item se borra
    type: { type: String, enum: ['Compra', 'Salida', 'SIMA', 'RECAMBIO', 'COMPRA', 'ENTRADA', 'SALIDA'],
    quantity: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    bottleCode: { type: String }, // El código de las botellas de gas
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    workerName: { type: String }, // Nombre del "Entregado a"
    destination: { type: String }, // El "Destino"
}, { timestamps: true });

export default mongoose.model('Movement', MovementSchema);