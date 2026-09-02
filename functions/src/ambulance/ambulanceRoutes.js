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

// Day 16 (Phase 5, Step 5.4, corrected) — statuses that hold the single
// system-wide active-trip slot. Only ONE driver/vehicle can be physically
// in motion at a time, so the lock starts at 'dispatched' — NOT at
// 'accepted'. Multiple requests can sit 'accepted' simultaneously
// (reception reviewing/triaging several at once); only actual dispatch is
// exclusive. 'returned' still holds the slot because the trip isn't
// administratively closed until 'completed'.
const BLOCKING_STATUSES = [
  AMBULANCE_STATUS.DISPATCHED,
  AMBULANCE_STATUS.PICKED_UP,
  AMBULANCE_STATUS.RETURNED,
];

// Helper: fetch every non-terminal request, sorted emergency-first then
// oldest-first. This is the single system-wide queue order — used both to
// compute a request's queue position and to check whether the active-trip
// slot is currently held. NOTE: this subphase (5.4) only lets emergencies
// jump ahead of other WAITING (pending) requests. It does not let an
// emergency interrupt a trip that is already accepted/dispatched/picked_up/
// returned — that mid-trip interrupt is Phase 5.7, not built yet.
async function getActiveQueue() {
  const snap = await db.collection('ambulanceRequests')
    .where('status', 'not-in', [AMBULANCE_STATUS.COMPLETED, AMBULANCE_STATUS.CANCELLED])
    .get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  docs.sort((a, b) => {
    const aEmergency = a.priorityFlag === 'emergency' ? 0 : 1;
    const bEmergency = b.priorityFlag === 'emergency' ? 0 : 1;
    if (aEmergency !== bEmergency) return aEmergency - bEmergency;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return docs;
}

// GET /on-duty-driver - Current on-duty driver, for reception's info box
// Day 16 (Phase 5, Step 5.6.1). Same field convention as GET /drivers above
// (reads fullName off the users doc, falling back to email — a pre-existing
// pattern in this file, not something introduced here).
router.get("/on-duty-driver", async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    if (!["reception", "cmo", "admin_incharge"].includes(userRole)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const snapshot = await db.collection("users")
      .where("role", "==", "driver")
      .where("onDuty", "==", true)
      .limit(1)
      .get();
    const onDutyDriver = snapshot.empty ? null : {
      uid:      snapshot.docs[0].id,
      email:    snapshot.docs[0].data().email,
      fullName: snapshot.docs[0].data().fullName || snapshot.docs[0].data().email,
    };
    res.json({ success: true, data: onDutyDriver });
  } catch (error) {
    console.error("Fetch on-duty driver error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch on-duty driver", error: error.message });
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
      patientName, patientRelation, patientCondition, employeeNumber,
      vehicleType, priorityFlag, tripType, purposeOfVisit,
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

    // Day 16 (Phase 5, Step 5.5, hardened during audit) — identifies which
    // employee/family this request belongs to, independent of who actually
    // submitted it. For an employee's own submission, derive it server-side
    // from their own uid rather than trusting the client-supplied value —
    // reception's value legitimately stays client-supplied (it identifies
    // whichever employee they searched for, which the server has no other
    // way to know), but an employee submitting for themselves should not
    // be able to submit under a different employee's number just by
    // sending different JSON. Used below for the family-level duplicate
    // block and for the employee's own GET /my-active lookup.
    let resolvedEmployeeNumber = employeeNumber;
    if (!isReception) {
      try {
        const ownEmployeeData = await getEmployeeData(uid);
        resolvedEmployeeNumber = ownEmployeeData.officialEmployeeNumber;
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Could not find your employee record.' });
      }
    }
    if (!resolvedEmployeeNumber?.trim()) {
      return res.status(400).json({ success: false, message: 'Employee number is required' });
    }

    // Day 16 (Phase 5, Step 5.5) — block a second active request for the
    // same family while one is already open, regardless of which specific
    // family member it's for. "Active" = anything not yet completed or
    // cancelled. Applies equally whether this new submission is from the
    // employee themselves or from reception on their behalf.
    const dupSnap = await db.collection('ambulanceRequests')
      .where('employeeNumber', '==', resolvedEmployeeNumber.trim())
      .where('status', 'not-in', [AMBULANCE_STATUS.COMPLETED, AMBULANCE_STATUS.CANCELLED])
      .limit(1)
      .get();
    if (!dupSnap.empty) {
      const existing = dupSnap.docs[0].data();
      return res.status(400).json({
        success: false,
        message: `An ambulance request is already active for your family (${existing.patientName}, status: ${existing.status}). Please wait until it is completed or cancelled before submitting a new one.`,
      });
    }

    // Day 16 (Phase 5, Step 5.4) — reception's on-behalf-of requests were
    // previously ALWAYS auto-accepted, which let reception bypass the
    // single-active-trip lock just by using their own screen. Now: only
    // auto-accept if the slot is actually free; otherwise this request
    // joins the queue as 'pending', same as an employee submission.
    const blockingSnap = await db.collection('ambulanceRequests')
      .where('status', 'in', BLOCKING_STATUSES)
      .limit(1)
      .get();
    const slotFree = blockingSnap.empty;
    const autoAccept = isReception && slotFree;

    const requestData = {
      requestedBy:      uid,
      requestedByType:  userRole,
      employeeNumber:   resolvedEmployeeNumber.trim(),
      patientName:      patientName.trim(),
      patientRelation:  patientRelation?.trim() || 'Self',
      patientCondition: patientCondition.trim(),
      purposeOfVisit:   purposeOfVisit || null,
      vehicleType:      vehicleType || 'mini',
      priorityFlag:     priorityFlag || 'routine',
      tripType:         tripType || 'intra_township',
      pickupLocation:   pickupLocation?.trim() || null,
      dropLocation:     dropLocation?.trim() || null,
      status:           autoAccept ? AMBULANCE_STATUS.ACCEPTED : AMBULANCE_STATUS.PENDING,
      assignedDriver:   null,
      vehicleAssigned:  vehicleType || 'mini',
      doctorObserver:   null,
      overriddenBy:     null,
      dispatchedAt:     null,
      pickedUpAt:       null,
      returnedAt:       null,
      completedAt:      null,
      acceptedAt:       autoAccept ? now : null,
      acceptedBy:       autoAccept ? uid : null,
      cancelledBy:      null,
      cancelledAt:      null,
      cancelReason:     null,
      notes:            notes?.trim() || null,
      createdAt:        now,
    };

    const docRef = await db.collection('ambulanceRequests').add(requestData);

    // ── Notifications ─────────────────────────────────────────────────────────
    if (!autoAccept) {
      // Not auto-accepted — either an employee request, or a reception
      // request that had to join the queue because the slot was held.
      await notifyReception(
        'New Ambulance Request',
        `${requestData.patientName} — ${requestData.patientCondition}. Pickup: ${requestData.pickupLocation || 'Not specified'}.`,
        docRef.id
      );
    }

    // Day 16 (Phase 5, Step 5.4) — queue position, shown to the requester
    // at submission time. No ETA (deliberately dropped per design doc §1)
    // — just an honest position number.
    let message;
    if (autoAccept) {
      message = 'Request created and auto-approved. Ready for dispatch.';
    } else {
      const queue = await getActiveQueue();
      const position = queue.findIndex(r => r.id === docRef.id) + 1;
      if (slotFree) {
        message = `Ambulance request submitted. You are #${position} in queue.`;
      } else {
        // Day 16 (Phase 5, Step 5.6.3) — an intercity trip (e.g. referral
        // to Sadiqabad/RYK) takes the vehicle away for longer than a
        // routine within-township trip. Told plainly rather than left to
        // guess, since there's no ETA to give them either way.
        const blockingData = blockingSnap.docs[0]?.data();
        const awayNote = blockingData?.tripType === 'intercity'
          ? ' An ambulance is currently away on an intercity trip. Please call the medical centre directly to check on the expected delay.'
          : ' An ambulance is currently on another trip.';
        message = `Ambulance request submitted.${awayNote} You are #${position} in queue.`;
      }
    }

    res.json({
      success: true,
      message,
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

    // Day 16 (Phase 5, Step 5.4) — attach each request's true queue
    // position (emergency-first, then oldest-first) without changing the
    // display order above (kept newest-first for reception's browsing
    // convenience — that's unrelated to actual dispatch priority).
    const queue = await getActiveQueue();
    const positionById = new Map(queue.map((r, i) => [r.id, i + 1]));
    requests.forEach(r => { r.queuePosition = positionById.get(r.id) || null; });

    res.json({ success: true, message: 'Success', data: requests });

  } catch (error) {
    console.error('Fetch active requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch active requests', error: error.message });
  }
});

// GET /my-active - Get the calling employee's own family's current active
// request, if any. Day 16 (Phase 5, Step 5.5). Purpose-built rather than
// opening up GET /:id to the employee role: this endpoint inherently can
// only ever return the caller's own family's request (matched by
// employeeNumber), so there's no separate ownership check to get wrong.
// Matches by employeeNumber, not requestedBy, so this correctly finds a
// request even if reception submitted it on the employee's behalf.
router.get('/my-active', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);

    if (userRole !== 'employee') {
      return res.status(403).json({ success: false, message: 'Employee access only' });
    }

    const employeeData = await getEmployeeData(uid);
    const employeeNumber = employeeData.officialEmployeeNumber;
    if (!employeeNumber) {
      return res.json({ success: true, data: null });
    }

    const snapshot = await db.collection('ambulanceRequests')
      .where('employeeNumber', '==', employeeNumber)
      .where('status', 'not-in', [AMBULANCE_STATUS.COMPLETED, AMBULANCE_STATUS.CANCELLED])
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json({ success: true, data: null });
    }

    const doc = snapshot.docs[0];
    const requestOut = { id: doc.id, ...doc.data() };

    // Day 16 (Phase 5, Step 5.5) — same queue-position computation as
    // GET /active, so the employee sees their real position when checking
    // status, not just at the moment of submission.
    const queue = await getActiveQueue();
    const position = queue.findIndex(r => r.id === doc.id);
    requestOut.queuePosition = position === -1 ? null : position + 1;

    res.json({ success: true, data: requestOut });

  } catch (error) {
    console.error('Fetch my-active request error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your active request', error: error.message });
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
    const { vehicleType } = req.body;

    if (!['reception', 'cmo'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Day 16 (Phase 5, Step 5.6.2) — driver is no longer picked by
    // reception. Auto-assign whoever is currently on duty (set at login/
    // logout, see authRoutes.js), derived server-side rather than trusted
    // from the client — same reasoning as employeeNumber in Step 5.5.
    const onDutySnap = await db.collection('users')
      .where('role', '==', 'driver')
      .where('onDuty', '==', true)
      .limit(1)
      .get();
    if (onDutySnap.empty) {
      return res.status(400).json({ success: false, message: 'No driver is currently on duty. Cannot dispatch.' });
    }
    const driverUid = onDutySnap.docs[0].id;

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
      assignedDriver:  driverUid,
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

    // Day 16 (Phase 5, Step 5.4) — single system-wide active-trip lock.
    // Only one driver/vehicle exists, so only one request may be
    // dispatched at a time. Multiple requests can be 'accepted' at once
    // (reception triage) — the lock applies only here, at actual dispatch,
    // and releases when the blocking trip reaches 'completed'. This does
    // NOT let an emergency interrupt a trip already in motion — that
    // mid-trip interrupt is Phase 5.7, not built yet.
    const blockingSnap = await db.collection('ambulanceRequests')
      .where('status', 'in', BLOCKING_STATUSES)
      .limit(1)
      .get();
    if (!blockingSnap.empty) {
      const blocking = blockingSnap.docs[0].data();
      return res.status(400).json({
        success: false,
        message: `Cannot dispatch — an ambulance is currently on another trip (${blocking.patientName}, status: ${blocking.status}). This request can be dispatched once that trip is completed.`,
      });
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
      `Ambulance has returned to the medical centre with ${data.patientName}. Please confirm arrival.`,
      id
    );

    res.json({ success: true, message: 'Returned to medical center successfully' });

  } catch (error) {
    console.error('Return error:', error);
    res.status(500).json({ success: false, message: 'Failed to update return status', error: error.message });
  }
});

