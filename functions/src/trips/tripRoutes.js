const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO, getDayOfWeek } = require('../utils');
const {
  ROLES,
  TRIP_STATUS,
  BOOKING_STATUS,
  MEDICAL_TRIP_TOTAL_SEATS,
  MEDICAL_TRIP_DAYS,
} = require('../constants');

// ─── POST /create ─────────────────────────────────────────
// Reception creates a trip for a specific date
router.post('/create', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { tripDate } = req.body;

    if (!tripDate) {
      return errorResponse(res, 'tripDate is required (YYYY-MM-DD)', 400);
    }

    const dayOfWeek = getDayOfWeek(tripDate);
    if (!MEDICAL_TRIP_DAYS.includes(dayOfWeek)) {
      return errorResponse(res,
        'Trips can only be created on Monday, Wednesday or Saturday',
        400);
    }

    // Check trip not already created for this date
    const existing = await db.collection('medicalTrips')
      .where('tripDate', '==', tripDate)
      .get();

    if (!existing.empty) {
      return errorResponse(res, 'A trip already exists for this date', 409);
    }

    const tripRef = db.collection('medicalTrips').doc();
    await tripRef.set({
      tripDate,
      dayOfWeek,
      departureMC:  '17:30',
      departureRYK: '21:00',
      totalSeats:   MEDICAL_TRIP_TOTAL_SEATS,
      seatsBooked:  0,
      status:       TRIP_STATUS.OPEN,
      createdBy:    req.user.uid,
      createdAt:    nowISO(),
    });

    return successResponse(res,
      { tripId: tripRef.id },
      'Trip created successfully',
      201
    );
  } catch (error) {
    console.error('Create trip error:', error);
    return errorResponse(res, 'Failed to create trip', 500);
  }
});

// ─── GET /upcoming ────────────────────────────────────────
// All upcoming open trips
router.get('/upcoming', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const today = new Date().toISOString().split('T')[0];

    const snapshot = await db.collection('medicalTrips')
      .where('tripDate', '>=', today)
      .where('status', 'in', [TRIP_STATUS.OPEN, TRIP_STATUS.FULL])
      .orderBy('tripDate', 'asc')
      .get();

    const trips = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      seatsAvailable: MEDICAL_TRIP_TOTAL_SEATS - doc.data().seatsBooked,
    }));

    return successResponse(res, trips);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch upcoming trips', 500);
  }
});

// ─── GET /all ─────────────────────────────────────────────
// Reception/Doctor/CMO views all trips
router.get('/all', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.DOCTOR, ROLES.CMO, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { month, year } = req.query;

    let query = db.collection('medicalTrips').orderBy('tripDate', 'desc');

    const snapshot = await query.get();
    let trips = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      seatsAvailable: MEDICAL_TRIP_TOTAL_SEATS - doc.data().seatsBooked,
    }));

    // Filter by month/year if provided
    if (month && year) {
      trips = trips.filter(trip => {
        const date = new Date(trip.tripDate);
        return date.getMonth() + 1 === parseInt(month) &&
               date.getFullYear() === parseInt(year);
      });
    }

    return successResponse(res, trips);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch trips', 500);
  }
});

// ─── GET /:tripId ─────────────────────────────────────────
router.get('/:tripId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const doc = await db.collection('medicalTrips').doc(req.params.tripId).get();

    if (!doc.exists) {
      return errorResponse(res, 'Trip not found', 404);
    }

    return successResponse(res, {
      id: doc.id,
      ...doc.data(),
      seatsAvailable: MEDICAL_TRIP_TOTAL_SEATS - doc.data().seatsBooked,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch trip', 500);
  }
});

