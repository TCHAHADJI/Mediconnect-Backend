const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { getAuditLogs, exportAuditLogs } = require('../controllers/auditLogController');

// All audit log routes are restricted to authenticated Admins
router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', getAuditLogs);
router.get('/export', exportAuditLogs);

module.exports = router;
