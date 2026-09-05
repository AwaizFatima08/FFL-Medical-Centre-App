// functions/src/trips/tripRoutes.js
// Flow 4 — Medical Trip
// Bookable by: employee
// Managed by: reception (confirm/cancel)
// View only:  cmo, doctor
// Seat cap:   24 total per trip date, max 4 per booking

const express = require('express');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { createNotification } = require('../notifications/notificationRoutes');

const router = express.Router();
const db = getFirestore();

const SEAT_CAP  = 24;
const MAX_SEATS = 4;

// Phase 11 review, Day 22 — mirrors TripBookingScreen.js's RELATIONS /
// FAMILY_RELATION_VALUE. Kept here too (not imported) since this is the
// backend's own trust boundary — a stale or modified client shouldn't be
// able to submit a relation this route wouldn't otherwise accept.
const VALID_RELATIONS = ['Self', 'Spouse', 'Son', 'Daughter'];
const FAMILY_RELATION_VALUE = { Spouse: 'spouse', Son: 'son', Daughter: 'daughter' };

// Phase 11 review, Day 22 — the trip only ever travels to Rahimyarkhan;
// a doctorId from anywhere else shouldn't be acceptable here even if the
// frontend's own filter is somehow bypassed or stale.
const TRIP_CITY = 'Rahimyarkhan';

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

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getUserRole(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) throw new Error('User not found');
  return doc.data().role;
}

