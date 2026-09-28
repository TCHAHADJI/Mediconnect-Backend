const mongoose = require('mongoose');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// 1. Get all conversations for current user
const getConversations = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const currentUserId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const currentUserType = req.user.userType;

    // Find all conversations where user is patient or pharmacy
    let conversations = await Conversation.find({
      $or: [{ patientId: currentUserId }, { pharmacyId: currentUserId }],
      isActive: true,
    })
      .populate('patientId', 'name email phone userType')
      .populate('pharmacyId', 'name businessName businessAddress email phone userType')
      .sort({ updatedAt: -1 });

    // If patient has zero conversations, initialize a welcome conversation with an active pharmacy
    if (conversations.length === 0 && currentUserType === 'PATIENT') {
      const activePharmacy = await User.findOne({
        userType: 'PHARMACY',
        status: 'ACTIVE',
      });

      if (activePharmacy) {
        try {
          const welcomeConv = await Conversation.create({
            patientId: currentUserId,
            pharmacyId: activePharmacy._id,
            lastMessage: `Hello! Welcome to the messaging service of ${activePharmacy.businessName || activePharmacy.name}. How can we assist you today?`,
            isActive: true,
          });

          await Message.create({
            conversationId: welcomeConv._id,
            senderId: activePharmacy._id,
            receiverId: currentUserId,
            content: `Hello ${req.user.name || 'there'}! Welcome to MediConnect direct messaging. Feel free to ask any questions about medicine availability, dosages, or prescriptions.`,
            status: 'SENT',
          });

          conversations = await Conversation.find({
            _id: welcomeConv._id,
          })
            .populate('patientId', 'name email phone userType')
            .populate('pharmacyId', 'name businessName businessAddress email phone userType');
        } catch (initErr) {
          console.warn('Welcome conversation creation error (non-fatal):', initErr.message);
        }
      }
    }

    // Format conversations with participant details and unread count
    const formatted = await Promise.all(
      conversations.map(async (conv) => {
        const isPatient = conv.patientId && conv.patientId._id.toString() === currentUserId.toString();
        const otherParticipant = isPatient ? conv.pharmacyId : conv.patientId;

        const unreadCount = await Message.countDocuments({
          conversationId: conv._id,
          receiverId: currentUserId,
          status: { $ne: 'READ' },
        });

        const participantName = otherParticipant
          ? (otherParticipant.businessName || otherParticipant.name || 'MediConnect Partner')
          : 'Unknown Contact';

        const participantLocation = otherParticipant?.businessAddress || otherParticipant?.address || '';

        return {
          id: conv._id.toString(),
          participantId: otherParticipant ? otherParticipant._id.toString() : '',
          participantName,
          participantType: otherParticipant?.userType === 'PHARMACY' ? 'pharmacy' : 'patient',
          participantLocation,
          lastMessage: conv.lastMessage || 'New conversation',
          lastMessageTime: new Date(conv.updatedAt || conv.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          unreadCount,
          status: conv.isActive ? 'active' : 'closed',
          messages: [],
        };
      })
    );

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    next(error);
  }
};

// 2. Get messages for a specific conversation
const getConversationMessages = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { conversationId } = req.params;
    const currentUserId = new mongoose.Types.ObjectId(req.user._id || req.user.id);

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID' });
    }

    // Mark unread messages sent to this user as READ
    await Message.updateMany(
      {
        conversationId: new mongoose.Types.ObjectId(conversationId),
        receiverId: currentUserId,
        status: { $ne: 'READ' },
      },
      { $set: { status: 'READ' } }
    );

    const messages = await Message.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
    })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name businessName userType');

    const formattedMessages = messages.map((msg) => {
      const isSender = msg.senderId && msg.senderId._id.toString() === currentUserId.toString();
      const senderName = isSender
        ? 'You'
        : (msg.senderId?.businessName || msg.senderId?.name || 'Contact');

      return {
        id: msg._id.toString(),
        senderId: msg.senderId ? msg.senderId._id.toString() : 'unknown',
        senderName,
        senderType: (msg.senderId?.userType || 'PATIENT').toLowerCase(),
        content: msg.content,
        timestamp: new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: msg.status === 'READ',
      };
    });

    res.status(200).json({ success: true, data: formattedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    next(error);
  }
};

