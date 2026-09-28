const mongoose = require('mongoose');

const RecallSeverity = {
  CRITICAL: 'CRITICAL', // Immediate threat to life / counterfeit / contamination
  HIGH: 'HIGH', // Serious defect / wrong dosage
  MEDIUM: 'MEDIUM' // Minor packaging or labelling defect
};

const RecallStatus = {
  ACTIVE: 'ACTIVE',
  RESOLVED: 'RESOLVED'
};

const BatchRecallSchema = new mongoose.Schema({
  batchNumber: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
  },
  medicineName: {
    type: String,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  hazardDescription: {
    type: String,
  },
  severity: {
    type: String,
    enum: Object.values(RecallSeverity),
    default: RecallSeverity.CRITICAL,
    index: true,
  },
  recallStatus: {
    type: String,
    enum: Object.values(RecallStatus),
    default: RecallStatus.ACTIVE,
    index: true,
  },
  // Audit trail of affected pharmacies where inventory was frozen
  affectedPharmacies: [{
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    pharmacyName: String,
    unitsQuarantined: Number,
    notifiedAt: {
      type: Date,
      default: Date.now,
    }
  }],
  totalUnitsQuarantined: {
    type: Number,
    default: 0,
  },
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  inspectorName: {
    type: String,
    default: 'Direction de la Pharmacie et du Médicament (MINSANTÉ)',
  },
  nationalAlertReference: {
    type: String,
  },
  broadcastToPublic: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('BatchRecall', BatchRecallSchema);
module.exports.RecallSeverity = RecallSeverity;
module.exports.RecallStatus = RecallStatus;
