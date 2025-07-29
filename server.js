const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes and middleware
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const vrSessionRoutes = require('./routes/vrSessions');
const userRoutes = require('./routes/users');
const { authenticateSocket } = require('./middleware/auth');
const { connectDB } = require('./config/database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Connect to database
connectDB();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://aframe.io", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Middleware
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/vr-sessions', vrSessionRoutes);
app.use('/api/users', userRoutes);

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active users and VR sessions
const activeUsers = new Map();
const vrSessions = new Map();
const chatRooms = new Map();

// Socket.IO connection handling
io.use(authenticateSocket);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId}`);
  
  // Store user connection
  activeUsers.set(socket.userId, {
    socketId: socket.id,
    username: socket.username,
    joinedAt: new Date(),
    currentRoom: null,
    vrPosition: null,
    vrRotation: null
  });

  // Emit user list update
  io.emit('users_update', Array.from(activeUsers.values()));

  // Handle joining VR session
  socket.on('join_vr_session', (sessionId) => {
    const user = activeUsers.get(socket.userId);
    if (user) {
      // Leave previous room if any
      if (user.currentRoom) {
        socket.leave(user.currentRoom);
      }
      
      // Join new VR session
      socket.join(sessionId);
      user.currentRoom = sessionId;
      
      // Initialize or update VR session
      if (!vrSessions.has(sessionId)) {
        vrSessions.set(sessionId, {
          id: sessionId,
          users: new Set(),
          createdAt: new Date(),
          sharedObjects: new Map()
        });
      }
      
      const session = vrSessions.get(sessionId);
      session.users.add(socket.userId);
      
      socket.emit('vr_session_joined', {
        sessionId,
        users: Array.from(session.users),
        sharedObjects: Array.from(session.sharedObjects.values())
      });
      
      // Notify other users in the session
      socket.to(sessionId).emit('user_joined_vr', {
        userId: socket.userId,
        username: user.username
      });
    }
  });

  // Handle VR position updates
  socket.on('vr_position_update', (data) => {
    const user = activeUsers.get(socket.userId);
    if (user && user.currentRoom) {
      user.vrPosition = data.position;
      user.vrRotation = data.rotation;
      
      // Broadcast position to other users in the same VR session
      socket.to(user.currentRoom).emit('user_position_update', {
        userId: socket.userId,
        position: data.position,
        rotation: data.rotation
      });
    }
  });

  // Handle shared object creation/update
  socket.on('create_shared_object', (data) => {
    const user = activeUsers.get(socket.userId);
    if (user && user.currentRoom && vrSessions.has(user.currentRoom)) {
      const session = vrSessions.get(user.currentRoom);
      const objectId = data.id || require('uuid').v4();
      
      const sharedObject = {
        id: objectId,
        type: data.type,
        position: data.position,
        rotation: data.rotation,
        scale: data.scale,
        properties: data.properties,
        createdBy: socket.userId,
        createdAt: new Date()
      };
      
      session.sharedObjects.set(objectId, sharedObject);
      
      // Broadcast to all users in the session
      io.to(user.currentRoom).emit('shared_object_created', sharedObject);
    }
  });

  // Handle shared object updates
  socket.on('update_shared_object', (data) => {
    const user = activeUsers.get(socket.userId);
    if (user && user.currentRoom && vrSessions.has(user.currentRoom)) {
      const session = vrSessions.get(user.currentRoom);
      if (session.sharedObjects.has(data.id)) {
        const object = session.sharedObjects.get(data.id);
        Object.assign(object, data.updates);
        
        // Broadcast update to all users in the session
        socket.to(user.currentRoom).emit('shared_object_updated', {
          id: data.id,
          updates: data.updates
        });
      }
    }
  });

  // Handle chat messages
  socket.on('send_chat_message', (data) => {
    const user = activeUsers.get(socket.userId);
    if (user) {
      const message = {
        id: require('uuid').v4(),
        userId: socket.userId,
        username: user.username,
        message: data.message,
        timestamp: new Date(),
        room: data.room || 'global'
      };
      
      // Store message in chat room
      if (!chatRooms.has(message.room)) {
        chatRooms.set(message.room, []);
      }
      chatRooms.get(message.room).push(message);
      
      // Keep only last 100 messages per room
      const roomMessages = chatRooms.get(message.room);
      if (roomMessages.length > 100) {
        roomMessages.splice(0, roomMessages.length - 100);
      }
      
      // Broadcast message
      if (message.room === 'global') {
        io.emit('chat_message', message);
      } else {
        io.to(message.room).emit('chat_message', message);
      }
    }
  });

  // Handle getting chat history
  socket.on('get_chat_history', (room = 'global') => {
    const messages = chatRooms.get(room) || [];
    socket.emit('chat_history', { room, messages });
  });

  // Handle voice chat signaling
  socket.on('voice_offer', (data) => {
    socket.to(data.targetUserId).emit('voice_offer', {
      offer: data.offer,
      fromUserId: socket.userId
    });
  });

  socket.on('voice_answer', (data) => {
    socket.to(data.targetUserId).emit('voice_answer', {
      answer: data.answer,
      fromUserId: socket.userId
    });
  });

  socket.on('voice_ice_candidate', (data) => {
    socket.to(data.targetUserId).emit('voice_ice_candidate', {
      candidate: data.candidate,
      fromUserId: socket.userId
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
    
    const user = activeUsers.get(socket.userId);
    if (user && user.currentRoom) {
      // Remove from VR session
      if (vrSessions.has(user.currentRoom)) {
        const session = vrSessions.get(user.currentRoom);
        session.users.delete(socket.userId);
        
        // Clean up empty sessions
        if (session.users.size === 0) {
          vrSessions.delete(user.currentRoom);
        } else {
          // Notify other users
          socket.to(user.currentRoom).emit('user_left_vr', {
            userId: socket.userId,
            username: user.username
          });
        }
      }
    }
    
    // Remove user from active users
    activeUsers.delete(socket.userId);
    
    // Emit updated user list
    io.emit('users_update', Array.from(activeUsers.values()));
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});