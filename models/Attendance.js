import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dni: { type: String, required: true }, 
    date: { type: String, required: true }, // Formato "YYYY-MM-DD"
    checkIn: { type: Date },
    checkOut: { type: Date },
    // --- AGREGA ESTA LÍNEA ---
    manualHours: { type: Number, default: null }, 
    // -------------------------
    observations: { type: String, default: 'No issues' }
}, { timestamps: true });

AttendanceSchema.index({ worker: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', AttendanceSchema);