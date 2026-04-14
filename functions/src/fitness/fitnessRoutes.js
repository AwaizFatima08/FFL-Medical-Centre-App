const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO } = require('../utils');
const { ROLES, FITNESS_STATUS, APPOINTMENT_STATUS } = require('../constants');

// ─── POST /schedule ───────────────────────────────────────
// Admin Incharge creates fitness appointment for an employee
router.post('/schedule', verifyToken, verifyRole([
  ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      employeeId,
      scheduledDate,
      scheduledTime,
      cycleYear,
    } = req.body;

    if (!employeeId || !scheduledDate || !scheduledTime || !cycleYear) {
      return errorResponse(res,
        'employeeId, scheduledDate, scheduledTime and cycleYear are required',
        400);
    }

    // Verify employee exists
    const empDoc = await db.collection('employees').doc(employeeId).get();
    if (!empDoc.exists) {
      return errorResponse(res, 'Employee not found', 404);
    }

    // Check employee doesn't already have appointment this cycle year
    const existing = await db.collection('fitnessAppointments')
      .where('employeeId', '==', employeeId)
      .where('cycleYear', '==', cycleYear)
      .where('status', '!=', APPOINTMENT_STATUS.CANCELLED)
      .get();

    if (!existing.empty) {
      return errorResponse(res,
        `Employee already has a fitness appointment for ${cycleYear}`,
        409);
    }

    // Check no other appointment at same date/time
    const slotCheck = await db.collection('fitnessAppointments')
      .where('scheduledDate', '==', scheduledDate)
      .where('scheduledTime', '==', scheduledTime)
      .where('status', '!=', APPOINTMENT_STATUS.CANCELLED)
      .get();

    if (!slotCheck.empty) {
      return errorResponse(res,
        'This time slot is already booked. Please choose another.',
        409);
    }

    const appointmentRef = db.collection('fitnessAppointments').doc();
    await appointmentRef.set({
      employeeId,
      scheduledDate,
      scheduledTime,
      cycleYear,
      scheduledBy:           req.user.uid,
      status:                APPOINTMENT_STATUS.SCHEDULED,
      rescheduleRequestedBy: null,
      rescheduleReason:      null,
      rescheduledDate:       null,
      rescheduledTime:       null,
      examinedBy:            null,
      examinedAt:            null,
      fitnessStatus:         null,
      remarks:               null,
      createdAt:             nowISO(),
    });

    // Send notification to employee
    await db.collection('notifications').add({
      title:            'Annual Fitness Appointment Scheduled',
      body:             `Your annual medical fitness examination is scheduled on ${scheduledDate} at ${scheduledTime} at the Medical Centre.`,
      category:         'fitness_appointment',
      targetType:       'individual',
      targetEmployeeId: employeeId,
      appointmentId:    appointmentRef.id,
      sentBy:           req.user.uid,
      sentByRole:       ROLES.ADMIN_INCHARGE,
      sentAt:           nowISO(),
      whatsappDeferred: true,
    });

    return successResponse(res,
      { appointmentId: appointmentRef.id },
      'Fitness appointment scheduled successfully',
      201
    );
  } catch (error) {
    console.error('Schedule fitness appointment error:', error);
    return errorResponse(res, 'Failed to schedule appointment', 500);
  }
});

// ─── GET /all ─────────────────────────────────────────────
// Admin/Doctor/CMO views all appointments
router.get('/all', verifyToken, verifyRole([
  ROLES.ADMIN_INCHARGE, ROLES.DOCTOR, ROLES.CMO, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { cycleYear, status, date } = req.query;

    let query = db.collection('fitnessAppointments')
      .orderBy('scheduledDate', 'asc');

    const snapshot = await query.get();
    let appointments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (cycleYear) {
      appointments = appointments.filter(
        a => a.cycleYear === parseInt(cycleYear)
      );
    }
    if (status) {
      appointments = appointments.filter(a => a.status === status);
    }
    if (date) {
      appointments = appointments.filter(a => a.scheduledDate === date);
    }

    return successResponse(res, appointments);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch appointments', 500);
  }
});

