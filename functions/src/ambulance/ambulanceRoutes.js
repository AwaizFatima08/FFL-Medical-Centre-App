// functions/src/ambulance/ambulanceRoutes.js
const express = require('express');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { ROLES, AMBULANCE_STATUS } = require('../constants');
const { createNotification } = require('../notifications/notificationRoutes');

const router = express.Router();
const db = getFirestore();

// Helper: get user role
async function getUserRole(uid) {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('User not found');
  return userDoc.data().role;
}

// Helper: get employee data
async function getEmployeeData(uid) {
  const empQuery = await db.collection('employees').where('userId', '==', uid).get();
  if (empQuery.empty) throw new Error('Employee record not found');
  return empQuery.docs[0].data();
}

// Helper: notify all active reception users
async function notifyReception(title, body, referenceId) {
  const snap = await db.collection('users')
    .where('role', '==', 'reception')
    .where('isActive', '==', true)
    .get();
  await Promise.all(snap.docs.map(doc =>
    createNotification({
      recipientUid:  doc.id,
      recipientRole: 'reception',
      title,
      body,
      type:          'ambulance',
      referenceId,
    })
  ));
}

// GET /drivers - Get list of available drivers (for reception dropdown)
router.get("/drivers", async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    if (!["reception", "cmo", "admin_incharge"].includes(userRole)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const snapshot = await db.collection("users")
      .where("role", "==", "driver")
      .where("isActive", "==", true)
      .get();
    const drivers = snapshot.docs.map(doc => ({
      uid:      doc.id,
      email:    doc.data().email,
      fullName: doc.data().fullName || doc.data().email
    }));
    res.json({ success: true, data: drivers });
  } catch (error) {
    console.error("Fetch drivers error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch drivers", error: error.message });
  }
});

// POST /request - Submit new ambulance request (employee or reception)
router.post('/request', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);

    if (!['employee', 'reception'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const {
      patientName, patientRelation, patientCondition,
      vehicleType, priorityFlag, tripType,
      pickupLocation, dropLocation, notes
    } = req.body;

    if (!patientName?.trim()) {
      return res.status(400).json({ success: false, message: 'Patient name is required' });
    }
    if (!patientCondition?.trim()) {
      return res.status(400).json({ success: false, message: 'Patient condition is required' });
    }

    const isReception = userRole === 'reception';
    const now = Timestamp.now().toDate().toISOString();

    const requestData = {
      requestedBy:      uid,
      requestedByType:  userRole,
      patientName:      patientName.trim(),
      patientRelation:  patientRelation?.trim() || 'Self',
      patientCondition: patientCondition.trim(),
      vehicleType:      vehicleType || 'mini',
      priorityFlag:     priorityFlag || 'routine',
      tripType:         tripType || 'intra_township',
      pickupLocation:   pickupLocation?.trim() || null,
      dropLocation:     dropLocation?.trim() || null,
      status:           isReception ? AMBULANCE_STATUS.ACCEPTED : AMBULANCE_STATUS.PENDING,
      assignedDriver:   null,
      vehicleAssigned:  vehicleType || 'mini',
      doctorObserver:   null,
      overriddenBy:     null,
      dispatchedAt:     null,
      pickedUpAt:       null,
      returnedAt:       null,
      completedAt:      null,
      acceptedAt:       isReception ? now : null,
      acceptedBy:       isReception ? uid : null,
      cancelledBy:      null,
      cancelledAt:      null,
      cancelReason:     null,
      notes:            notes?.trim() || null,
      createdAt:        now,
    };

    const docRef = await db.collection('ambulanceRequests').add(requestData);

    // ── Notifications ─────────────────────────────────────────────────────────
    if (!isReception) {
      // Employee request — notify all reception staff
      await notifyReception(
        'New Ambulance Request',
        `${requestData.patientName} — ${requestData.patientCondition}. Pickup: ${requestData.pickupLocation || 'Not specified'}.`,
        docRef.id
      );
    }
    // Reception-created requests are auto-accepted — no inbound notification needed

    res.json({
      success: true,
      message: isReception
        ? 'Request created and auto-approved. Ready for dispatch.'
        : 'Ambulance request submitted. Awaiting reception approval.',
      data: { id: docRef.id, ...requestData }
    });

  } catch (error) {
    console.error('Submit request error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit request', error: error.message });
  }
});

// GET /active - Get all active (non-completed/cancelled) requests
router.get('/active', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);

    if (!['reception', 'cmo', 'admin_incharge'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const snapshot = await db.collection('ambulanceRequests')
      .where('status', 'not-in', [AMBULANCE_STATUS.COMPLETED, AMBULANCE_STATUS.CANCELLED])
      .orderBy('createdAt', 'desc')
      .get();

    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, message: 'Success', data: requests });

  } catch (error) {
    console.error('Fetch active requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch active requests', error: error.message });
  }
});