async function getEmployeeData(uid) {
  const snapshot = await db.collection('employees')
    .where('userId', '==', uid)
    .limit(1)
    .get();
  if (snapshot.empty) throw new Error('Employee record not found');
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function getConfirmedSeats(tripDate) {
  const snapshot = await db.collection('tripBookings')
    .where('tripDate', '==', tripDate)
    .where('status', '==', STATUS.CONFIRMED)
    .get();
  return snapshot.docs.reduce((sum, doc) => sum + (doc.data().seats || 1), 0);
}

// ── POST /book ────────────────────────────────────────────────────────────────
router.post('/book', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    if (role !== ROLES.EMPLOYEE) {
      return res.status(403).json({ success: false, message: 'Only employees can book trips' });
    }

    const {
      tripDate, pickupHouse, seats = 1,
      patientName, patientRelation, patientFamilyMemberId,
      doctorId, doctorName, hospital,
      referralConfirmed, overnightStay, returnTrip, notes,
    } = req.body;

    if (!tripDate?.trim())    return res.status(400).json({ success: false, message: 'Trip date is required' });
    if (!pickupHouse?.trim()) return res.status(400).json({ success: false, message: 'Pickup house is required' });
    if (!patientName?.trim()) return res.status(400).json({ success: false, message: 'Patient name is required' });

    // Phase 11 review, Day 22 — relation is no longer free-form. Self needs
    // nothing further; Spouse/Son/Daughter must point at a real, validated,
    // active family record belonging to this employee — otherwise the whole
    // point of linking bookings to real family data is just cosmetic on the
    // frontend and bypassable by anyone calling this route directly.
    if (!VALID_RELATIONS.includes(patientRelation)) {
      return res.status(400).json({
        success: false,
        message: `patientRelation must be one of: ${VALID_RELATIONS.join(', ')}`,
      });
    }

    let verifiedFamilyMemberId = null;
    const employee = await getEmployeeData(uid);

    if (patientRelation !== 'Self') {
      if (!patientFamilyMemberId) {
        return res.status(400).json({
          success: false,
          message: `A registered ${patientRelation.toLowerCase()} must be selected, or choose Self and add a note`,
        });
      }

      // Corrected same session as the frontend fix — familyMembers is a
      // top-level collection keyed by its own doc id, with an `employeeId`
      // field holding the owning employee's Auth uid. It is NOT a
      // subcollection under employees/{id} (that path is a separate, dead
      // route in employeeRoutes.js that nothing else reads from or writes
      // to — see Command Board note for Phase 11).
      const memberDoc = await db.collection('familyMembers').doc(patientFamilyMemberId).get();

      if (!memberDoc.exists) {
        return res.status(400).json({ success: false, message: 'Selected family member not found' });
      }
      const member = memberDoc.data();
      if (member.employeeId !== uid) {
        return res.status(400).json({ success: false, message: 'Selected family member does not belong to you' });
      }
      if (member.relation !== FAMILY_RELATION_VALUE[patientRelation]) {
        return res.status(400).json({ success: false, message: 'Selected family member does not match the chosen relation' });
      }
      if (member.status !== 'validated' || member.isActive === false) {
        return res.status(400).json({ success: false, message: 'Selected family member is not an active, validated record' });
      }

      verifiedFamilyMemberId = patientFamilyMemberId;
    }

    // If a doctor was picked from the directory (not typed manually),
    // confirm they're actually Rahimyarkhan-based — same reasoning as the
    // family-member check above: don't trust the frontend's own filter alone.
    if (doctorId) {
      const doctorDoc = await db.collection('doctorDirectory').doc(doctorId).get();
      if (!doctorDoc.exists) {
        return res.status(400).json({ success: false, message: 'Selected doctor not found' });
      }
      if (doctorDoc.data().city !== TRIP_CITY) {
        return res.status(400).json({
          success: false,
          message: 'Only Rahimyarkhan-based doctors can be referred for this trip',
        });
      }
    }

    const seatCount = parseInt(seats, 10);
    if (isNaN(seatCount) || seatCount < 1 || seatCount > MAX_SEATS) {
      return res.status(400).json({
        success: false,
        message: `Number of seats must be between 1 and ${MAX_SEATS}`,
      });
    }

    // Validate trip date is Mon/Wed/Sat
    const [year, month, day] = tripDate.split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    if (![1, 3, 6].includes(dayOfWeek)) {
      return res.status(400).json({
        success: false,
        message: 'Trips only run on Monday, Wednesday, and Saturday',
      });
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
    const confirmedSeats = await getConfirmedSeats(tripDate);
    if (confirmedSeats + seatCount > SEAT_CAP) {
      const seatsLeft = SEAT_CAP - confirmedSeats;
      return res.status(400).json({
        success: false,
        message: seatsLeft <= 0
          ? `All ${SEAT_CAP} seats are full for this date.`
          : `Only ${seatsLeft} seat(s) remaining. You requested ${seatCount}.`,
      });
    }

    const booking = {
      bookedBy:               uid,
      employeeName:           employee.fullName || '',
      employeeNumber:         employee.officialEmployeeNumber || '',
      department:             employee.department || '',
      phone:                  employee.phone || '',
      tripDate:               tripDate.trim(),
      pickupHouse:            pickupHouse.trim(),
      seats:                  seatCount,
      patientName:            patientName.trim(),
      patientRelation:        patientRelation || 'Self',
      patientFamilyMemberId:  verifiedFamilyMemberId,
      doctorId:               doctorId || null,
      doctorName:             doctorName || null,
      hospital:               hospital || null,
      referralConfirmed:      referralConfirmed === true,
      overnightStay:          overnightStay === true,
      returnTrip:             returnTrip !== false,
      notes:                  notes?.trim() || null,
      status:                 STATUS.PENDING,
      confirmedAt:            null,
      confirmedBy:            null,
      cancelledAt:            null,
      cancelledBy:            null,
      createdAt:              Timestamp.now(),
    };

    const ref = await db.collection('tripBookings').add(booking);

    // ── Notify all active reception staff of new booking ──────────────────────
    try {
      const receptionSnap = await db.collection('users')
        .where('role', '==', ROLES.RECEPTION)
        .where('isActive', '==', true)
        .get();

      await Promise.all(receptionSnap.docs.map(doc =>
        createNotification({
          recipientUid:  doc.id,
          recipientRole: ROLES.RECEPTION,
          title:         'New Medical Trip Booking',
          body:          `${employee.fullName || 'An employee'} has requested a trip seat for ${tripDate}. Patient: ${patientName.trim()}.`,
          type:          'trip',
          referenceId:   ref.id,
        })
      ));
    } catch (notifError) {
      console.error('Trip booking notification error:', notifError);
    }

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

// ── GET /my ───────────────────────────────────────────────────────────────────
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

// ── GET /confirmedCount — must be before /:id ─────────────────────────────────
router.get('/confirmedCount', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    const allowed = [ROLES.RECEPTION, ROLES.CMO, ROLES.DOCTOR, ROLES.ADMIN];
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { tripDate } = req.query;
    if (!tripDate) return res.status(400).json({ success: false, message: 'tripDate is required' });

    const count = await getConfirmedSeats(tripDate);
    res.json({ success: true, count, seatsLeft: SEAT_CAP - count, capacity: SEAT_CAP });

  } catch (error) {
    console.error('Confirmed count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get seat count', error: error.message });
  }
});

// ── GET /all — must be before /:id ────────────────────────────────────────────
router.get('/all', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    const allowed = [ROLES.RECEPTION, ROLES.CMO, ROLES.DOCTOR, ROLES.ADMIN];
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { tripDate, status } = req.query;
    if (!tripDate) return res.status(400).json({ success: false, message: 'tripDate is required' });

    let query = db.collection('tripBookings').where('tripDate', '==', tripDate);
    if (status) query = query.where('status', '==', status);
    const snapshot = await query.orderBy('createdAt', 'asc').get();

    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data });

  } catch (error) {
    console.error('Trip all error:', error);
    res.status(500).json({ success: false, message: 'Failed to load bookings', error: error.message });
  }
});

