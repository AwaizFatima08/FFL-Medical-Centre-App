const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO, resolveAutoStatus } = require('../utils');
const { ROLES, AVAILABILITY_STATUS } = require('../constants');

// ─── POST /initialize ─────────────────────────────────────
// Create availability record for a doctor/CMO
// Called once when doctor account is created
router.post('/initialize', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.CMO, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { doctorUserId, fullName, designation, role } = req.body;

    if (!doctorUserId || !fullName || !designation || !role) {
      return errorResponse(res,
        'doctorUserId, fullName, designation and role are required',
        400);
    }

    if (![ROLES.DOCTOR, ROLES.CMO].includes(role)) {
      return errorResponse(res,
        'role must be doctor or cmo',
        400);
    }

    // Check if already initialized
    const existing = await db.collection('doctorAvailability')
      .doc(doctorUserId).get();

    if (existing.exists) {
      return errorResponse(res,
        'Availability record already exists for this doctor',
        409);
    }

    await db.collection('doctorAvailability').doc(doctorUserId).set({
      userId:        doctorUserId,
      fullName,
      designation,
      role,
      currentStatus: AVAILABILITY_STATUS.NOT_AVAILABLE,
      updatedBy:     req.user.uid,
      updatedAt:     nowISO(),
    });

    return successResponse(res,
      { doctorUserId },
      'Availability record initialized',
      201
    );
  } catch (error) {
    console.error('Initialize availability error:', error);
    return errorResponse(res, 'Failed to initialize availability', 500);
  }
});

// ─── GET /all ─────────────────────────────────────────────
// All employees view doctor availability status
router.get('/all', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('doctorAvailability').get();

    const doctors = snapshot.docs.map(doc => {
      const data = doc.data();
      // Resolve auto status based on working hours
      const resolvedStatus = resolveAutoStatus(data.role, data.currentStatus);
      return {
        id:          doc.id,
        fullName:    data.fullName,
        designation: data.designation,
        status:      resolvedStatus === AVAILABILITY_STATUS.OFF_DUTY
                       ? AVAILABILITY_STATUS.NOT_AVAILABLE
                       : resolvedStatus,
      };
    });

    return successResponse(res, doctors);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch availability', 500);
  }
});

// ─── GET /:doctorUserId ───────────────────────────────────
router.get('/:doctorUserId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const doc = await db.collection('doctorAvailability')
      .doc(req.params.doctorUserId).get();

    if (!doc.exists) {
      return errorResponse(res, 'Doctor availability record not found', 404);
    }

    const data = doc.data();
    const resolvedStatus = resolveAutoStatus(data.role, data.currentStatus);

    return successResponse(res, {
      id:          doc.id,
      fullName:    data.fullName,
      designation: data.designation,
      status:      resolvedStatus === AVAILABILITY_STATUS.OFF_DUTY
                     ? AVAILABILITY_STATUS.NOT_AVAILABLE
                     : resolvedStatus,
      updatedAt:   data.updatedAt,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch availability', 500);
  }
});

// ─── POST /:doctorUserId/update ───────────────────────────
// Doctor updates own status / Reception updates on behalf
router.post('/:doctorUserId/update', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { status } = req.body;

    if (!status || ![
      AVAILABILITY_STATUS.AVAILABLE,
      AVAILABILITY_STATUS.NOT_AVAILABLE,
    ].includes(status)) {
      return errorResponse(res,
        'status must be available or not_available',
        400);
    }

    const docRef = db.collection('doctorAvailability')
      .doc(req.params.doctorUserId);
    const docDoc = await docRef.get();

    if (!docDoc.exists) {
      return errorResponse(res, 'Doctor availability record not found', 404);
    }

    // Doctor can only update own status
    if (req.userRole === ROLES.DOCTOR &&
        req.user.uid !== req.params.doctorUserId) {
      return errorResponse(res,
        'Doctors can only update their own availability',
        403);
    }

    const updatedBy = req.userRole === ROLES.RECEPTION
      ? 'reception'
      : 'self';

    // Log previous status
    await docRef.collection('statusLog').add({
      status,
      updatedBy:     req.user.uid,
      updatedByType: updatedBy,
      updatedAt:     nowISO(),
    });

    await docRef.update({
      currentStatus: status,
      updatedBy:     req.user.uid,
      updatedByType: updatedBy,
      updatedAt:     nowISO(),
    });

    return successResponse(res, null, 'Availability status updated');
  } catch (error) {
    return errorResponse(res, 'Failed to update availability', 500);
  }
});

// ─── GET /:doctorUserId/log ───────────────────────────────
// CMO/Reception views status change history
router.get('/:doctorUserId/log', verifyToken, verifyRole([
  ROLES.CMO, ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('doctorAvailability')
      .doc(req.params.doctorUserId)
      .collection('statusLog')
      .orderBy('updatedAt', 'desc')
      .get();

    const log = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return successResponse(res, log);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch status log', 500);
  }
});

module.exports = router;