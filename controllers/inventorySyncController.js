const Inventory = require('../models/Inventory');
const Medicine = require('../models/Medicine');
const User = require('../models/User');
const crypto = require('crypto');

// Smart Bulk Import from CSV / Excel rows
// Expects an array of items: [{ name, quantity, price, batchNumber, expiryDate, lowStockThreshold, costPrice }]
const bulkImportInventory = async (req, res) => {
  try {
    const pharmacyId = req.user.id;
    const { items, autoCreateMissing = false } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A non-empty array of inventory items is required'
      });
    }

    const report = {
      totalReceived: items.length,
      successfullyImported: 0,
      updatedExisting: 0,
      unmatchedItems: [],
      errors: []
    };

    // Cache existing master catalogue medicines for fast in-memory lookup
    const allMasterMedicines = await Medicine.find({ isActive: true })
      .select('_id name genericName brand barcode atcCode strength form')
      .lean();

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const rawName = (row.name || row.medicineName || '').trim();

      if (!rawName) {
        report.errors.push({ row: i + 1, message: 'Missing medicine name' });
        continue;
      }

      // Smart matching strategy:
      // 1. Exact or normalized name match
      // 2. Barcode match
      // 3. Brand / Generic name match
      const normalizedQuery = rawName.toLowerCase();
      let matchedMedicine = allMasterMedicines.find(m => 
        (row.barcode && m.barcode === row.barcode) ||
        m.name.toLowerCase() === normalizedQuery ||
        (m.genericName && m.genericName.toLowerCase() === normalizedQuery) ||
        (m.brand && m.brand.toLowerCase() === normalizedQuery)
      );

      // Partial fuzzy search if exact match not found
      if (!matchedMedicine) {
        matchedMedicine = allMasterMedicines.find(m => 
          m.name.toLowerCase().includes(normalizedQuery) ||
          normalizedQuery.includes(m.name.toLowerCase())
        );
      }

      if (!matchedMedicine) {
        report.unmatchedItems.push({
          row: i + 1,
          name: rawName,
          suggestedAction: 'Please select from Master Catalogue or request Admin creation'
        });
        continue;
      }

      // Safe parse fields with defaults
      const quantity = Math.max(0, parseInt(row.quantity ?? row.stock ?? 0, 10));
      const price = Math.max(0, parseFloat(row.price ?? 0));
      const costPrice = row.costPrice ? parseFloat(row.costPrice) : undefined;
      const batchNumber = (row.batchNumber || row.lot || `LOT-${Date.now().toString().slice(-4)}`).toString().trim();
      
      let parsedExpiry = new Date();
      if (row.expiryDate) {
        const d = new Date(row.expiryDate);
        if (!isNaN(d.getTime())) parsedExpiry = d;
        else parsedExpiry.setFullYear(parsedExpiry.getFullYear() + 1);
      } else {
        parsedExpiry.setFullYear(parsedExpiry.getFullYear() + 1); // Default 1 year expiry
      }

      const lowStockThreshold = parseInt(row.lowStockThreshold || row.minStock || 10, 10);

      // Determine inventory status
      let status = 'IN_STOCK';
      if (quantity === 0) status = 'OUT_OF_STOCK';
      else if (quantity <= lowStockThreshold) status = 'LOW_STOCK';

      // Upsert into inventory for this pharmacy
      const existing = await Inventory.findOne({
        pharmacyId,
        medicineId: matchedMedicine._id
      });

      if (existing) {
        existing.quantity = quantity;
        existing.price = price > 0 ? price : existing.price;
        if (costPrice) existing.costPrice = costPrice;
        existing.batchNumber = batchNumber;
        existing.expiryDate = parsedExpiry;
        existing.status = status;
        existing.lowStockThreshold = lowStockThreshold;
        existing.lastRestockedAt = new Date();
        await existing.save();
        report.updatedExisting++;
      } else {
        await Inventory.create({
          pharmacyId,
          medicineId: matchedMedicine._id,
          quantity,
          price,
          costPrice,
          batchNumber,
          expiryDate: parsedExpiry,
          status,
          lowStockThreshold,
          supplier: row.supplier || 'Import Manuel',
          locationInStore: row.locationInStore || row.location || undefined
        });
        report.successfullyImported++;
      }
    }

    res.json({
      success: true,
      message: `Import processed: ${report.successfullyImported} added, ${report.updatedExisting} updated, ${report.unmatchedItems.length} unmatched.`,
      report
    });

  } catch (error) {
    console.error('Bulk import inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk inventory import',
      error: error.message
    });
  }
};