// ── GET /:id ──────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    const allowed = [ROLES.EMPLOYEE, ROLES.RECEPTION, ROLES.CMO, ROLES.DOCTOR, ROLES.ADMIN];
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const doc = await db.collection('tripBookings').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Booking not found' });

    const booking = { id: doc.id, ...doc.data() };

    if (role === ROLES.EMPLOYEE && booking.bookedBy !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: booking });

  } catch (error) {
    console.error('Trip get error:', error);
    res.status(500).json({ success: false, message: 'Failed to load booking', error: error.message });
  }
});

// ── POST /:id/confirm ─────────────────────────────────────────────────────────
router.post('/:id/confirm', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    if (role !== ROLES.RECEPTION) {
      return res.status(403).json({ success: false, message: 'Only reception can confirm bookings' });
    }

    const ref = db.collection('tripBookings').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Booking not found' });

    const booking = doc.data();
    if (booking.status !== STATUS.PENDING) {
      return res.status(400).json({ success: false, message: `Cannot confirm a booking with status: ${booking.status}` });
    }

    // Re-check seat availability at confirm time
    const confirmedSeats = await getConfirmedSeats(booking.tripDate);
    const requestedSeats = booking.seats || 1;
    if (confirmedSeats + requestedSeats > SEAT_CAP) {
      const seatsLeft = SEAT_CAP - confirmedSeats;
      return res.status(400).json({
        success: false,
        message: seatsLeft <= 0
          ? `All ${SEAT_CAP} seats are full. Cannot confirm.`
          : `Only ${seatsLeft} seat(s) left but this booking needs ${requestedSeats}.`,
      });
    }

    await ref.update({
      status:      STATUS.CONFIRMED,
      confirmedAt: Timestamp.now(),
      confirmedBy: uid,
    });

    // ── Notify employee their booking is confirmed ────────────────────────────
    await createNotification({
      recipientUid:  booking.bookedBy,
      recipientRole: ROLES.EMPLOYEE,
      title:         'Medical Trip Booking Confirmed',
      body:          `Your trip booking for ${booking.tripDate} has been confirmed. Departure: 17:30. Patient: ${booking.patientName}.`,
      type:          'trip',
      referenceId:   req.params.id,
    });

    res.json({ success: true, message: 'Booking confirmed successfully' });

  } catch (error) {
    console.error('Trip confirm error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm booking', error: error.message });
  }
});

// ── POST /:id/cancel ──────────────────────────────────────────────────────────
router.post('/:id/cancel', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    // Admin's trip access is read-only (Phase 11 review) — cancel intentionally
    // left out of this list, unlike GET /all, /confirmedCount and /:id which
    // admin still has for viewing.
    const allowed = [ROLES.EMPLOYEE, ROLES.RECEPTION];
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { reason } = req.body;

    const ref = db.collection('tripBookings').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Booking not found' });

    const booking = doc.data();

    if (role === ROLES.EMPLOYEE && booking.bookedBy !== uid) {
      return res.status(403).json({ success: false, message: 'You can only cancel your own bookings' });
    }

    // Reception cancelling someone else's booking must give a reason — this
    // is an internal record only, never shown verbatim to the employee (see
    // the fixed notification text below). Employees cancelling their own
    // booking need no reason — it's their own choice.
    if (role === ROLES.RECEPTION && !reason?.trim()) {
      return res.status(400).json({ success: false, message: 'A cancellation reason is required' });
    }

    if (booking.status === STATUS.CANCELLED) {
      return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
    }
    if (booking.status === STATUS.COMPLETED) {
      return res.status(400).json({ success: false, message: 'Cannot cancel a completed booking' });
    }

    await ref.update({
      status:        STATUS.CANCELLED,
      cancelledAt:   Timestamp.now(),
      cancelledBy:   uid,
      cancelReason:  role === ROLES.RECEPTION ? reason.trim() : null,
    });

    // ── Notify employee only if cancelled by someone else (reception) ─────────
    // Fixed, generic wording by design — the real reason stays internal on the
    // booking record (cancelReason above), visible to reception/CMO only. The
    // employee is pointed to a phone call rather than an automated explanation.
    if (booking.bookedBy !== uid) {
      await createNotification({
        recipientUid:  booking.bookedBy,
        recipientRole: ROLES.EMPLOYEE,
        title:         'Medical Trip Booking Cancelled',
        body:          'Your booking is cancelled by reception, please call medical centre for further details.',
        type:          'trip',
        referenceId:   req.params.id,
      });
    }

    res.json({ success: true, message: 'Booking cancelled successfully' });

  } catch (error) {
    console.error('Trip cancel error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel booking', error: error.message });
  }
});

module.exports = router;