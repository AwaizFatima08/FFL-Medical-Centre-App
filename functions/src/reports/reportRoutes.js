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

// ─────────────────────────────────────────────────────────
// ─── EXISTING ROUTES (unchanged) ─────────────────────────
// ─────────────────────────────────────────────────────────

// ─── GET /ambulance ───────────────────────────────────────
router.get('/ambulance', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { fromDate, toDate, priorityFlag, vehicleType } = req.query;
    const snapshot = await db.collection('ambulanceRequests')
      .orderBy('createdAt', 'desc').get();
    let requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    requests = requests.filter(r => inDateRange(r.createdAt, fromDate, toDate));
    if (priorityFlag) requests = requests.filter(r => r.priorityFlag === priorityFlag);
    if (vehicleType)  requests = requests.filter(r => r.vehicleAssigned === vehicleType);
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

// ─── GET /trips ───────────────────────────────────────────
router.get('/trips', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { fromDate, toDate, month, year } = req.query;
    const snapshot = await db.collection('medicalTrips').orderBy('tripDate', 'desc').get();
    let trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (fromDate || toDate) trips = trips.filter(t => inDateRange(t.tripDate, fromDate, toDate));
    if (month && year) {
      trips = trips.filter(t => {
        const date = new Date(t.tripDate);
        return date.getMonth() + 1 === parseInt(month) && date.getFullYear() === parseInt(year);
      });
    }
    const tripsWithBookings = await Promise.all(trips.map(async (trip) => {
      const bookingsSnapshot = await db.collection('medicalTrips').doc(trip.id).collection('bookings').get();
      const bookings = bookingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const approvedBookings = bookings.filter(b => b.status === BOOKING_STATUS.APPROVED);
      return {
        ...trip,
        bookings,
        approvedCount:   approvedBookings.length,
        totalPassengers: approvedBookings.reduce((sum, b) => sum + (b.seatsRequired || 1), 0),
      };
    }));
    const summary = {
      totalTrips:      trips.length,
      totalBookings:   tripsWithBookings.reduce((sum, t) => sum + t.bookings.length, 0),
      totalPassengers: tripsWithBookings.reduce((sum, t) => sum + t.totalPassengers, 0),
      byDayOfWeek:     {},
    };
    tripsWithBookings.forEach(t => {
      summary.byDayOfWeek[t.dayOfWeek] = (summary.byDayOfWeek[t.dayOfWeek] || 0) + 1;
    });
    return successResponse(res, { summary, trips: tripsWithBookings });
  } catch (error) {
    return errorResponse(res, 'Failed to generate trip report', 500);
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
        fit:         appointments.filter(a => a.fitnessStatus === 'fit').length,
        unfit:       appointments.filter(a => a.fitnessStatus === 'unfit').length,
        conditional: appointments.filter(a => a.fitnessStatus === 'conditional').length,
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
router.get('/feedback', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION,
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
    const calcAvg = (field) => {
      const values = feedbacks.map(f => f[field]).filter(v => v !== null && v !== undefined);
      if (values.length === 0) return null;
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    };
    const summary = {
      total: feedbacks.length, anonymous: feedbacks.filter(f => f.isAnonymous).length,
      withComments: feedbacks.filter(f => f.comments && f.comments.trim()).length,
      averageRatings: { staffBehaviour: calcAvg('staffBehaviourRating'), cleanliness: calcAvg('cleanlinessRating'), services: calcAvg('servicesRating') },
      recentComments: feedbacks.filter(f => f.comments && f.comments.trim()).slice(0, 10)
        .map(f => ({ comment: f.comments, submittedAt: f.submittedAt, isAnonymous: f.isAnonymous })),
    };
    return successResponse(res, { summary, feedbacks });
  } catch (error) {
    return errorResponse(res, 'Failed to generate feedback report', 500);
  }
});

// ─────────────────────────────────────────────────────────
// ─── NEW ROUTES ───────────────────────────────────────────
// ─────────────────────────────────────────────────────────

