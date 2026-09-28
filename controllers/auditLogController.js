const mongoose = require('mongoose');
require('../models/User'); // Ensure User schema is loaded for population
const AuditLog = require('../models/AuditLog');

/**
 * @desc    Get all audit logs with pagination, search, and filtering
 * @route   GET /api/audit-logs
 * @access  Private / Admin
 */
const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const { search, action, resource, startDate, endDate } = req.query;

    const query = {};

    if (action && action !== 'ALL' && action !== 'all') {
      query.action = action;
    }

    if (resource && resource !== 'ALL' && resource !== 'all') {
      query.resource = resource;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Search query matching action, resource, details text, or IP
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { action: searchRegex },
        { resource: searchRegex },
        { ipAddress: searchRegex },
        { 'details.title': searchRegex },
        { 'details.name': searchRegex },
        { 'details.medicineName': searchRegex },
        { 'details.notes': searchRegex }
      ];
    }

    const [totalMatching, logs, availableActions, availableResources] = await Promise.all([
      AuditLog.countDocuments(query),
      AuditLog.find(query)
        .populate('userId', 'name email userType role organization businessName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.distinct('action'),
      AuditLog.distinct('resource')
    ]);

    // Calculate aggregated statistics
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalAllTime, last24hCount, uniqueUsersList] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.countDocuments({ createdAt: { $gte: oneDayAgo } }),
      AuditLog.distinct('userId')
    ]);

    // Safe formatting for logs (handle deleted users, null references)
    const formattedLogs = logs.map(log => ({
      _id: log._id,
      id: log._id.toString(),
      timestamp: log.createdAt,
      createdAt: log.createdAt,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId ? log.resourceId.toString() : null,
      details: log.details || {},
      ipAddress: log.ipAddress || '127.0.0.1',
      userAgent: log.userAgent || 'Web Client',
      user: log.userId ? {
        id: log.userId._id ? log.userId._id.toString() : null,
        name: log.userId.name || 'Unknown User',
        email: log.userId.email || 'N/A',
        userType: log.userId.userType || 'UNKNOWN',
        organization: log.userId.organization || null,
        businessName: log.userId.businessName || null
      } : {
        id: null,
        name: 'System / Background Service',
        email: 'system@mediconnect.cm',
        userType: 'SYSTEM'
      }
    }));

    res.json({
      success: true,
      data: {
        logs: formattedLogs,
        pagination: {
          page,
          limit,
          totalLogs: totalMatching,
          totalPages: Math.max(1, Math.ceil(totalMatching / limit))
        },
        stats: {
          totalEvents: totalAllTime,
          filteredCount: totalMatching,
          last24hEvents: last24hCount,
          uniqueUsers: uniqueUsersList.length,
          clearanceEvents: logs.filter(l => l.action?.includes('APPROVE') || l.action?.includes('REJECT') || l.action?.includes('CLEARANCE')).length
        },
        availableActions: availableActions.filter(Boolean),
        availableResources: availableResources.filter(Boolean)
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit logs from database',
      error: error.message
    });
  }
};

/**
 * @desc    Export audit logs in CSV or JSON format
 * @route   GET /api/audit-logs/export
 * @access  Private / Admin
 */
const exportAuditLogs = async (req, res) => {
  try {
    const { format = 'json', action, resource, search } = req.query;
    const query = {};

    if (action && action !== 'ALL' && action !== 'all') query.action = action;
    if (resource && resource !== 'ALL' && resource !== 'all') query.resource = resource;

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { action: regex },
        { resource: regex },
        { 'details.title': regex },
        { 'details.name': regex }
      ];
    }

    const logs = await AuditLog.find(query)
      .populate('userId', 'name email userType')
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean();

    if (format === 'csv') {
      const csvHeader = 'Log ID,Timestamp,User Name,User Email,User Type,Action,Resource,Details,IP Address\n';
      const csvRows = logs.map(l => {
        const userName = `"${(l.userId?.name || 'System').replace(/"/g, '""')}"`;
        const userEmail = `"${(l.userId?.email || 'N/A').replace(/"/g, '""')}"`;
        const userType = `"${(l.userId?.userType || 'SYSTEM').replace(/"/g, '""')}"`;
        const actionStr = `"${(l.action || '').replace(/"/g, '""')}"`;
        const resourceStr = `"${(l.resource || '').replace(/"/g, '""')}"`;
        const detailsStr = `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`;
        const ipStr = `"${(l.ipAddress || '').replace(/"/g, '""')}"`;
        return `"${l._id}","${new Date(l.createdAt).toISOString()}",${userName},${userEmail},${userType},${actionStr},${resourceStr},${detailsStr},${ipStr}`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="mediconnect_audit_logs_${Date.now()}.csv"`);
      return res.status(200).send(csvHeader + csvRows);
    }

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export audit logs',
      error: error.message
    });
  }
};

module.exports = {
  getAuditLogs,
  exportAuditLogs
};
