const express = require('express');
const router = express.Router();
const { getPublicStats, getAdminStats } = require('../controllers/statsController');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// @route   GET /api/stats/public
// @desc    Get public application statistics (pharmacies, medicines, patients)
// @access  Public
router.get('/public', getPublicStats);

// @route   GET /api/stats/admin
// @desc    Get admin statistics
// @access  Private/Admin
router.get('/admin', authMiddleware, requireAdmin, getAdminStats);

module.exports = router;