// ─── POST /:tripId/book ───────────────────────────────────
// Employee books seats on a trip
router.post('/:tripId/book', verifyToken, verifyRole([
  ROLES.EMPLOYEE, ROLES.RECEPTION, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      patientName,
      patientRelation,
      consultantToVisit,
      seatsRequired,
      referralConfirmed,
      familyMemberId,
    } = req.body;

    if (!patientName || !consultantToVisit || !seatsRequired) {
      return errorResponse(res,
        'patientName, consultantToVisit and seatsRequired are required',
        400);
    }

    if (!referralConfirmed) {
      return errorResponse(res,
        'Please confirm you have a valid doctor referral to proceed',
        400);
    }

    const tripRef = db.collection('medicalTrips').doc(req.params.tripId);

    // Run as transaction to prevent overbooking
    const result = await db.runTransaction(async (transaction) => {
      const tripDoc = await transaction.get(tripRef);

      if (!tripDoc.exists) {
        throw new Error('Trip not found');
      }

      const tripData = tripDoc.data();

      if (tripData.status === TRIP_STATUS.CANCELLED) {
        throw new Error('This trip has been cancelled');
      }

      if (tripData.status === TRIP_STATUS.COMPLETED) {
        throw new Error('This trip has already been completed');
      }

      const seatsAvailable = tripData.totalSeats - tripData.seatsBooked;

      if (seatsRequired > seatsAvailable) {
        throw new Error(
          `Only ${seatsAvailable} seat(s) available on this trip`
        );
      }

      // Check employee hasn't already booked this trip
      const existingBooking = await db.collection('medicalTrips')
        .doc(req.params.tripId)
        .collection('bookings')
        .where('bookedBy', '==', req.user.uid)
        .where('status', '!=', BOOKING_STATUS.CANCELLED)
        .get();

      if (!existingBooking.empty) {
        throw new Error('You already have a booking on this trip');
      }

      const newSeatsBooked = tripData.seatsBooked + seatsRequired;
      const newStatus = newSeatsBooked >= tripData.totalSeats
        ? TRIP_STATUS.FULL
        : TRIP_STATUS.OPEN;

      const bookingRef = tripRef.collection('bookings').doc();

      transaction.update(tripRef, {
        seatsBooked: newSeatsBooked,
        status:      newStatus,
      });

      transaction.set(bookingRef, {
        bookedBy:          req.user.uid,
        patientName,
        patientRelation:   patientRelation || null,
        familyMemberId:    familyMemberId || null,
        consultantToVisit,
        seatsRequired,
        referralConfirmed: true,
        status:            BOOKING_STATUS.PENDING,
        approvedBy:        null,
        approvedAt:        null,
        locationSharingEnabled: false,
        createdAt:         nowISO(),
      });

      return { bookingId: bookingRef.id, tripStatus: newStatus };
    });

    return successResponse(res, result,
      'Booking created successfully. Awaiting reception approval.',
      201
    );
  } catch (error) {
    console.error('Booking error:', error);
    if (error.message.includes('seat') ||
        error.message.includes('booking') ||
        error.message.includes('cancelled') ||
        error.message.includes('completed')) {
      return errorResponse(res, error.message, 409);
    }
    return errorResponse(res, 'Booking failed', 500);
  }
});

// ─── GET /:tripId/bookings ────────────────────────────────
// Reception/Doctor/CMO views all bookings for a trip
router.get('/:tripId/bookings', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.DOCTOR, ROLES.CMO, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('medicalTrips')
      .doc(req.params.tripId)
      .collection('bookings')
      .get();

    const bookings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return successResponse(res, bookings);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch bookings', 500);
  }
});

// ─── GET /:tripId/my-booking ──────────────────────────────
// Employee views own booking on a trip
router.get('/:tripId/my-booking', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('medicalTrips')
      .doc(req.params.tripId)
      .collection('bookings')
      .where('bookedBy', '==', req.user.uid)
      .get();

    if (snapshot.empty) {
      return errorResponse(res, 'No booking found for this trip', 404);
    }

    return successResponse(res, {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data(),
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch booking', 500);
  }
});

