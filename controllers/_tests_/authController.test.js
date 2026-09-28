// Mock dependencies before they are imported
jest.mock('../../models/User');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { register, login } = require('../authController');

// Helper to create mock Express request and response objects
const mockRequest = (body = {}, params = {}, query = {}) => ({
  body,
  params,
  query,
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Auth Controller', () => {
  // Clear all mocks before each test to ensure a clean slate
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Registration Tests ---
  describe('register', () => {
    it('should register a new patient successfully', async () => {
      const req = mockRequest({
        name: 'Jane Doe',
        email: 'jane.doe@test.com',
        password: 'password123',
        userType: 'PATIENT',
      });
      const res = mockResponse();

      // Mock database calls
      User.findOne.mockResolvedValue(null); // No existing user
      User.create.mockResolvedValue({
        _id: 'patient123',
        name: 'Jane Doe',
        email: 'jane.doe@test.com',
        userType: 'PATIENT',
        status: 'ACTIVE',
      });
      jwt.sign.mockReturnValue('fake_jwt_token');

      await register(req, res);

      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
        email: 'jane.doe@test.com',
        userType: 'PATIENT',
        status: 'ACTIVE',
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'User registered successfully',
      }));
    });

    it('should fail registration if email already exists', async () => {
      const req = mockRequest({
        name: 'Jane Doe',
        email: 'jane.doe@test.com',
        password: 'password123',
        userType: 'PATIENT',
      });
      const res = mockResponse();

      User.findOne.mockResolvedValue({ email: 'jane.doe@test.com' }); // User exists

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User with this email already exists',
      });
    });

    it('should fail registration if pharmacy license number already exists', async () => {
        const req = mockRequest({
          businessName: 'Test Pharmacy',
          email: 'pharmacy@test.com',
          password: 'password123',
          userType: 'PHARMACY',
          licenseNumber: 'PH12345',
        });
        const res = mockResponse();
  
        // First findOne is for email (null), second is for license (exists)
        User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ licenseNumber: 'PH12345' });
  
        await register(req, res);
  
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Pharmacy with this license number already exists',
        });
    });
  });

  // --- Login Tests ---
  describe('login', () => {
    it('should log in a user with correct credentials', async () => {
      const req = mockRequest({ email: 'jane.doe@test.com', password: 'password123' });
      const res = mockResponse();

      const mockUser = {
        _id: 'patient123',
        email: 'jane.doe@test.com',
        status: 'ACTIVE',
        matchPassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: 'patient123', email: 'jane.doe@test.com' }),
      };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      jwt.sign.mockReturnValue('fake_jwt_token');

      await login(req, res);

      expect(mockUser.matchPassword).toHaveBeenCalledWith('password123');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Login successful',
      }));
    });

    it('should fail login with incorrect password', async () => {
        const req = mockRequest({ email: 'jane.doe@test.com', password: 'wrongpassword' });
        const res = mockResponse();
  
        const mockUser = {
          matchPassword: jest.fn().mockResolvedValue(false), // Password does not match
        };
        User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
  
        await login(req, res);
  
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Invalid email or password',
        });
    });

    it('should fail login if user does not exist', async () => {
        const req = mockRequest({ email: 'nonexistent@test.com', password: 'password123' });
        const res = mockResponse();
  
        User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) }); // User not found
  
        await login(req, res);
  
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Invalid email or password',
        });
    });

    it('should fail login if account is suspended', async () => {
        const req = mockRequest({ email: 'suspended@test.com', password: 'password123' });
        const res = mockResponse();
  
        const mockUser = {
          status: 'SUSPENDED',
          matchPassword: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
  
        await login(req, res);
  
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Your account has been suspended. Please contact support.',
        });
    });
  });
});
