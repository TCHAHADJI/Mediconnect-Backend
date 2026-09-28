const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  getGenericEquivalences,
  reviewGenericEquivalence,
  getBatchRecalls,
  triggerBatchRecall,
  getEpidemiologicalTelemetry,
  getCriticalStockoutMonitoring,
  getPublicHealthAlerts,
  broadcastPublicHealthAlert,
  getPharmacyAccreditations,
  updatePharmacyAccreditation,
  seedAuthorityMockData,
  exportDHIS2Json,
  exportDHIS2Csv,
  getAuthorityHealthTips,
  reviewHealthTip,
  createAuthorityHealthTip,
  getPublicHealthCampaigns,
  getActivePublicHealthCampaigns,
  createPublicHealthCampaign,
  updateCampaignStatus,
  updatePublicHealthCampaign,
  deletePublicHealthCampaign
} = require('../controllers/healthAuthorityController');

const router = express.Router();

// Allow public/demo seeding or protected with authMiddleware
router.get('/seed', seedAuthorityMockData);

// Public routes: national campaigns must be visible to all users (citizens, patients, pharmacies, visitors)
router.get('/campaigns/active', getActivePublicHealthCampaigns);
router.get('/campaigns', getPublicHealthCampaigns);

// Protected routes (MINSANTÉ Health Authority & Admin)
router.use(authMiddleware);

// 1. Interoperability & DHIS2 Export
router.get('/export/dhis2/json', exportDHIS2Json);
router.get('/export/dhis2/csv', exportDHIS2Csv);

// 2. Epidemiological Telemetry & Critical Stockouts
router.get('/telemetry/epidemiological', getEpidemiologicalTelemetry);
router.get('/telemetry/stockouts', getCriticalStockoutMonitoring);

// 3. Health Tips Approval Workflow & Authority Direct Creation
router.get('/health-tips', getAuthorityHealthTips);
router.put('/health-tips/:id/review', reviewHealthTip);
router.post('/health-tips', createAuthorityHealthTip);

// 4. Public Health Campaigns Management
router.post('/campaigns', createPublicHealthCampaign);
router.put('/campaigns/:id', updatePublicHealthCampaign);
router.put('/campaigns/:id/status', updateCampaignStatus);
router.delete('/campaigns/:id', deletePublicHealthCampaign);

// 5. Official Advisories & Emergency Broadcast
router.get('/alerts', getPublicHealthAlerts);
router.post('/alerts/broadcast', broadcastPublicHealthAlert);

// 6. Generic Bioequivalence
router.get('/equivalences', getGenericEquivalences);
router.put('/equivalences/:id/review', reviewGenericEquivalence);

// 7. Pharmacovigilance & Batch Recalls
router.get('/recalls', getBatchRecalls);
router.post('/recalls', triggerBatchRecall);

// 8. ONPC Registry & Pharmacy Accreditation
router.get('/pharmacies', getPharmacyAccreditations);
router.put('/pharmacies/:id/accreditation', updatePharmacyAccreditation);

module.exports = router;