// ─── GET /pending ─────────────────────────────────────────
// Appointments not yet examined
router.get('/pending', verifyToken, verifyRole([
  ROLES.ADMIN_INCHARGE, ROLES.DOCTOR, ROLES.CMO, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('fitnessAppointments')
      .where('status', 'in', [
        APPOINTMENT_STATUS.SCHEDULED,
        APPOINTMENT_STATUS.RESCHEDULED,
      ])
      .orderBy('scheduledDate', 'asc')
      .get();

    const appointments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return successResponse(res, appointments);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch pending appointments', 500);
  }
});

// ─── GET /my-appointment ─────────────────────────────────
// Employee views own appointment
router.get('/my-appointment', verifyToken,
  verifyRole([ROLES.EMPLOYEE]),
  async (req, res) => {
    try {
      const db = admin.firestore();

      const empQuery = await db.collection('employees')
        .where('userId', '==', req.user.uid).get();

      if (empQuery.empty) {
        return errorResponse(res, 'Employee record not found', 404);
      }

      const employeeId = empQuery.docs[0].id;

      const snapshot = await db.collection('fitnessAppointments')
        .where('employeeId', '==', employeeId)
        .orderBy('scheduledDate', 'desc')
        .get();

      const appointments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      return successResponse(res, appointments);
    } catch (error) {
      return errorResponse(res, 'Failed to fetch appointment', 500);
    }
  }
);

// ─── GET /:appointmentId ──────────────────────────────────
router.get('/:appointmentId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const doc = await db.collection('fitnessAppointments')
      .doc(req.params.appointmentId).get();

    if (!doc.exists) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    const data = doc.data();

    // Employee can only view own appointment
    if (req.userRole === ROLES.EMPLOYEE) {
      const empQuery = await db.collection('employees')
        .where('userId', '==', req.user.uid).get();
      if (empQuery.empty || empQuery.docs[0].id !== data.employeeId) {
        return errorResponse(res, 'Forbidden', 403);
      }
    }

    return successResponse(res, { id: doc.id, ...data });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch appointment', 500);
  }
});

// ─── POST /:appointmentId/reschedule-request ──────────────
// Employee requests reschedule
router.post('/:appointmentId/reschedule-request', verifyToken,
  verifyRole([ROLES.EMPLOYEE]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { reason } = req.body;

      const appointmentRef = db.collection('fitnessAppointments')
        .doc(req.params.appointmentId);
      const appointmentDoc = await appointmentRef.get();

      if (!appointmentDoc.exists) {
        return errorResponse(res, 'Appointment not found', 404);
      }

      const data = appointmentDoc.data();

      // Verify own appointment
      const empQuery = await db.collection('employees')
        .where('userId', '==', req.user.uid).get();
      if (empQuery.empty || empQuery.docs[0].id !== data.employeeId) {
        return errorResponse(res, 'Forbidden', 403);
      }

      if (data.status === APPOINTMENT_STATUS.COMPLETED) {
        return errorResponse(res,
          'Cannot reschedule a completed appointment',
          409);
      }

      await appointmentRef.update({
        rescheduleRequestedBy: req.user.uid,
        rescheduleReason:      reason || null,
        rescheduleRequestedAt: nowISO(),
      });

      // Notify admin incharge
      await db.collection('notifications').add({
        title:            'Fitness Appointment Reschedule Request',
        body:             `An employee has requested to reschedule their fitness appointment on ${data.scheduledDate} at ${data.scheduledTime}.`,
        category:         'fitness_appointment',
        targetType:       'individual',
        targetEmployeeId: data.employeeId,
        appointmentId:    req.params.appointmentId,
        sentBy:           'system',
        sentByRole:       'system',
        sentAt:           nowISO(),
        whatsappDeferred: true,
      });

      return successResponse(res, null,
        'Reschedule request submitted. Admin will assign new date.');
    } catch (error) {
      return errorResponse(res, 'Reschedule request failed', 500);
    }
  }
);