// ─── POST /:tripId/bookings/:bookingId/approve ────────────
// Reception approves a booking
router.post('/:tripId/bookings/:bookingId/approve', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const bookingRef = db.collection('medicalTrips')
      .doc(req.params.tripId)
      .collection('bookings')
      .doc(req.params.bookingId);

    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) {
      return errorResponse(res, 'Booking not found', 404);
    }

    await bookingRef.update({
      status:     BOOKING_STATUS.APPROVED,
      approvedBy: req.user.uid,
      approvedAt: nowISO(),
    });

    return successResponse(res, null, 'Booking approved');
  } catch (error) {
    return errorResponse(res, 'Approval failed', 500);
  }
});

// ─── POST /:tripId/bookings/:bookingId/cancel ─────────────
router.post('/:tripId/bookings/:bookingId/cancel', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const tripRef  = db.collection('medicalTrips').doc(req.params.tripId);
    const bookingRef = tripRef.collection('bookings').doc(req.params.bookingId);

    await db.runTransaction(async (transaction) => {
      const tripDoc    = await transaction.get(tripRef);
      const bookingDoc = await transaction.get(bookingRef);

      if (!bookingDoc.exists) throw new Error('Booking not found');

      const bookingData = bookingDoc.data();

      // Employee can only cancel own booking
      if (req.userRole === ROLES.EMPLOYEE &&
          bookingData.bookedBy !== req.user.uid) {
        throw new Error('Forbidden');
      }

      if (bookingData.status === BOOKING_STATUS.CANCELLED) {
        throw new Error('Booking already cancelled');
      }

      const tripData       = tripDoc.data();
      const newSeatsBooked = tripData.seatsBooked - bookingData.seatsRequired;
      const newStatus      = tripData.status === TRIP_STATUS.FULL
        ? TRIP_STATUS.OPEN
        : tripData.status;

      transaction.update(bookingRef, {
        status:      BOOKING_STATUS.CANCELLED,
        cancelledAt: nowISO(),
        cancelledBy: req.user.uid,
      });

      transaction.update(tripRef, {
        seatsBooked: newSeatsBooked,
        status:      newStatus,
      });
    });

    return successResponse(res, null, 'Booking cancelled');
  } catch (error) {
    if (error.message === 'Forbidden') {
      return errorResponse(res, 'Forbidden', 403);
    }
    return errorResponse(res, 'Cancellation failed', 500);
  }
});

// ─── POST /:tripId/bookings/:bookingId/location ───────────
// Employee shares live location for pickup coordination
router.post('/:tripId/bookings/:bookingId/location', verifyToken,
  verifyRole([ROLES.EMPLOYEE]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { latitude, longitude } = req.body;

      if (!latitude || !longitude) {
        return errorResponse(res, 'latitude and longitude are required', 400);
      }

      const bookingRef = db.collection('medicalTrips')
        .doc(req.params.tripId)
        .collection('bookings')
        .doc(req.params.bookingId);

      const bookingDoc = await bookingRef.get();
      if (!bookingDoc.exists) {
        return errorResponse(res, 'Booking not found', 404);
      }

      if (bookingDoc.data().bookedBy !== req.user.uid) {
        return errorResponse(res, 'Forbidden', 403);
      }

      await bookingRef.update({
        locationSharingEnabled: true,
        currentLocation: { latitude, longitude },
        locationUpdatedAt: nowISO(),
      });

      return successResponse(res, null, 'Location updated');
    } catch (error) {
      return errorResponse(res, 'Location update failed', 500);
    }
  }
);

// ─── POST /:tripId/complete ───────────────────────────────
// Reception marks trip as completed
router.post('/:tripId/complete', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const tripRef = db.collection('medicalTrips').doc(req.params.tripId);
    const tripDoc = await tripRef.get();

    if (!tripDoc.exists) {
      return errorResponse(res, 'Trip not found', 404);
    }

    await tripRef.update({
      status:      TRIP_STATUS.COMPLETED,
      completedAt: nowISO(),
      completedBy: req.user.uid,
    });

    return successResponse(res, null, 'Trip marked as completed');
  } catch (error) {
    return errorResponse(res, 'Failed to complete trip', 500);
  }
});

module.exports = router;