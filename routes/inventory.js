const express = require('express');
const { requirePharmacy, requireVerifiedPharmacy } = require('../middleware/auth');
const { validate, inventorySchema, updateInventorySchema } = require('../middleware/validation');
const {
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryStats
} = require('../controllers/inventoryController');

const router = express.Router();

// All routes require pharmacy authentication
router.use(requirePharmacy);

// Inventory management routes
router.get('/', getInventory);
router.get('/stats', getInventoryStats);
router.post('/', requireVerifiedPharmacy, validate(inventorySchema), addInventoryItem);
router.put('/:id', requireVerifiedPharmacy, validate(updateInventorySchema), updateInventoryItem);
router.delete('/:id', requireVerifiedPharmacy, deleteInventoryItem);

module.exports = router;