// 3. Send message
const sendMessage = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { recipientId, conversationId, content } = req.body;
    const currentUserId = new mongoose.Types.ObjectId(req.user._id || req.user.id);

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required.' });
    }

    let conv = null;

    // A. If conversationId is provided
    if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
      conv = await Conversation.findById(conversationId);
    }

    // B. If no conversation found by ID, look up or create with recipientId
    if (!conv && recipientId && mongoose.Types.ObjectId.isValid(recipientId)) {
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        return res.status(404).json({ success: false, message: 'Recipient not found.' });
      }

      const isPatient = req.user.userType === 'PATIENT';
      const patientId = isPatient ? currentUserId : recipient._id;
      const pharmacyId = isPatient ? recipient._id : currentUserId;

      conv = await Conversation.findOne({ patientId, pharmacyId });
      if (!conv) {
        conv = await Conversation.create({
          patientId,
          pharmacyId,
          lastMessage: content.trim(),
          isActive: true,
        });
      }
    }

    if (!conv) {
      return res.status(400).json({
        success: false,
        message: 'Could not find or establish a conversation. Please specify a valid recipient.',
      });
    }

    // Determine receiver
    const receiverId = conv.patientId.toString() === currentUserId.toString()
      ? conv.pharmacyId
      : conv.patientId;

    // Create the message in MongoDB
    const message = await Message.create({
      conversationId: conv._id,
      senderId: currentUserId,
      receiverId: receiverId,
      content: content.trim(),
      status: 'SENT',
    });

    // Update conversation metadata
    conv.lastMessage = content.trim();
    conv.updatedAt = new Date();
    await conv.save();

    // Create notification for receiver
    const senderDisplayName = req.user.businessName || req.user.name || 'MediConnect User';
    try {
      await Notification.create({
        userId: receiverId,
        type: 'order',
        title: `New message from ${senderDisplayName}`,
        message: content.trim().substring(0, 100),
        relatedId: conv._id,
      });
    } catch (notifErr) {
      console.warn('Failed to create message notification:', notifErr.message);
    }

    // Optional automated helpful reply from pharmacy if patient messages an offline pharmacy
    const recipientUser = await User.findById(receiverId);
    if (req.user.userType === 'PATIENT' && recipientUser && recipientUser.userType === 'PHARMACY') {
      // Simulate pharmacy automated assistant reply after short delay
      setTimeout(async () => {
        try {
          const autoReplies = [
            `Hello! We have received your inquiry regarding "${content.trim().substring(0, 35)}...". Our pharmaceutical team is checking stock and will respond promptly.`,
            `Message received! Our pharmacy staff is at your disposal. For urgent questions, you can also contact us at ${recipientUser.phone || 'our direct line'}.`,
            `Thank you for your message. We have received your request and will assist you shortly.`
          ];
          const autoReplyText = autoReplies[Math.floor(Math.random() * autoReplies.length)];

          await Message.create({
            conversationId: conv._id,
            senderId: receiverId,
            receiverId: currentUserId,
            content: autoReplyText,
            status: 'SENT',
          });

          await Conversation.findByIdAndUpdate(conv._id, {
            lastMessage: autoReplyText,
            updatedAt: new Date(),
          });
        } catch (botErr) {
          console.warn('Automated reply error:', botErr.message);
        }
      }, 1500);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully.',
      data: {
        id: message._id.toString(),
        conversationId: conv._id.toString(),
        senderId: currentUserId.toString(),
        senderName: 'You',
        senderType: (req.user.userType || 'PATIENT').toLowerCase(),
        content: message.content,
        timestamp: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false,
      },
    });
  } catch (error) {
    console.error('Error sending message:', error);
    next(error);
  }
};

// 4. Mark conversation messages as read
const markConversationAsRead = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { conversationId } = req.params;
    const currentUserId = new mongoose.Types.ObjectId(req.user._id || req.user.id);

    await Message.updateMany(
      {
        conversationId: new mongoose.Types.ObjectId(conversationId),
        receiverId: currentUserId,
        status: { $ne: 'READ' },
      },
      { $set: { status: 'READ' } }
    );

    res.status(200).json({ success: true, message: 'Conversation marked as read.' });
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    next(error);
  }
};

module.exports = {
  getConversations,
  getConversationMessages,
  sendMessage,
  markConversationAsRead,
};