const PillReminder = require('../models/PillReminder');
const Notification = require('../models/Notification');

/**
 * Get today's date formatted as YYYY-MM-DD in local time
 */
const getTodayDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * @desc Get all pill reminders for the logged in patient
 * @route GET /api/reminders
 */
exports.getReminders = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const reminders = await PillReminder.find({ userId }).sort({ createdAt: -1 });

    const todayDate = getTodayDateString();

    let totalDosesToday = 0;
    let takenDosesToday = 0;
    let lowStockCount = 0;

    reminders.forEach((r) => {
      if (r.isActive) {
        totalDosesToday += (r.times && r.times.length) || 1;
        const takenToday = (r.takenHistory || []).filter(
          (h) => h.date === todayDate && h.status === 'TAKEN'
        );
        takenDosesToday += takenToday.length;

        if (r.refillReminder && r.remainingPills <= r.refillThreshold) {
          lowStockCount++;
        }
      }
    });

    const adherenceRate = totalDosesToday > 0 
      ? Math.round((takenDosesToday / totalDosesToday) * 100) 
      : 100;

    res.status(200).json({
      success: true,
      data: {
        reminders,
        stats: {
          total: reminders.length,
          active: reminders.filter((r) => r.isActive).length,
          dosesToday: totalDosesToday,
          takenToday: takenDosesToday,
          adherenceRate,
          lowStockCount,
          todayDate,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc Create a new pill reminder
 * @route POST /api/reminders
 */
exports.createReminder = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const {
      medicineName,
      dosage,
      form,
      frequency,
      times,
      foodInstructions,
      startDate,
      endDate,
      ongoing,
      totalPills,
      remainingPills,
      refillReminder,
      refillThreshold,
      color,
      notes,
    } = req.body;

    if (!medicineName || !dosage) {
      return res.status(400).json({
        success: false,
        message: 'Medicine name and dosage are required',
      });
    }

    const timesArray = Array.isArray(times) && times.length > 0 
      ? times 
      : ['08:00', '20:00'];

    const newReminder = await PillReminder.create({
      userId,
      medicineName: medicineName.trim(),
      dosage: dosage.trim(),
      form: form || 'tablet',
      frequency: frequency || 'TWICE_DAILY',
      times: timesArray,
      foodInstructions: foodInstructions || 'AFTER_MEAL',
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined,
      ongoing: ongoing !== undefined ? ongoing : true,
      totalPills: Number(totalPills) || 30,
      remainingPills: Number(remainingPills !== undefined ? remainingPills : (totalPills || 30)),
      refillReminder: refillReminder !== undefined ? refillReminder : true,
      refillThreshold: Number(refillThreshold) || 5,
      color: color || 'blue',
      notes: notes ? notes.trim() : '',
      isActive: true,
      takenHistory: [],
    });

    // Notify user of successful schedule
    try {
      await Notification.create({
        userId,
        type: 'PILL_REMINDER_CREATED',
        title: 'New Medication Reminder Set',
        message: `Reminder scheduled for ${newReminder.medicineName} (${newReminder.dosage}) at ${timesArray.join(', ')}.`,
        data: { reminderId: newReminder._id },
      });
    } catch (notifErr) {
      console.warn('Could not create notification for reminder:', notifErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Medication reminder created successfully',
      data: newReminder,
    });
  } catch (error) {
    console.error('Error creating reminder:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc Update an existing pill reminder
 * @route PUT /api/reminders/:id
 */
exports.updateReminder = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const reminder = await PillReminder.findOne({ _id: id, userId });
    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found or unauthorized' });
    }

    const updatable = [
      'medicineName',
      'dosage',
      'form',
      'frequency',
      'times',
      'foodInstructions',
      'startDate',
      'endDate',
      'ongoing',
      'totalPills',
      'remainingPills',
      'refillReminder',
      'refillThreshold',
      'color',
      'notes',
      'isActive',
    ];

    updatable.forEach((field) => {
      if (req.body[field] !== undefined) {
        reminder[field] = req.body[field];
      }
    });

    await reminder.save();

    res.status(200).json({
      success: true,
      message: 'Reminder updated successfully',
      data: reminder,
    });
  } catch (error) {
    console.error('Error updating reminder:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc Delete a pill reminder
 * @route DELETE /api/reminders/:id
 */
exports.deleteReminder = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const reminder = await PillReminder.findOneAndDelete({ _id: id, userId });
    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found or unauthorized' });
    }

    res.status(200).json({
      success: true,
      message: 'Reminder deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc Record a dose as TAKEN or SKIPPED
 * @route POST /api/reminders/:id/take
 */
exports.logDose = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    const { time, status = 'TAKEN', date } = req.body;

    const reminder = await PillReminder.findOne({ _id: id, userId });
    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found or unauthorized' });
    }

    const logDate = date || getTodayDateString();
    const doseTime = time || (reminder.times && reminder.times[0]) || '08:00';

    // Remove any existing log for this same date & time to avoid duplicate records
    reminder.takenHistory = reminder.takenHistory.filter(
      (h) => !(h.date === logDate && h.time === doseTime)
    );

    // Push new log entry
    reminder.takenHistory.push({
      date: logDate,
      time: doseTime,
      status: status === 'SKIPPED' ? 'SKIPPED' : 'TAKEN',
      takenAt: new Date(),
    });

    // If TAKEN, decrease remaining pills
    if (status === 'TAKEN' && reminder.remainingPills > 0) {
      reminder.remainingPills = Math.max(0, reminder.remainingPills - 1);

      // Low stock notification trigger
      if (
        reminder.refillReminder && 
        reminder.remainingPills <= reminder.refillThreshold
      ) {
        try {
          await Notification.create({
            userId,
            type: 'REFILL_ALERT',
            title: `Low Stock Alert: ${reminder.medicineName}`,
            message: `You only have ${reminder.remainingPills} doses remaining of ${reminder.medicineName}. Check nearby accredited pharmacies to refill your stock.`,
            data: { reminderId: reminder._id, medicineName: reminder.medicineName },
          });
        } catch (notifErr) {
          console.warn('Could not create low stock notification:', notifErr.message);
        }
      }
    }

    await reminder.save();

    res.status(200).json({
      success: true,
      message: status === 'TAKEN' ? 'Dose marked as taken!' : 'Dose marked as skipped.',
      data: reminder,
    });
  } catch (error) {
    console.error('Error logging dose:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc Record an alarm notification when a dose is due
 * @route POST /api/reminders/:id/notify-due
 */
exports.notifyDoseDue = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    const { time, medicineName, dosage, foodInstructions } = req.body;

    const notif = await Notification.create({
      userId,
      type: 'MEDICATION_DUE',
      title: `⏰ Heure de prise : ${medicineName || 'Médicament'}`,
      message: `Il est l'heure de prendre votre dose de ${medicineName} (${dosage || '1 dose'}) - ${foodInstructions || 'Selon ordonnance'}.`,
      data: { reminderId: id, time, medicineName, dosage },
    });

    res.status(200).json({ success: true, message: 'Dose notification registered', data: notif });
  } catch (error) {
    console.error('Error creating dose notification:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

