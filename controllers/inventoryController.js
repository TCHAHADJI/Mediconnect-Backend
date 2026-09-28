const Inventory = require('../models/Inventory');
const Medicine = require('../models/Medicine');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');

// Get pharmacy inventory
const getInventory = async (req, res) => {
  try {
    const {
      search,
      category,
      status,
      lowStock,
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = parseInt(page, 10);
    const parsedLimit = parseInt(limit);
    const skip = (pageNum - 1) * parsedLimit;

    // --- Refactor to Aggregation Pipeline ---
    const pipeline = [];

    // 1. Match inventory for the current pharmacy
    pipeline.push({ $match: { pharmacyId: new mongoose.Types.ObjectId(req.user.id) } });

    // 2. Lookup medicine details
    pipeline.push({
      $lookup: {
        from: 'medicines',
        localField: 'medicineId',
        foreignField: '_id',
        as: 'medicineDetails'
      }
    });

    // 3. Unwind the medicineDetails array
    pipeline.push({ $unwind: '$medicineDetails' });

    // 4. Build the match stage for filtering based on query params
    const filterStage = {};
    if (status) {
      filterStage.status = status;
    }
    if (search) {
      filterStage['$or'] = [
        { 'medicineDetails.name': { $regex: search, $options: 'i' } },
        { 'medicineDetails.genericName': { $regex: search, $options: 'i' } },
        { 'medicineDetails.brand': { $regex: search, $options: 'i' } }
      ];
    }
    if (category) {
      filterStage['medicineDetails.category'] = { $regex: category, $options: 'i' };
    }
    if (lowStock === 'true') {
      filterStage['$expr'] = { $lte: ['$quantity', '$lowStockThreshold'] };
    }
    if (Object.keys(filterStage).length > 0) {
      pipeline.push({ $match: filterStage });
    }

    // 5. Create a facet for getting both paginated data and total count in one query
    const facetPipeline = {
      $facet: {
        inventory: [
          { $sort: { updatedAt: -1 } },
          { $skip: skip },
          { $limit: parsedLimit },
          // Reshape the data to match the old format
          {
            $project: {
              _id: 1, pharmacyId: 1, quantity: 1, price: 1, status: 1, expiryDate: 1,
              batchNumber: 1, lowStockThreshold: 1, createdAt: 1, updatedAt: 1,
              medicineId: '$medicineDetails' // Embed medicine details
            }
          }
        ],
        total: [{ $count: 'count' }]
      }
    };
    pipeline.push(facetPipeline);

    const results = await Inventory.aggregate(pipeline);
    const filteredInventory = results[0].inventory;
    const total = results[0].total.length > 0 ? results[0].total[0].count : 0;

    const inventoryWithStatus = filteredInventory.map(item => ({
      ...item,
      isLowStock: item.quantity <= item.lowStockThreshold,
      isExpired: item.expiryDate ? new Date(item.expiryDate) < new Date() : false,
      daysUntilExpiry: item.expiryDate 
        ? Math.ceil((new Date(item.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
        : null
    }));

    res.json({
      success: true,
      data: {
        inventory: inventoryWithStatus,
        pagination: {
          page: pageNum,
          limit: parsedLimit,
          total,
          pages: Math.ceil(total / parsedLimit)
        }
      }
    });

  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Add medicine to inventory
const addInventoryItem = async (req, res) => {
  try {
    const { medicineId, quantity, price, expiryDate, batchNumber, lowStockThreshold } = req.body;

    // Check if medicine exists
    const medicine = await Medicine.findById(medicineId);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    // Check if inventory item already exists
    const existingItem = await Inventory.findOne({
      pharmacyId: req.user.id,
      medicineId
    });

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Medicine already exists in inventory. Use update endpoint to modify.'
      });
    }

    // Determine status based on quantity
    let status = 'IN_STOCK';
    if (quantity === 0) {
      status = 'OUT_OF_STOCK';
    } else if (quantity <= (lowStockThreshold || 10)) {
      status = 'LOW_STOCK';
    }

    const inventoryData = {
      pharmacyId: req.user.id,
      medicineId,
      quantity,
      price,
      status,
      lowStockThreshold: lowStockThreshold || 10
    };

    if (expiryDate) {
      inventoryData.expiryDate = new Date(expiryDate);
    }

    if (batchNumber) {
      inventoryData.batchNumber = batchNumber;
    }

    const inventoryItem = await Inventory.create(inventoryData);

    // Populate medicine details for response
    await inventoryItem.populate('medicineId', 'id name genericName brand form category');

    // Create notification for low stock if applicable
    if (status === 'LOW_STOCK') {
      await Notification.create({
        userId: req.user.id,
        type: 'STOCK_UPDATE',
        title: 'Low Stock Alert',
        message: `${medicine.name} is running low (${quantity} remaining)`,
        data: { medicineId, inventoryId: inventoryItem._id }
      });
    }

    // Log audit
    await AuditLog.create({
      userId: req.user.id,
      action: 'CREATE',
      resource: 'Inventory',
      resourceId: inventoryItem._id,
      details: { medicineName: medicine.name, quantity, price },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Medicine added to inventory successfully',
      data: inventoryItem
    });

  } catch (error) {
    console.error('Add inventory item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add medicine to inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update inventory item
const updateInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, price, expiryDate, batchNumber, lowStockThreshold, status } = req.body;

    // Check if inventory item exists and belongs to pharmacy
    const existingItem = await Inventory.findOne({
      _id: id,
      pharmacyId: req.user.id
    }).populate('medicine', 'name');

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    const updateData = {};

    if (quantity !== undefined) {
      updateData.quantity = quantity;
      
      // Auto-update status based on quantity
      if (quantity === 0) {
        updateData.status = 'OUT_OF_STOCK';
      } else if (quantity <= (lowStockThreshold || existingItem.lowStockThreshold)) {
        updateData.status = 'LOW_STOCK';
      } else {
        updateData.status = 'IN_STOCK';
      }
    }

    if (price !== undefined) updateData.price = price;
    if (expiryDate !== undefined) updateData.expiryDate = new Date(expiryDate);
    if (batchNumber !== undefined) updateData.batchNumber = batchNumber;
    if (lowStockThreshold !== undefined) updateData.lowStockThreshold = lowStockThreshold;
    if (status !== undefined) updateData.status = status;

    const updatedItem = await Inventory.findByIdAndUpdate(id, updateData, { new: true }).populate('medicine', 'id name genericName brand form category');

    // Create notification for status changes
    if (updateData.status && updateData.status !== existingItem.status) {
      let notificationMessage = '';
      
      if (updateData.status === 'LOW_STOCK') {
        notificationMessage = `${existingItem.medicine.name} is now low in stock`;
      } else if (updateData.status === 'OUT_OF_STOCK') {
        notificationMessage = `${existingItem.medicine.name} is now out of stock`;
      } else if (updateData.status === 'IN_STOCK' && existingItem.status !== 'IN_STOCK') {
        notificationMessage = `${existingItem.medicine.name} is back in stock`;
      }

      if (notificationMessage) {
        await Notification.create({
          userId: req.user.id,
          type: 'STOCK_UPDATE',
          title: 'Stock Status Update',
          message: notificationMessage,
          data: { medicineId: existingItem.medicine._id, inventoryId: id }
        });
      }
    }

    // Log audit
    await AuditLog.create({
      userId: req.user.id,
      action: 'UPDATE',
      resource: 'Inventory',
      resourceId: id,
      details: { 
          medicineName: existingItem.medicine.name,
          changes: updateData 
        },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Inventory updated successfully',
      data: updatedItem
    });

  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete inventory item
const deleteInventoryItem = async (req, res) => {
  try { 
    const { id } = req.params;  

    // Use findOneAndDelete to ensure the item belongs to the pharmacy and delete it atomically, which is more secure and efficient.
    const deletedItem = await Inventory.findOneAndDelete({
      _id: id,
      pharmacyId: req.user.id
    }).populate('medicineId', 'name'); // Populate the medicine details for the audit log

    if (!deletedItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    // Log audit
    await AuditLog.create({
      userId: req.user.id,
      action: 'DELETE',
      resource: 'Inventory',
      resourceId: id,
      details: { medicineName: deletedItem.medicineId.name },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Medicine removed from inventory successfully'
    });

  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove medicine from inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get inventory statistics
const getInventoryStats = async (req, res) => {
  try {
    const pharmacyId = new mongoose.Types.ObjectId(req.user.id);

    const totalItems = await Inventory.countDocuments({ pharmacyId });

    const statusBreakdown = await Inventory.aggregate([
      { $match: { pharmacyId: pharmacyId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } }
    ]);

    const lowStockItems = await Inventory.countDocuments({
      pharmacyId,
      $expr: { $lte: ['$quantity', '$lowStockThreshold'] }
    });

    const expiredItems = await Inventory.countDocuments({
      pharmacyId,
      expiryDate: { $lt: new Date() }
    });

    const expiringItems = await Inventory.countDocuments({
      pharmacyId,
      expiryDate: {
        $gte: new Date(),
        $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });

    const totalValueResult = await Inventory.aggregate([
      { $match: { pharmacyId: pharmacyId } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);

    const totalValue = totalValueResult.length > 0 ? totalValueResult[0].total : 0;

    const statusStats = {
      IN_STOCK: 0,
      LOW_STOCK: 0,
      OUT_OF_STOCK: 0,
      DISCONTINUED: 0
    };

    statusBreakdown.forEach(stat => {
      statusStats[stat.status] = stat.count;
    });

    res.json({
      success: true,
      data: {
        totalItems,
        statusBreakdown: statusStats,
        lowStockItems,
        expiredItems,
        expiringItems,
        totalValue
      }
    });

  } catch (error) {
    console.error('Get inventory stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryStats
};