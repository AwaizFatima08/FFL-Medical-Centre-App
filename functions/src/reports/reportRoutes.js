const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');
const PDFDocument = require('pdfkit');
const { Parser }  = require('json2csv');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse } = require('../utils');
const {
  ROLES,
  AMBULANCE_STATUS,
  BOOKING_STATUS,
  APPOINTMENT_STATUS,
  VACCINE_STATUS,
  MEDICAL_TRIP_TOTAL_SEATS,   // ← Day 13 (Phase 2): real configured capacity, replaces the old tripData.totalSeats fallback
} = require('../constants');

// ─── HELPER — DATE RANGE FILTER ──────────────────────────
const inDateRange = (dateStr, fromDate, toDate) => {
  if (!fromDate && !toDate) return true;
  if (fromDate && dateStr < fromDate) return false;
  if (toDate && dateStr > toDate + 'T23:59:59') return false;
  return true;
};

// ─── HELPER — CALCULATE AGE FROM DOB ─────────────────────
const calcAge = (dob) => {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// ─── HELPER — DIFF MINUTES BETWEEN TWO ISO STRINGS ───────
const diffMinutes = (start, end) => {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  return Math.round(ms / 60000);
};

// ─── HELPER — SEND PDF BUFFER ─────────────────────────────
const sendPDF = (res, filename, buildFn) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  buildFn(doc);
  doc.end();
};

// ─── HELPER — BATCH HOSPITAL LOOKUP (Day 13, Phase 2) ────
// tripBookings has no `hospital` field of its own — it's looked up via
// doctorId → doctorDirectory.hospital at report-generation time.
// Fetches each unique doctorId once, not once per booking.
const getHospitalMap = async (db, doctorIds) => {
  const uniqueIds = [...new Set(doctorIds.filter(Boolean))];
  const map = {};
  await Promise.all(uniqueIds.map(async (id) => {
    const doc = await db.collection('doctorDirectory').doc(id).get();
    map[id] = doc.exists ? (doc.data().hospital || null) : null;
  }));
  return map;
};

// ─── HELPER — BATCH USER NAME LOOKUP (Day 19, Phase 5.9) ─
// Resolves uids (e.g. an ambulance request's acceptedBy field) to a
// display name, once per unique uid — same batched-lookup pattern as
// getHospitalMap above, not once per row. Falls back to email if
// fullName isn't set, matching the convention already used in
// ambulanceRoutes.js's GET /on-duty-driver.
const getUserNameMap = async (db, uids) => {
  const uniqueIds = [...new Set(uids.filter(Boolean))];
  const map = {};
  await Promise.all(uniqueIds.map(async (id) => {
    const doc = await db.collection('users').doc(id).get();
    map[id] = doc.exists ? (doc.data().fullName || doc.data().email || '—') : '—';
  }));
  return map;
};

// ─── HELPER — DAY OF WEEK FROM YYYY-MM-DD ────────────────
// tripBookings has no stored dayOfWeek field — derived from tripDate.
const dayOfWeekFrom = (tripDate) => {
  if (!tripDate) return null;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(tripDate).getDay()];
};

// ─────────────────────────────────────────────────────────
// ─── EXISTING ROUTES (unchanged) ─────────────────────────
// ─────────────────────────────────────────────────────────