// ─── GET /trip-day ────────────────────────────────────────
// Trip day report: today's confirmed bookings
// Reception: in-app JSON + PDF download
// CMO/Doctor: in-app JSON only
router.get('/trip-day', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { date, format } = req.query;

    // Default to today if no date provided
    const tripDate = date || new Date().toISOString().split('T')[0];

    // Find the trip document for this date
    const tripSnap = await db.collection('medicalTrips')
      .where('tripDate', '==', tripDate)
      .limit(1)
      .get();

    if (tripSnap.empty) {
      if (format === 'pdf') {
        return sendPDF(res, `trip-report-${tripDate}.pdf`, (doc) => {
          doc.fontSize(16).font('Helvetica-Bold').text('FFL Medical Centre', { align: 'center' });
          doc.fontSize(12).font('Helvetica').text(`Medical Trip Report — ${tripDate}`, { align: 'center' });
          doc.moveDown(2);
          doc.fontSize(12).text('No trip scheduled for this date.', { align: 'center' });
        });
      }
      return successResponse(res, { tripDate, bookings: [], totalSeats: 0, bookedSeats: 0 });
    }

    const tripDoc   = tripSnap.docs[0];
    const tripData  = tripDoc.data();

    // Get all confirmed bookings for this trip
    const bookingsSnap = await db.collection('medicalTrips')
      .doc(tripDoc.id)
      .collection('bookings')
      .where('status', '==', 'confirmed')
      .get();

    const bookings = bookingsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.pickupHouse || '').localeCompare(b.pickupHouse || ''));

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
          doc.text(b.employeePhoneNumber || b.phoneNumber || '—', cols.phone, y, { width: 85 });
          doc.moveUp();
          doc.text(b.doctorName    || '—',  cols.doctor,  y, { width: 85 });
          doc.moveUp();
          doc.text(b.hospital      || '—',  cols.hospital,y, { width: 65 });
          doc.moveDown(0.2);
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#eeeeee');
          doc.moveDown(0.2);

          // New page if near bottom
          if (doc.y > 750) doc.addPage();
        });

        doc.moveDown();
        doc.fontSize(9).font('Helvetica-Oblique')
           .text(`Generated: ${new Date().toLocaleString('en-PK')}`, { align: 'right' });
      });
    }

    return successResponse(res, {
      tripDate,
      tripId:     tripDoc.id,
      totalSeats: tripData.totalSeats || 24,
      bookedSeats: bookings.length,
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

    // Pad month for string comparison
    const monthStr = String(month).padStart(2, '0');
    const prefix   = `${year}-${monthStr}`;

    // Get all trips for this month
    const tripsSnap = await db.collection('medicalTrips')
      .where('tripDate', '>=', `${prefix}-01`)
      .where('tripDate', '<=', `${prefix}-31`)
      .get();

    const rows = [];

    await Promise.all(tripsSnap.docs.map(async (tripDoc) => {
      const trip = tripDoc.data();
      const bookingsSnap = await db.collection('medicalTrips')
        .doc(tripDoc.id)
        .collection('bookings')
        .where('status', '==', 'confirmed')
        .get();

      bookingsSnap.docs.forEach(doc => {
        const b = doc.data();
        rows.push({
          tripDate:       trip.tripDate,
          patientName:    b.patientName    || '—',
          patientRelation:b.patientRelation|| '—',
          employeeName:   b.employeeName   || '—',
          employeeNumber: b.employeeNumber || '—',
          doctorName:     b.doctorName     || '—',
          hospital:       b.hospital       || '—',
          returnTrip:     b.returnTrip ? 'Yes' : 'No',
          overnightStay:  b.overnightStay  ? 'Yes' : 'No',
        });
      });
    }));

    // Sort by date
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

// ─── GET /ambulance/kpis ──────────────────────────────────
// Ambulance KPI report: response times from 4 timestamps
// Daily and monthly — CMO only
router.get('/ambulance/kpis', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db    = admin.firestore();
    const { date, month, year } = req.query;

    const snapshot = await db.collection('ambulanceRequests')
      .orderBy('createdAt', 'desc')
      .get();

    let requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filter by single date OR month+year
    if (date) {
      requests = requests.filter(r => r.createdAt && r.createdAt.startsWith(date));
    } else if (month && year) {
      const monthStr = String(parseInt(month)).padStart(2, '0');
      const prefix   = `${year}-${monthStr}`;
      requests = requests.filter(r => r.createdAt && r.createdAt.startsWith(prefix));
    }

    // Only completed trips have all 4 timestamps meaningful
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
      // KPI calculations in minutes
      responseTime:        diffMinutes(r.createdAt, r.dispatchedAt),
      arrivalTime:         diffMinutes(r.dispatchedAt, r.pickedUpAt),
      returnTime:          diffMinutes(r.pickedUpAt, r.completedAt),
      totalTripTime:       diffMinutes(r.createdAt, r.completedAt),
    }));

    // Averages from completed trips only
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

    // Get all validated township residents
    const empSnap = await db.collection('employees')
      .where('isValidated', '==', true)
      .get();

    let employees = empSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(e => e.townshipResidentWithFamily === true || e.townshipResidentBachelor === true);

    // Enrich with family members
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

        // Column headers
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