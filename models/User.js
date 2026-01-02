import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true
    },
    lastName: { 
        type: String, 
        required: true,
        trim: true
    },
    dni: { 
        type: String, unique: true,
        required: true,
        trim: true
    },
    mail: { 
        type: String, unique: true,
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
    
    tipo: { 
        type: String, 
        enum: ['Trabajador', 'Externo', 'Visita'], 
        default: 'Externo'
    },
    
    cargo: { type: String }, // Almacenero, Calderero
        sueldoBase: { type: Number, default: 0 },
        fechaIngreso: { type: Date },

    nivelAcceso: { 
        type: String, 
        enum: ['SuperAdmin', 'Admin', 'Usuario'], 
        default: 'Usuario' 
    }
}, { 
    timestamps: true // Crea automáticamente campos "createdAt" y "updatedAt"
});

// Exportamos el modelo
const User = mongoose.model('User', UserSchema);
export default User;