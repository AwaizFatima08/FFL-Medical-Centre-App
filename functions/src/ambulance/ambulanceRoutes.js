const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO } = require('../utils');
const { ROLES, AMBULANCE_STATUS, VEHICLE_TYPES, PRIORITY_FLAGS, TRIP_TYPES } = require('../constants');

// ─── POST /request ────────────────────────────────────────
// Employee or Reception creates dispatch request
router.post('/request', verifyToken, verifyRole([
  ROLES.EMPLOYEE, ROLES.RECEPTION, ROLES.CMO, ROLES.DOCTOR,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      patientName,
      patientRelation,
      patientCondition,
      vehicleType,
      priorityFlag,
      tripType,
      pickupLocation,
      dropLocation,
      notes,
    } = req.body;

    if (!patientName || !patientCondition || !vehicleType || !priorityFlag || !tripType) {
      return errorResponse(res,
        'patientName, patientCondition, vehicleType, priorityFlag and tripType are required',
        400);
    }

    if (!Object.values(VEHICLE_TYPES).includes(vehicleType)) {
      return errorResponse(res,
        `Invalid vehicleType. Valid values: ${Object.values(VEHICLE_TYPES).join(', ')}`,
        400);
    }

    if (!Object.values(PRIORITY_FLAGS).includes(priorityFlag)) {
      return errorResponse(res,
        `Invalid priorityFlag. Valid values: ${Object.values(PRIORITY_FLAGS).join(', ')}`,
        400);
    }

    // Check for active emergency — block routine if emergency active
    if (priorityFlag === PRIORITY_FLAGS.ROUTINE) {
      const activeEmergency = await db.collection('ambulanceRequests')
        .where('priorityFlag', '==', PRIORITY_FLAGS.EMERGENCY)
        .where('status', 'in', [
          AMBULANCE_STATUS.PENDING,
          AMBULANCE_STATUS.ACCEPTED,
          AMBULANCE_STATUS.DISPATCHED,
          AMBULANCE_STATUS.PICKED_UP,
        ])
        .get();

      if (!activeEmergency.empty) {
        return errorResponse(res,
          'An emergency is currently active. Routine requests are on hold.',
          409);
      }
    }

    const requestRef = db.collection('ambulanceRequests').doc();
    await requestRef.set({
      requestedBy:       req.user.uid,
      requestedByType:   req.userRole,
      patientName,
      patientRelation:   patientRelation || null,
      patientCondition,
      vehicleType,
      priorityFlag,
      tripType:          tripType || TRIP_TYPES.INTRA_TOWNSHIP,
      pickupLocation:    pickupLocation || null,
      dropLocation:      dropLocation || null,
      status:            AMBULANCE_STATUS.PENDING,
      assignedDriver:    null,
      vehicleAssigned:   vehicleType,
      doctorObserver:    null,
      overriddenBy:      null,
      dispatchedAt:      null,
      pickedUpAt:        null,
      returnedAt:        null,
      notes:             notes || null,
      createdAt:         nowISO(),
    });

    return successResponse(res,
      { requestId: requestRef.id },
      'Ambulance request created successfully',
      201
    );
  } catch (error) {
    console.error('Create ambulance request error:', error);
    return errorResponse(res, 'Failed to create request', 500);
  }
});

// ─── GET /active ──────────────────────────────────────────
// All active requests — visible to Reception, Driver, Doctor, CMO
router.get('/active', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.DRIVER, ROLES.DOCTOR, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('ambulanceRequests')
      .where('status', 'in', [
        AMBULANCE_STATUS.PENDING,
        AMBULANCE_STATUS.ACCEPTED,
        AMBULANCE_STATUS.DISPATCHED,
        AMBULANCE_STATUS.PICKED_UP,
      ])
      .orderBy('createdAt', 'desc')
      .get();

    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return successResponse(res, requests);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch active requests', 500);
  }
});

// ─── GET /my-requests ────────────────────────────────────
// Employee views own requests
router.get('/my-requests', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('ambulanceRequests')
      .where('requestedBy', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return successResponse(res, requests);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch requests', 500);
  }
});

// ─── GET /:requestId ──────────────────────────────────────
router.get('/:requestId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const doc = await db.collection('ambulanceRequests')
      .doc(req.params.requestId).get();

    if (!doc.exists) {
      return errorResponse(res, 'Request not found', 404);
    }

    return successResponse(res, { id: doc.id, ...doc.data() });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch request', 500);
  }
});

// ─── POST /:requestId/assign ──────────────────────────────
// Reception assigns driver and dispatches
router.post('/:requestId/assign', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { driverUid, vehicleType } = req.body;

    if (!driverUid || !vehicleType) {
      return errorResponse(res, 'driverUid and vehicleType are required', 400);
    }

    const requestRef = db.collection('ambulanceRequests').doc(req.params.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return errorResponse(res, 'Request not found', 404);
    }

    if (requestDoc.data().status !== AMBULANCE_STATUS.PENDING) {
      return errorResponse(res, 'Request is no longer pending', 409);
    }

    await requestRef.update({
      assignedDriver:  driverUid,
      vehicleAssigned: vehicleType,
      status:          AMBULANCE_STATUS.ACCEPTED,
      assignedAt:      nowISO(),
      assignedBy:      req.user.uid,
    });

    return successResponse(res, null, 'Driver assigned successfully');
  } catch (error) {
    return errorResponse(res, 'Assignment failed', 500);
  }
});

