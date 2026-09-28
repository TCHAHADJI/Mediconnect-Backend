const mongoose = require('mongoose');

const MessageStatus = {
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
};

const MessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: Object.values(MessageStatus),
    default: MessageStatus.SENT,
  },
  attachments: {
    type: Object, // Stored as JSON in Prisma, so Object in Mongoose
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Message', MessageSchema);