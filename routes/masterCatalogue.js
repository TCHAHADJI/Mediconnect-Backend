const express = require('express');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const {
  getMasterMedicines,
  searchMasterMedicines,
  getMasterMedicineById,
  createMasterMedicine,
  updateMasterMedicine,
  deleteMasterMedicine,
  seedEssentialMedicines
} = require('../controllers/masterCatalogueController');

const router = express.Router();

// Public / Authenticated search & listing
router.get('/', getMasterMedicines);
router.get('/search', searchMasterMedicines);
router.get('/seed', seedEssentialMedicines);
router.get('/:id', getMasterMedicineById);

// Admin & Health Authority CRUD operations
router.post('/', authMiddleware, createMasterMedicine);
router.put('/:id', authMiddleware, updateMasterMedicine);
router.delete('/:id', authMiddleware, deleteMasterMedicine);

module.exports = router;
