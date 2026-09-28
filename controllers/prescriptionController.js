const Prescription = require('../models/Prescription');
const Notification = require('../models/Notification');
const crypto = require('crypto');

/**
 * @desc Get all prescriptions for the authenticated patient
 * @route GET /api/prescriptions
 */
exports.getPrescriptions = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const prescriptions = await Prescription.find({ userId }).sort({ createdAt: -1 });

    const total = prescriptions.length;
    const active = prescriptions.filter((p) => p.status === 'ACTIVE').length;
    const dispensed = prescriptions.filter((p) => p.status === 'DISPENSED').length;
    const paperUploads = prescriptions.filter((p) => p.type === 'PAPER_UPLOAD').length;
    const digitalCount = prescriptions.filter((p) => p.type === 'DIGITAL_PRESCRIPTION').length;

    res.status(200).json({
      success: true,
      data: {
        prescriptions,
        stats: {
          total,
          active,
          dispensed,
          paperUploads,
          digitalCount,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc Get prescription details by ID
 * @route GET /api/prescriptions/:id
 */
exports.getPrescriptionById = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const prescription = await Prescription.findById(id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Patients can only view their own; pharmacies can view if shared
    if (
      prescription.userId.toString() !== userId.toString() &&
      req.user.userType !== 'PHARMACY' &&
      req.user.userType !== 'ADMIN'
    ) {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    res.status(200).json({ success: true, data: prescription });
  } catch (error) {
    console.error('Error fetching prescription:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc Upload paper prescription or register digital prescription
 * @route POST /api/prescriptions
 */
exports.createPrescription = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const {
      type = 'PAPER_UPLOAD',
      title,
      prescriberName,
      prescriberHospital,
      prescriberPhone,
      prescriberLicenseNumber,
      issueDate,
      expiryDate,
      paperImageUrl,
      medicines,
      notes,
    } = req.body;

    if (!prescriberName || !prescriberName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Doctor / Prescriber name is required',
      });
    }

    const year = new Date().getFullYear();
    const randomCode = Math.floor(10000 + Math.random() * 90000);
    const prescriptionNumber = `ORD-${year}-${randomCode}`;

    const parsedIssueDate = issueDate ? new Date(issueDate) : new Date();
    const defaultExpiry = new Date(parsedIssueDate);
    defaultExpiry.setDate(defaultExpiry.getDate() + 90); // 3 months validity

    const newPrescription = await Prescription.create({
      userId,
      prescriptionNumber,
      type: type || 'PAPER_UPLOAD',
      title: title ? title.trim() : (type === 'PAPER_UPLOAD' ? 'Ordonnance Papier Numérisée' : 'Ordonnance Électronique Sécurisée'),
      prescriberName: prescriberName.trim(),
      prescriberHospital: prescriberHospital ? prescriberHospital.trim() : 'Hôpital Central de Yaoundé (HCY)',
      prescriberPhone: prescriberPhone ? prescriberPhone.trim() : '',
      prescriberLicenseNumber: prescriberLicenseNumber ? prescriberLicenseNumber.trim() : 'ONMC/' + year + '/' + randomCode,
      issueDate: parsedIssueDate,
      expiryDate: expiryDate ? new Date(expiryDate) : defaultExpiry,
      status: 'ACTIVE',
      paperImageUrl: paperImageUrl || undefined,
      medicines: Array.isArray(medicines) && medicines.length > 0 ? medicines : [
        {
          name: 'Traitement prescrit',
          dosage: 'Selon avis médical',
          frequency: '2x par jour',
          duration: '7 jours',
          quantity: 1,
          instructions: 'Consulter la pharmacie pour posologie exacte',
          dispensed: false,
        }
      ],
      notes: notes ? notes.trim() : '',
    });

    // Notify patient
    try {
      await Notification.create({
        userId,
        type: 'PRESCRIPTION_ADDED',
        title: 'Prescription Added to Your Health Booklet',
        message: `Prescription ${prescriptionNumber} from ${newPrescription.prescriberName} was securely archived.`,
        data: { prescriptionId: newPrescription._id, prescriptionNumber },
      });
    } catch (notifErr) {
      console.warn('Could not create notification for prescription:', notifErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Prescription saved successfully',
      data: newPrescription,
    });
  } catch (error) {
    console.error('Error creating prescription:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc Update prescription
 * @route PUT /api/prescriptions/:id
 */
exports.updatePrescription = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const prescription = await Prescription.findOne({ _id: id, userId });
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    const fields = [
      'title',
      'prescriberName',
      'prescriberHospital',
      'prescriberPhone',
      'prescriberLicenseNumber',
      'status',
      'expiryDate',
      'medicines',
      'notes',
      'paperImageUrl',
    ];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        prescription[f] = req.body[f];
      }
    });

    await prescription.save();

    res.status(200).json({
      success: true,
      message: 'Prescription updated successfully',
      data: prescription,
    });
  } catch (error) {
    console.error('Error updating prescription:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc Delete prescription
 * @route DELETE /api/prescriptions/:id
 */
exports.deletePrescription = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const prescription = await Prescription.findOneAndDelete({ _id: id, userId });
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Prescription deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting prescription:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};