// ─── GET /ambulance ───────────────────────────────────────
// Day 19 (Phase 5.9) — extended, not forked. This route already covered
// most of what reception's new history screen needs (date range,
// priority filter, full request list, role gating that already includes
// reception) — per PHASE5_DESIGN.md's own note to check this route before
// building fresh. Added: optional `status` filter (comma-separated,
// e.g. "completed,cancelled"), optional `employeeSearch` (name/number
// substring match), and `acceptedByName` resolved onto every row. All
// three are additive/optional — a caller that doesn't pass them gets
// exactly the previous behavior, so this stays safe for any other future
// consumer (e.g. Phase 5.8's CMO historical view) to reuse with its own
// query params.
router.get('/ambulance', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { fromDate, toDate, priorityFlag, vehicleType, status, employeeSearch, falseEmergencyOnly } = req.query;
    const snapshot = await db.collection('ambulanceRequests')
      .orderBy('createdAt', 'desc').get();
    let requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    requests = requests.filter(r => inDateRange(r.createdAt, fromDate, toDate));
    if (priorityFlag) requests = requests.filter(r => r.priorityFlag === priorityFlag);
    if (vehicleType)  requests = requests.filter(r => r.vehicleAssigned === vehicleType);

    // Day 21 (Phase 5.8.3) — filter to only requests flagged as a false
    // emergency at closure. Optional; unrelated to any other filter here.
    if (falseEmergencyOnly === 'true') {
      requests = requests.filter(r => r.falseEmergencyFlag === true);
    }

    // Day 19 (Phase 5.9) — optional status filter, comma-separated.
    // Reception's history screen calls this with status=completed,cancelled.
    if (status) {
      const statusList = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statusList.length) requests = requests.filter(r => statusList.includes(r.status));
    }

    // Day 19 (Phase 5.9) — free-text search against patient name or
    // employee number, case-insensitive substring match.
    if (employeeSearch) {
      const term = employeeSearch.trim().toLowerCase();
      requests = requests.filter(r =>
        (r.patientName || '').toLowerCase().includes(term) ||
        (r.employeeNumber || '').toLowerCase().includes(term)
      );
    }

    // Day 19 (Phase 5.9) — resolve acceptedBy uid to a display name.
    // Requests that were cancelled while still pending (never accepted)
    // simply have no acceptedBy, so they get null here, not a lookup.
    const acceptedByIds = requests.map(r => r.acceptedBy).filter(Boolean);
    const acceptedByMap = await getUserNameMap(db, acceptedByIds);
    requests.forEach(r => {
      r.acceptedByName = r.acceptedBy ? (acceptedByMap[r.acceptedBy] || '—') : null;
    });

    const summary = { total: requests.length, byStatus: {}, byVehicle: {}, byPriority: {}, byTripType: {} };
    requests.forEach(r => {
      summary.byStatus[r.status]          = (summary.byStatus[r.status]          || 0) + 1;
      summary.byVehicle[r.vehicleAssigned]= (summary.byVehicle[r.vehicleAssigned]|| 0) + 1;
      summary.byPriority[r.priorityFlag]  = (summary.byPriority[r.priorityFlag]  || 0) + 1;
      summary.byTripType[r.tripType]      = (summary.byTripType[r.tripType]      || 0) + 1;
    });
    return successResponse(res, { summary, requests });
  } catch (error) {
    return errorResponse(res, 'Failed to generate ambulance report', 500);
  }
});

// ─── GET /vaccination ─────────────────────────────────────
router.get('/vaccination', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const profilesSnapshot = await db.collection('vaccinationProfiles').get();
    const profilesWithSchedule = await Promise.all(profilesSnapshot.docs.map(async (profileDoc) => {
      const profile = { id: profileDoc.id, ...profileDoc.data() };
      const scheduleSnapshot = await db.collection('vaccinationProfiles').doc(profileDoc.id).collection('scheduleItems').get();
      const schedule = scheduleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const administered = schedule.filter(s => s.status === VACCINE_STATUS.ADMINISTERED).length;
      const pending      = schedule.filter(s => s.status === VACCINE_STATUS.PENDING).length;
      const missed       = schedule.filter(s => s.status === VACCINE_STATUS.MISSED).length;
      const rescheduled  = schedule.filter(s => s.status === VACCINE_STATUS.RESCHEDULED).length;
      const overdue      = schedule.filter(s => {
        const effectiveDate = s.rescheduledDate || s.dueDate;
        return s.status === VACCINE_STATUS.PENDING && effectiveDate < new Date().toISOString().split('T')[0];
      }).length;
      return { ...profile, stats: { total: schedule.length, administered, pending, missed, rescheduled, overdue,
        complianceRate: schedule.length > 0 ? Math.round((administered / schedule.length) * 100) : 0 } };
    }));
    const summary = {
      totalChildren:     profilesWithSchedule.length,
      fullyCompliant:    profilesWithSchedule.filter(p => p.stats.pending === 0 && p.stats.missed === 0).length,
      withOverdue:       profilesWithSchedule.filter(p => p.stats.overdue > 0).length,
      averageCompliance: profilesWithSchedule.length > 0
        ? Math.round(profilesWithSchedule.reduce((sum, p) => sum + p.stats.complianceRate, 0) / profilesWithSchedule.length)
        : 0,
    };
    return successResponse(res, { summary, profiles: profilesWithSchedule });
  } catch (error) {
    return errorResponse(res, 'Failed to generate vaccination report', 500);
  }
});

