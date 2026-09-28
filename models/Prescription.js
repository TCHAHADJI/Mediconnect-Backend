const mongoose = require('mongoose');

const PrescriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true,
  },
  prescriptionNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['PAPER_UPLOAD', 'DIGITAL_PRESCRIPTION'],
    default: 'PAPER_UPLOAD',
  },
  title: {
    type: String,
    trim: true,
    default: 'Ordonnance Médicale',
  },
  prescriberName: {
    type: String,
    required: [true, 'Doctor / Prescriber name is required'],
    trim: true,
  },
  prescriberHospital: {
    type: String,
    trim: true,
    default: 'Hôpital Central de Yaoundé (HCY)',
  },
  prescriberPhone: {
    type: String,
    trim: true,
  },
  prescriberLicenseNumber: {
    type: String, // ONMC registration
    trim: true,
  },
  issueDate: {
    type: Date,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'DISPENSED', 'PARTIALLY_DISPENSED', 'EXPIRED'],
    default: 'ACTIVE',
  },
  paperImageUrl: {
    type: String, // Base64 compressed image data URI
  },
  medicines: [
    {
      name: { type: String, required: true },
      dosage: { type: String, default: '1 unité' },
      frequency: { type: String, default: 'Matin et Soir' },
      duration: { type: String, default: '7 jours' },
      quantity: { type: Number, default: 1 },
      instructions: { type: String, default: 'Respecter les heures prescrites' },
      dispensed: { type: Boolean, default: false },
    }
  ],
  notes: {
    type: String,
    trim: true,
  },
  pharmacyFulfillment: {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    pharmacyName: { type: String },
    dispensedAt: { type: Date },
    pharmacistNotes: { type: String },
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Prescription', PrescriptionSchema);
