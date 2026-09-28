const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  // The user who will receive the notification. Can be omitted for system-wide notifications.
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  type: {
    type: String,
    enum: [
      'stock',
      'price',
      'new_pharmacy',
      'order',
      'system',
      'health_tip',
      'medication_due',
      'pill_reminder',
      'PILL_REMINDER_CREATED',
      'MEDICATION_DUE',
      'REFILL_ALERT',
      'campaign',
      'CAMPAIGN_LAUNCHED',
      'CAMPAIGN_CONCLUDED',
      'public_health_alert',
    ],
    default: 'system',
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  // ID of the related entity (e.g., the new pharmacy's ID)
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Notification', NotificationSchema);