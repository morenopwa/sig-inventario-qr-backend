import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    customId: { type: String, unique: true, required: true }, // Se usará para el QR del personal
    name: { type: String, required: true, trim: true, uppercase: true },
    lastName: { type: String, required: true, trim: true, uppercase: true },
    dni: { type: String, unique: true, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, trim: true },
    password: { type: String, required: true }, 
    role: { type: String }, 
    type: { type: String, enum: ['Trabajador', 'Externo', 'Visitante'], default: 'Trabajador' },
    workStartDate: { type: Date, default: Date.now },
    accessLevel: { type: String, enum: ['SuperAdmin', 'Admin', 'Usuario'], default: 'Usuario' },
    hourlyRate: { type: Number, default: 0 },
    additionalDaily: { type: Number, default: 0 }, // Monto fijo para Almuerzo/Cena/Pasajes
    isActive: { type: Boolean, default: true },
    weeklyBonus: { type: Number, default: 0 }, // El bono semanal,
    birthday: { type: String },
}, { timestamps: true });

export default mongoose.model('User', UserSchema);