// Day 16 (Phase 5, Step 5.6.3) — renamed from /complete. This step now
// only confirms the patient has physically arrived back at the Medical
// Centre — it frees the vehicle for a new dispatch (ARRIVED is not in
// BLOCKING_STATUSES) but does NOT fully close the request, since the
// return-home leg (Drop Off / Drop Off Not Required, below) is still
// outstanding. The request keeps blocking a duplicate request from the
// same family until that leg is resolved (ARRIVED is not in the
// [COMPLETED, CANCELLED] terminal set used throughout this file).
router.post('/:id/arrive', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;

    if (!['reception', 'cmo'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Only reception and CMO can confirm arrival' });
    }

    const docRef = db.collection('ambulanceRequests').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const data = doc.data();
    if (data.status !== AMBULANCE_STATUS.RETURNED) {
      return res.status(400).json({ success: false, message: `Cannot confirm arrival from status: ${data.status}` });
    }

    await docRef.update({
      status:    AMBULANCE_STATUS.ARRIVED,
      arrivedAt: Timestamp.now().toDate().toISOString(),
    });

    // ── Notification: patient has arrived — trip is not yet fully closed ──────
    await createNotification({
      recipientUid:  data.requestedBy,
      recipientRole: data.requestedByType,
      title:         'Patient Arrived at Medical Centre',
      body:          `${data.patientName} has arrived at the Medical Centre.`,
      type:          'ambulance',
      referenceId:   id,
    });

    res.json({ success: true, message: 'Arrival confirmed. Awaiting drop off.' });

  } catch (error) {
    console.error('Arrive error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm arrival', error: error.message });
  }
});

