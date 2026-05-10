// functions/src/fitness/fitnessRoutes.js

const express = require('express');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { ROLES } = require('../constants');
const { createNotification } = require('../notifications/notificationRoutes');

const router = express.Router();
const db = getFirestore();

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = await getAuth().verifyIdToken(token);
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) return res.status(401).json({ success: false, message: 'User not found' });

    const userData = userDoc.data();
    if (!userData.isActive) return res.status(403).json({ success: false, message: 'Account not active' });

    req.user = { uid: decoded.uid, role: userData.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ─── FITNESS APPOINTMENT STATUSES ────────────────────────────────────────────
const FITNESS_STATUS = {
  SCHEDULED:             'scheduled',
  CONFIRMED:             'confirmed',
  RESCHEDULE_REQUESTED:  'reschedule_requested',
  RESCHEDULED:           'rescheduled',
  RESCHEDULE_REJECTED:   'reschedule_rejected',
  COMPLETED:             'completed',
  CANCELLED:             'cancelled',
};

// Statuses in which the employee can still take action
const ACTIVE_STATUSES = [
  FITNESS_STATUS.SCHEDULED,
  FITNESS_STATUS.CONFIRMED,
  FITNESS_STATUS.RESCHEDULED,
  FITNESS_STATUS.RESCHEDULE_REJECTED,
];

// ─── HELPER: Get employee record by uid ──────────────────────────────────────
async function getEmployeeByUid(uid) {
  const snap = await db.collection('employees').where('userId', '==', uid).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ─── POST /schedule — Admin assigns appointment to an employee ────────────────
// Body: { employeeUid, scheduledDate, scheduledTime, cycleYear, notes }
// employeeUid: Firebase Auth UID of the employee
router.post('/schedule', authenticate, async (req, res) => {
  try {
    if (req.user.role !== ROLES.ADMIN_INCHARGE) {
      return res.status(403).json({ success: false, message: 'Only Admin Incharge can schedule fitness appointments' });
    }

    const { officialEmployeeNumber, scheduledDate, scheduledTime, cycleYear, notes } = req.body;
    
    if (!officialEmployeeNumber || !scheduledDate || !scheduledTime || !cycleYear) {
      return res.status(400).json({
        success: false,
        message: 'officialEmployeeNumber, scheduledDate, scheduledTime and cycleYear are required',
      });
    }

    // Look up employee by officialEmployeeNumber
    const empLookup = await db.collection('employees')
      .where('officialEmployeeNumber', '==', officialEmployeeNumber.trim())
      .limit(1)
      .get();

    if (empLookup.empty) {
      return res.status(404).json({ success: false, message: 'No employee found with that Employee Number.' });
    }

    const empRecord = { id: empLookup.docs[0].id, ...empLookup.docs[0].data() };
    const employeeUid = empRecord.userId;

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return res.status(400).json({ success: false, message: 'scheduledDate must be in YYYY-MM-DD format' });
    }

    // Validate time format HH:MM
    if (!/^\d{2}:\d{2}$/.test(scheduledTime)) {
      return res.status(400).json({ success: false, message: 'scheduledTime must be in HH:MM format' });
    }

    // Check slot not already taken
    const slotCheck = await db.collection('fitnessAppointments')
      .where('scheduledDate', '==', scheduledDate)
      .where('scheduledTime', '==', scheduledTime)
      .where('status', 'not-in', [FITNESS_STATUS.CANCELLED])
      .get();

    if (!slotCheck.empty) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is already booked. Please choose a different time.',
      });
    }

    const now = new Date().toISOString();
    const docRef = await db.collection('fitnessAppointments').add({
      employeeUid,
      employeeId:         empRecord.id,
      fullName:           empRecord.fullName || '',
      department:         empRecord.department || '',
      scheduledDate,
      scheduledTime,
      cycleYear:          parseInt(cycleYear),
      status:             FITNESS_STATUS.SCHEDULED,
      notes:              notes?.trim() || null,
      // Reschedule fields — populated when employee requests reschedule
      rescheduleReason:         null,
      rescheduleRequestedAt:    null,
      // Admin action fields
      adminNote:                null,
      rejectedAt:               null,
      rejectedBy:               null,
      rescheduledDate:          null,
      rescheduledTime:          null,
      rescheduledAt:            null,
      rescheduledBy:            null,
      // Completion fields
      completedAt:              null,
      completedBy:              null,
      fitnessOutcome:           null,   // 'fit' | 'unfit' | 'fit_with_restrictions'
      completionRemarks:        null,
      // Audit
      assignedBy:         req.user.uid,
      assignedAt:         now,
      createdAt:          now,
    });

    // Notify employee
    await createNotification({
      recipientUid:  employeeUid,
      recipientRole: ROLES.EMPLOYEE,
      title:         'Annual Fitness Appointment Scheduled',
      body:          `Your annual medical fitness examination is scheduled on ${scheduledDate} at ${scheduledTime}. Please confirm your attendance or request a reschedule if needed.`,
      type:          'fitness',
      referenceId:   docRef.id,
    });

    return res.status(201).json({
      success: true,
      message: 'Fitness appointment scheduled successfully',
      data: { appointmentId: docRef.id },
    });
  } catch (error) {
    console.error('Schedule fitness error:', error);
    return res.status(500).json({ success: false, message: 'Failed to schedule appointment', error: error.message });
  }
});

