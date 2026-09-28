const mongoose = require('mongoose');

const SystemAnalyticsSchema = new mongoose.Schema({
  snapshotType: {
    type: String,
    enum: ['SCHEDULED_DAILY', 'MANUAL_ADMIN_SNAPSHOT', 'REALTIME_AGGREGATION', 'EXPORT_ARCHIVE'],
    default: 'MANUAL_ADMIN_SNAPSHOT',
    index: true,
  },
  capturedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  capturedByName: {
    type: String,
    default: 'MediConnect Automated Daemon',
    trim: true,
  },
  period: {
    type: String,
    enum: ['realtime', '7days', '30days', '3months', '1year'],
    default: '30days',
  },
  summary: {
    totalUsers: { type: Number, default: 0 },
    patients: { type: Number, default: 0 },
    pharmacies: { type: Number, default: 0 },
    onDutyPharmacies: { type: Number, default: 0 },
    healthAuthorities: { type: Number, default: 0 },
    admins: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },

    // Pharmaceutical & Inventory Telemetry
    masterMedicines: { type: Number, default: 0 },
    inventoryBatches: { type: Number, default: 0 },
    totalStockUnits: { type: Number, default: 0 },
    totalStockValueXaf: { type: Number, default: 0 }, // Value in FCFA
    avgMedicinePriceXaf: { type: Number, default: 0 },
    lowStockAlerts: { type: Number, default: 0 },
    outOfStockCount: { type: Number, default: 0 },

    // Public Health & MINSANTÉ / ONPC Regulatory Metrics
    publicHealthCampaigns: { type: Number, default: 0 },
    activeCampaigns: { type: Number, default: 0 },
    publicHealthAlerts: { type: Number, default: 0 },
    epidemiologicalSignals: { type: Number, default: 0 },
    batchRecalls: { type: Number, default: 0 },
    healthTipsTotal: { type: Number, default: 0 },
    healthTipsApproved: { type: Number, default: 0 },
    healthTipsPending: { type: Number, default: 0 },
    healthTipsRejected: { type: Number, default: 0 },

    // Clinical & Telehealth Engagement
    totalPrescriptions: { type: Number, default: 0 },
    activePillReminders: { type: Number, default: 0 },
    totalMessages: { type: Number, default: 0 },

    // Compliance & System Performance
    totalAuditLogs: { type: Number, default: 0 },
    last24hAuditLogs: { type: Number, default: 0 },
  },
  regionalDistribution: [
    {
      region: { type: String, required: true },
      pharmacies: { type: Number, default: 0 },
      patients: { type: Number, default: 0 },
      totalUsers: { type: Number, default: 0 },
      onDutyPharmacies: { type: Number, default: 0 },
      activeCampaigns: { type: Number, default: 0 },
    }
  ],
  categoryDistribution: [
    {
      category: { type: String, required: true },
      medicineCount: { type: Number, default: 0 },
      stockUnits: { type: Number, default: 0 },
      totalValueXaf: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
    }
  ],
  userGrowthTrend: [
    {
      month: { type: String, required: true },
      patients: { type: Number, default: 0 },
      pharmacies: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    }
  ],
  activityTrend: [
    {
      day: { type: String, required: true },
      searches: { type: Number, default: 0 },
      messages: { type: Number, default: 0 },
      audits: { type: Number, default: 0 },
      registrations: { type: Number, default: 0 },
    }
  ],
  systemHealth: {
    dbStatus: { type: String, default: 'CONNECTED' },
    dbLatencyMs: { type: Number, default: 12 },
    uptimeSeconds: { type: Number, default: 0 },
    memoryUsageMb: { type: Number, default: 0 },
    errorRatePercent: { type: Number, default: 0.1 },
    environment: { type: String, default: 'production' },
  },
  notes: {
    type: String,
    default: 'MediConnect platform telemetry captured and verified.',
    trim: true,
  },
}, {
  timestamps: true,
});

SystemAnalyticsSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SystemAnalytics', SystemAnalyticsSchema);
