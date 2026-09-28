const mongoose = require('mongoose');

const HealthTipSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
  },
  content: {
    type: String,
    required: [true, 'Please add content'],
  },
  category: {
    type: String,
    required: [true, 'Please add a category'],
  },
  author: {
    type: String,
    default: 'Direction de la Promotion de la Santé - MINSANTÉ',
  },
  isPublished: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'],
    default: 'PENDING_APPROVAL',
  },
  submitterRole: {
    type: String,
    default: 'ADMIN', // 'HEALTH_AUTHORITY', 'PHARMACY', 'PRACTITIONER', 'ADMIN'
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewerNotes: {
    type: String,
    default: '',
  },
  targetAudience: {
    type: String,
    default: 'Tous publics',
  },
  priority: {
    type: String,
    enum: ['STANDARD', 'URGENT', 'SEASONAL', 'HIGH', 'MEDIUM', 'LOW'],
    default: 'STANDARD',
  },
  summary: {
    type: String,
    trim: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  targetConditions: {
    type: [String], // e.g. ['Asthme bronchique', 'Diabète de Type 2', 'Hypertension Artérielle (HTA)']
    default: [],
  },
  targetGenotypes: {
    type: [String], // e.g. ['AA', 'AS', 'SS']
    default: [],
  },
  targetAllergies: {
    type: [String], // e.g. ['Pénicilline', 'Aspirine']
    default: [],
  },
  readTime: {
    type: String,
    default: '2 min',
  },
  viewedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
}, {
  timestamps: true,
});

module.exports = mongoose.model('HealthTip', HealthTipSchema);