// GET /:id - Get specific request details
router.get('/:id', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;

    if (!['reception', 'driver', 'cmo', 'admin_incharge'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const doc = await db.collection('ambulanceRequests').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    res.json({ success: true, data: { id: doc.id, ...doc.data() } });

  } catch (error) {
    console.error('Fetch request error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch request', error: error.message });
  }
});

// POST /:id/accept - Accept a pending request (reception workflow)
router.post('/:id/accept', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;

    if (!['reception', 'cmo'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Only reception and CMO can accept requests' });
    }

    const docRef = db.collection('ambulanceRequests').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const data = doc.data();
    if (data.status !== AMBULANCE_STATUS.PENDING) {
      return res.status(400).json({ success: false, message: `Cannot accept request with status: ${data.status}` });
    }

    await docRef.update({
      status:     AMBULANCE_STATUS.ACCEPTED,
      acceptedBy: uid,
      acceptedAt: Timestamp.now().toDate().toISOString(),
    });

    // ── Notification: inform employee their request was accepted ──────────────
    await createNotification({
      recipientUid:  data.requestedBy,
      recipientRole: data.requestedByType,
      title:         'Ambulance Request Accepted',
      body:          `Your ambulance request for ${data.patientName} has been accepted by reception. A driver will be assigned shortly.`,
      type:          'ambulance',
      referenceId:   id,
    });

    res.json({ success: true, message: 'Request accepted successfully' });

  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept request', error: error.message });
  }
});

// POST /:id/assign - Assign driver and vehicle
router.post('/:id/assign', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;
    const { driverUid, vehicleType } = req.body;

    if (!['reception', 'cmo'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!driverUid?.trim()) {
      return res.status(400).json({ success: false, message: 'Driver UID is required' });
    }

    const driverDoc = await db.collection('users').doc(driverUid.trim()).get();
    if (!driverDoc.exists || driverDoc.data().role !== 'driver') {
      return res.status(400).json({ success: false, message: 'Invalid driver UID' });
    }

    const docRef = db.collection('ambulanceRequests').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const data = doc.data();
    if (data.status !== AMBULANCE_STATUS.ACCEPTED) {
      return res.status(400).json({ success: false, message: `Cannot assign driver to request with status: ${data.status}. Request must be accepted first.` });
    }

    await docRef.update({
      assignedDriver:  driverUid.trim(),
      vehicleAssigned: vehicleType || data.vehicleType || 'mini',
    });

    res.json({ success: true, message: 'Driver assigned successfully' });

  } catch (error) {
    console.error('Assign driver error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign driver', error: error.message });
  }
});

// POST /:id/dispatch - Dispatch ambulance
router.post('/:id/dispatch', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;

    if (!['reception', 'cmo'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const docRef = db.collection('ambulanceRequests').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const data = doc.data();
    if (data.status !== AMBULANCE_STATUS.ACCEPTED || !data.assignedDriver) {
      return res.status(400).json({ success: false, message: 'Cannot dispatch. Request must be accepted and have assigned driver.' });
    }

    await docRef.update({
      status:      AMBULANCE_STATUS.DISPATCHED,
      dispatchedAt: Timestamp.now().toDate().toISOString(),
    });

    // ── Notifications: employee told ambulance is on the way ──────────────────
    await createNotification({
      recipientUid:  data.requestedBy,
      recipientRole: data.requestedByType,
      title:         'Ambulance Dispatched',
      body:          `The ambulance is on its way for ${data.patientName}. Please be ready at the pickup point.`,
      type:          'ambulance',
      referenceId:   id,
    });

    res.json({ success: true, message: 'Ambulance dispatched successfully' });

  } catch (error) {
    console.error('Dispatch error:', error);
    res.status(500).json({ success: false, message: 'Failed to dispatch ambulance', error: error.message });
  }
});

// POST /:id/pickup - Driver marks arrived at pickup (patient picked up)
router.post('/:id/pickup', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;

    if (userRole !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can mark pickup' });
    }

    const docRef = db.collection('ambulanceRequests').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const data = doc.data();
    if (data.assignedDriver !== uid) {
      return res.status(403).json({ success: false, message: 'Not assigned to this request' });
    }
    if (data.status !== AMBULANCE_STATUS.DISPATCHED) {
      return res.status(400).json({ success: false, message: `Cannot pickup from status: ${data.status}` });
    }

    await docRef.update({
      status:     AMBULANCE_STATUS.PICKED_UP,
      pickedUpAt: Timestamp.now().toDate().toISOString(),
    });

    // ── Notification: reception told driver arrived at pickup ─────────────────
    await notifyReception(
      'Ambulance Arrived at Pickup',
      `Driver has arrived at pickup point for ${data.patientName}. Patient being transported.`,
      id
    );

    res.json({ success: true, message: 'Patient picked up successfully' });

  } catch (error) {
    console.error('Pickup error:', error);
    res.status(500).json({ success: false, message: 'Failed to update pickup status', error: error.message });
  }
});

