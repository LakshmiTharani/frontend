const mongoose = require('mongoose');

const sharedObjectSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['box', 'sphere', 'cylinder', 'plane', 'text', 'model', 'light', 'camera']
  },
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    z: { type: Number, default: 0 }
  },
  rotation: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    z: { type: Number, default: 0 }
  },
  scale: {
    x: { type: Number, default: 1 },
    y: { type: Number, default: 1 },
    z: { type: Number, default: 1 }
  },
  properties: {
    color: String,
    material: String,
    texture: String,
    text: String,
    src: String,
    opacity: Number,
    metalness: Number,
    roughness: Number
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  permissions: {
    canEdit: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    canDelete: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    isPublic: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

const vrSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  environment: {
    type: String,
    default: 'default',
    enum: ['default', 'space', 'forest', 'ocean', 'city', 'custom']
  },
  maxUsers: {
    type: Number,
    default: 20,
    min: 2,
    max: 100
  },
  currentUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 1.6 },
      z: { type: Number, default: -3 }
    },
    rotation: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      z: { type: Number, default: 0 }
    },
    avatar: {
      type: String,
      default: 'sphere'
    }
  }],
  sharedObjects: [sharedObjectSchema],
  settings: {
    isPrivate: {
      type: Boolean,
      default: false
    },
    requireInvite: {
      type: Boolean,
      default: false
    },
    voiceChatEnabled: {
      type: Boolean,
      default: true
    },
    handTrackingEnabled: {
      type: Boolean,
      default: true
    },
    physicsEnabled: {
      type: Boolean,
      default: true
    }
  },
  inviteCode: {
    type: String,
    unique: true,
    sparse: true
  },
  invitedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  bannedUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    bannedAt: {
      type: Date,
      default: Date.now
    },
    reason: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  endedAt: {
    type: Date
  },
  duration: {
    type: Number // in seconds
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
vrSessionSchema.index({ sessionId: 1 });
vrSessionSchema.index({ host: 1, createdAt: -1 });
vrSessionSchema.index({ isActive: 1, createdAt: -1 });
vrSessionSchema.index({ 'settings.isPrivate': 1, isActive: 1 });

// Generate invite code
vrSessionSchema.methods.generateInviteCode = function() {
  this.inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  return this.inviteCode;
};

// Check if user can join
vrSessionSchema.methods.canUserJoin = function(userId) {
  if (this.bannedUsers.some(banned => banned.user.toString() === userId.toString())) {
    return false;
  }
  
  if (this.currentUsers.length >= this.maxUsers) {
    return false;
  }
  
  if (this.settings.requireInvite && !this.invitedUsers.includes(userId)) {
    return false;
  }
  
  return true;
};

module.exports = mongoose.model('VRSession', vrSessionSchema);