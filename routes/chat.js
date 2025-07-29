const express = require('express');
const { body, validationResult } = require('express-validator');
const ChatMessage = require('../models/ChatMessage');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get chat history for a specific room
router.get('/history/:room', optionalAuth, async (req, res) => {
  try {
    const { room } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const messages = await ChatMessage.find({ 
      room,
      deletedAt: null 
    })
      .populate('user', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const totalMessages = await ChatMessage.countDocuments({ 
      room,
      deletedAt: null 
    });

    res.json({
      messages: messages.reverse(), // Reverse to get chronological order
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalMessages / limit),
        totalMessages,
        hasMore: skip + messages.length < totalMessages
      }
    });
  } catch (error) {
    console.error('Chat history fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send a chat message (via HTTP, though Socket.IO is preferred)
router.post('/send', authenticateToken, [
  body('message')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters')
    .trim(),
  body('room')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Room name must be between 1 and 50 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { message, room = 'global', messageType = 'text', metadata = {} } = req.body;

    const chatMessage = new ChatMessage({
      user: req.user._id,
      username: req.user.username,
      message,
      room,
      messageType,
      metadata
    });

    await chatMessage.save();
    await chatMessage.populate('user', 'username avatar');

    // Update user stats
    await req.user.updateOne({ $inc: { 'stats.messagesSent': 1 } });

    res.status(201).json({
      message: 'Message sent successfully',
      chatMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit a chat message
router.put('/:messageId', authenticateToken, [
  body('message')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters')
    .trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { messageId } = req.params;
    const { message } = req.body;

    const chatMessage = await ChatMessage.findOne({
      _id: messageId,
      user: req.user._id,
      deletedAt: null
    });

    if (!chatMessage) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    // Check if message is too old to edit (15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (chatMessage.createdAt < fifteenMinutesAgo) {
      return res.status(400).json({ error: 'Message is too old to edit' });
    }

    chatMessage.message = message;
    chatMessage.editedAt = new Date();
    await chatMessage.save();

    res.json({
      message: 'Message updated successfully',
      chatMessage
    });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a chat message
router.delete('/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    const chatMessage = await ChatMessage.findOne({
      _id: messageId,
      user: req.user._id,
      deletedAt: null
    });

    if (!chatMessage) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    // Soft delete
    chatMessage.deletedAt = new Date();
    await chatMessage.save();

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available chat rooms
router.get('/rooms', optionalAuth, async (req, res) => {
  try {
    const rooms = await ChatMessage.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: '$room',
          lastMessage: { $max: '$createdAt' },
          messageCount: { $sum: 1 },
          lastMessageText: { $last: '$message' },
          lastUsername: { $last: '$username' }
        }
      },
      { $sort: { lastMessage: -1 } },
      { $limit: 20 }
    ]);

    res.json({ rooms });
  } catch (error) {
    console.error('Rooms fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;