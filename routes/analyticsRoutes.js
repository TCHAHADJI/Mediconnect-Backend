const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const {
  getSystemAnalyticsOverview,
  saveAnalyticsSnapshot,
  getSnapshotHistory,
  deleteSnapshot,
  exportAnalyticsReport
} = require('../controllers/systemAnalyticsController');

// All system analytics routes are restricted to authenticated Admins
router.use(authMiddleware);
router.use(requireAdmin);

// @route   GET /api/analytics/overview
// @desc    Get live system analytics + auto-saves daily snapshot if none exists
router.get('/overview', getSystemAnalyticsOverview);

// @route   POST /api/analytics/snapshot
// @desc    Explicitly capture & persist a system analytics snapshot into MongoDB
router.post('/snapshot', saveAnalyticsSnapshot);

// @route   GET /api/analytics/history
// @desc    Get historical saved snapshots from database
router.get('/history', getSnapshotHistory);

// @route   DELETE /api/analytics/history/:id
// @desc    Delete a saved snapshot from the database
router.delete('/history/:id', deleteSnapshot);

// @route   GET /api/analytics/export
// @desc    Export system analytics as CSV
router.get('/export', exportAnalyticsReport);

module.exports = router;
