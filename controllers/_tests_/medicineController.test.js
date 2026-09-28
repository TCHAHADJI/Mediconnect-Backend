/* eslint-disable no-undef */

// Mock dependencies before they are imported
jest.mock('../../models/Medicine');
jest.mock('../../models/Inventory');
jest.mock('../../models/MedicineAlternative');
jest.mock('../../models/AuditLog');

const Medicine = require('../../models/Medicine');
const Inventory = require('../../models/Inventory');
const MedicineAlternative = require('../../models/MedicineAlternative');
const AuditLog = require('../../models/AuditLog');
const { createMedicine, getMedicineById } = require('../medicineController');

// Helper to create mock Express request and response objects
const mockRequest = (body = {}, user = {}, ip = '127.0.0.1', params = {}) => ({
  body,
  user,
  ip,
  params,
  get: jest.fn((header) => {
    if (header === 'User-Agent') return 'Test User-Agent';
    return undefined;
  }),
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Medicine Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createMedicine', () => {
    it('should create a new medicine and log the audit successfully', async () => {
      const medicineData = {
        name: 'Paracetamol',
        genericName: 'Acetaminophen',
        brand: 'Panadol',
        category: 'Painkiller',
        form: 'Tablet',
        strength: '500mg',
        barcode: '1234567890123',
      };
      const mockUser = { id: 'admin123' };
      const req = mockRequest(medicineData, mockUser);
      const res = mockResponse();

      const createdMedicine = { _id: 'med123', ...medicineData };
      Medicine.create.mockResolvedValue(createdMedicine);
      AuditLog.create.mockResolvedValue({});

      await createMedicine(req, res);

      expect(Medicine.create).toHaveBeenCalledWith(medicineData);
      expect(AuditLog.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        action: 'CREATE',
        resource: 'Medicine',
        resourceId: createdMedicine._id,
        details: { name: createdMedicine.name },
        ipAddress: req.ip,
        userAgent: 'Test User-Agent',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Medicine created successfully',
        data: createdMedicine,
      });
    });

    it('should return 409 if a medicine with a unique field already exists', async () => {
      const medicineData = { name: 'Ibuprofen', barcode: '987654321' };
      const req = mockRequest(medicineData, { id: 'admin123' });
      const res = mockResponse();

      const error = new Error('Duplicate key');
      error.code = 11000;
      Medicine.create.mockRejectedValue(error);

      await createMedicine(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'A medicine with the same unique field (e.g., barcode) already exists.',
      });
    });

    it('should return 500 for other database errors', async () => {
      const medicineData = { name: 'Aspirin' };
      const req = mockRequest(medicineData, { id: 'admin123' });
      const res = mockResponse();

      const error = new Error('Something went wrong');
      Medicine.create.mockRejectedValue(error);

      await createMedicine(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to create medicine',
      }));
    });
  });

  describe('getMedicineById', () => {
    it('should return medicine details with inventory and alternatives successfully', async () => {
      const medicineId = 'med123';
      const req = mockRequest({}, {}, '127.0.0.1', { id: medicineId });
      const res = mockResponse();

      const mockMedicine = {
        _id: medicineId,
        name: 'Paracetamol',
        toObject: () => ({ _id: medicineId, name: 'Paracetamol' }),
      };

      const mockInventory = [
        {
          price: 5.99,
          quantity: 100,
          pharmacyId: {
            businessName: 'HealthPlus',
            businessAddress: '123 Main St',
            latitude: 1.23,
            longitude: 4.56,
            phone: '123-456-7890',
            operatingHours: '9-5',
          },
        },
      ];

      const mockAlternatives = [
        {
          alternativeId: {
            _id: 'alt123',
            name: 'Tylenol',
            toObject: () => ({ _id: 'alt123', name: 'Tylenol' }),
          },
        },
      ];

      Medicine.findById.mockResolvedValue(mockMedicine);
      // Mock the chained Mongoose query methods
      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockInventory),
      };
      Inventory.find.mockReturnValue(mockQuery);
      MedicineAlternative.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockAlternatives),
      });

      await getMedicineById(req, res);

      expect(Medicine.findById).toHaveBeenCalledWith(medicineId);
      expect(Inventory.find).toHaveBeenCalledWith({ medicineId, quantity: { $gt: 0 } });
      expect(res.status).not.toHaveBeenCalled(); // Should be 200 by default
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          name: 'Paracetamol',
          isAvailable: true,
          pharmacies: expect.any(Array),
          alternatives: expect.any(Array),
        }),
      }));
      expect(res.json.mock.calls[0][0].data.pharmacies[0].name).toBe('HealthPlus');
      expect(res.json.mock.calls[0][0].data.alternatives[0].name).toBe('Tylenol');
    });

    it('should return 404 if medicine is not found', async () => {
      const req = mockRequest({}, {}, '127.0.0.1', { id: 'nonexistent' });
      const res = mockResponse();

      Medicine.findById.mockResolvedValue(null);

      await getMedicineById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Medicine not found' });
    });

    it('should return 500 for a server error', async () => {
      const req = mockRequest({}, {}, '127.0.0.1', { id: 'med123' });
      const res = mockResponse();

      Medicine.findById.mockRejectedValue(new Error('Database error'));

      await getMedicineById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Failed to fetch medicine details' }));
    });
  });
});