const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import User model
const AuditLog = require('../models/AuditLog');
const { v4: uuidv4 } = require('uuid');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'mediconnect_cameroon_super_secure_jwt_secret_key_2026!',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Register new user
const register = async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      userType,
      phone,
      dateOfBirth,
      address,
      licenseNumber,
      businessName,
      businessAddress,
      operatingHours,
      latitude,
      longitude
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check if license number already exists for pharmacy (application-level check)
    if (userType === 'PHARMACY' && licenseNumber) {
      const existingLicense = await User.findOne({
        licenseNumber,
        userType: 'PHARMACY'
      });

      if (existingLicense) {
        return res.status(400).json({
          success: false,
          message: 'Pharmacy with this license number already exists'
        });
      }
    }

    // Create user data object
    const userData = {
      email,
      password, // Password will be hashed by the pre-save hook in the User model
      name,
      userType,
      phone,
      status: userType === 'PHARMACY' ? 'PENDING_VERIFICATION' : 'ACTIVE'
    };

    // Add type-specific fields
    if (userType === 'PATIENT') {
      if (dateOfBirth) userData.dateOfBirth = new Date(dateOfBirth);
      if (address) userData.address = address;
    } else if (userType === 'PHARMACY') {      
      userData.licenseNumber = licenseNumber;
      userData.businessName = businessName;
      userData.businessAddress = businessAddress;
      if (operatingHours) userData.operatingHours = operatingHours;
      if (latitude) userData.latitude = latitude;
      if (longitude) userData.longitude = longitude;
    }

    // Create user
    const user = await User.create(userData);

    // Generate token
    const token = generateToken(user._id);

    // Log audit event for registration
    await AuditLog.create({
      userId: user._id,
      action: 'USER_REGISTERED',
      resource: 'User',
      resourceId: user._id,
      details: {
        name: user.name,
        email: user.email,
        userType: user.userType,
        organization: user.organization || user.businessName || null,
        platform: 'MediConnect Cameroon'
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'MediConnect Client'
    }).catch(err => console.warn('Audit error on register:', err.message));

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          userType: user.userType,
          status: user.status,
          phone: user.phone,
          businessName: user.businessName,
          verificationStatus: user.verificationStatus,
          createdAt: user.createdAt
        },
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: `Validation error: ${messages.join(', ')}`
      });
    }
    res.status(500).json({
      success: false,
      message: 'Registration failed due to an internal error.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred.'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email }).select('+password'); // Select password explicitly

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isValidPassword = await user.matchPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact support.'
      });
    }

    if (user.status === 'INACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact support.'
      });
    }

    // Enforce role isolation: if login was attempted through the Health Authority tab,
    // verify the account is explicitly a HEALTH_AUTHORITY user.
    const { expectedUserType } = req.body;
    if (expectedUserType === 'HEALTH_AUTHORITY' && user.userType !== 'HEALTH_AUTHORITY') {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Ce compte ne possède pas les habilitations Régulateur MINSANTÉ / ONPC.'
      });
    }

    // 2FA verification for Health Authorities (only if isMfaRequired is enabled on account)
    if (user.userType === 'HEALTH_AUTHORITY' && user.isMfaRequired) {
      const { mfaCode } = req.body;
      if (!mfaCode) {
        return res.status(200).json({
          success: true,
          requiresMfa: true,
          email: user.email,
          institution: user.organization || (user.email.includes('onpc') ? 'ONPC' : 'MINSANTE'),
          department: user.institutionDepartment || 'Régulateur National',
          message: 'Code 2FA requis pour accéder au Portail Régulateur.'
        });
      }

      // Check MFA OTP: accept user's configured mfaCode or standard institutional OTP 237237
      const validCode = user.mfaCode || '237237';
      if (mfaCode !== validCode && mfaCode !== '237237') {
        return res.status(401).json({
          success: false,
          message: 'Code 2FA invalide. Veuillez vérifier le code d\'authentification à 6 chiffres.'
        });
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await User.updateOne({ _id: user._id }, { $set: { lastLogin: user.lastLogin } });

    // Generate token
    const token = generateToken(user._id);

    // Log audit event for login
    await AuditLog.create({
      userId: user._id,
      action: 'LOGIN_SUCCESS',
      resource: 'User',
      resourceId: user._id,
      details: {
        name: user.name,
        email: user.email,
        userType: user.userType,
        organization: user.organization || user.businessName || null,
        platform: 'MediConnect Cameroon'
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'MediConnect Client'
    }).catch(err => console.warn('Audit error on login:', err.message));

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user.toObject();
    userWithoutPassword.id = user._id;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token,
        user
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Seed standard demo users for immediate testing and defense presentation
const seedDemoUsers = async (req, res) => {
  try {
    const demoUsers = [
      {
        email: 'authority@minsante.cm',
        password: 'Authority123!',
        name: 'Direction de la Pharmacie (MINSANTÉ)',
        userType: 'HEALTH_AUTHORITY',
        status: 'ACTIVE',
        phone: '+237 222 22 22 22',
        address: 'Ministère de la Santé Publique, Yaoundé'
      },
      {
        email: 'admin@mediconnect.cm',
        password: 'Admin123!',
        name: 'Administrateur Système MediConnect',
        userType: 'ADMIN',
        status: 'ACTIVE',
        phone: '+237 670 00 00 01'
      },
      {
        email: 'pharmacie.centre@mediconnect.cm',
        password: 'Pharmacy123!',
        name: 'Dr. Paul Biwole',
        businessName: 'Grande Pharmacie du Centre Yaoundé',
        businessAddress: 'Avenue Kennedy, Centre Ville, Yaoundé',
        city: 'Yaoundé',
        district: 'Centre',
        licenseNumber: 'LIC-CM-2024-089',
        onpcNumber: 'ONPC-CM-2024-0412',
        userType: 'PHARMACY',
        status: 'ACTIVE',
        verificationStatus: true,
        isOnDuty: true,
        phone: '+237 699 11 22 33'
      },
      {
        email: 'patient@mediconnect.cm',
        password: 'Patient123!',
        name: 'Nestor Tchahadji',
        userType: 'PATIENT',
        status: 'ACTIVE',
        phone: '+237 677 88 99 00',
        address: 'Bastos, Yaoundé',
        bloodGroup: 'O+',
        csuIdentifier: 'CSU-CM-883921'
      }
    ];

    const results = [];
    for (const u of demoUsers) {
      let user = await User.findOne({ email: u.email });
      if (!user) {
        user = await User.create(u);
        results.push({ email: u.email, role: u.userType, action: 'created' });
      } else {
        user.userType = u.userType;
        user.status = 'ACTIVE';
        if (u.verificationStatus !== undefined) user.verificationStatus = u.verificationStatus;
        if (u.businessName) user.businessName = u.businessName;
        if (u.onpcNumber) user.onpcNumber = u.onpcNumber;
        user.password = u.password; // pre-save will rehash
        await user.save();
        results.push({ email: u.email, role: u.userType, action: 'updated' });
      }
    }

    res.json({
      success: true,
      message: 'Demo accounts ready! (Patient, Pharmacy, Admin, Health Authority)',
      users: results
    });
  } catch (error) {
    console.error('Seed users error:', error);
    res.status(500).json({ success: false, message: 'Failed to seed demo users', error: error.message });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  refreshToken,
  seedDemoUsers
};