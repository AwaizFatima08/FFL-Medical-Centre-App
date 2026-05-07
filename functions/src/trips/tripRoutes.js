// functions/src/trips/tripRoutes.js
// Flow 4 — Medical Trip
// Bookable by: employee
// Managed by: reception (confirm/cancel)
// View only:  cmo, doctor
// Seat cap:   24 per trip date

const express = require('express');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

const router = express.Router();
const db = getFirestore();

const SEAT_CAP = 24;

const ROLES = {
  EMPLOYEE:  'employee',
  RECEPTION: 'reception',
  CMO:       'cmo',
  DOCTOR:    'doctor',
  ADMIN:     'admin_incharge',
};

const STATUS = {
  PENDING:   'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

// ── Helper: get user role ─────────────────────────────────────────────────────
async function getUserRole(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) throw new Error('User not found');
  return doc.data().role;
}

// ── Helper: get employee record linked to a user ──────────────────────────────
async function getEmployeeData(uid) {
  const snapshot = await db.collection('employees')
    .where('userId', '==', uid)
    .limit(1)
    .get();
  if (snapshot.empty) throw new Error('Employee record not found');
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

// ── Helper: count confirmed seats for a trip date ─────────────────────────────
async function getConfirmedCount(tripDate) {
  const snapshot = await db.collection('tripBookings')
    .where('tripDate', '==', tripDate)
    .where('status', '==', STATUS.CONFIRMED)
    .get();
  return snapshot.size;
}

// ── POST /book — employee submits a booking request ───────────────────────────
router.post('/book', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    if (role !== ROLES.EMPLOYEE) {
      return res.status(403).json({ success: false, message: 'Only employees can book trips' });
    }

    const { tripDate, pickupHouse, referralConfirmed, overnightStay, returnTrip, notes } = req.body;

    if (!tripDate?.trim()) {
      return res.status(400).json({ success: false, message: 'Trip date is required' });
    }
    if (!pickupHouse?.trim()) {
      return res.status(400).json({ success: false, message: 'Pickup house number is required' });
    }

    // Validate trip date is Mon/Wed/Sat
    const dayOfWeek = new Date(tripDate).getDay(); // 0=Sun,1=Mon,3=Wed,6=Sat
    if (![1, 3, 6].includes(dayOfWeek)) {
      return res.status(400).json({ success: false, message: 'Trips only run on Monday, Wednesday, and Saturday' });
    }

    // Check employee doesn't already have an active booking for this date
    const existing = await db.collection('tripBookings')
      .where('bookedBy', '==', uid)
      .where('tripDate', '==', tripDate)
      .where('status', 'in', [STATUS.PENDING, STATUS.CONFIRMED])
      .get();

    if (!existing.empty) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active booking for this trip date',
      });
    }

    // Check seat availability
    const confirmedCount = await getConfirmedCount(tripDate);
    if (confirmedCount >= SEAT_CAP) {
      return res.status(400).json({
        success: false,
        message: `All ${SEAT_CAP} seats are full for this trip date. Please choose another date.`,
      });
    }

    // Fetch employee details to store on booking
    const employee = await getEmployeeData(uid);

    const booking = {
      bookedBy:          uid,
      employeeName:      employee.fullName || '',
      employeeNumber:    employee.officialEmployeeNumber || '',
      department:        employee.department || '',
      phone:             employee.phone || '',
      tripDate:          tripDate.trim(),
      pickupHouse:       pickupHouse.trim(),
      referralConfirmed: referralConfirmed === true,
      overnightStay:     overnightStay === true,
      returnTrip:        returnTrip !== false, // defaults to true
      notes:             notes?.trim() || null,
      status:            STATUS.PENDING,
      confirmedAt:       null,
      confirmedBy:       null,
      cancelledAt:       null,
      cancelledBy:       null,
      createdAt:         Timestamp.now(),
    };

    const ref = await db.collection('tripBookings').add(booking);
    res.json({
      success: true,
      message: 'Booking submitted. Reception will confirm your seat.',
      data: { id: ref.id, ...booking },
    });

  } catch (error) {
    console.error('Trip book error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit booking', error: error.message });
  }
});

