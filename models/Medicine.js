const mongoose = require('mongoose');

const DispensingCategory = {
  OTC: 'OTC', // Over-The-Counter
  PRESCRIPTION_ONLY: 'PRESCRIPTION_ONLY', // Prescription Required (Rx)
  CONTROLLED_SUBSTANCE: 'CONTROLLED_SUBSTANCE', // Regulated, narcotics, psychotropics
};

const MedicineSchema = new mongoose.Schema({
  // International Standard: Brand / Commercial Name
  name: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  // International Standard: INN / DCI (Dénomination Commune Internationale)
  genericName: {
    type: String,
    trim: true,
    index: true,
  },
  // Brand name (laboratory trademark)
  brand: {
    type: String,
    trim: true,
  },
  // Manufacturer / Laboratory
  manufacturer: {
    type: String,
    trim: true,
  },
  // International Standard: WHO-ATC Code (Anatomical Therapeutic Chemical)
  atcCode: {
    type: String,
    trim: true,
    uppercase: true,
    index: true,
  },
  // Active Pharmaceutical Ingredient(s)
  activeIngredient: {
    type: String,
    trim: true,
  },
  // Strength / Concentration (e.g., 500mg, 100mg/5ml, 2%)
  strength: {
    type: String,
    trim: true,
  },
  dosage: {
    type: String,
    trim: true,
  },
  // Galenic Form (e.g., Tablet, Capsule, Syrup, Injectable, Suspension, Ointment, Suppository)
  form: {
    type: String,
    trim: true,
  },
  // Route of administration (Oral, Intravenous, Intramuscular, Topical, Ophthalmic, Rectal)
  administrationRoute: {
    type: String,
    default: 'Oral',
  },
  // Therapeutic Category
  category: {
    type: String,
    trim: true,
    index: true,
  },
  // Dispensing Legal Classification
  dispensingCategory: {
    type: String,
    enum: Object.values(DispensingCategory),
    default: DispensingCategory.OTC,
  },
  requiresPrescription: {
    type: Boolean,
    default: false,
  },
  isControlledSubstance: {
    type: Boolean,
    default: false,
  },
  // Standardized Barcode / GTIN / CIP Code
  barcode: {
    type: String,
    trim: true,
    sparse: true,
    index: true,
  },
  cipCode: {
    type: String, // Code Identifiant de Présentation
    trim: true,
  },
  // Regulatory & Bioequivalence Grouping
  bioequivalentGroup: {
    type: String, // Grouping key for identical API + Strength + Form (for generic substitution)
    index: true,
  },
  minsanteApproved: {
    type: Boolean,
    default: true,
  },
  minsanteApprovalNumber: {
    type: String,
  },
  // Clinical Information
  description: {
    type: String,
  },
  indications: {
    type: String,
  },
  sideEffects: {
    type: String,
  },
  contraindications: {
    type: String,
  },
  instructions: {
    type: String,
  },
  image: {
    type: String,
  },
  // Reference price ceiling set by MINSANTÉ (optional in FCFA)
  referencePriceCeiling: {
    type: Number,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Text index for high-performance multi-field search
MedicineSchema.index({
  name: 'text',
  genericName: 'text',
  brand: 'text',
  activeIngredient: 'text',
  atcCode: 'text',
  category: 'text',
});

module.exports = mongoose.model('Medicine', MedicineSchema);
module.exports.DispensingCategory = DispensingCategory;