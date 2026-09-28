const express = require('express');
const rateLimit = require('express-rate-limit');
const { authMiddleware } = require('../middleware/auth');
const { validate, registerSchema, loginSchema } = require('../middleware/validation');
const {
  register,
  login,
  getProfile,
  refreshToken,
  seedDemoUsers
} = require('../controllers/authController');

const router = express.Router();

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Increased max requests for development to avoid being locked out.
  // In production, this should be a lower number (e.g., 5-10) to prevent brute-force attacks.
  max: 500, 
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  }
});

// Public routes
router.get('/seed-users', seedDemoUsers);
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);

// Protected routes
router.get('/profile', authMiddleware, getProfile);
router.post('/refresh', authMiddleware, refreshToken);

module.exports = router;