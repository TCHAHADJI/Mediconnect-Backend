const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

// Auth validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).max(100).required(),
  userType: Joi.string().valid('PATIENT', 'PHARMACY', 'ADMIN', 'HEALTH_AUTHORITY').required(),
  phone: Joi.string().optional(),
  
  // Patient fields
  dateOfBirth: Joi.date().when('userType', {
    is: 'PATIENT',
    then: Joi.optional(),
    otherwise: Joi.forbidden()
  }),
  address: Joi.string().when('userType', {
    is: 'PATIENT',
    then: Joi.optional(),
    otherwise: Joi.forbidden()
  }),
  
  // Pharmacy fields
  licenseNumber: Joi.string().when('userType', {
    is: 'PHARMACY',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  businessName: Joi.string().when('userType', {
    is: 'PHARMACY',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  businessAddress: Joi.string().when('userType', {
    is: 'PHARMACY',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  latitude: Joi.number().when('userType', {
    is: 'PHARMACY',
    then: Joi.optional(),
    otherwise: Joi.forbidden()
  }),
  longitude: Joi.number().when('userType', {
    is: 'PHARMACY',
    then: Joi.optional(),
    otherwise: Joi.forbidden()
  }),
  operatingHours: Joi.string().when('userType', {
    is: 'PHARMACY',
    then: Joi.optional().allow(''),
    otherwise: Joi.forbidden()
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  mfaCode: Joi.string().optional().allow(''),
  expectedUserType: Joi.string().optional().allow('')
});

// Medicine validation schemas
const medicineSchema = Joi.object({
  name: Joi.string().required(),
  genericName: Joi.string().optional().allow(''),
  brand: Joi.string().optional().allow(''),
  description: Joi.string().optional().allow(''),
  dosage: Joi.string().optional().allow(''),
  form: Joi.string().optional().allow(''),
  category: Joi.string().optional().allow(''),
  activeIngredient: Joi.string().optional().allow(''),
  sideEffects: Joi.string().optional().allow(''),
  contraindications: Joi.string().optional().allow(''),
  instructions: Joi.string().optional().allow(''),
  requiresPrescription: Joi.boolean().optional(),
  barcode: Joi.string().optional().allow('')
});

const updateMedicineSchema = Joi.object({
  name: Joi.string().optional(),
  genericName: Joi.string().optional().allow(''),
  brand: Joi.string().optional().allow(''),
  description: Joi.string().optional().allow(''),
  dosage: Joi.string().optional().allow(''),
  form: Joi.string().optional().allow(''),
  category: Joi.string().optional().allow(''),
  activeIngredient: Joi.string().optional().allow(''),
  sideEffects: Joi.string().optional().allow(''),
  contraindications: Joi.string().optional().allow(''),
  instructions: Joi.string().optional().allow(''),
  requiresPrescription: Joi.boolean().optional(),
  barcode: Joi.string().optional().allow(''),
  image: Joi.string().optional().allow('')
}).unknown(true);

// Inventory validation schemas
const inventorySchema = Joi.object({
  medicineId: Joi.string().required(),
  quantity: Joi.number().integer().min(0).required(),
  price: Joi.number().min(0).required(),
  expiryDate: Joi.date().optional(),
  batchNumber: Joi.string().optional().allow(''),
  lowStockThreshold: Joi.number().integer().min(0).optional()
}).unknown(true);

const updateInventorySchema = Joi.object({
  quantity: Joi.number().integer().min(0).optional(),
  price: Joi.number().positive().optional(),
  expiryDate: Joi.date().optional(),
  batchNumber: Joi.string().optional(),
  lowStockThreshold: Joi.number().integer().min(0).optional(),
  status: Joi.string().valid('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED').optional()
});

// Message validation schemas
const messageSchema = Joi.object({
  receiverId: Joi.string().required(),
  content: Joi.string().required(),
  conversationId: Joi.string().optional()
});

// Health tip validation schemas
const healthTipSchema = Joi.object({
  title: Joi.string().required(),
  content: Joi.string().required(),
  category: Joi.string().required(),
  author: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

// User profile validation schemas
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  phone: Joi.string().optional(),
  address: Joi.string().optional(),
  businessName: Joi.string().optional(),
  businessAddress: Joi.string().optional(),
  operatingHours: Joi.object().optional()
});

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  medicineSchema,
  inventorySchema,
  updateInventorySchema,
  messageSchema,
  healthTipSchema,
  updateProfileSchema,
  updateMedicineSchema
};