// ─── POST /:requestId/dispatch ────────────────────────────
// Reception confirms dispatch
router.post('/:requestId/dispatch', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const requestRef = db.collection('ambulanceRequests').doc(req.params.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return errorResponse(res, 'Request not found', 404);
    }

    if (requestDoc.data().status !== AMBULANCE_STATUS.ACCEPTED) {
      return errorResponse(res, 'Request must be accepted before dispatch', 409);
    }

    await requestRef.update({
      status:       AMBULANCE_STATUS.DISPATCHED,
      dispatchedAt: nowISO(),
    });

    return successResponse(res, null, 'Ambulance dispatched');
  } catch (error) {
    return errorResponse(res, 'Dispatch failed', 500);
  }
});

// ─── POST /:requestId/picked-up ───────────────────────────
// Driver pushes button on arrival at pickup location
router.post('/:requestId/picked-up', verifyToken, verifyRole([
  ROLES.DRIVER,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { latitude, longitude } = req.body;

    const requestRef = db.collection('ambulanceRequests').doc(req.params.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return errorResponse(res, 'Request not found', 404);
    }

    if (requestDoc.data().status !== AMBULANCE_STATUS.DISPATCHED) {
      return errorResponse(res, 'Request must be dispatched first', 409);
    }

    await requestRef.update({
      status:     AMBULANCE_STATUS.PICKED_UP,
      pickedUpAt: nowISO(),
      pickupGPS:  latitude && longitude ? { latitude, longitude } : null,
    });

    return successResponse(res, null, 'Patient picked up confirmed');
  } catch (error) {
    return errorResponse(res, 'Status update failed', 500);
  }
});

// ─── POST /:requestId/returned ────────────────────────────
// Driver pushes button on return to medical centre
router.post('/:requestId/returned', verifyToken, verifyRole([
  ROLES.DRIVER,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { latitude, longitude } = req.body;

    const requestRef = db.collection('ambulanceRequests').doc(req.params.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return errorResponse(res, 'Request not found', 404);
    }

    if (requestDoc.data().status !== AMBULANCE_STATUS.PICKED_UP) {
      return errorResponse(res, 'Patient must be picked up first', 409);
    }

    await requestRef.update({
      status:     AMBULANCE_STATUS.RETURNED,
      returnedAt: nowISO(),
      returnGPS:  latitude && longitude ? { latitude, longitude } : null,
    });

    return successResponse(res, null, 'Vehicle returned to medical centre');
  } catch (error) {
    return errorResponse(res, 'Status update failed', 500);
  }
});

// ─── POST /:requestId/cancel ──────────────────────────────
router.post('/:requestId/cancel', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.CMO, ROLES.DOCTOR,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { reason } = req.body;

    const requestRef = db.collection('ambulanceRequests').doc(req.params.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return errorResponse(res, 'Request not found', 404);
    }

    if ([AMBULANCE_STATUS.RETURNED, AMBULANCE_STATUS.CANCELLED]
        .includes(requestDoc.data().status)) {
      return errorResponse(res, 'Request is already completed or cancelled', 409);
    }

    await requestRef.update({
      status:       AMBULANCE_STATUS.CANCELLED,
      cancelledAt:  nowISO(),
      cancelledBy:  req.user.uid,
      cancelReason: reason || null,
    });

    return successResponse(res, null, 'Request cancelled');
  } catch (error) {
    return errorResponse(res, 'Cancellation failed', 500);
  }
});

// ─── POST /:requestId/override ────────────────────────────
// Doctor/CMO overrides vehicle type or priority
router.post('/:requestId/override', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { vehicleType, priorityFlag, notes } = req.body;

    const requestRef = db.collection('ambulanceRequests').doc(req.params.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return errorResponse(res, 'Request not found', 404);
    }

    const updates = {
      overriddenBy:  req.user.uid,
      overriddenAt:  nowISO(),
      overrideNotes: notes || null,
    };

    if (vehicleType) updates.vehicleType   = vehicleType;
    if (priorityFlag) updates.priorityFlag = priorityFlag;

    await requestRef.update(updates);

    return successResponse(res, null, 'Override applied successfully');
  } catch (error) {
    return errorResponse(res, 'Override failed', 500);
  }
});

// ─── POST /:requestId/location ────────────────────────────
// Driver updates live GPS location
router.post('/:requestId/location', verifyToken, verifyRole([
  ROLES.DRIVER,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return errorResponse(res, 'latitude and longitude are required', 400);
    }

    const requestRef = db.collection('ambulanceRequests').doc(req.params.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return errorResponse(res, 'Request not found', 404);
    }

    await requestRef.update({
      currentLocation: { latitude, longitude },
      locationUpdatedAt: nowISO(),
    });

    return successResponse(res, null, 'Location updated');
  } catch (error) {
    return errorResponse(res, 'Location update failed', 500);
  }
});

module.exports = router;