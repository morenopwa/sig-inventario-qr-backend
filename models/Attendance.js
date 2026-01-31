import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dni: { type: String, required: true }, 
    date: { type: String, required: true }, // Format "YYYY-MM-DD"
    checkIn: { type: Date },
    checkOut: { type: Date },
    manualHours: { type: Number, default: null },
    observations: { type: String, default: 'No issues' }
}, { timestamps: true });

// Avoid duplicate check-ins for the same worker on the same day
AttendanceSchema.index({ worker: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', AttendanceSchema);