/* eslint-disable no-undef */

// Mock dependencies before they are imported
jest.mock('../../models/User');

const User = require('../../models/User');
// Assuming getPharmacies will be in pharmacyController
const { getPharmacies } = require('../userController');

// Helper to create mock Express request and response objects
const mockRequest = (query = {}) => ({
  query,
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Pharmacy Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPharmacies', () => {
    it('should retrieve all pharmacies successfully', async () => {
      const req = mockRequest();
      const res = mockResponse();

      const mockPharmacies = [
        { _id: 'pharm1', businessName: 'HealthPlus', userType: 'PHARMACY' },
        { _id: 'pharm2', businessName: 'MediCare', userType: 'PHARMACY' },
      ];

      User.find.mockResolvedValue(mockPharmacies);

      await getPharmacies(req, res);

      expect(User.find).toHaveBeenCalledWith({ userType: 'PHARMACY' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockPharmacies,
      });
    });

    it('should return 500 if there is a server error', async () => {
      const req = mockRequest();
      const res = mockResponse();

      const error = new Error('Database connection failed');
      User.find.mockRejectedValue(error);

      await getPharmacies(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error',
      });
    });
  });
});