// Generate / Retrieve POS integration API key for this pharmacy
const getOrCreatePosApiKey = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Pharmacy user not found' });
    }

    // Check if user has an existing API key stored or generate one
    let apiKey = user.posApiKey;
    if (!apiKey) {
      apiKey = `mc_live_${crypto.randomBytes(24).toString('hex')}`;
      user.posApiKey = apiKey;
      await user.save();
    }

    res.json({
      success: true,
      data: {
        pharmacyId: user._id,
        pharmacyName: user.name || user.pharmacyName,
        apiKey,
        syncEndpoint: `${req.protocol}://${req.get('host')}/api/inventory/pos-sync`,
        documentation: 'Include x-pharmacy-api-key header in your POS system requests.'
      }
    });
  } catch (error) {
    console.error('Error generating POS API key:', error);
    res.status(500).json({ success: false, message: 'Could not generate API key', error: error.message });
  }
};

// External POS / ERP real-time sync endpoint (Authenticated via x-pharmacy-api-key)
const posSync = async (req, res) => {
  try {
    const apiKey = req.headers['x-pharmacy-api-key'];
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'Missing x-pharmacy-api-key header'
      });
    }

    const pharmacy = await User.findOne({ posApiKey: apiKey });
    if (!pharmacy) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or revoked POS API key'
      });
    }

    const { updates } = req.body;
    // updates: Array of { barcode or medicineName, quantityChange or absoluteQuantity, price }
    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: 'Invalid payload: updates array expected' });
    }

    let syncedCount = 0;
    for (const update of updates) {
      const matchCriteria = [];
      if (update.barcode) matchCriteria.push({ barcode: update.barcode });
      if (update.medicineName) matchCriteria.push({ name: new RegExp(`^${update.medicineName}$`, 'i') });

      if (matchCriteria.length === 0) continue;

      const medicine = await Medicine.findOne({ $or: matchCriteria, isActive: true });
      if (!medicine) continue;

      const inv = await Inventory.findOne({ pharmacyId: pharmacy._id, medicineId: medicine._id });
      if (inv) {
        if (update.absoluteQuantity !== undefined) {
          inv.quantity = Math.max(0, parseInt(update.absoluteQuantity, 10));
        } else if (update.quantityChange !== undefined) {
          inv.quantity = Math.max(0, inv.quantity + parseInt(update.quantityChange, 10));
        }
        if (update.price !== undefined) inv.price = parseFloat(update.price);
        
        // Auto status
        if (inv.quantity === 0) inv.status = 'OUT_OF_STOCK';
        else if (inv.quantity <= inv.lowStockThreshold) inv.status = 'LOW_STOCK';
        else inv.status = 'IN_STOCK';

        await inv.save();
        syncedCount++;
      }
    }

    res.json({
      success: true,
      message: `Successfully synchronized ${syncedCount} inventory records for ${pharmacy.name || 'Pharmacy'}.`,
      syncedCount
    });
  } catch (error) {
    console.error('POS sync error:', error);
    res.status(500).json({ success: false, message: 'POS synchronization failed', error: error.message });
  }
};

module.exports = {
  bulkImportInventory,
  getOrCreatePosApiKey,
  posSync
};