// Day 16 (Phase 5, Step 5.6.3) — the actual final close-out. Single click,
// no in-transit tracking for the return leg itself (deliberately not
// engineered further — same driver, same vehicle, no new pickup to
// coordinate). outcome is one of three fixed values:
//   'dropped_off'      — patient actually taken home
//   'referred_outside' — referred to an outside facility (Sadiqabad/RYK) —
//                        reception separately raises a new, ordinary
//                        request for that transport; nothing special here
//   'patient_declined' — patient opted to return home on their own
router.post('/:id/dropoff', async (req, res) => {
  try {
    const { uid } = req.user;
    const userRole = await getUserRole(uid);
    const { id } = req.params;
    const { outcome } = req.body;

    if (!['reception', 'cmo'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Only reception and CMO can close the drop-off' });
    }

    const validOutcomes = ['dropped_off', 'referred_outside', 'patient_declined'];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ success: false, message: `outcome must be one of: ${validOutcomes.join(', ')}` });
    }

    const docRef = db.collection('ambulanceRequests').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const data = doc.data();
    if (data.status !== AMBULANCE_STATUS.ARRIVED) {
      return res.status(400).json({ success: false, message: `Cannot close drop-off from status: ${data.status}` });
    }

    const now = Timestamp.now().toDate().toISOString();
    await docRef.update({
      status:            AMBULANCE_STATUS.COMPLETED,
      dropOffOutcome:    outcome,
      dropOffTriggeredAt: now,
      completedAt:        now,
    });

    // ── Notification: trip is now genuinely, fully closed ──────────────────────
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
    console.error('Dropoff error:', error);
    res.status(500).json({ success: false, message: 'Failed to close drop-off', error: error.message });
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
    } else if (userRole === 'employee') {
      // Day 16 (Phase 5, Step 5.5) — the employee's own family can cancel
      // their own request, but only while still pending (before reception
      // has acted on it). Matched by employeeNumber, not requestedBy — a
      // request reception submitted on the employee's behalf still belongs
      // to that employee for cancellation purposes.
      let employeeNumber;
      try {
        const employeeData = await getEmployeeData(uid);
        employeeNumber = employeeData.officialEmployeeNumber;
      } catch (e) {
        employeeNumber = null;
      }
      if (!employeeNumber || data.employeeNumber !== employeeNumber) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (data.status !== AMBULANCE_STATUS.PENDING) {
        return res.status(403).json({ success: false, message: 'This request has already been accepted by reception and can no longer be cancelled directly. Please contact reception.' });
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