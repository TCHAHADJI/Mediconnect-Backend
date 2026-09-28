const mongoose = require('mongoose');

const PillReminderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true,
  },
  medicineName: {
    type: String,
    required: [true, 'Medicine name is required'],
    trim: true,
  },
  dosage: {
    type: String,
    required: [true, 'Dosage is required (e.g., 500mg, 1 tablet)'],
    trim: true,
  },
  form: {
    type: String,
    enum: ['tablet', 'capsule', 'syrup', 'drops', 'injection', 'inhaler', 'other'],
    default: 'tablet',
  },
  frequency: {
    type: String,
    enum: ['ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'FOUR_TIMES_DAILY', 'EVERY_8_HOURS', 'EVERY_12_HOURS', 'AS_NEEDED', 'CUSTOM'],
    default: 'TWICE_DAILY',
  },
  times: {
    type: [String],
    default: ['08:00', '20:00'],
  },
  foodInstructions: {
    type: String,
    enum: ['BEFORE_MEAL', 'AFTER_MEAL', 'WITH_MEAL', 'EMPTY_STOMACH', 'NO_RESTRICTION'],
    default: 'AFTER_MEAL',
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
  },
  ongoing: {
    type: Boolean,
    default: true,
  },
  totalPills: {
    type: Number,
    default: 30,
  },
  remainingPills: {
    type: Number,
    default: 30,
  },
  refillReminder: {
    type: Boolean,
    default: true,
  },
  refillThreshold: {
    type: Number,
    default: 5,
  },
  color: {
    type: String,
    enum: ['blue', 'emerald', 'purple', 'amber', 'rose', 'indigo', 'teal'],
    default: 'blue',
  },
  notes: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  takenHistory: [
    {
      date: { type: String, required: true }, // Format: YYYY-MM-DD
      time: { type: String, required: true }, // Format: HH:mm
      status: { type: String, enum: ['TAKEN', 'SKIPPED'], default: 'TAKEN' },
      takenAt: { type: Date, default: Date.now },
    },
  ],
}, {
  timestamps: true,
});

module.exports = mongoose.model('PillReminder', PillReminderSchema);
