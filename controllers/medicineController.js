const Medicine = require('../models/Medicine');
const Inventory = require('../models/Inventory');
const User = require('../models/User'); // Assuming User model is needed for pharmacy details
const mongoose = require('mongoose');
const MedicineAlternative = require('../models/MedicineAlternative');
const AuditLog = require('../models/AuditLog');

// Get all medicines with search and filtering
const getMedicines = async (req, res) => {
  try {
    const {
      search,
      category,
      form,
      requiresPrescription,
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // 1. Build the initial match stage for the aggregation pipeline
    const matchStage = {};

    if (search) {
      // Search by either the specific medicine name or the generic name
      matchStage['$or'] = [
        { 'medicineDetails.name': { $regex: search, $options: 'i' } },
        { 'medicineDetails.genericName': { $regex: search, $options: 'i' } }
      ];
    }
    if (category) {
      matchStage['medicineDetails.category'] = { $regex: category, $options: 'i' };
    }
    if (form) {
      matchStage['medicineDetails.form'] = { $regex: form, $options: 'i' };
    }
    if (requiresPrescription !== undefined) {
      matchStage['medicineDetails.requiresPrescription'] = requiresPrescription === 'true';
    }

    // 2. Aggregation Pipeline
    const aggregation = [
      // Find inventory for active pharmacies
      {
        $lookup: {
          from: 'users',
          localField: 'pharmacyId',
          foreignField: '_id',
          as: 'pharmacyDetails'
        }
      },
      { $unwind: '$pharmacyDetails' },
      { $match: { 'pharmacyDetails.status': 'ACTIVE' } },
      // Find medicine details
      {
        $lookup: {
          from: 'medicines',
          localField: 'medicineId',
          foreignField: '_id',
          as: 'medicineDetails'
        }
      },
      { $unwind: '$medicineDetails' },
      // Apply search filters
      { $match: matchStage },
      // Group by medicine
      {
        $group: {
          _id: { 
            genericName: '$medicineDetails.genericName', 
            form: '$medicineDetails.form' 
          },
          // We take the first document as a representative for this group
          medicineDoc: { $first: '$medicineDetails' }, 
          inventory: { $push: '$$ROOT' }
        }
      },
      // Pagination
      { $skip: skip },
      { $limit: limitNum },
      // Final projection
      {
        $project: {
          ...Object.fromEntries(Object.keys(Medicine.schema.paths).map(path => [path, `$medicineDoc.${path}`])),
          inventory: '$inventory'
        }
      }
    ];

    const medicinesWithDetails = await Inventory.aggregate(aggregation);

    // We need a separate query to get the total count for pagination
    const totalPipeline = aggregation.slice(0, -3); // Remove skip, limit, and project
    totalPipeline.push({ $count: 'total' });
    const totalResult = await Inventory.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    res.json({
      success: true,
      data: {
        medicines: medicinesWithDetails,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Get medicines error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicines',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get medicine by ID
const getMedicineById = async (req, res) => {
  try {
    const { id } = req.params;

    const medicine = await Medicine.findById(id);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    const inventory = await Inventory.find({
      medicineId: medicine._id,
      quantity: { $gt: 0 }
    }).populate('pharmacyId', 'businessName businessAddress latitude longitude phone operatingHours verificationStatus').sort({ price: 1 });

    const alternatives = await MedicineAlternative.find({ mainMedicineId: medicine._id })
      .populate('alternativeId');

    // Add availability and pricing info
    const medicineWithDetails = {
      ...medicine.toObject(),
      isAvailable: inventory.length > 0,
      pharmacies: inventory.map(inv => ({
        name: inv.pharmacyId.businessName,
        location: inv.pharmacyId.businessAddress,
        latitude: inv.pharmacyId.latitude,
        longitude: inv.pharmacyId.longitude,
        price: inv.price,
        stock: inv.quantity,
        phone: inv.pharmacyId.phone,
        rating: 4.5, // Mocked
        hours: inv.pharmacyId.operatingHours || 'N/A',
      })),
      alternatives: alternatives.map(alt => alt.alternativeId.toObject())
    };

    res.json({
      success: true,
      data: medicineWithDetails
    });

  } catch (error) {
    console.error('Get medicine by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicine details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create new medicine (Admin only)
const createMedicine = async (req, res) => {
  try {
    const medicineData = req.body;

    const medicine = await Medicine.create(medicineData);

    // Log audit
    await AuditLog.create({
      userId: req.user?.id,
      action: 'CREATE',
      resource: 'Medicine',
      resourceId: medicine._id,
      details: { name: medicine.name },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Medicine created successfully',
      data: medicine
    });

  } catch (error) {
    console.error('Create medicine error:', error);

    // Handle duplicate key error (e.g., for unique barcode)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A medicine with the same unique field (e.g., barcode) already exists.',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create medicine',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update medicine (Admin only)
const updateMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const medicine = await Medicine.findByIdAndUpdate(id, updateData, { new: true });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    // Log audit
    await AuditLog.create({
      userId: req.user?.id,
      action: 'UPDATE',
      resource: 'Medicine',
      resourceId: medicine._id,
      details: updateData,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Medicine updated successfully',
      data: medicine
    });

  } catch (error) {
    console.error('Update medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update medicine',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get medicine categories
const getCategories = async (req, res) => {
  try {
    const categories = await Medicine.distinct('category', { category: { $ne: null } });

    const categoryList = categories
      .filter(category => category)
      .sort();

    res.json({
      success: true,
      data: categoryList
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Search medicine alternatives
const searchAlternatives = async (req, res) => {
  try {
    const { medicineId } = req.params;

    const medicine = await Medicine.findById(medicineId);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    const alternatives = await MedicineAlternative.find({ mainMedicineId: medicine._id })
      .populate({
        path: 'alternativeId',
        populate: {
          path: 'inventory',
          match: { quantity: { $gt: 0 }, status: 'IN_STOCK' },
          populate: {
            path: 'pharmacyId',
            select: 'businessName businessAddress verificationStatus'
          }
        }
      });

    const formattedAlternatives = alternatives.map(alt => ({
      ...alt.alternativeId.toObject(),
      reason: alt.reason,
      isAvailable: alt.alternativeId.inventory.length > 0,
      availableAtPharmacies: alt.alternativeId.inventory.length,
      lowestPrice: alt.alternativeId.inventory.length > 0 
        ? Math.min(...alt.alternativeId.inventory.map(inv => inv.price))
        : null
    }));

    res.json({
      success: true,
      data: {
        medicine: {
          id: medicine._id,
          name: medicine.name,
          genericName: medicine.genericName
        },
        alternatives: formattedAlternatives
      }
    });

  } catch (error) {
    console.error('Search alternatives error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicine alternatives',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// Delete medicine (Admin only)
const deleteMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const medicine = await Medicine.findById(id);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    // Also delete inventory items associated with this medicine
    await Inventory.deleteMany({ medicineId: id });
    
    // Also delete medicine alternatives associated with this medicine
    await MedicineAlternative.deleteMany({ mainMedicineId: id });
    await MedicineAlternative.deleteMany({ alternativeId: id });

    await Medicine.findByIdAndDelete(id);

    // Log audit
    await AuditLog.create({
      userId: req.user?.id,
      action: 'DELETE',
      resource: 'Medicine',
      resourceId: id,
      details: { name: medicine.name },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Medicine and associated inventory deleted successfully'
    });

  } catch (error) {
    console.error('Delete medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete medicine',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  getCategories,
  searchAlternatives,
  deleteMedicine
};