// ── GET /my — employee views their own bookings ───────────────────────────────
router.get('/my', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    if (role !== ROLES.EMPLOYEE) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const snapshot = await db.collection('tripBookings')
      .where('bookedBy', '==', uid)
      .orderBy('tripDate', 'desc')
      .get();

    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data });

  } catch (error) {
    console.error('Trip my bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load bookings', error: error.message });
  }
});

// ── GET /confirmedCount — seat count for a trip date ─────────────────────────
// Must be defined before /:id to avoid route conflict
router.get('/confirmedCount', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    const allowed = [ROLES.RECEPTION, ROLES.CMO, ROLES.DOCTOR, ROLES.ADMIN];
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { tripDate } = req.query;
    if (!tripDate) {
      return res.status(400).json({ success: false, message: 'tripDate query param is required' });
    }

    const count = await getConfirmedCount(tripDate);
    res.json({ success: true, count, seatsLeft: SEAT_CAP - count, capacity: SEAT_CAP });

  } catch (error) {
    console.error('Confirmed count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get seat count', error: error.message });
  }
});

// ── GET /all — reception/cmo/doctor view all bookings for a date ──────────────
// Must be defined before /:id to avoid route conflict
router.get('/all', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    const allowed = [ROLES.RECEPTION, ROLES.CMO, ROLES.DOCTOR, ROLES.ADMIN];
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { tripDate, status } = req.query;
    if (!tripDate) {
      return res.status(400).json({ success: false, message: 'tripDate query param is required' });
    }

    let query = db.collection('tripBookings').where('tripDate', '==', tripDate);
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.orderBy('createdAt', 'asc').get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data });

  } catch (error) {
    console.error('Trip all error:', error);
    res.status(500).json({ success: false, message: 'Failed to load bookings', error: error.message });
  }
});

// ── GET /:id — fetch single booking ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    const allowed = [ROLES.EMPLOYEE, ROLES.RECEPTION, ROLES.CMO, ROLES.DOCTOR, ROLES.ADMIN];
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const doc = await db.collection('tripBookings').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = { id: doc.id, ...doc.data() };

    // Employees can only view their own bookings
    if (role === ROLES.EMPLOYEE && booking.bookedBy !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: booking });

  } catch (error) {
    console.error('Trip get error:', error);
    res.status(500).json({ success: false, message: 'Failed to load booking', error: error.message });
  }
});

// ── POST /:id/confirm — reception confirms a seat ─────────────────────────────
router.post('/:id/confirm', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    if (role !== ROLES.RECEPTION) {
      return res.status(403).json({ success: false, message: 'Only reception can confirm bookings' });
    }

    const ref = db.collection('tripBookings').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = doc.data();
    if (booking.status !== STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm a booking with status: ${booking.status}`,
      });
    }

    // Re-check seat availability at confirm time
    const confirmedCount = await getConfirmedCount(booking.tripDate);
    if (confirmedCount >= SEAT_CAP) {
      return res.status(400).json({
        success: false,
        message: `All ${SEAT_CAP} seats are full. Cannot confirm this booking.`,
      });
    }

    await ref.update({
      status:      STATUS.CONFIRMED,
      confirmedAt: Timestamp.now(),
      confirmedBy: uid,
    });

    res.json({ success: true, message: 'Booking confirmed successfully' });

  } catch (error) {
    console.error('Trip confirm error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm booking', error: error.message });
  }
});

// ── POST /:id/cancel — employee or reception cancels ─────────────────────────
router.post('/:id/cancel', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    const allowed = [ROLES.EMPLOYEE, ROLES.RECEPTION, ROLES.ADMIN];
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const ref = db.collection('tripBookings').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = doc.data();

    // Employee can only cancel their own booking
    if (role === ROLES.EMPLOYEE && booking.bookedBy !== uid) {
      return res.status(403).json({ success: false, message: 'You can only cancel your own bookings' });
    }

    if (booking.status === STATUS.CANCELLED) {
      return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
    }
    if (booking.status === STATUS.COMPLETED) {
      return res.status(400).json({ success: false, message: 'Cannot cancel a completed booking' });
    }

    await ref.update({
      status:      STATUS.CANCELLED,
      cancelledAt: Timestamp.now(),
      cancelledBy: uid,
    });

    res.json({ success: true, message: 'Booking cancelled successfully' });

  } catch (error) {
    console.error('Trip cancel error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel booking', error: error.message });
  }
});

module.exports = router;