// ─── GET /fitness ─────────────────────────────────────────
router.get('/fitness', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { cycleYear } = req.query;
    const snapshot = await db.collection('fitnessAppointments').get();
    let appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (cycleYear) appointments = appointments.filter(a => a.cycleYear === parseInt(cycleYear));
    const empSnapshot = await db.collection('employees').where('isValidated', '==', true).get();
    const totalEmployees = empSnapshot.size;
    const summary = {
      totalEmployees,
      scheduled:    appointments.filter(a => a.status === APPOINTMENT_STATUS.SCHEDULED).length,
      rescheduled:  appointments.filter(a => a.status === APPOINTMENT_STATUS.RESCHEDULED).length,
      completed:    appointments.filter(a => a.status === APPOINTMENT_STATUS.COMPLETED).length,
      missed:       appointments.filter(a => a.status === APPOINTMENT_STATUS.MISSED).length,
      notScheduled: totalEmployees - appointments.length,
      byFitnessStatus: {
        fit:                   appointments.filter(a => a.fitnessOutcome === 'fit').length,
        unfit:                 appointments.filter(a => a.fitnessOutcome === 'unfit').length,
        fit_with_restrictions: appointments.filter(a => a.fitnessOutcome === 'fit_with_restrictions').length,
      },
      complianceRate: totalEmployees > 0
        ? Math.round((appointments.filter(a => a.status === APPOINTMENT_STATUS.COMPLETED).length / totalEmployees) * 100)
        : 0,
    };
    return successResponse(res, { summary, appointments });
  } catch (error) {
    return errorResponse(res, 'Failed to generate fitness report', 500);
  }
});

// ─── GET /employees ───────────────────────────────────────
router.get('/employees', verifyToken, verifyRole([
  ROLES.CMO, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { validated, department, bloodGroup } = req.query;
    let query = db.collection('employees');
    if (validated !== undefined) query = query.where('isValidated', '==', validated === 'true');
    const snapshot = await query.get();
    let employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (department) employees = employees.filter(e => e.department === department);
    if (bloodGroup)  employees = employees.filter(e => e.bloodGroup === bloodGroup);
    const employeesWithFamily = await Promise.all(employees.map(async (emp) => {
      const familySnapshot = await db.collection('employees').doc(emp.id).collection('familyMembers').get();
      return { ...emp, familyMemberCount: familySnapshot.size };
    }));
    const summary = { total: employees.length, validated: employees.filter(e => e.isValidated).length,
      pending: employees.filter(e => !e.isValidated).length, bloodDonors: employees.filter(e => e.bloodDonorConsent).length,
      byDepartment: {}, byBloodGroup: {}, byCommunity: {} };
    employees.forEach(e => {
      if (e.department)   summary.byDepartment[e.department]   = (summary.byDepartment[e.department]   || 0) + 1;
      if (e.bloodGroup)   summary.byBloodGroup[e.bloodGroup]   = (summary.byBloodGroup[e.bloodGroup]   || 0) + 1;
      if (e.communityGroup) summary.byCommunity[e.communityGroup] = (summary.byCommunity[e.communityGroup] || 0) + 1;
    });
    return successResponse(res, { summary, employees: employeesWithFamily });
  } catch (error) {
    return errorResponse(res, 'Failed to generate employee report', 500);
  }
});