// POST /:id/return - Driver marks returned to medical centre
router.post('/:id/return', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;

    if (userRole !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can mark return' });
    }

    const docRef = db.collection('ambulanceRequests').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const data = doc.data();
    if (data.assignedDriver !== uid) {
      return res.status(403).json({ success: false, message: 'Not assigned to this request' });
    }
    if (data.status !== AMBULANCE_STATUS.PICKED_UP) {
      return res.status(400).json({ success: false, message: `Cannot return from status: ${data.status}` });
    }

    await docRef.update({
      status:     AMBULANCE_STATUS.RETURNED,
      returnedAt: Timestamp.now().toDate().toISOString(),
    });

    // ── Notification: reception told ambulance has returned ───────────────────
    await notifyReception(
      'Ambulance Returned to Medical Centre',
      `Ambulance has returned to the medical centre with ${data.patientName}. Please complete the request.`,
      id
    );

    res.json({ success: true, message: 'Returned to medical center successfully' });

  } catch (error) {
    console.error('Return error:', error);
    res.status(500).json({ success: false, message: 'Failed to update return status', error: error.message });
  }
});

// POST /:id/complete - Mark request as completed (reception only)
router.post('/:id/complete', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;

    if (!['reception', 'cmo'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Only reception and CMO can complete requests' });
    }

    const docRef = db.collection('ambulanceRequests').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const data = doc.data();
    if (data.status !== AMBULANCE_STATUS.RETURNED) {
      return res.status(400).json({ success: false, message: `Cannot complete from status: ${data.status}` });
    }

    await docRef.update({
      status:      AMBULANCE_STATUS.COMPLETED,
      completedAt: Timestamp.now().toDate().toISOString(),
    });

    // ── Notification: inform employee trip is fully completed ─────────────────
    await createNotification({
      recipientUid:  data.requestedBy,
      recipientRole: data.requestedByType,
      title:         'Ambulance Trip Completed',
      body:          `Your ambulance trip for ${data.patientName} has been completed and closed.`,
      type:          'ambulance',
      referenceId:   id,
    });

    res.json({ success: true, message: 'Request completed successfully' });

  } catch (error) {
    console.error('Complete error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete request', error: error.message });
  }
});

// POST /:id/cancel - Cancel request
router.post('/:id/cancel', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;
    const { reason } = req.body;

    const docRef = db.collection('ambulanceRequests').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const data = doc.data();

    // Permission checks
    if (userRole === 'reception' || userRole === 'cmo') {
      // Can cancel at any stage
    } else if (userRole === 'driver' && data.assignedDriver === uid) {
      if (!['dispatched', 'picked_up'].includes(data.status)) {
        return res.status(403).json({ success: false, message: 'Drivers can only cancel during dispatch or pickup phases' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (['completed', 'cancelled'].includes(data.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel ${data.status} request` });
    }

    await docRef.update({
      status:      AMBULANCE_STATUS.CANCELLED,
      cancelledBy: uid,
      cancelledAt: Timestamp.now().toDate().toISOString(),
      cancelReason: reason?.trim() || 'No reason provided',
    });

    // ── Notification: inform employee of cancellation ─────────────────────────
    // Only notify if it wasn't cancelled by the employee themselves
    if (data.requestedBy !== uid) {
      await createNotification({
        recipientUid:  data.requestedBy,
        recipientRole: data.requestedByType,
        title:         'Ambulance Request Cancelled',
        body:          `Your ambulance request for ${data.patientName} has been cancelled.${reason ? ` Reason: ${reason.trim()}` : ''}`,
        type:          'ambulance',
        referenceId:   id,
      });
    }

    res.json({ success: true, message: 'Request cancelled successfully' });

  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel request', error: error.message });
  }
});

// GET /driver/active - Get active trip for current driver
router.get('/driver/active', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);

    if (userRole !== 'driver') {
      return res.status(403).json({ success: false, message: 'Driver access only' });
    }

    const snapshot = await db.collection('ambulanceRequests')
      .where('assignedDriver', '==', uid)
      .where('status', 'in', [AMBULANCE_STATUS.DISPATCHED, AMBULANCE_STATUS.PICKED_UP])
      .orderBy('dispatchedAt', 'desc')
      .limit(1)
      .get();

    const activeTrip = snapshot.empty ? null : {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data()
    };

    res.json({ success: true, data: activeTrip });

  } catch (error) {
    console.error('Driver active trip error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch active trip', error: error.message });
  }
});

module.exports = router;