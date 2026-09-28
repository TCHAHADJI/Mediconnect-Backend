const mongoose = require('mongoose');

const InventoryStatus = {
  IN_STOCK: 'IN_STOCK',
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  EXPIRED: 'EXPIRED',
  DISCONTINUED: 'DISCONTINUED',
  FROZEN: 'FROZEN', // For pharmacovigilance / batch recall quarantine
};

const InventorySchema = new mongoose.Schema({
  pharmacyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the Pharmacy User
    required: true,
    index: true,
  },
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine', // Reference to the Central Master Medicine model
    required: true,
    index: true,
  },
  quantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  price: {
    type: Number,
    required: true,
    min: 0, // Retail price in FCFA
  },
  costPrice: {
    type: Number,
    min: 0, // Purchase / Wholesale cost
  },
  expiryDate: {
    type: Date,
    required: true,
    index: true,
  },
  batchNumber: {
    type: String,
    required: true,
    trim: true,
    index: true, // Crucial for pharmacovigilance batch recalls
  },
  status: {
    type: String,
    enum: Object.values(InventoryStatus),
    default: InventoryStatus.IN_STOCK,
  },
  lowStockThreshold: {
    type: Number,
    default: 10,
    min: 1,
  },
  // Location inside pharmacy physical store (e.g., "Rayon B-04", "Frigo A")
  locationInStore: {
    type: String,
    trim: true,
  },
  supplier: {
    type: String,
    trim: true,
  },
  // Pharmacovigilance safety quarantine
  isFrozen: {
    type: Boolean,
    default: false,
    index: true,
  },
  freezeReason: {
    type: String,
  },
  lastRestockedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound unique index for pharmacyId and medicineId (One inventory entry per master medicine per pharmacy)
InventorySchema.index({ pharmacyId: 1, medicineId: 1 }, { unique: true });

// Index for batch lookup across all pharmacies during recall
InventorySchema.index({ batchNumber: 1, isFrozen: 1 });

module.exports = mongoose.model('Inventory', InventorySchema);
module.exports.InventoryStatus = InventoryStatus;