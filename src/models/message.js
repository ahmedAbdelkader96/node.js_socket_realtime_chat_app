const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  content: { type: String, required: true },
  sender: { type: String, required: true },
  createdAt: { type: Date, default: new Date() },
  status: { type: String, enum: ['sent','pending'], default: 'sent' },
  seen: { type: Boolean, default: false },
  tempId :{ type: String, default: '' , required: false },
  filePath :{ type: String, default: '' , required: false },
  senderFilePath :{ type: String, default: '' , required: false },
  base64 :{ type: String, default: '' , required: false },
  type: {
    type: String,
    // enum: ['text', 'file', 'image', 'video', 'audio'],
    required: true
  }, 
});

module.exports = mongoose.model('Message', messageSchema);