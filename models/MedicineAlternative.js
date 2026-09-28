const mongoose = require('mongoose');

const MedicineAlternativeSchema = new mongoose.Schema({
  mainMedicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true,
  },
  alternativeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true,
  },
  reason: {
    type: String,
  },
}, {
  timestamps: false, // No timestamps in Prisma schema for this model
});

// Compound unique index
MedicineAlternativeSchema.index({ mainMedicineId: 1, alternativeId: 1 }, { unique: true });

module.exports = mongoose.model('MedicineAlternative', MedicineAlternativeSchema);