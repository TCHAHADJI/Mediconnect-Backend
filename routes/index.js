const authRoutes = require('./auth');
const inventoryRoutes = require('./inventory');
const medicineRoutes = require('./medicines');
const healthTipRoutes = require('./healthTip');
const statsRoutes = require('./stats');
const userRoutes = require('./user');
const masterCatalogueRoutes = require('./masterCatalogue');
const inventorySyncRoutes = require('./inventorySync');
const healthAuthorityRoutes = require('./healthAuthority');
const messageRoutes = require('./messageRoutes');
const reminderRoutes = require('./reminderRoutes');
const prescriptionRoutes = require('./prescriptionRoutes');
const auditLogRoutes = require('./auditLogRoutes');
const analyticsRoutes = require('./analyticsRoutes');

module.exports = {
  authRoutes,
  inventoryRoutes,
  medicineRoutes,
  healthTipRoutes,
  statsRoutes,
  userRoutes,
  masterCatalogueRoutes,
  inventorySyncRoutes,
  healthAuthorityRoutes,
  messageRoutes,
  reminderRoutes,
  prescriptionRoutes,
  auditLogRoutes,
  analyticsRoutes,
};