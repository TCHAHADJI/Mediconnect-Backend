const express = require('express');
const router = express.Router();
const reminderController = require('../controllers/reminderController');
const { authMiddleware } = require('../middleware/auth');

// All reminder routes require patient authentication
router.use(authMiddleware);

router.get('/', reminderController.getReminders);
router.post('/', reminderController.createReminder);
router.put('/:id', reminderController.updateReminder);
router.delete('/:id', reminderController.deleteReminder);
router.post('/:id/take', reminderController.logDose);
router.post('/:id/notify-due', reminderController.notifyDoseDue);
router.post('/:id/skip', (req, res, next) => {
  req.body.status = 'SKIPPED';
  reminderController.logDose(req, res, next);
});

module.exports = router;
