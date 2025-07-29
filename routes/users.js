const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const VRSession = require('../models/VRSession');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get all users (with pagination and search)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, online } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    
    // Search by username
    if (search) {
      query.username = { $regex: search, $options: 'i' };
    }
    
    // Filter by online status
    if (online !== undefined) {
      query.isOnline = online === 'true';
    }

    const users = await User.find(query)
      .select('username avatar stats isOnline lastSeen currentVRSession')
      .sort({ isOnline: -1, lastSeen: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const totalUsers = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        hasMore: skip + users.length < totalUsers
      }
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific user's profile
router.get('/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('username avatar stats isOnline lastSeen currentVRSession createdAt')
      .populate('friends.user', 'username avatar isOnline');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's recent VR sessions
    const recentSessions = await VRSession.find({
      $or: [
        { host: userId },
        { 'currentUsers.user': userId }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('sessionId name environment createdAt duration');

    res.json({
      user: {
        ...user.toObject(),
        recentSessions
      }
    });
  } catch (error) {
    console.error('User profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send friend request
router.post('/:userId/friend-request', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already friends
    const isAlreadyFriend = req.user.friends.some(
      friend => friend.user.toString() === userId
    );

    if (isAlreadyFriend) {
      return res.status(400).json({ error: 'Already friends with this user' });
    }

    // Add to friends list (simplified - in a real app, you'd have friend requests)
    req.user.friends.push({
      user: userId,
      addedAt: new Date()
    });

    targetUser.friends.push({
      user: req.user._id,
      addedAt: new Date()
    });

    await req.user.save();
    await targetUser.save();

    res.json({ message: 'Friend added successfully' });
  } catch (error) {
    console.error('Friend request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove friend
router.delete('/:userId/friend', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove from friends list
    req.user.friends = req.user.friends.filter(
      friend => friend.user.toString() !== userId
    );

    targetUser.friends = targetUser.friends.filter(
      friend => friend.user.toString() !== req.user._id.toString()
    );

    await req.user.save();
    await targetUser.save();

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Friend removal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's friends
router.get('/:userId/friends', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if requesting own friends or if profile is public
    if (req.user && req.user._id.toString() !== userId) {
      // In a real app, you might have privacy settings
    }

    const user = await User.findById(userId)
      .populate('friends.user', 'username avatar isOnline lastSeen currentVRSession')
      .select('friends');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ friends: user.friends });
  } catch (error) {
    console.error('Friends fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get online friends
router.get('/me/friends/online', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'friends.user',
        match: { isOnline: true },
        select: 'username avatar currentVRSession lastSeen'
      })
      .select('friends');

    const onlineFriends = user.friends.filter(friend => friend.user);

    res.json({ onlineFriends });
  } catch (error) {
    console.error('Online friends fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user VR preferences
router.put('/me/vr-preferences', authenticateToken, [
  body('defaultAvatar')
    .optional()
    .isIn(['sphere', 'box', 'cylinder', 'robot', 'character'])
    .withMessage('Invalid avatar type'),
  body('favoriteEnvironments')
    .optional()
    .isArray()
    .withMessage('Favorite environments must be an array'),
  body('voiceChatEnabled')
    .optional()
    .isBoolean()
    .withMessage('Voice chat setting must be boolean'),
  body('gestureControlsEnabled')
    .optional()
    .isBoolean()
    .withMessage('Gesture controls setting must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updates = {};
    const allowedUpdates = ['defaultAvatar', 'favoriteEnvironments', 'voiceChatEnabled', 'gestureControlsEnabled'];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[`vrPreferences.${field}`] = req.body[field];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'VR preferences updated successfully',
      vrPreferences: updatedUser.vrPreferences
    });
  } catch (error) {
    console.error('VR preferences update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user statistics
router.get('/:userId/stats', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('username stats createdAt');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get additional stats from VR sessions
    const sessionStats = await VRSession.aggregate([
      {
        $match: {
          $or: [
            { host: user._id },
            { 'currentUsers.user': user._id }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          sessionsHosted: {
            $sum: {
              $cond: [{ $eq: ['$host', user._id] }, 1, 0]
            }
          }
        }
      }
    ]);

    const additionalStats = sessionStats.length > 0 ? sessionStats[0] : {
      totalSessions: 0,
      totalDuration: 0,
      sessionsHosted: 0
    };

    res.json({
      username: user.username,
      joinedAt: user.createdAt,
      stats: {
        ...user.stats,
        ...additionalStats,
        averageSessionDuration: additionalStats.totalSessions > 0 
          ? Math.round(additionalStats.totalDuration / additionalStats.totalSessions)
          : 0
      }
    });
  } catch (error) {
    console.error('User stats fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search users
router.get('/search/:query', optionalAuth, async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 10 } = req.query;

    if (query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await User.find({
      username: { $regex: query, $options: 'i' }
    })
      .select('username avatar isOnline currentVRSession')
      .limit(parseInt(limit))
      .sort({ isOnline: -1, username: 1 });

    res.json({ users });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;