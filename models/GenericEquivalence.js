const mongoose = require('mongoose');

const EquivalenceStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

const GenericEquivalenceSchema = new mongoose.Schema({
  // Patented / Reference Medicine
  referenceMedicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true,
    index: true,
  },
  referenceMedicineName: {
    type: String,
    required: true,
  },
  // Certified Generic Medicine
  genericMedicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true,
    index: true,
  },
  genericMedicineName: {
    type: String,
    required: true,
  },
  // Active Pharmaceutical Ingredient matching
  activeIngredient: {
    type: String,
    required: true,
    index: true,
  },
  strength: {
    type: String,
    required: true,
  },
  form: {
    type: String,
    required: true,
  },
  // Bioequivalence similarity metrics (e.g. 98.4% Cmax / AUC bioequivalence)
  bioequivalenceRatio: {
    type: Number,
    default: 100, // percentage 80-125% acceptance range according to WHO
  },
  status: {
    type: String,
    enum: Object.values(EquivalenceStatus),
    default: EquivalenceStatus.PENDING,
    index: true,
  },
  // Price comparison for patient savings
  referencePrice: {
    type: Number,
  },
  genericPrice: {
    type: Number,
  },
  estimatedPatientSavingsPercent: {
    type: Number,
  },
  // Regulatory Review Details
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewerName: {
    type: String,
  },
  minsanteCertificationNumber: {
    type: String,
  },
  regulatoryNotes: {
    type: String,
  },
  approvedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

GenericEquivalenceSchema.index({ referenceMedicineId: 1, genericMedicineId: 1 }, { unique: true });

module.exports = mongoose.model('GenericEquivalence', GenericEquivalenceSchema);
module.exports.EquivalenceStatus = EquivalenceStatus;