// ─── POST /:appointmentId/reschedule ──────────────────────
// Admin Incharge sets new date/time
router.post('/:appointmentId/reschedule', verifyToken,
  verifyRole([ROLES.ADMIN_INCHARGE]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { rescheduledDate, rescheduledTime } = req.body;

      if (!rescheduledDate || !rescheduledTime) {
        return errorResponse(res,
          'rescheduledDate and rescheduledTime are required',
          400);
      }

      // Check slot not already taken
      const slotCheck = await db.collection('fitnessAppointments')
        .where('scheduledDate', '==', rescheduledDate)
        .where('scheduledTime', '==', rescheduledTime)
        .where('status', '!=', APPOINTMENT_STATUS.CANCELLED)
        .get();

      if (!slotCheck.empty) {
        return errorResponse(res,
          'This time slot is already booked.',
          409);
      }

      const appointmentRef = db.collection('fitnessAppointments')
        .doc(req.params.appointmentId);
      const appointmentDoc = await appointmentRef.get();

      if (!appointmentDoc.exists) {
        return errorResponse(res, 'Appointment not found', 404);
      }

      const data = appointmentDoc.data();

      await appointmentRef.update({
        scheduledDate:    rescheduledDate,
        scheduledTime:    rescheduledTime,
        rescheduledDate,
        rescheduledTime,
        rescheduledBy:    req.user.uid,
        rescheduledAt:    nowISO(),
        status:           APPOINTMENT_STATUS.RESCHEDULED,
      });

      // Notify employee
      await db.collection('notifications').add({
        title:            'Fitness Appointment Rescheduled',
        body:             `Your annual fitness examination has been rescheduled to ${rescheduledDate} at ${rescheduledTime} at the Medical Centre.`,
        category:         'fitness_appointment',
        targetType:       'individual',
        targetEmployeeId: data.employeeId,
        appointmentId:    req.params.appointmentId,
        sentBy:           req.user.uid,
        sentByRole:       ROLES.ADMIN_INCHARGE,
        sentAt:           nowISO(),
        whatsappDeferred: true,
      });

      return successResponse(res, null, 'Appointment rescheduled successfully');
    } catch (error) {
      return errorResponse(res, 'Reschedule failed', 500);
    }
  }
);

// ─── POST /:appointmentId/complete ────────────────────────
// Doctor marks examination as completed
router.post('/:appointmentId/complete', verifyToken,
  verifyRole([ROLES.DOCTOR, ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { fitnessStatus, remarks } = req.body;

      if (!fitnessStatus ||
          !Object.values(FITNESS_STATUS).includes(fitnessStatus)) {
        return errorResponse(res,
          `fitnessStatus is required. Valid values: ${Object.values(FITNESS_STATUS).join(', ')}`,
          400);
      }

      const appointmentRef = db.collection('fitnessAppointments')
        .doc(req.params.appointmentId);
      const appointmentDoc = await appointmentRef.get();

      if (!appointmentDoc.exists) {
        return errorResponse(res, 'Appointment not found', 404);
      }

      if (appointmentDoc.data().status === APPOINTMENT_STATUS.COMPLETED) {
        return errorResponse(res, 'Appointment already completed', 409);
      }

      const data = appointmentDoc.data();

      await appointmentRef.update({
        status:        APPOINTMENT_STATUS.COMPLETED,
        fitnessStatus,
        remarks:       remarks || null,
        examinedBy:    req.user.uid,
        examinedAt:    nowISO(),
      });

      // Update fitness status on employee profile
      await db.collection('employees').doc(data.employeeId).update({
        fitnessStatus,
        fitnessExaminedAt: nowISO(),
        fitnessExaminedBy: req.user.uid,
      });

      // Notify employee of result
      await db.collection('notifications').add({
        title:            'Fitness Examination Result',
        body:             `Your annual fitness examination result: ${fitnessStatus.toUpperCase()}. ${remarks ? 'Remarks: ' + remarks : ''}`,
        category:         'fitness_appointment',
        targetType:       'individual',
        targetEmployeeId: data.employeeId,
        appointmentId:    req.params.appointmentId,
        sentBy:           req.user.uid,
        sentByRole:       req.userRole,
        sentAt:           nowISO(),
        whatsappDeferred: true,
      });

      return successResponse(res, null, 'Examination completed successfully');
    } catch (error) {
      return errorResponse(res, 'Failed to complete examination', 500);
    }
  }
);

module.exports = router;