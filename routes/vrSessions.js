const express = require('express');
const { body, validationResult } = require('express-validator');
const VRSession = require('../models/VRSession');
const User = require('../models/User');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Get all active VR sessions
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, environment, isPrivate } = req.query;
    const skip = (page - 1) * limit;

    const query = { isActive: true };
    
    // Filter by environment if specified
    if (environment && environment !== 'all') {
      query.environment = environment;
    }
    
    // Filter by privacy if specified
    if (isPrivate !== undefined) {
      query['settings.isPrivate'] = isPrivate === 'true';
    }

    // If user is not authenticated, only show public sessions
    if (!req.user) {
      query['settings.isPrivate'] = false;
    }

    const sessions = await VRSession.find(query)
      .populate('host', 'username avatar')
      .populate('currentUsers.user', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .select('-inviteCode'); // Don't expose invite codes

    const totalSessions = await VRSession.countDocuments(query);

    res.json({
      sessions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalSessions / limit),
        totalSessions,
        hasMore: skip + sessions.length < totalSessions
      }
    });
  } catch (error) {
    console.error('VR sessions fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new VR session
router.post('/', authenticateToken, [
  body('name')
    .isLength({ min: 3, max: 100 })
    .withMessage('Session name must be between 3 and 100 characters')
    .trim(),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters')
    .trim(),
  body('environment')
    .optional()
    .isIn(['default', 'space', 'forest', 'ocean', 'city', 'custom'])
    .withMessage('Invalid environment type'),
  body('maxUsers')
    .optional()
    .isInt({ min: 2, max: 100 })
    .withMessage('Max users must be between 2 and 100'),
  body('settings.isPrivate')
    .optional()
    .isBoolean()
    .withMessage('isPrivate must be a boolean'),
  body('settings.requireInvite')
    .optional()
    .isBoolean()
    .withMessage('requireInvite must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      name, 
      description, 
      environment = 'default', 
      maxUsers = 20, 
      settings = {} 
    } = req.body;

    const sessionId = uuidv4();

    const vrSession = new VRSession({
      sessionId,
      name,
      description,
      host: req.user._id,
      environment,
      maxUsers,
      settings: {
        isPrivate: settings.isPrivate || false,
        requireInvite: settings.requireInvite || false,
        voiceChatEnabled: settings.voiceChatEnabled !== false,
        handTrackingEnabled: settings.handTrackingEnabled !== false,
        physicsEnabled: settings.physicsEnabled !== false
      },
      currentUsers: [{
        user: req.user._id,
        joinedAt: new Date(),
        position: { x: 0, y: 1.6, z: -3 },
        rotation: { x: 0, y: 0, z: 0 },
        avatar: req.user.vrPreferences?.defaultAvatar || 'sphere'
      }]
    });

    // Generate invite code if required
    if (settings.requireInvite || settings.isPrivate) {
      vrSession.generateInviteCode();
    }

    await vrSession.save();
    await vrSession.populate('host', 'username avatar');
    await vrSession.populate('currentUsers.user', 'username avatar');

    // Update user's current VR session
    await User.findByIdAndUpdate(req.user._id, {
      currentVRSession: sessionId,
      $inc: { 'stats.sessionsJoined': 1 }
    });

    res.status(201).json({
      message: 'VR session created successfully',
      session: vrSession
    });
  } catch (error) {
    console.error('VR session creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific VR session
router.get('/:sessionId', optionalAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await VRSession.findOne({ 
      sessionId, 
      isActive: true 
    })
      .populate('host', 'username avatar')
      .populate('currentUsers.user', 'username avatar')
      .populate('invitedUsers', 'username avatar');

    if (!session) {
      return res.status(404).json({ error: 'VR session not found' });
    }

    // Check access permissions
    if (session.settings.isPrivate && (!req.user || session.host._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({ error: 'Access denied to private session' });
    }

    // Hide invite code unless user is host
    if (!req.user || session.host._id.toString() !== req.user._id.toString()) {
      session.inviteCode = undefined;
    }

    res.json({ session });
  } catch (error) {
    console.error('VR session fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join a VR session
router.post('/:sessionId/join', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { inviteCode, position, avatar } = req.body;

    const session = await VRSession.findOne({ 
      sessionId, 
      isActive: true 
    });

    if (!session) {
      return res.status(404).json({ error: 'VR session not found' });
    }

    // Check if user can join
    if (!session.canUserJoin(req.user._id)) {
      return res.status(403).json({ error: 'Cannot join this session' });
    }

    // Check invite code if required
    if (session.settings.requireInvite && session.inviteCode !== inviteCode) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }

    // Check if user is already in the session
    const existingUser = session.currentUsers.find(
      user => user.user.toString() === req.user._id.toString()
    );

    if (existingUser) {
      return res.status(400).json({ error: 'User already in session' });
    }

    // Add user to session
    session.currentUsers.push({
      user: req.user._id,
      joinedAt: new Date(),
      position: position || { x: Math.random() * 4 - 2, y: 1.6, z: Math.random() * 4 - 2 },
      rotation: { x: 0, y: 0, z: 0 },
      avatar: avatar || req.user.vrPreferences?.defaultAvatar || 'sphere'
    });

    await session.save();

    // Update user's current VR session
    await User.findByIdAndUpdate(req.user._id, {
      currentVRSession: sessionId,
      $inc: { 'stats.sessionsJoined': 1 }
    });

    await session.populate('currentUsers.user', 'username avatar');

    res.json({
      message: 'Joined VR session successfully',
      session: {
        sessionId: session.sessionId,
        name: session.name,
        environment: session.environment,
        currentUsers: session.currentUsers,
        settings: session.settings
      }
    });
  } catch (error) {
    console.error('VR session join error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave a VR session
router.post('/:sessionId/leave', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await VRSession.findOne({ 
      sessionId, 
      isActive: true 
    });

    if (!session) {
      return res.status(404).json({ error: 'VR session not found' });
    }

    // Remove user from session
    session.currentUsers = session.currentUsers.filter(
      user => user.user.toString() !== req.user._id.toString()
    );

    // If session is empty and not the host, deactivate it
    if (session.currentUsers.length === 0) {
      session.isActive = false;
      session.endedAt = new Date();
      session.duration = Math.floor((session.endedAt - session.createdAt) / 1000);
    }

    await session.save();

    // Update user's current VR session
    await User.findByIdAndUpdate(req.user._id, {
      currentVRSession: null
    });

    res.json({ message: 'Left VR session successfully' });
  } catch (error) {
    console.error('VR session leave error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update VR session settings (host only)
router.put('/:sessionId', authenticateToken, [
  body('name')
    .optional()
    .isLength({ min: 3, max: 100 })
    .withMessage('Session name must be between 3 and 100 characters')
    .trim(),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters')
    .trim(),
  body('maxUsers')
    .optional()
    .isInt({ min: 2, max: 100 })
    .withMessage('Max users must be between 2 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { sessionId } = req.params;
    const updates = req.body;

    const session = await VRSession.findOne({ 
      sessionId, 
      isActive: true,
      host: req.user._id
    });

    if (!session) {
      return res.status(404).json({ error: 'VR session not found or unauthorized' });
    }

    // Update allowed fields
    const allowedUpdates = ['name', 'description', 'maxUsers', 'settings'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'settings') {
          session.settings = { ...session.settings, ...updates[field] };
        } else {
          session[field] = updates[field];
        }
      }
    });

    await session.save();

    res.json({
      message: 'VR session updated successfully',
      session
    });
  } catch (error) {
    console.error('VR session update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// End a VR session (host only)
router.delete('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await VRSession.findOne({ 
      sessionId, 
      isActive: true,
      host: req.user._id
    });

    if (!session) {
      return res.status(404).json({ error: 'VR session not found or unauthorized' });
    }

    session.isActive = false;
    session.endedAt = new Date();
    session.duration = Math.floor((session.endedAt - session.createdAt) / 1000);

    await session.save();

    // Update all users' current VR session
    const userIds = session.currentUsers.map(user => user.user);
    await User.updateMany(
      { _id: { $in: userIds } },
      { currentVRSession: null }
    );

    res.json({ message: 'VR session ended successfully' });
  } catch (error) {
    console.error('VR session end error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate new invite code (host only)
router.post('/:sessionId/invite-code', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await VRSession.findOne({ 
      sessionId, 
      isActive: true,
      host: req.user._id
    });

    if (!session) {
      return res.status(404).json({ error: 'VR session not found or unauthorized' });
    }

    const newInviteCode = session.generateInviteCode();
    await session.save();

    res.json({
      message: 'New invite code generated',
      inviteCode: newInviteCode
    });
  } catch (error) {
    console.error('Invite code generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;