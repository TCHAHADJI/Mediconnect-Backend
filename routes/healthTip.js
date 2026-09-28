const express = require('express');
const router = express.Router();
const {
  getHealthTips,
  getHealthTipCategories,
  getRecommendedHealthTips,
  createHealthTip,
  updateHealthTip,
  deleteHealthTip,
  incrementViewCount,
} = require('../controllers/healthTipController');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// @route   GET /api/health-tips/categories
// @desc    Get all available health tip categories (standard + custom in DB)
router.get('/categories', authMiddleware, getHealthTipCategories);

// @route   GET /api/health-tips/recommended
// @desc    Get personalized health tips tailored to patient's clinical profile from DB
router.get('/recommended', authMiddleware, getRecommendedHealthTips);

// @route   GET /api/health-tips
// @desc    Get all published health tips (for patients) or all tips (for admins)
router.get('/', authMiddleware, getHealthTips);

// @route   PATCH /api/health-tips/:id/view
// @desc    Increment the view count of a health tip
router.patch('/:id/view', authMiddleware, incrementViewCount);

// Admin-only routes
router.post('/', authMiddleware, requireAdmin, createHealthTip);
router.patch('/:id', authMiddleware, requireAdmin, updateHealthTip);
router.delete('/:id', authMiddleware, requireAdmin, deleteHealthTip);

module.exports = router;