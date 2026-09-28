const User = require('../models/User');

// Default initial rotations template for Cameroon pharmacies if empty
const getDefaultRotations = () => {
  const now = new Date();
  
  // Next Saturday
  const nextSat = new Date();
  nextSat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
  const nextSun = new Date(nextSat);
  nextSun.setDate(nextSat.getDate() + 1);

  // Following weekend
  const follSat = new Date(nextSat);
  follSat.setDate(follSat.getDate() + 7);
  const follSun = new Date(follSat);
  follSun.setDate(follSat.getDate() + 1);

  return [
    {
      id: `ROT-${Date.now()}-1`,
      title: 'Rotation Garde Weekend - Centre Urbain',
      type: 'WEEKEND',
      startDate: nextSat.toISOString().split('T')[0],
      endDate: nextSun.toISOString().split('T')[0],
      dutyStaff: 'Dr. Jean-Marc Mbarga (Pharmacien Titulaire)',
      contactPhone: '+237 670 12 34 56',
      notes: 'Garde continue 48h selon arrêté ONPC Yaoundé Centre.',
      status: 'CONFIRMED_ONPC'
    },
    {
      id: `ROT-${Date.now()}-2`,
      title: 'Fête Nationale du 20 Mai - Service Non-Stop',
      type: 'HOLIDAY',
      startDate: `${now.getFullYear()}-05-20`,
      endDate: `${now.getFullYear()}-05-20`,
      dutyStaff: 'Équipe de Garde Urgence A',
      contactPhone: '+237 699 88 77 66',
      notes: 'Jour férié national - Permanence de garde 24h/24 obligatoire.',
      status: 'SCHEDULED'
    },
    {
      id: `ROT-${Date.now()}-3`,
      title: 'Garde Weekend Prochain - Relève Spéciale',
      type: 'WEEKEND',
      startDate: follSat.toISOString().split('T')[0],
      endDate: follSun.toISOString().split('T')[0],
      dutyStaff: 'Dr. Sophie Kouam (Pharmacienne Adjointe)',
      contactPhone: '+237 677 33 22 11',
      notes: 'Guichet de nuit et approvisionnement urgence pédiatrique.',
      status: 'SCHEDULED'
    }
  ];
};

// GET current pharmacy duty schedule & real-time status
const getDutySchedule = async (req, res) => {
  try {
    const pharmacyId = req.user._id || req.user.id;
    const pharmacy = await User.findById(pharmacyId).select(
      'name businessName email phone city district isOnDuty realTimeStatus dutySchedule operatingHours licenseNumber onpcNumber'
    );

    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy profile not found.' });
    }

    // Initialize dutySchedule if not present
    let schedule = pharmacy.dutySchedule;
    if (!schedule || !schedule.rotations || schedule.rotations.length === 0) {
      schedule = {
        nightDuty: {
          enabled: pharmacy.isOnDuty || false,
          startTime: (schedule && schedule.nightDuty && schedule.nightDuty.startTime) || '20:00',
          endTime: (schedule && schedule.nightDuty && schedule.nightDuty.endTime) || '08:00',
          onCallPhone: (schedule && schedule.nightDuty && schedule.nightDuty.onCallPhone) || pharmacy.phone || '',
          dutyPharmacistName: (schedule && schedule.nightDuty && schedule.nightDuty.dutyPharmacistName) || pharmacy.name || '',
          emergencyInstructions: (schedule && schedule.nightDuty && schedule.nightDuty.emergencyInstructions) || "Sonnette de nuit disponible au guichet d'urgence.",
          is24Hours: (schedule && schedule.nightDuty && schedule.nightDuty.is24Hours) || false,
        },
        rotations: (schedule && schedule.rotations && schedule.rotations.length > 0) ? schedule.rotations : getDefaultRotations(),
        lastStatusUpdate: (schedule && schedule.lastStatusUpdate) || new Date()
      };
    }

    res.status(200).json({
      success: true,
      data: {
        pharmacyId: pharmacy._id,
        pharmacyName: pharmacy.businessName || pharmacy.name,
        isOnDuty: pharmacy.isOnDuty,
        realTimeStatus: pharmacy.realTimeStatus || (pharmacy.isOnDuty ? 'ON_DUTY' : 'OPEN'),
        dutySchedule: schedule,
        operatingHours: pharmacy.operatingHours,
        phone: pharmacy.phone,
        city: pharmacy.city,
        licenseNumber: pharmacy.licenseNumber,
        onpcNumber: pharmacy.onpcNumber,
      }
    });
  } catch (error) {
    console.error('Error fetching duty schedule:', error);
    res.status(500).json({ success: false, message: 'Server error fetching duty schedule.' });
  }
};