// ─── GET /feedback ────────────────────────────────────────
// Phase 9 fix (flagged Day 13, confirmed and fixed here): this route was
// reading field names that don't match the real feedback schema —
// ratings are nested under `ratings.*`, not top-level `*Rating` fields;
// `isAnonymous` doesn't exist anywhere in this module (there's no
// anonymous-submission concept in Feedback); the comment field is
// `overallExperience`, not `comments`. Every average and comment count
// below has always silently returned null/0/empty because of this — same
// shape of bug as the Phase 1 Fitness report fix. Role list also locked
// to CMO only here, matching the rest of the feedback module (this was
// previously CMO + DOCTOR + RECEPTION, which meant those two roles could
// see aggregate feedback stats despite having no access to individual
// entries via feedbackRoutes.js — inconsistent, now resolved).
router.get('/feedback', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { month, year } = req.query;
    const snapshot = await db.collection('feedback').orderBy('submittedAt', 'desc').get();
    let feedbacks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (month && year) {
      feedbacks = feedbacks.filter(f => {
        const date = new Date(f.submittedAt);
        return date.getMonth() + 1 === parseInt(month) && date.getFullYear() === parseInt(year);
      });
    }

    // Averages a named rating field across all feedback docs, reading it
    // from the real nested location (ratings.<field>) — not top-level,
    // which is what the old version incorrectly did.
    const calcAvg = (field) => {
      const values = feedbacks
        .map(f => f.ratings?.[field])
        .filter(v => typeof v === 'number');
      if (values.length === 0) return null;
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    };

    // Per-service ratings (consultation, pharmacy, laboratory, xray,
    // nursing, dental, physiotherapy) each live as their own optional
    // field under ratings.*, present only when that service was used on
    // a given visit — there's no single "servicesRating" field to read,
    // unlike the three mandatory ratings above. This averages across all
    // of them combined, the closest real equivalent to what this summary
    // field was trying to represent.
    const SERVICE_RATING_KEYS = [
      'consultation', 'pharmacy', 'laboratory',
      'xray', 'nursing', 'dental', 'physiotherapy',
    ];
    const allServiceValues = feedbacks.flatMap(f =>
      SERVICE_RATING_KEYS
        .map(key => f.ratings?.[key])
        .filter(v => typeof v === 'number')
    );
    const servicesAvg = allServiceValues.length === 0 ? null :
      Math.round((allServiceValues.reduce((a, b) => a + b, 0) / allServiceValues.length) * 10) / 10;

    // Real comment field is overallExperience — the per-visit "suggestion"
    // field was removed from the submission form in Phase 9 (general
    // suggestions now live in their own suggestions collection, unrelated
    // to a visit), so it's intentionally not folded in here.
    const withComments = feedbacks.filter(f => f.overallExperience && f.overallExperience.trim());

    const summary = {
      total: feedbacks.length,
      withComments: withComments.length,
      averageRatings: {
        staffBehaviour: calcAvg('staffBehaviour'),
        waitingTime:    calcAvg('waitingTime'),
        housekeeping:   calcAvg('housekeeping'),
        services:       servicesAvg,
      },
      recentComments: withComments.slice(0, 10)
        .map(f => ({ comment: f.overallExperience, submittedAt: f.submittedAt })),
    };
    return successResponse(res, { summary, feedbacks });
  } catch (error) {
    return errorResponse(res, 'Failed to generate feedback report', 500);
  }
});

// ─────────────────────────────────────────────────────────
// ─── TRIP ROUTES — REWRITTEN Day 13 (Phase 2) ────────────
// tripBookings is a FLAT, top-level collection — each document IS a
// booking directly. There is no `medicalTrips` parent collection or
// `bookings` subcollection in live Firestore; the old routes queried a
// structure that never existed, so these reports never returned real data.
// `hospital` is not a stored field on tripBookings — it's looked up via
// doctorId → doctorDirectory.hospital at report-generation time.
// ─────────────────────────────────────────────────────────

// ─── GET /trips ────────────────────────────────────────────
// General trip/booking report across a date range or month — booking-level
// metrics (no separate "trip" entity exists in the real data model).
router.get('/trips', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { fromDate, toDate, month, year } = req.query;

    let query = db.collection('tripBookings');
    const snapshot = await query.get();
    let bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (fromDate || toDate) bookings = bookings.filter(b => inDateRange(b.tripDate, fromDate, toDate));
    if (month && year) {
      bookings = bookings.filter(b => {
        const date = new Date(b.tripDate);
        return date.getMonth() + 1 === parseInt(month) && date.getFullYear() === parseInt(year);
      });
    }

    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');

    const summary = {
      totalBookings:   bookings.length,
      totalConfirmed:  confirmedBookings.length,
      totalPassengers: confirmedBookings.reduce((sum, b) => sum + (b.seats || 1), 0),
      byStatus:        {},
      byDayOfWeek:      {},
    };
    bookings.forEach(b => {
      summary.byStatus[b.status] = (summary.byStatus[b.status] || 0) + 1;
      const dow = dayOfWeekFrom(b.tripDate);
      if (dow) summary.byDayOfWeek[dow] = (summary.byDayOfWeek[dow] || 0) + 1;
    });

    bookings.sort((a, b) => (b.tripDate || '').localeCompare(a.tripDate || ''));

    return successResponse(res, { summary, bookings });
  } catch (error) {
    console.error('Trip report error:', error);
    return errorResponse(res, 'Failed to generate trip report', 500);
  }
});

