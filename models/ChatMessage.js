const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  room: {
    type: String,
    default: 'global'
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'voice', 'system'],
    default: 'text'
  },
  metadata: {
    vrPosition: {
      x: Number,
      y: Number,
      z: Number
    },
    attachments: [{
      type: String,
      url: String
    }]
  },
  editedAt: {
    type: Date
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient room-based queries
chatMessageSchema.index({ room: 1, createdAt: -1 });
chatMessageSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);