// PUT update entire duty schedule (night duty + weekend/holiday rotations)
const updateDutySchedule = async (req, res) => {
  try {
    const pharmacyId = req.user._id || req.user.id;
    const { nightDuty, rotations, realTimeStatus } = req.body;

    const pharmacy = await User.findById(pharmacyId);
    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy profile not found.' });
    }

    if (!pharmacy.dutySchedule) {
      pharmacy.dutySchedule = {};
    }

    if (nightDuty) {
      pharmacy.dutySchedule.nightDuty = {
        enabled: Boolean(nightDuty.enabled),
        startTime: nightDuty.startTime || '20:00',
        endTime: nightDuty.endTime || '08:00',
        onCallPhone: nightDuty.onCallPhone || pharmacy.phone || '',
        dutyPharmacistName: nightDuty.dutyPharmacistName || pharmacy.name || '',
        emergencyInstructions: nightDuty.emergencyInstructions || "Sonnette de nuit disponible au guichet d'urgence.",
        is24Hours: Boolean(nightDuty.is24Hours),
      };
    }

    if (Array.isArray(rotations)) {
      pharmacy.dutySchedule.rotations = rotations.map(r => ({
        id: r.id || `ROT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: r.title || 'Garde Spéciale',
        type: ['WEEKEND', 'HOLIDAY', 'NIGHT_EMERGENCY'].includes(r.type) ? r.type : 'WEEKEND',
        startDate: r.startDate,
        endDate: r.endDate || r.startDate,
        dutyStaff: r.dutyStaff || '',
        contactPhone: r.contactPhone || pharmacy.phone || '',
        notes: r.notes || '',
        status: ['SCHEDULED', 'CONFIRMED_ONPC', 'COMPLETED'].includes(r.status) ? r.status : 'SCHEDULED'
      }));
    }

    // Sync real-time status if provided
    if (realTimeStatus && ['OPEN', 'ON_DUTY', 'CLOSED'].includes(realTimeStatus)) {
      pharmacy.realTimeStatus = realTimeStatus;
      pharmacy.isOnDuty = (realTimeStatus === 'ON_DUTY');
    }

    pharmacy.dutySchedule.lastStatusUpdate = new Date();
    await pharmacy.save();

    res.status(200).json({
      success: true,
      message: 'Duty schedule and rotation roster saved successfully.',
      data: {
        isOnDuty: pharmacy.isOnDuty,
        realTimeStatus: pharmacy.realTimeStatus,
        dutySchedule: pharmacy.dutySchedule
      }
    });
  } catch (error) {
    console.error('Error updating duty schedule:', error);
    res.status(500).json({ success: false, message: 'Failed to update duty schedule.' });
  }
};

// PATCH fast toggle real-time opening status ('OPEN' | 'ON_DUTY' | 'CLOSED')
const updateRealTimeStatus = async (req, res) => {
  try {
    const pharmacyId = req.user._id || req.user.id;
    const { status } = req.body;

    if (!['OPEN', 'ON_DUTY', 'CLOSED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: OPEN, ON_DUTY, CLOSED'
      });
    }

    const pharmacy = await User.findById(pharmacyId);
    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found.' });
    }

    pharmacy.realTimeStatus = status;
    pharmacy.isOnDuty = (status === 'ON_DUTY');

    if (!pharmacy.dutySchedule) {
      pharmacy.dutySchedule = {};
    }
    pharmacy.dutySchedule.lastStatusUpdate = new Date();

    if (status === 'ON_DUTY' && pharmacy.dutySchedule.nightDuty) {
      pharmacy.dutySchedule.nightDuty.enabled = true;
    }

    await pharmacy.save();

    res.status(200).json({
      success: true,
      message: `Pharmacy real-time status updated to: ${status}`,
      data: {
        pharmacyId: pharmacy._id,
        pharmacyName: pharmacy.businessName || pharmacy.name,
        realTimeStatus: pharmacy.realTimeStatus,
        isOnDuty: pharmacy.isOnDuty,
        lastStatusUpdate: pharmacy.dutySchedule.lastStatusUpdate
      }
    });
  } catch (error) {
    console.error('Error toggling real-time status:', error);
    res.status(500).json({ success: false, message: 'Failed to update real-time status.' });
  }
};

module.exports = {
  getDutySchedule,
  updateDutySchedule,
  updateRealTimeStatus,
};
