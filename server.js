require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');


const connectDB = require('./config/db'); // Import connectDB

// Connect to database
connectDB();

const Message = require('./models/Message');
const Notification = require('./models/Notification');
const User = require('./models/User'); // User model is needed for sender details

const errorHandler = require('./middleware/errorHandler');

// Import all routes from index.js
const routes = require('./routes');
const userController = require('./controllers/userController'); // Import userController
const { authMiddleware } = require('./middleware/auth');

// Initialize Express app
const app = express();
const server = createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive in local development
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

const io = new Server(server, {
  cors: corsOptions
});

// Global rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3000, // accommodate real-time messaging polling and dashboard telemetry
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware (CORS first to ensure headers on all responses)
app.use(cors(corsOptions));
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(compression());
app.use(morgan('combined'));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  res.status(200).json({
    status: 'OK',
    message: 'MediConnect API is running',
    database: mongoose.connection.name,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', routes.authRoutes);
app.use('/api/users', routes.userRoutes);
app.use('/api/medicines', routes.medicineRoutes);
app.use('/api/master-catalogue', routes.masterCatalogueRoutes);
app.use('/api/inventory-sync', routes.inventorySyncRoutes);
app.use('/api/stats', routes.statsRoutes);
app.use('/api/inventory', authMiddleware, routes.inventoryRoutes);
app.use('/api/authority', routes.healthAuthorityRoutes);
app.use('/api/health-tips', routes.healthTipRoutes);
app.use('/api/messages', routes.messageRoutes);
app.use('/api/reminders', routes.reminderRoutes);
app.use('/api/prescriptions', routes.prescriptionRoutes);
app.use('/api/audit-logs', routes.auditLogRoutes);
app.use('/api/analytics', routes.analyticsRoutes);

// Socket.IO for real-time messaging
io.use((socket, next) => {
  // Add socket authentication here
  const token = socket.handshake.auth.token;
  if (token) {
    // Verify token and attach user to socket
    socket.userId = 'user-id-from-token'; // Replace with actual token verification
  }
  next();
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-conversation', (conversationId) => {
    socket.join(conversationId);
  });

  socket.on('send-message', async (data) => {
    try {
      // Save message to database
      const message = await Message.create({
        conversationId: data.conversationId,
        senderId: data.senderId,
        receiverId: data.receiverId,
        content: data.content,
        status: 'SENT' // Default status
      });

      // Populate sender details for response
      await message.populate('senderId', 'id name userType'); // Populate sender details

      // Emit to conversation room
      io.to(data.conversationId).emit('new-message', message);

      // Create notification for receiver
      await Notification.create({
        userId: data.receiverId,
        type: 'MESSAGE_RECEIVED',
        title: 'New Message',
        message: `You have a new message from ${message.senderId.name}`,
        data: { conversationId: data.conversationId }
      });

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message-error', { error: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`
🚀 MediConnect API Server is running!
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📊 Health Check: http://localhost:${PORT}/health
📚 API Base URL: http://localhost:${PORT}/api
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;