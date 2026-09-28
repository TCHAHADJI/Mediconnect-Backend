const express = require('express');
const {
  getConversations,
  getConversationMessages,
  sendMessage,
  markConversationAsRead,
} = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/conversations', authMiddleware, getConversations);
router.get('/conversations/:conversationId', authMiddleware, getConversationMessages);
router.patch('/conversations/:conversationId/read', authMiddleware, markConversationAsRead);
router.post('/send', authMiddleware, sendMessage);

module.exports = router;