const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import Mongoose User model

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token || token === 'null' || token === 'undefined' || token.trim() === '') {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No valid token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mediconnect_cameroon_super_secure_jwt_secret_key_2026!');
    
    // Get user from database
    const user = await User.findById(decoded.userId || decoded.id).select('-password'); // Exclude password

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Add user to request object
    req.user = user;
    console.log('Authenticated user:', req.user);
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }
    
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
};

// Middleware to check if user is a pharmacy
const requirePharmacy = (req, res, next) => {
  if (req.user.userType !== 'PHARMACY') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Pharmacy account required.'
    });
  }
  next();
};

// Middleware to check if user is a patient
const requirePatient = (req, res, next) => {
  if (req.user.userType !== 'PATIENT') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Patient account required.'
    });
  }
  next();
};

// Middleware to check if user is an admin
const requireAdmin = (req, res, next) => {
  if (req.user.userType !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin account required.'
    });
  }
  next();
};

// Middleware to check if pharmacy is verified
const requireVerifiedPharmacy = (req, res, next) => {
  if (req.user.userType !== 'PHARMACY' || !req.user.verificationStatus) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Verified pharmacy account required.'
    });
  }
  next();
};

module.exports = {
  authMiddleware,
  requirePharmacy,
  requirePatient,
  requireAdmin,
  requireVerifiedPharmacy
};