// ─── GET /all — Admin/CMO/Doctor views all appointments ──────────────────────
// Query params: ?cycleYear=2025&status=scheduled&date=2025-06-15
router.get('/all', authenticate, async (req, res) => {
  try {
    const allowedRoles = [ROLES.ADMIN_INCHARGE, ROLES.CMO, ROLES.DOCTOR];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { cycleYear, status, date } = req.query;

    let query = db.collection('fitnessAppointments').orderBy('scheduledDate', 'asc');
    const snapshot = await query.get();

    let appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (cycleYear) appointments = appointments.filter(a => a.cycleYear === parseInt(cycleYear));
    if (status)    appointments = appointments.filter(a => a.status === status);
    if (date)      appointments = appointments.filter(a => a.scheduledDate === date);

    return res.json({ success: true, data: appointments });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch appointments' });
  }
});

// ─── GET /my — Employee views own appointment(s) ─────────────────────────────
router.get('/my', authenticate, async (req, res) => {
  try {
    if (req.user.role !== ROLES.EMPLOYEE) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const snapshot = await db.collection('fitnessAppointments')
      .where('employeeUid', '==', req.user.uid)
      .orderBy('scheduledDate', 'desc')
      .get();

    const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ success: true, data: appointments });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch appointment' });
  }
});

// ─── GET /:id — Get single appointment ───────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await db.collection('fitnessAppointments').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    const data = doc.data();

    // Employee can only view their own
    if (req.user.role === ROLES.EMPLOYEE && data.employeeUid !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return res.json({ success: true, data: { id: doc.id, ...data } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch appointment' });
  }
});

