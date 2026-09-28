const mongoose = require('mongoose');

const AlertLevel = {
  NORMAL: 'NORMAL',
  ELEVATED: 'ELEVATED',
  OUTBREAK_WARNING: 'OUTBREAK_WARNING'
};

const EpidemiologicalSignalSchema = new mongoose.Schema({
  region: {
    type: String,
    required: true,
    index: true,
  },
  district: {
    type: String,
    required: true,
  },
  diseaseCategory: {
    type: String,
    required: true,
    enum: ['MALARIA', 'CHOLERA', 'MEASLES', 'TYPHOID', 'GASTROENTERITIS', 'RESPIRATORY'],
    index: true,
  },
  symptomKeywords: [{
    type: String,
  }],
  searchVolume: {
    type: Number,
    required: true,
  },
  baselineVolume: {
    type: Number,
    required: true,
  },
  anomalyPercentage: {
    type: Number, // (searchVolume - baselineVolume) / baselineVolume * 100
    required: true,
  },
  alertLevel: {
    type: String,
    enum: Object.values(AlertLevel),
    default: AlertLevel.NORMAL,
    index: true,
  },
  channelSpikes: {
    web: { type: Number, default: 0 },
    mobile: { type: Number, default: 0 },
    ussd: { type: Number, default: 0 }, // USSD 2G search spikes
  },
  correlatedDrugs: [{
    type: String, // e.g. 'Coartem 20/120mg', 'Oral Rehydration Salts (ORS)', 'Amoxicillin'
  }],
  aiConfidence: {
    type: Number,
    default: 94,
  },
  recommendedAction: {
    type: String,
  },
  reportedDate: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('EpidemiologicalSignal', EpidemiologicalSignalSchema);
module.exports.AlertLevel = AlertLevel;
