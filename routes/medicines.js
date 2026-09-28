const express = require('express');
const { authMiddleware, requirePharmacy } = require('../middleware/auth');
const { validate, medicineSchema, updateMedicineSchema } = require('../middleware/validation');
const {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  getCategories,
  searchAlternatives,
  deleteMedicine
} = require('../controllers/medicineController');
const { verifyPackagingCode } = require('../controllers/packagingVerificationController');

const router = express.Router();
 
// Packaging Code & Anti-Counterfeiting Verification
router.post('/verify-packaging', verifyPackagingCode);

// Public routes
router.get('/', getMedicines);
router.get('/categories', getCategories);
router.get('/:id', getMedicineById);
router.get('/:medicineId/alternatives', searchAlternatives);

// Protected routes (Admin only)
router.post('/create', authMiddleware, requirePharmacy, validate(medicineSchema), createMedicine);
router.patch('/:id', authMiddleware, requirePharmacy, validate(updateMedicineSchema), updateMedicine);
router.delete('/:id', authMiddleware, requirePharmacy, deleteMedicine);

module.exports = router;