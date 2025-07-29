const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  avatar: {
    type: String,
    default: null
  },
  vrPreferences: {
    defaultAvatar: {
      type: String,
      default: 'sphere'
    },
    favoriteEnvironments: [{
      type: String
    }],
    voiceChatEnabled: {
      type: Boolean,
      default: true
    },
    gestureControlsEnabled: {
      type: Boolean,
      default: true
    }
  },
  stats: {
    totalVRTime: {
      type: Number,
      default: 0
    },
    sessionsJoined: {
      type: Number,
      default: 0
    },
    messagesSent: {
      type: Number,
      default: 0
    },
    objectsCreated: {
      type: Number,
      default: 0
    }
  },
  friends: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  currentVRSession: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, rounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Get public profile method
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    avatar: this.avatar,
    stats: this.stats,
    isOnline: this.isOnline,
    lastSeen: this.lastSeen,
    currentVRSession: this.currentVRSession
  };
};

module.exports = mongoose.model('User', userSchema);