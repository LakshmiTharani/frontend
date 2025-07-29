# VR/AR Interactive Platform

An immersive Virtual Reality and Augmented Reality platform with real-time collaboration, built with Node.js, Express, Socket.IO, and A-Frame.

## Features

### 🎮 Core VR/AR Features
- **Immersive VR Experiences** - Full VR support with A-Frame
- **Real-time Collaboration** - Multiple users in shared VR spaces
- **Interactive 3D Objects** - Create and manipulate shared objects
- **Avatar System** - Customizable user avatars
- **Environment Switching** - Multiple VR environments (Space, Forest, Ocean, City)

### 💬 Communication
- **Real-time Chat** - Global and room-specific messaging
- **Voice Chat Ready** - WebRTC infrastructure for voice communication
- **User Presence** - See who's online and in VR sessions

### 👥 User Management
- **Authentication System** - Secure JWT-based login/registration
- **User Profiles** - Track VR time, sessions, and statistics
- **Friend System** - Add and manage friends
- **Session Management** - Create, join, and manage VR sessions

### 🔧 Technical Features
- **RESTful API** - Comprehensive backend API
- **Real-time Updates** - Socket.IO for live communication
- **Database Integration** - MongoDB with Mongoose
- **Security** - Rate limiting, CORS, input validation
- **Responsive Design** - Works on desktop and mobile

## Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **MongoDB** - Database
- **Mongoose** - ODM for MongoDB
- **JWT** - Authentication
- **bcryptjs** - Password hashing

### Frontend
- **A-Frame** - VR/AR framework
- **Socket.IO Client** - Real-time communication
- **Axios** - HTTP client
- **Vanilla JavaScript** - No framework dependencies

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- Modern web browser with WebXR support

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd vr-ar-interactive-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start MongoDB**
Make sure MongoDB is running on your system or update the connection string in `.env`

5. **Run the application**
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

6. **Access the application**
Open your browser and navigate to `http://localhost:3001`

## VS Code Setup

### Recommended Extensions
- **Node.js Extension Pack** - Essential Node.js tools
- **MongoDB for VS Code** - Database management
- **REST Client** - API testing
- **Auto Rename Tag** - HTML tag management
- **Bracket Pair Colorizer** - Code readability

### VS Code Configuration
Create a `.vscode/launch.json` file for debugging:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Start Server",
            "type": "node",
            "request": "launch",
            "program": "${workspaceFolder}/server.js",
            "env": {
                "NODE_ENV": "development"
            },
            "console": "integratedTerminal",
            "restart": true,
            "runtimeExecutable": "nodemon"
        }
    ]
}
```

Create a `.vscode/settings.json` file for project settings:

```json
{
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
    },
    "files.associations": {
        "*.ejs": "html"
    },
    "emmet.includeLanguages": {
        "javascript": "javascriptreact"
    }
}
```

### Debugging
1. Set breakpoints in your code
2. Press `F5` or use the Debug panel
3. Use the integrated terminal for logs
4. Monitor network requests in the browser dev tools

## API Documentation

### Authentication Routes
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/logout` - Logout user

### VR Session Routes
- `GET /api/vr-sessions` - List active sessions
- `POST /api/vr-sessions` - Create new session
- `GET /api/vr-sessions/:id` - Get session details
- `POST /api/vr-sessions/:id/join` - Join session
- `POST /api/vr-sessions/:id/leave` - Leave session
- `PUT /api/vr-sessions/:id` - Update session (host only)
- `DELETE /api/vr-sessions/:id` - End session (host only)

### Chat Routes
- `GET /api/chat/history/:room` - Get chat history
- `POST /api/chat/send` - Send message (HTTP fallback)
- `GET /api/chat/rooms` - Get available rooms

### User Routes
- `GET /api/users` - List users
- `GET /api/users/:id` - Get user profile
- `POST /api/users/:id/friend-request` - Send friend request
- `DELETE /api/users/:id/friend` - Remove friend

## Socket.IO Events

### Client to Server
- `join_vr_session` - Join a VR session
- `vr_position_update` - Update user position in VR
- `send_chat_message` - Send chat message
- `create_shared_object` - Create shared VR object
- `update_shared_object` - Update shared VR object

### Server to Client
- `vr_session_joined` - Session join confirmation
- `user_joined_vr` - User joined notification
- `user_left_vr` - User left notification
- `chat_message` - New chat message
- `shared_object_created` - New shared object
- `users_update` - Online users list update

## Database Schema

### User Model
```javascript
{
  username: String,
  email: String,
  password: String (hashed),
  vrPreferences: {
    defaultAvatar: String,
    favoriteEnvironments: [String],
    voiceChatEnabled: Boolean
  },
  stats: {
    totalVRTime: Number,
    sessionsJoined: Number,
    messagesSent: Number
  },
  friends: [{ user: ObjectId, addedAt: Date }]
}
```

### VR Session Model
```javascript
{
  sessionId: String,
  name: String,
  host: ObjectId,
  environment: String,
  maxUsers: Number,
  currentUsers: [{ user: ObjectId, position: Object }],
  sharedObjects: [Object],
  settings: {
    isPrivate: Boolean,
    voiceChatEnabled: Boolean
  }
}
```

## Development

### Project Structure
```
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables
├── config/
│   └── database.js        # Database configuration
├── models/
│   ├── User.js           # User schema
│   ├── VRSession.js      # VR session schema
│   └── ChatMessage.js    # Chat message schema
├── routes/
│   ├── auth.js           # Authentication routes
│   ├── vrSessions.js     # VR session routes
│   ├── chat.js           # Chat routes
│   └── users.js          # User routes
├── middleware/
│   └── auth.js           # Authentication middleware
└── public/
    ├── index.html        # Main HTML file
    ├── style.css         # Styles
    └── app.js            # Frontend JavaScript
```

### Environment Variables
```bash
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/vr-ar-app
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
```

### Adding New Features
1. **Backend**: Add routes in the appropriate file in `/routes/`
2. **Database**: Update models in `/models/` if needed
3. **Frontend**: Update `/public/app.js` and `/public/index.html`
4. **Real-time**: Add Socket.IO events in `server.js`

### Testing
```bash
# Install test dependencies
npm install --save-dev jest supertest

# Run tests
npm test
```

## Deployment

### Production Setup
1. **Environment**: Set `NODE_ENV=production`
2. **Database**: Use MongoDB Atlas or production MongoDB
3. **Security**: Update JWT secret and other sensitive config
4. **HTTPS**: Configure SSL certificates
5. **Process Management**: Use PM2 or similar

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue on GitHub
- Check the API documentation
- Review the Socket.IO events list
- Test with the provided Postman collection
