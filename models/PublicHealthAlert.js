const mongoose = require('mongoose');

const PublicHealthAlertSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  alertType: {
    type: String,
    enum: ['EPIDEMIC_OUTBREAK', 'MEDICINE_RECALL', 'SEASONAL_WARNING', 'PUBLIC_SAFETY'],
    default: 'EPIDEMIC_OUTBREAK',
  },
  severity: {
    type: String,
    enum: ['URGENT', 'HIGH', 'INFO'],
    default: 'HIGH',
  },
  targetRegions: [{
    type: String, // 'Toutes les régions', 'Littoral', 'Centre', etc.
  }],
  channels: [{
    type: String,
    enum: ['MOBILE_PUSH', 'SMS_BROADCAST', 'WEB_BANNER'],
  }],
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  authorityOrganization: {
    type: String,
    default: 'MINSANTÉ - Direction de la Pharmacie et du Médicament',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  recipientsCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('PublicHealthAlert', PublicHealthAlertSchema);
