const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  content: { type: String, required: true },
  sender: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['sent','pending'], default: 'sent' },
  seen: { type: Boolean, default: false },
  tempId :{ type: String, default: '' , required: false },
  type: {
    type: String,
    enum: ['text', 'file', 'image', 'video', 'sound'],
    required: true
  }, 
});

module.exports = mongoose.model('Message', messageSchema);