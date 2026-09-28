const express = require('express')

const router = express.Router();

const userController = require("../controllers/userController")
const { authMiddleware, requireAdmin } = require('../middleware/auth');


router.post('/create', userController.createUser);
router.get('/', userController.getAllUsers);

// --- Health Authority Credential Management (Admin Only, before /:id) ---
router.get('/authority/credentials', authMiddleware, requireAdmin, userController.getAuthorityCredentials);
router.put('/authority/credentials', authMiddleware, requireAdmin, userController.updateAuthorityCredentials);
router.post('/authority/credentials/reset', authMiddleware, requireAdmin, userController.resetAuthorityCredentials);

// --- Specific Notification Routes (must be before /:id) ---
router.get('/notifications', authMiddleware, userController.getUserNotifications);
router.patch('/notifications/read-all', authMiddleware, userController.markAllNotificationsAsRead);
router.patch('/notifications/:id/read', authMiddleware, userController.markNotificationAsRead);
router.delete('/notifications/:id', authMiddleware, userController.deleteNotification);

const pharmacyDutyController = require("../controllers/pharmacyDutyController");

// --- Pharmacy Duty Schedule & Real-Time Status Routes ---
router.get('/pharmacy/duty-schedule', authMiddleware, pharmacyDutyController.getDutySchedule);
router.put('/pharmacy/duty-schedule', authMiddleware, pharmacyDutyController.updateDutySchedule);
router.patch('/pharmacy/realtime-status', authMiddleware, pharmacyDutyController.updateRealTimeStatus);

// --- Specific Pharmacy & Patient Routes (must be before /:id) ---
router.get('/pharmacies/pending', authMiddleware, requireAdmin, userController.getPendingPharmacies);
router.get('/pharmacies/approved', userController.getApprovedPharmacies);
router.get('/pharmacies', userController.getPharmacies);
router.get('/patients', userController.getPatients);
router.get('/recipients', authMiddleware, userController.getRecipients);

router.post('/patients/create', userController.createPatient);
router.post('/pharmacies/create', userController.createPharmacy);
router.put('/patients/update/:id', userController.updatePatient);
router.put('/pharmacies/update/:id', userController.updatePharmacy);
router.patch('/pharmacies/:id/status', authMiddleware, requireAdmin, userController.updatePharmacyStatus);

// --- Specific Profile Routes (must be before /:id) ---
router.get('/profile', authMiddleware, (req, res, next) => {
    req.params.id = req.user._id || req.user.id;
    userController.getUserById(req, res, next);
});
router.put('/profile', authMiddleware, userController.updateUser);

// --- Specific CSU Routes (must be before /:id) ---
router.post('/csu/link', authMiddleware, userController.linkCsuInsurance);
router.delete('/csu/unlink', authMiddleware, userController.unlinkCsuInsurance);

// --- Specific Medical Booklet & Emergency QR Routes (must be before /:id) ---
router.put('/medical-booklet', authMiddleware, userController.updateMedicalBooklet);
router.get('/emergency-card/:token', userController.getPublicEmergencyMedicalInfo);

// --- Generic ID Routes ---
router.get('/:id', userController.getUserById);
router.put('/update/:id', authMiddleware, userController.updateUser);
router.delete('/delete/:id', authMiddleware, userController.deleteUser);

module.exports = router;