// ─── GET /trip-day ────────────────────────────────────────
// Trip day report: today's (or a given date's) confirmed bookings
// Reception: in-app JSON + PDF download
// CMO/Doctor: in-app JSON only
router.get('/trip-day', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { date, format } = req.query;

    const tripDate = date || new Date().toISOString().split('T')[0];

    const bookingsSnap = await db.collection('tripBookings')
      .where('tripDate', '==', tripDate)
      .where('status', '==', 'confirmed')
      .get();

    const rawBookings = bookingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const hospitalMap = await getHospitalMap(db, rawBookings.map(b => b.doctorId));

    const bookings = rawBookings
      .map(b => ({ ...b, hospital: hospitalMap[b.doctorId] || null }))
      .sort((a, b) => (a.pickupHouse || '').localeCompare(b.pickupHouse || ''));

    const bookedSeats = bookings.reduce((sum, b) => sum + (b.seats || 1), 0);

    if (format === 'pdf') {
      return sendPDF(res, `trip-report-${tripDate}.pdf`, (doc) => {
        // Header
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text(`Medical Trip Report — ${tripDate}`, { align: 'center' });
        doc.fontSize(10).font('Helvetica')
           .text(`Departure: 17:30  |  Return: 21:00 RYK  |  Total Confirmed: ${bookings.length}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        if (bookings.length === 0) {
          doc.fontSize(12).text('No confirmed bookings for this date.', { align: 'center' });
          return;
        }

        // Column headers
        const cols = { no: 40, name: 70, house: 220, phone: 310, doctor: 400, hospital: 490 };
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('#',           cols.no,      doc.y, { width: 25 });
        doc.moveUp();
        doc.text('Patient',     cols.name,    doc.y, { width: 145 });
        doc.moveUp();
        doc.text('Pickup',      cols.house,   doc.y, { width: 85 });
        doc.moveUp();
        doc.text('Phone',       cols.phone,   doc.y, { width: 85 });
        doc.moveUp();
        doc.text('Doctor',      cols.doctor,  doc.y, { width: 85 });
        doc.moveUp();
        doc.text('Hospital',    cols.hospital,doc.y, { width: 65 });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        // Rows
        doc.fontSize(9).font('Helvetica');
        bookings.forEach((b, i) => {
          const y = doc.y;
          doc.text(String(i + 1),           cols.no,      y, { width: 25 });
          doc.moveUp();
          doc.text(b.patientName   || '—',  cols.name,    y, { width: 145 });
          doc.moveUp();
          doc.text(b.pickupHouse   || '—',  cols.house,   y, { width: 85 });
          doc.moveUp();
          doc.text(b.phone         || '—',  cols.phone,   y, { width: 85 });  // ← Day 13 fix: real field is `phone`
          doc.moveUp();
          doc.text(b.doctorName    || '—',  cols.doctor,  y, { width: 85 });
          doc.moveUp();
          doc.text(b.hospital      || '—',  cols.hospital,y, { width: 65 });  // ← Day 13 fix: looked up, not stored
          doc.moveDown(0.2);
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#eeeeee');
          doc.moveDown(0.2);

          if (doc.y > 750) doc.addPage();
        });

        doc.moveDown();
        doc.fontSize(9).font('Helvetica-Oblique')
           .text(`Generated: ${new Date().toLocaleString('en-PK')}`, { align: 'right' });
      });
    }

    return successResponse(res, {
      tripDate,
      totalSeats:  MEDICAL_TRIP_TOTAL_SEATS,   // ← Day 13 fix: real configured capacity
      bookedSeats,
      bookings,
    });

  } catch (error) {
    console.error('Trip day report error:', error);
    return errorResponse(res, 'Failed to generate trip day report', 500);
  }
});

// ─── GET /trips/monthly ───────────────────────────────────
// Monthly trip consolidation: employees facilitated, doctor + hospital
// CMO only
router.get('/trips/monthly', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db    = admin.firestore();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();

    const monthStr = String(month).padStart(2, '0');
    const prefix    = `${year}-${monthStr}`;

    const bookingsSnap = await db.collection('tripBookings')
      .where('tripDate', '>=', `${prefix}-01`)
      .where('tripDate', '<=', `${prefix}-31`)
      .where('status', '==', 'confirmed')
      .get();

    const rawBookings = bookingsSnap.docs.map(doc => doc.data());
    const hospitalMap = await getHospitalMap(db, rawBookings.map(b => b.doctorId));

    const rows = rawBookings.map(b => ({
      tripDate:        b.tripDate,
      patientName:     b.patientName     || '—',
      patientRelation: b.patientRelation || '—',
      employeeName:    b.employeeName    || '—',
      employeeNumber:  b.employeeNumber  || '—',
      doctorName:      b.doctorName      || '—',
      hospital:        hospitalMap[b.doctorId] || '—',   // ← Day 13 fix: looked up, not stored
      returnTrip:      b.returnTrip    ? 'Yes' : 'No',
      overnightStay:   b.overnightStay ? 'Yes' : 'No',
    }));

    rows.sort((a, b) => a.tripDate.localeCompare(b.tripDate));

    return successResponse(res, {
      month, year,
      totalFacilitated: rows.length,
      rows,
    });

  } catch (error) {
    console.error('Monthly trip report error:', error);
    return errorResponse(res, 'Failed to generate monthly trip report', 500);
  }
});

// ─────────────────────────────────────────────────────────
// ─── OTHER ROUTES (unchanged) ────────────────────────────
// ─────────────────────────────────────────────────────────

// ─── GET /ambulance/kpis ──────────────────────────────────
// Ambulance KPI report: response times from 4 timestamps
// Daily and monthly — CMO and Doctor (Day 20, Phase 5.8.2 — doctor added
// for dashboard parity with CMO).
router.get('/ambulance/kpis', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR,
]), async (req, res) => {
  try {
    const db    = admin.firestore();
    const { date, month, year, fromDate, toDate } = req.query;

    const snapshot = await db.collection('ambulanceRequests')
      .orderBy('createdAt', 'desc')
      .get();

    let requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Day 20 (Phase 5.8.2) — fromDate/toDate added alongside the existing
    // date/month/year options, using the same inDateRange helper the
    // sibling GET /ambulance route already uses, so the CMO/Doctor
    // dashboard's request list and KPI panel can share one date filter
    // instead of two inconsistent ones. Existing date/month/year callers
    // are unaffected — this is purely additive.
    if (fromDate || toDate) {
      requests = requests.filter(r => inDateRange(r.createdAt, fromDate, toDate));
    } else if (date) {
      requests = requests.filter(r => r.createdAt && r.createdAt.startsWith(date));
    } else if (month && year) {
      const monthStr = String(parseInt(month)).padStart(2, '0');
      const prefix   = `${year}-${monthStr}`;
      requests = requests.filter(r => r.createdAt && r.createdAt.startsWith(prefix));
    }

    const completed = requests.filter(r => r.status === 'completed');

    const kpiRows = requests.map(r => ({
      id:                  r.id,
      createdAt:           r.createdAt           || null,
      dispatchedAt:        r.dispatchedAt         || null,
      pickedUpAt:          r.pickedUpAt           || null,
      completedAt:         r.completedAt          || null,
      patientName:         r.patientName          || '—',
      priorityFlag:        r.priorityFlag         || '—',
      vehicleAssigned:     r.vehicleAssigned       || '—',
      status:              r.status               || '—',
      responseTime:        diffMinutes(r.createdAt, r.dispatchedAt),
      arrivalTime:         diffMinutes(r.dispatchedAt, r.pickedUpAt),
      returnTime:          diffMinutes(r.pickedUpAt, r.completedAt),
      totalTripTime:       diffMinutes(r.createdAt, r.completedAt),
    }));

    const avg = (field) => {
      const vals = kpiRows.filter(r => r[field] !== null).map(r => r[field]);
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    };

    const summary = {
      totalRequests:        requests.length,
      completed:            completed.length,
      avgResponseTime:      avg('responseTime'),
      avgArrivalTime:       avg('arrivalTime'),
      avgReturnTime:        avg('returnTime'),
      avgTotalTripTime:     avg('totalTripTime'),
    };

    return successResponse(res, { summary, kpiRows });

  } catch (error) {
    console.error('Ambulance KPI error:', error);
    return errorResponse(res, 'Failed to generate ambulance KPI report', 500);
  }
});

// ─── GET /population/township ─────────────────────────────
// Township population report with family details — CMO only — PDF
router.get('/population/township', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { format } = req.query;

    const empSnap = await db.collection('employees')
      .where('isValidated', '==', true)
      .get();

    let employees = empSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(e => e.townshipResidentWithFamily === true || e.townshipResidentBachelor === true);

    const enriched = await Promise.all(employees.map(async (emp) => {
      const famSnap = await db.collection('employees')
        .doc(emp.id).collection('familyMembers').get();
      const family = famSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return { ...emp, familyMembers: family };
    }));

    if (format === 'pdf') {
      return sendPDF(res, 'township-population.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Township Population Report', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
           .text(`Total Employees: ${enriched.length}  |  Generated: ${new Date().toLocaleDateString('en-PK')}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        enriched.forEach((emp, i) => {
          if (doc.y > 700) doc.addPage();

          doc.fontSize(10).font('Helvetica-Bold')
             .text(`${i + 1}. ${emp.fullName}  [${emp.officialEmployeeNumber || '—'}]`);
          doc.fontSize(9).font('Helvetica')
             .text(`Dept: ${emp.department || '—'}  |  Unit: ${emp.unit || '—'}  |  Designation: ${emp.designation || '—'}  |  Residence: ${emp.residenceType || '—'}  |  ${emp.houseNumber ? 'House: ' + emp.houseNumber : emp.roomNumber ? 'Room: ' + emp.roomNumber : ''}  |  Age: ${calcAge(emp.dateOfBirth) ?? '—'}`);

          if (emp.familyMembers.length > 0) {
            doc.fontSize(8).font('Helvetica-Oblique').text('  Family Members:');
            emp.familyMembers.forEach(fm => {
              doc.fontSize(8).font('Helvetica')
                 .text(`    • ${fm.fullName}  |  ${fm.relation || '—'}  |  ${fm.gender || '—'}  |  Age: ${calcAge(fm.dateOfBirth) ?? '—'}  |  Differently Abled: ${fm.differentlyAbled ? 'Yes' : 'No'}`);
            });
          } else {
            doc.fontSize(8).font('Helvetica-Oblique').text('  No family members registered.');
          }
          doc.moveDown(0.5);
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#eeeeee');
          doc.moveDown(0.3);
        });
      });
    }

    return successResponse(res, {
      total: enriched.length,
      employees: enriched,
    });

  } catch (error) {
    console.error('Township population report error:', error);
    return errorResponse(res, 'Failed to generate township population report', 500);
  }
});