// ─── POST /:id/confirm — Employee confirms attendance ────────────────────────
router.post('/:id/confirm', authenticate, async (req, res) => {
  try {
    if (req.user.role !== ROLES.EMPLOYEE) {
      return res.status(403).json({ success: false, message: 'Only employees can confirm appointments' });
    }

    const docRef = db.collection('fitnessAppointments').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const data = doc.data();
    if (data.employeeUid !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (![FITNESS_STATUS.SCHEDULED, FITNESS_STATUS.RESCHEDULED, FITNESS_STATUS.RESCHEDULE_REJECTED].includes(data.status)) {
      return res.status(409).json({ success: false, message: `Cannot confirm appointment with status: ${data.status}` });
    }

    await docRef.update({
      status:      FITNESS_STATUS.CONFIRMED,
      confirmedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: 'Appointment confirmed' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to confirm appointment' });
  }
});

// ─── POST /:id/reschedule-request — Employee requests reschedule ──────────────
// Body: { reason }
// Employee can request reschedule as long as appointment is not completed/cancelled.
// Only one pending reschedule request allowed at a time.
router.post('/:id/reschedule-request', authenticate, async (req, res) => {
  try {
    if (req.user.role !== ROLES.EMPLOYEE) {
      return res.status(403).json({ success: false, message: 'Only employees can request reschedule' });
    }

    const { reason } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required for reschedule request' });
    }

    const docRef = db.collection('fitnessAppointments').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const data = doc.data();
    if (data.employeeUid !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!ACTIVE_STATUSES.includes(data.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot request reschedule for an appointment with status: ${data.status}`,
      });
    }

    // Prevent duplicate pending request
    if (data.status === FITNESS_STATUS.RESCHEDULE_REQUESTED) {
      return res.status(409).json({
        success: false,
        message: 'A reschedule request is already pending. Please wait for admin to respond.',
      });
    }

    await docRef.update({
      status:                   FITNESS_STATUS.RESCHEDULE_REQUESTED,
      rescheduleReason:         reason.trim(),
      rescheduleRequestedAt:    new Date().toISOString(),
      // Clear any previous rejection note
      adminNote:                null,
      rejectedAt:               null,
      rejectedBy:               null,
    });

    // Notify admin incharge
    // We find admin uids to notify — notify all admin_incharge users
    const adminSnap = await db.collection('users')
      .where('role', '==', ROLES.ADMIN_INCHARGE)
      .where('isActive', '==', true)
      .get();

    await Promise.all(adminSnap.docs.map(adminDoc =>
      createNotification({
        recipientUid:  adminDoc.id,
        recipientRole: ROLES.ADMIN_INCHARGE,
        title:         'Fitness Appointment Reschedule Request',
        body:          `${data.fullName} has requested to reschedule their fitness appointment on ${data.scheduledDate} at ${data.scheduledTime}. Reason: ${reason.trim()}`,
        type:          'fitness',
        referenceId:   req.params.id,
      })
    ));

    return res.json({ success: true, message: 'Reschedule request submitted. Admin will assign a new date.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to submit reschedule request' });
  }
});

// ─── POST /:id/reschedule — Admin approves reschedule with new date ───────────
// Body: { newDate, newTime }
router.post('/:id/reschedule', authenticate, async (req, res) => {
  try {
    if (req.user.role !== ROLES.ADMIN_INCHARGE) {
      return res.status(403).json({ success: false, message: 'Only Admin Incharge can approve reschedules' });
    }

    const { newDate, newTime } = req.body;
    if (!newDate || !newTime) {
      return res.status(400).json({ success: false, message: 'newDate and newTime are required' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      return res.status(400).json({ success: false, message: 'newDate must be in YYYY-MM-DD format' });
    }
    if (!/^\d{2}:\d{2}$/.test(newTime)) {
      return res.status(400).json({ success: false, message: 'newTime must be in HH:MM format' });
    }

    // Check new slot not already taken
    const slotCheck = await db.collection('fitnessAppointments')
      .where('scheduledDate', '==', newDate)
      .where('scheduledTime', '==', newTime)
      .where('status', 'not-in', [FITNESS_STATUS.CANCELLED])
      .get();

    // Exclude current appointment from slot check
    const conflict = slotCheck.docs.filter(d => d.id !== req.params.id);
    if (conflict.length > 0) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked. Please choose a different time.' });
    }

    const docRef = db.collection('fitnessAppointments').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const data = doc.data();
    if (data.status !== FITNESS_STATUS.RESCHEDULE_REQUESTED) {
      return res.status(409).json({ success: false, message: 'No pending reschedule request for this appointment' });
    }

    const now = new Date().toISOString();
    await docRef.update({
      status:         FITNESS_STATUS.RESCHEDULED,
      scheduledDate:  newDate,
      scheduledTime:  newTime,
      rescheduledDate: newDate,
      rescheduledTime: newTime,
      rescheduledAt:  now,
      rescheduledBy:  req.user.uid,
    });

    // Notify employee
    await createNotification({
      recipientUid:  data.employeeUid,
      recipientRole: ROLES.EMPLOYEE,
      title:         'Fitness Appointment Rescheduled',
      body:          `Your fitness appointment has been rescheduled to ${newDate} at ${newTime}. Please confirm your attendance.`,
      type:          'fitness',
      referenceId:   req.params.id,
    });

    return res.json({ success: true, message: 'Appointment rescheduled successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reschedule appointment' });
  }
});

// ─── POST /:id/reject-reschedule — Admin rejects reschedule request ───────────
// Original date/time stands. Body: { adminNote }
router.post('/:id/reject-reschedule', authenticate, async (req, res) => {
  try {
    if (req.user.role !== ROLES.ADMIN_INCHARGE) {
      return res.status(403).json({ success: false, message: 'Only Admin Incharge can reject reschedule requests' });
    }

    const { adminNote } = req.body;

    const docRef = db.collection('fitnessAppointments').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const data = doc.data();
    if (data.status !== FITNESS_STATUS.RESCHEDULE_REQUESTED) {
      return res.status(409).json({ success: false, message: 'No pending reschedule request for this appointment' });
    }

    const now = new Date().toISOString();
    await docRef.update({
      status:      FITNESS_STATUS.RESCHEDULE_REJECTED,
      adminNote:   adminNote?.trim() || null,
      rejectedAt:  now,
      rejectedBy:  req.user.uid,
    });

    // Notify employee — original date stands
    await createNotification({
      recipientUid:  data.employeeUid,
      recipientRole: ROLES.EMPLOYEE,
      title:         'Reschedule Request Declined',
      body:          `Your request to reschedule your fitness appointment has been declined. Your appointment remains on ${data.scheduledDate} at ${data.scheduledTime}.${adminNote ? ` Note from admin: ${adminNote.trim()}` : ''}`,
      type:          'fitness',
      referenceId:   req.params.id,
    });

    return res.json({ success: true, message: 'Reschedule request rejected. Original date stands.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reject reschedule request' });
  }
});

// ─── POST /:id/complete — Doctor/CMO marks examination as completed ───────────
// Body: { fitnessOutcome, completionRemarks }
// fitnessOutcome: 'fit' | 'unfit' | 'fit_with_restrictions'
router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const allowedRoles = [ROLES.DOCTOR, ROLES.CMO];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only Doctor or CMO can complete fitness examinations' });
    }

    const { fitnessOutcome, completionRemarks } = req.body;
    const validOutcomes = ['fit', 'unfit', 'fit_with_restrictions'];

    if (!fitnessOutcome || !validOutcomes.includes(fitnessOutcome)) {
      return res.status(400).json({
        success: false,
        message: `fitnessOutcome is required. Valid values: ${validOutcomes.join(', ')}`,
      });
    }

    const docRef = db.collection('fitnessAppointments').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const data = doc.data();
    if (data.status === FITNESS_STATUS.COMPLETED) {
      return res.status(409).json({ success: false, message: 'Appointment already completed' });
    }
    if (data.status === FITNESS_STATUS.CANCELLED) {
      return res.status(409).json({ success: false, message: 'Cannot complete a cancelled appointment' });
    }

    const now = new Date().toISOString();
    await docRef.update({
      status:             FITNESS_STATUS.COMPLETED,
      fitnessOutcome,
      completionRemarks:  completionRemarks?.trim() || null,
      completedAt:        now,
      completedBy:        req.user.uid,
    });

    // Also write fitness outcome back to the employee's record for quick lookup
    await db.collection('employees').doc(data.employeeId).update({
      lastFitnessOutcome:    fitnessOutcome,
      lastFitnessDate:       data.scheduledDate,
      lastFitnessCycleYear:  data.cycleYear,
    });

    // Notify employee of result
    const outcomeLabels = {
      fit:                   'Fit for Duty ✅',
      unfit:                 'Unfit for Duty ❌',
      fit_with_restrictions: 'Fit with Restrictions ⚠️',
    };
    await createNotification({
      recipientUid:  data.employeeUid,
      recipientRole: ROLES.EMPLOYEE,
      title:         'Fitness Examination Result',
      body:          `Your annual fitness examination result: ${outcomeLabels[fitnessOutcome]}.${completionRemarks ? ` Remarks: ${completionRemarks.trim()}` : ''}`,
      type:          'fitness',
      referenceId:   req.params.id,
    });

    return res.json({ success: true, message: 'Fitness examination completed successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to complete examination' });
  }
});

// ─── POST /:id/cancel — Admin cancels an appointment ─────────────────────────
// Body: { reason }
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    if (req.user.role !== ROLES.ADMIN_INCHARGE) {
      return res.status(403).json({ success: false, message: 'Only Admin Incharge can cancel appointments' });
    }

    const { reason } = req.body;

    const docRef = db.collection('fitnessAppointments').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const data = doc.data();
    if (data.status === FITNESS_STATUS.COMPLETED) {
      return res.status(409).json({ success: false, message: 'Cannot cancel a completed appointment' });
    }
    if (data.status === FITNESS_STATUS.CANCELLED) {
      return res.status(409).json({ success: false, message: 'Appointment already cancelled' });
    }

    await docRef.update({
      status:       FITNESS_STATUS.CANCELLED,
      cancelReason: reason?.trim() || null,
      cancelledAt:  new Date().toISOString(),
      cancelledBy:  req.user.uid,
    });

    // Notify employee
    await createNotification({
      recipientUid:  data.employeeUid,
      recipientRole: ROLES.EMPLOYEE,
      title:         'Fitness Appointment Cancelled',
      body:          `Your fitness appointment on ${data.scheduledDate} at ${data.scheduledTime} has been cancelled.${reason ? ` Reason: ${reason.trim()}` : ' Please contact the Medical Centre for details.'}`,
      type:          'fitness',
      referenceId:   req.params.id,
    });

    return res.json({ success: true, message: 'Appointment cancelled successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to cancel appointment' });
  }
});

module.exports = router;