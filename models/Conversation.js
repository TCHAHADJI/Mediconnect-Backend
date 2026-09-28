const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  pharmacyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
  },
  lastMessage: {
    type: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Compound unique index
ConversationSchema.index({ patientId: 1, pharmacyId: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', ConversationSchema);