// ─── GET /population/non-township ────────────────────────
// Non-township employee + family report — CMO only — PDF
router.get('/population/non-township', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { format } = req.query;

    const empSnap = await db.collection('employees')
      .where('isValidated', '==', true)
      .get();

    let employees = empSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(e => e.townshipResidentWithFamily === false && e.townshipResidentBachelor === false);

    const enriched = await Promise.all(employees.map(async (emp) => {
      const famSnap = await db.collection('employees')
        .doc(emp.id).collection('familyMembers').get();
      const family = famSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return { ...emp, familyMembers: family };
    }));

    if (format === 'pdf') {
      return sendPDF(res, 'non-township-population.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Non-Township Employee Report', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
           .text(`Total Employees: ${enriched.length}  |  Generated: ${new Date().toLocaleDateString('en-PK')}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        enriched.forEach((emp, i) => {
          if (doc.y > 700) doc.addPage();

          doc.fontSize(10).font('Helvetica-Bold')
             .text(`${i + 1}. ${emp.fullName}  [${emp.officialEmployeeNumber || '—'}]`);
          doc.fontSize(9).font('Helvetica')
             .text(`Dept: ${emp.department || '—'}  |  Unit: ${emp.unit || '—'}  |  Designation: ${emp.designation || '—'}  |  City: ${emp.cityOfResidence || '—'}  |  Age: ${calcAge(emp.dateOfBirth) ?? '—'}`);

          if (emp.familyMembers.length > 0) {
            doc.fontSize(8).font('Helvetica-Oblique').text('  Family Members:');
            emp.familyMembers.forEach(fm => {
              doc.fontSize(8).font('Helvetica')
                 .text(`    • ${fm.fullName}  |  ${fm.relation || '—'}  |  ${fm.gender || '—'}  |  Age: ${calcAge(fm.dateOfBirth) ?? '—'}  |  Differently Abled: ${fm.differentlyAbled ? 'Yes' : 'No'}`);
            });
          } else {
            doc.fontSize(8).font('Helvetica-Oblique').text('  No family members registered.');
          }
          doc.moveDown(0.5);
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#eeeeee');
          doc.moveDown(0.3);
        });
      });
    }

    return successResponse(res, { total: enriched.length, employees: enriched });

  } catch (error) {
    console.error('Non-township report error:', error);
    return errorResponse(res, 'Failed to generate non-township report', 500);
  }
});

// ─── GET /population/employees-only ──────────────────────
// Employee only report — no family details — CMO only
router.get('/population/employees-only', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { format } = req.query;

    const empSnap = await db.collection('employees')
      .where('isValidated', '==', true)
      .get();

    const employees = await Promise.all(empSnap.docs.map(async (doc) => {
      const emp = { id: doc.id, ...doc.data() };
      const famSnap = await db.collection('employees')
        .doc(emp.id).collection('familyMembers').get();
      return {
        id:                     emp.id,
        fullName:               emp.fullName               || '—',
        officialEmployeeNumber: emp.officialEmployeeNumber || '—',
        department:             emp.department             || '—',
        unit:                   emp.unit                   || '—',
        designation:            emp.designation            || '—',
        houseNumber:            emp.houseNumber            || emp.roomNumber || '—',
        age:                    calcAge(emp.dateOfBirth)   ?? '—',
        familyMemberCount:      famSnap.size,
        residenceType:          emp.residenceType          || '—',
        cityOfResidence:        emp.cityOfResidence        || '—',
      };
    }));

    if (format === 'pdf') {
      return sendPDF(res, 'employee-report.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Employee Report', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
           .text(`Total: ${employees.length}  |  Generated: ${new Date().toLocaleDateString('en-PK')}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        const c = { no: 40, name: 65, empNo: 190, dept: 270, desig: 360, house: 445, age: 495, fam: 520 };
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('#',           c.no,    doc.y, { width: 22 });
        doc.moveUp(); doc.text('Name',   c.name,  doc.y, { width: 122 });
        doc.moveUp(); doc.text('Emp No', c.empNo, doc.y, { width: 77 });
        doc.moveUp(); doc.text('Dept',   c.dept,  doc.y, { width: 87 });
        doc.moveUp(); doc.text('Desig',  c.desig, doc.y, { width: 82 });
        doc.moveUp(); doc.text('House',  c.house, doc.y, { width: 47 });
        doc.moveUp(); doc.text('Age',    c.age,   doc.y, { width: 22 });
        doc.moveUp(); doc.text('Fam',    c.fam,   doc.y, { width: 22 });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fontSize(8).font('Helvetica');
        employees.forEach((e, i) => {
          if (doc.y > 760) doc.addPage();
          const y = doc.y;
          doc.text(String(i + 1),       c.no,    y, { width: 22 });
          doc.moveUp(); doc.text(e.fullName,               c.name,  y, { width: 122 });
          doc.moveUp(); doc.text(e.officialEmployeeNumber, c.empNo, y, { width: 77 });
          doc.moveUp(); doc.text(e.department,             c.dept,  y, { width: 87 });
          doc.moveUp(); doc.text(e.designation,            c.desig, y, { width: 82 });
          doc.moveUp(); doc.text(e.houseNumber,            c.house, y, { width: 47 });
          doc.moveUp(); doc.text(String(e.age),            c.age,   y, { width: 22 });
          doc.moveUp(); doc.text(String(e.familyMemberCount), c.fam, y, { width: 22 });
          doc.moveDown(0.2);
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#eeeeee');
          doc.moveDown(0.2);
        });

        doc.moveDown();
        doc.fontSize(8).font('Helvetica-Oblique')
           .text(`Generated: ${new Date().toLocaleString('en-PK')}`, { align: 'right' });
      });
    }

    return successResponse(res, { total: employees.length, employees });

  } catch (error) {
    console.error('Employee only report error:', error);
    return errorResponse(res, 'Failed to generate employee report', 500);
  }
});

