import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true // Borra espacios vacíos al inicio y final
    },
    lastName: { 
        type: String, 
        required: true,
        trim: true
    },
    dni: { 
        type: Number, 
        required: true,
        trim: true
    },
    phone: { 
        type: Number, 
        required: true,
        trim: true,
        minlength: [9, 'El phone debe tener al menos 9 dígitos']
    },
    password: { 
        type: String, 
        required: true,
        minlength: [8, 'El DNI debe tener al menos 8 dígitos']
    }, 
    role: { 
        type: String, 
        enum: ['SuperAdmin','Admin','Prevencionista','Calderero','Almacenero', 'Maestro calderero','Maniobrista','Residente'],
        default: 'Trabajador' 
    },
    sueldoBase: { 
        type: Number, 
        default: 0 
    },
    tarifaDiaria: {
        type: Number,
        default: 50 // Por si usas este campo para el cálculo de pagos
    }
}, { 
    timestamps: true // Crea automáticamente campos "createdAt" y "updatedAt"
});

// Exportamos el modelo
const User = mongoose.model('User', UserSchema);
export default User;