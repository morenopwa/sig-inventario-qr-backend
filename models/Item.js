import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  qrCode: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['new', 'available', 'borrowed'],
    default: 'new'
  },
  registeredBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Item', itemSchema);