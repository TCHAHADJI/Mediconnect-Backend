const express = require('express');
const { requirePharmacy } = require('../middleware/auth');
const {
  bulkImportInventory,
  getOrCreatePosApiKey,
  posSync
} = require('../controllers/inventorySyncController');

const router = express.Router();

// Direct POS / ERP external synchronization (Authenticated via header: x-pharmacy-api-key)
router.post('/pos-sync', posSync);

// Pharmacy session protected endpoints
router.post('/import-bulk', requirePharmacy, bulkImportInventory);
router.get('/api-key', requirePharmacy, getOrCreatePosApiKey);

module.exports = router;
