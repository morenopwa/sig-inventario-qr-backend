import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dni: { type: String, required: true }, // Copia para búsquedas rápidas
    date: { type: String, required: true }, // Formato "YYYY-MM-DD"
    entryTime: { type: Date },
    exitTime: { type: Date },
    observations: { type: String, default: 'Sin novedad' }
}, { timestamps: true });

// Índice para evitar que un trabajador marque entrada dos veces el mismo día
AttendanceSchema.index({ worker: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', AttendanceSchema);