import mongoose from 'mongoose';

const historySchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  action: {
    type: String,
    enum: ['borrow', 'return', 'register'],
    required: true
  },
  person: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  }
});

export default mongoose.model('History', historySchema);    