// ─── GET /blood-groups/csv ────────────────────────────────
// Blood group repository — CSV download — admin only
router.get('/blood-groups/csv', verifyToken, verifyRole([
  ROLES.ADMIN_INCHARGE, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();

    const empSnap = await db.collection('employees')
      .where('isValidated', '==', true)
      .get();

    const rows = empSnap.docs
      .map(doc => doc.data())
      .filter(e => e.bloodGroup)
      .map(e => ({
        'Employee Number': e.officialEmployeeNumber || '—',
        'Full Name':       e.fullName               || '—',
        'Blood Group':     e.bloodGroup             || '—',
        'Phone Number':    e.phoneNumber            || '—',
        'Department':      e.department             || '—',
        'Designation':     e.designation            || '—',
        'Donor Consent':   e.bloodDonorConsent ? 'Yes' : 'No',
      }))
      .sort((a, b) => a['Blood Group'].localeCompare(b['Blood Group']));

    if (!rows.length) {
      return errorResponse(res, 'No employees with blood group data found', 404);
    }

    const parser = new Parser({
      fields: ['Employee Number', 'Full Name', 'Blood Group', 'Phone Number', 'Department', 'Designation', 'Donor Consent'],
    });
    const csv = parser.parse(rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="blood-group-repository.csv"');
    return res.send(csv);

  } catch (error) {
    console.error('Blood group CSV error:', error);
    return errorResponse(res, 'Failed to generate blood group CSV', 500);
  }
});

module.exports = router;