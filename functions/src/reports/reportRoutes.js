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

// ─── HELPER — BATCH EMPLOYEE LOOKUP (Phase 10) ───────────
// Resolves employeeId → the employee's current profile (department, unit,
// officialEmployeeNumber, dateOfBirth, etc.) — same batched-lookup shape
// as getHospitalMap/getUserNameMap above, not one read per row. Used
// where a report explicitly wants the *live* value, not whatever was
// true when the source record was created (Annual Fitness Report's
// Department/Unit columns, per PHASE10_DESIGN.md).
const getEmployeeMap = async (db, employeeIds) => {
  const uniqueIds = [...new Set(employeeIds.filter(Boolean))];
  const map = {};
  await Promise.all(uniqueIds.map(async (id) => {
    const doc = await db.collection('employees').doc(id).get();
    map[id] = doc.exists ? doc.data() : null;
  }));
  return map;
};

// ─── HELPER — FIRESTORE TIMESTAMP → 'YYYY-MM-DD' STRING ──
// inDateRange() compares plain date strings — a raw Firestore Timestamp
// object doesn't compare correctly against those, so convert first
// rather than pass the Timestamp straight through.
const tsToDateStr = (ts) => {
  if (!ts) return null;
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
};

// ─── HELPER — ACTIVE-USER STATUS MAP (Phase 10) ──────────
// Fetches every users doc once and returns a uid → isActive map. Used by
// every CENSUS-shaped report (Employee Report, Employee Chronic Disease
// Report, Population Report, Family Report) to exclude resigned/disabled
// employees — employees.isValidated alone doesn't capture this,
// isActive lives only on the linked users doc (see authRoutes.js's
// verifyRole fix, same session). Deliberately NOT applied to
// historical/event-log reports (Trip Day/Range, Ambulance KPI, Annual
// Fitness, Feedback) — those record things that already happened, and
// filtering by an employee's *current* status would hide real past
// events and skew trend data.
const getActiveUserMap = async (db) => {
  const usersSnap = await db.collection('users').get();
  const map = {};
  usersSnap.docs.forEach(doc => { map[doc.id] = doc.data().isActive === true; });
  return map;
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
// Phase 10 — Annual Fitness Report. Access narrowed to CMO only (was
// CMO/Doctor/Admin Incharge) — safe, since no frontend tile called this
// route before this report existed, so no existing consumer is affected.
// Row-level table is scoped to status:"completed" only (scheduled/missed
// rows have no meaningful completion date or outcome to show); the
// summary block still covers every status so the top tiles keep working
// exactly as before.
router.get('/fitness', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { cycleYear, fromDate, toDate, format } = req.query;

    const snapshot = await db.collection('fitnessAppointments').get();
    const allAppointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Dynamic year list — every year that actually has data, newest
    // first. Built from the full unfiltered set so the selector never
    // misses a year just because a narrower query already ran.
    const availableYears = [...new Set(allAppointments.map(a => a.cycleYear).filter(Boolean))]
      .sort((a, b) => b - a);

    let appointments = allAppointments;
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
      // Deliberately NOT re-scoped by fromDate/toDate below — the top
      // summary reflects the whole selected cycleYear regardless of any
      // further date narrowing on the row table, per PHASE10_DESIGN.md.
      complianceRate: totalEmployees > 0
        ? Math.round((appointments.filter(a => a.status === APPOINTMENT_STATUS.COMPLETED).length / totalEmployees) * 100)
        : 0,
    };

    // Row-level table — completed only, then optionally narrowed further
    // by fromDate/toDate on completedAt, bounded within the selected year.
    let completedRows = appointments.filter(a => a.status === APPOINTMENT_STATUS.COMPLETED);
    completedRows = completedRows.filter(a => inDateRange(tsToDateStr(a.completedAt), fromDate, toDate));

    // Live join — Department/Unit/employeeNumber/Age come from the
    // employee's current profile, not whatever was true when the
    // appointment was scheduled (unit isn't even captured on the
    // appointment record at all).
    const employeeMap = await getEmployeeMap(db, completedRows.map(a => a.employeeId));
    const rows = completedRows.map(a => {
      const emp = employeeMap[a.employeeId] || {};
      const dob = emp.dateOfBirth ? tsToDateStr(emp.dateOfBirth) : null;
      return {
        id:                 a.id,
        employeeName:       a.fullName || emp.fullName || '—',   // snapshot field, per spec
        employeeNumber:     emp.officialEmployeeNumber || '—',
        age:                calcAge(dob),
        department:         emp.department || '—',
        unit:               emp.unit || '—',
        fitnessCompletedOn: tsToDateStr(a.completedAt),
        fitnessOutcome:     a.fitnessOutcome || null,
      };
    }).sort((a, b) => (b.fitnessCompletedOn || '').localeCompare(a.fitnessCompletedOn || ''));

    const outcomeLabel = { fit: 'Fit', unfit: 'Unfit', fit_with_restrictions: 'Fit w/ Restriction' };

    if (format === 'pdf') {
      return sendPDF(res, `annual-fitness-report-${cycleYear || 'all'}.pdf`, (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text(`Annual Fitness Report${cycleYear ? ` — ${cycleYear}` : ''}`, { align: 'center' });
        doc.fontSize(10).font('Helvetica')
           .text(
             `Total Completed: ${summary.completed}  |  Fit: ${summary.byFitnessStatus.fit}  |  ` +
             `Unfit: ${summary.byFitnessStatus.unfit}  |  Fit w/ Restriction: ${summary.byFitnessStatus.fit_with_restrictions}`,
             { align: 'center' }
           );
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        if (rows.length === 0) {
          doc.fontSize(12).text('No completed fitness exams for this selection.', { align: 'center' });
          return;
        }

        const cols = { name: 40, num: 165, age: 235, dept: 270, unit: 360, date: 425, status: 490 };
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Employee',  cols.name,   doc.y, { width: 120 }); doc.moveUp();
        doc.text('Emp #',     cols.num,    doc.y, { width: 65 });  doc.moveUp();
        doc.text('Age',       cols.age,    doc.y, { width: 30 });  doc.moveUp();
        doc.text('Dept',      cols.dept,   doc.y, { width: 85 });  doc.moveUp();
        doc.text('Unit',      cols.unit,   doc.y, { width: 60 });  doc.moveUp();
        doc.text('Completed', cols.date,   doc.y, { width: 60 });  doc.moveUp();
        doc.text('Status',    cols.status, doc.y, { width: 65 });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fontSize(8).font('Helvetica');
        rows.forEach(r => {
          const y = doc.y;
          doc.text(r.employeeName,                        cols.name,   y, { width: 120 }); doc.moveUp();
          doc.text(r.employeeNumber,                       cols.num,    y, { width: 65 });  doc.moveUp();
          doc.text(r.age !== null ? String(r.age) : '—',   cols.age,    y, { width: 30 });  doc.moveUp();
          doc.text(r.department,                           cols.dept,   y, { width: 85 });  doc.moveUp();
          doc.text(r.unit,                                 cols.unit,   y, { width: 60 });  doc.moveUp();
          doc.text(r.fitnessCompletedOn || '—',            cols.date,   y, { width: 60 });  doc.moveUp();
          doc.text(outcomeLabel[r.fitnessOutcome] || '—',  cols.status, y, { width: 65 });
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

    return successResponse(res, { summary, availableYears, rows });
  } catch (error) {
    console.error('Fitness report error:', error);
    return errorResponse(res, 'Failed to generate fitness report', 500);
  }
});

// ─── GET /employees/report ────────────────────────────────
// Phase 10 — Employee Report (new). Consolidates and replaces
// EmployeeOnlyReportScreen.js and PopulationReportScreen.js's township
// and non-township branches — one flat, one-row-per-employee table with
// filters doing the narrowing, instead of three near-identical
// screens/routes. Deliberately a NEW route, not a rewrite of /employees
// or the /population/* routes below — those still back
// BloodGroupReportScreen.js (until Blood Donor Report replaces it) and
// EmployeeOnlyReportScreen.js/PopulationReportScreen.js respectively, so
// left untouched here rather than risk regressing screens still in use.
// Once Employee Report and Population Report (Phase 10's #8) are both
// live and their old screens deleted, /population/employees-only,
// /population/township, and /population/non-township become orphaned —
// flagged for a cleanup pass, not removed here.
//
// Family member count uses the correct TOP-LEVEL familyMembers
// collection, fetched once and grouped in memory by employeeId — not
// the employees/{id}/familyMembers subcollection path, which
// SCHEMA_REFERENCE.md's Day 22 correction confirms is dead code (and
// which the existing /employees route below still incorrectly uses,
// meaning its familyMemberCount has likely always returned 0 — flagged
// separately, not fixed here to avoid touching a route still serving
// BloodGroupReportScreen.js).
//
// IMPORTANT — join key correction: familyMembers.employeeId is the
// person's Auth UID (employees.userId), NOT the employees collection's
// own auto-generated doc ID — confirmed directly from
// FamilyAdminReviewScreen.js's own code comment. This route (and
// Population Report / Family Report below) was originally built
// matching against employees.id instead, which silently produced 0 for
// every family count — caught and fixed same-session, before any of the
// three reports were used for a real decision.
router.get('/employees/report', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { format } = req.query;

    const [empSnapshot, familySnapshot, activeUserMap] = await Promise.all([
      db.collection('employees').where('isValidated', '==', true).get(),
      db.collection('familyMembers').get(),
      getActiveUserMap(db),
    ]);

    // Phase 10 — census report: exclude employees whose linked users
    // account is disabled (resigned/deactivated), not just unvalidated.
    const employees = empSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(e => activeUserMap[e.userId] === true);

    // Group family members by sponsoring employee's UID (employeeId on
    // familyMembers = employees.userId, not employees.id) —
    // spouse/son/daughter only, isActive:true, status:"validated" — same
    // standard used for Family Report's household count.
    const FAMILY_RELATIONS = ['spouse', 'son', 'daughter'];
    const familyCountByEmployee = {};
    familySnapshot.docs.forEach(doc => {
      const f = doc.data();
      if (!FAMILY_RELATIONS.includes((f.relation || '').toLowerCase())) return;
      if (!f.isActive || f.status !== 'validated') return;
      familyCountByEmployee[f.employeeId] = (familyCountByEmployee[f.employeeId] || 0) + 1;
    });

    const rows = employees.map(e => {
      const dob = e.dateOfBirth ? tsToDateStr(e.dateOfBirth) : null;
      return {
        id:                     e.id,
        employeeName:           e.fullName || '—',
        employeeNumber:         e.officialEmployeeNumber || '—',
        dateOfBirth:            dob,
        age:                    calcAge(dob),
        cnic:                   e.cnic || '—',
        maritalStatus:          e.maritalStatus || '—',
        bloodGroup:             e.bloodGroup || '—',
        grade:                  e.designation || '—',
        unit:                   e.unit || '—',
        department:             e.department || '—',
        townshipResident:       !!(e.townshipResidentWithFamily || e.townshipResidentBachelor),
        houseType:              e.residenceType || '—',
        houseNumber:            e.houseNumber || e.roomNumber || '—',
        phoneNumber:            e.phoneNumber || '—',
        totalNoOfFamilyMembers: familyCountByEmployee[e.userId] || 0,
        // residentGuests deliberately omitted — deferred to V2, no
        // capture flow exists yet, per PHASE10_DESIGN.md.
      };
    }).sort((a, b) => (a.employeeName || '').localeCompare(b.employeeName || ''));

    // Filter option lists — dynamic, from real data, not hardcoded.
    const filterOptions = {
      departments: [...new Set(employees.map(e => e.department).filter(Boolean))].sort(),
      units:       [...new Set(employees.map(e => e.unit).filter(Boolean))].sort(),
      grades:      [...new Set(employees.map(e => e.designation).filter(Boolean))].sort(),
      houseTypes:  [...new Set(employees.map(e => e.residenceType).filter(Boolean))].sort(),
      bloodGroups: [...new Set(employees.map(e => e.bloodGroup).filter(Boolean))].sort(),
      maritalStatuses: [...new Set(employees.map(e => e.maritalStatus).filter(Boolean))].sort(),
    };

    if (format === 'pdf') {
      return sendPDF(res, 'employee-report.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Employee Report', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
           .text(`Total Employees: ${rows.length}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        const cols = { name: 40, num: 128, dob: 190, cnic: 238, grade: 310, dept: 375, unit: 435, fam: 490 };
        doc.fontSize(7).font('Helvetica-Bold');
        doc.text('Employee', cols.name, doc.y, { width: 86 }); doc.moveUp();
        doc.text('Emp #',    cols.num,  doc.y, { width: 60 }); doc.moveUp();
        doc.text('DOB',      cols.dob,  doc.y, { width: 46 }); doc.moveUp();
        doc.text('CNIC',     cols.cnic, doc.y, { width: 70 }); doc.moveUp();
        doc.text('Grade',    cols.grade,doc.y, { width: 63 }); doc.moveUp();
        doc.text('Dept',     cols.dept, doc.y, { width: 58 }); doc.moveUp();
        doc.text('Unit',     cols.unit, doc.y, { width: 53 }); doc.moveUp();
        doc.text('Family',   cols.fam,  doc.y, { width: 40 });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fontSize(7).font('Helvetica');
        rows.forEach(r => {
          const y = doc.y;
          doc.text(r.employeeName,                  cols.name, y, { width: 86 }); doc.moveUp();
          doc.text(r.employeeNumber,                 cols.num,  y, { width: 60 }); doc.moveUp();
          doc.text(r.dateOfBirth || '—',             cols.dob,  y, { width: 46 }); doc.moveUp();
          doc.text(r.cnic,                           cols.cnic, y, { width: 70 }); doc.moveUp();
          doc.text(r.grade,                          cols.grade,y, { width: 63 }); doc.moveUp();
          doc.text(r.department,                     cols.dept, y, { width: 58 }); doc.moveUp();
          doc.text(r.unit,                           cols.unit, y, { width: 53 }); doc.moveUp();
          doc.text(String(r.totalNoOfFamilyMembers), cols.fam,  y, { width: 40 });
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

    return successResponse(res, { total: rows.length, filterOptions, employees: rows });
  } catch (error) {
    console.error('Employee report error:', error);
    return errorResponse(res, 'Failed to generate employee report', 500);
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

// ─── GET /chronic-disease ─────────────────────────────────
// Phase 10 — Employee Chronic Disease Report (new). The only report
// reading employees/{id}/private/medical — Firestore rules restrict that
// subcollection to admin_incharge/cmo, but this route uses the Admin SDK
// (which bypasses rules) and gates access the same way at its own
// verifyRole check below. One extra read per employee on top of the
// normal `employees` read — ~1,000 extra reads per generation for
// ~1,000 employees, fine for CMO-only infrequent use per
// PHASE10_DESIGN.md's own cost note.
router.get('/chronic-disease', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { format } = req.query;

    const [empSnapshot, activeUserMap] = await Promise.all([
      db.collection('employees').where('isValidated', '==', true).get(),
      getActiveUserMap(db),
    ]);
    // Phase 10 — census report: exclude employees whose linked users
    // account is disabled (resigned/deactivated), not just unvalidated.
    const employees = empSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(e => activeUserMap[e.userId] === true);

    const medicalDocs = await Promise.all(
      employees.map(e => db.collection('employees').doc(e.id).collection('private').doc('medical').get())
    );

    const rows = employees.map((e, i) => {
      const medDoc = medicalDocs[i];
      const chronicDisease = (medDoc.exists && medDoc.data().chronicDisease) || [];
      const dob = e.dateOfBirth ? tsToDateStr(e.dateOfBirth) : null;
      return {
        id:                   e.id,
        employeeName:         e.fullName || '—',
        employeeNumber:       e.officialEmployeeNumber || '—',
        age:                  calcAge(dob),
        diabetes:             chronicDisease.includes('Diabetes'),
        hypertension:         chronicDisease.includes('Hypertension'),
        ischemicHeartDisease: chronicDisease.includes('Ischemic Heart Disease'),
        derangedLipidProfile: chronicDisease.includes('Deranged Lipid Profile'),
        isSmoker:             !!e.isSmoker,
      };
    });

    const summary = {
      smokers:              rows.filter(r => r.isSmoker).length,
      diabetic:             rows.filter(r => r.diabetes).length,
      hypertensive:         rows.filter(r => r.hypertension).length,
      ischemicHeartDisease: rows.filter(r => r.ischemicHeartDisease).length,
      derangedLipidProfile: rows.filter(r => r.derangedLipidProfile).length,
    };

    if (format === 'pdf') {
      return sendPDF(res, 'employee-chronic-disease-report.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Employee Chronic Disease Report', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
           .text(
             `Smokers: ${summary.smokers}  |  Diabetic: ${summary.diabetic}  |  Hypertensive: ${summary.hypertensive}  |  ` +
             `IHD: ${summary.ischemicHeartDisease}  |  Deranged Lipid Profile: ${summary.derangedLipidProfile}`,
             { align: 'center' }
           );
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        if (rows.length === 0) {
          doc.fontSize(12).text('No employee records found.', { align: 'center' });
          return;
        }

        const cols = { name: 40, num: 160, age: 225, dm: 260, htn: 305, ihd: 355, dlp: 420, smk: 495 };
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Employee', cols.name, doc.y, { width: 115 }); doc.moveUp();
        doc.text('Emp #',    cols.num,  doc.y, { width: 60 });  doc.moveUp();
        doc.text('Age',      cols.age,  doc.y, { width: 30 });  doc.moveUp();
        doc.text('DM',       cols.dm,   doc.y, { width: 40 });  doc.moveUp();
        doc.text('HTN',      cols.htn,  doc.y, { width: 45 });  doc.moveUp();
        doc.text('IHD',      cols.ihd,  doc.y, { width: 60 });  doc.moveUp();
        doc.text('DLP',      cols.dlp,  doc.y, { width: 70 });  doc.moveUp();
        doc.text('Smoker',   cols.smk,  doc.y, { width: 55 });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fontSize(8).font('Helvetica');
        rows.forEach(r => {
          const y = doc.y;
          doc.text(r.employeeName,                        cols.name, y, { width: 115 }); doc.moveUp();
          doc.text(r.employeeNumber,                       cols.num,  y, { width: 60 });  doc.moveUp();
          doc.text(r.age !== null ? String(r.age) : '—',   cols.age,  y, { width: 30 });  doc.moveUp();
          doc.text(r.diabetes ? 'Yes' : 'No',               cols.dm,   y, { width: 40 });  doc.moveUp();
          doc.text(r.hypertension ? 'Yes' : 'No',           cols.htn,  y, { width: 45 });  doc.moveUp();
          doc.text(r.ischemicHeartDisease ? 'Yes' : 'No',   cols.ihd,  y, { width: 60 });  doc.moveUp();
          doc.text(r.derangedLipidProfile ? 'Yes' : 'No',   cols.dlp,  y, { width: 70 });  doc.moveUp();
          doc.text(r.isSmoker ? 'Yes' : 'No',               cols.smk,  y, { width: 55 });
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

    return successResponse(res, { summary, rows });
  } catch (error) {
    console.error('Chronic disease report error:', error);
    return errorResponse(res, 'Failed to generate chronic disease report', 500);
  }
});

// ─── GET /feedback ────────────────────────────────────────
// Phase 10 rebuild — Feedback Report (tiled shape, not a row table).
// The Phase 9 field-name fixes below are still the foundation this
// builds on. All 10 real rating parameters are covered — 3 mandatory
// (housekeeping, staffBehaviour, waitingTime) + 7 conditional
// (consultation, dental, laboratory, nursing, pharmacy, physiotherapy,
// xray). PHASE10_DESIGN.md's spec text said "6 conditional / 9 total"
// but its own listed names are 7 — confirmed against the real schema
// and against Homi directly; building all 10, the doc's count label was
// simply wrong.
//
// Phase 9 fix (flagged Day 13, confirmed and fixed here): this route was
// reading field names that don't match the real feedback schema —
// ratings are nested under `ratings.*`, not top-level `*Rating` fields;
// `isAnonymous` doesn't exist anywhere in this module (there's no
// anonymous-submission concept in Feedback); the comment field is
// `overallExperience`, not `comments`. Role list locked to CMO only,
// matching the rest of the feedback module.
router.get('/feedback', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { format } = req.query;

    const [feedbackSnap, suggestionsSnap] = await Promise.all([
      db.collection('feedback').orderBy('submittedAt', 'desc').get(),
      db.collection('suggestions').get(),
    ]);
    const feedbacks = feedbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const MANDATORY = ['housekeeping', 'staffBehaviour', 'waitingTime'];
    const CONDITIONAL = ['consultation', 'dental', 'laboratory', 'nursing', 'pharmacy', 'physiotherapy', 'xray'];
    const ALL_PARAMS = [...MANDATORY, ...CONDITIONAL];

    // Averages a named rating field across a given feedback subset,
    // reading it from ratings.<field> — present on every doc for the 3
    // mandatory fields, present only when that service was used for the
    // 7 conditional ones. Returns null (not 0) when nothing to average,
    // per PHASE10_DESIGN.md's explicit "not treated as zero" rule.
    const avgField = (list, field) => {
      const values = list.map(f => f.ratings?.[field]).filter(v => typeof v === 'number');
      if (values.length === 0) return null;
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    };

    // "Overall Cumulative Satisfaction" = the average of the 3
    // mandatory parameters' own averages (not a pooled average of every
    // individual rating number) — matches the spec's "average of the 3
    // mandatory rating parameters" wording.
    const overallOf = (list) => {
      const parts = MANDATORY.map(f => avgField(list, f)).filter(v => v !== null);
      if (parts.length === 0) return null;
      return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;
    };

    const perParameter = {};
    ALL_PARAMS.forEach(p => { perParameter[p] = avgField(feedbacks, p); });

    const withComments = feedbacks.filter(f => f.overallExperience && f.overallExperience.trim());

    // Trend chart data — one line per parameter (+ a computed "overall"
    // line), monthly averages for every year that has data. Sent
    // pre-computed for all 10+1 series so the frontend selector can
    // switch parameters with no extra round-trip.
    const years = [...new Set(feedbacks.map(f => (f.submittedAt || '').slice(0, 4)).filter(Boolean))]
      .sort((a, b) => b.localeCompare(a));

    const byMonth = (year) => {
      const buckets = Array.from({ length: 12 }, () => []);
      feedbacks.forEach(f => {
        const d = f.submittedAt || '';
        if (d.slice(0, 4) !== year) return;
        const monthIdx = parseInt(d.slice(5, 7), 10) - 1;
        if (monthIdx >= 0 && monthIdx < 12) buckets[monthIdx].push(f);
      });
      return buckets;
    };

    const trend = { years, byParameter: {} };
    ['overall', ...ALL_PARAMS].forEach(param => {
      trend.byParameter[param] = {};
      years.forEach(year => {
        const buckets = byMonth(year);
        trend.byParameter[param][year] = buckets.map(list =>
          param === 'overall' ? overallOf(list) : avgField(list, param)
        );
      });
    });

    const summary = {
      totalFeedbacks:      feedbacks.length,
      overallSatisfaction: overallOf(feedbacks),
      totalSuggestions:    suggestionsSnap.size,
      withComments:        withComments.length,
      perParameter,
      recentComments: withComments.slice(0, 10)
        .map(f => ({ comment: f.overallExperience, submittedAt: f.submittedAt })),
    };

    const PARAM_LABEL = {
      housekeeping: 'Housekeeping', staffBehaviour: 'Staff Behaviour', waitingTime: 'Waiting Time',
      consultation: 'Consultation', dental: 'Dental', laboratory: 'Laboratory', nursing: 'Nursing',
      pharmacy: 'Pharmacy', physiotherapy: 'Physiotherapy', xray: 'X-Ray',
    };

    if (format === 'pdf') {
      return sendPDF(res, 'feedback-report.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Feedback Report', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
           .text(
             `Total Feedbacks: ${summary.totalFeedbacks}  |  Overall Satisfaction: ${summary.overallSatisfaction ?? '—'}/5  |  ` +
             `Suggestions Received: ${summary.totalSuggestions}`,
             { align: 'center' }
           );
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        doc.fontSize(11).font('Helvetica-Bold').text('Per-Parameter Cumulative Ratings');
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica');
        ALL_PARAMS.forEach(p => {
          const val = perParameter[p];
          doc.text(`${PARAM_LABEL[p]}: ${val !== null ? val + '/5' : 'No data'}`);
        });

        doc.moveDown();
        doc.fontSize(9).font('Helvetica-Oblique')
           .text('Trend chart not included in PDF — view in-app for the full monthly comparison.', { align: 'center' });
        doc.moveDown();
        doc.fontSize(9).font('Helvetica-Oblique')
           .text(`Generated: ${new Date().toLocaleString('en-PK')}`, { align: 'right' });
      });
    }

    return successResponse(res, { summary, trend });
  } catch (error) {
    console.error('Feedback report error:', error);
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
//
// Phase 10 cleanup: GET /trips (the general date-range/month booking
// summary that used to live here) removed — confirmed orphaned. Traced
// end-to-end via api.js and tripRoutes.js: nothing in the app calls
// ${API.reports}/trips. Trip Day Report and Trip Range Report below
// cover the report needs; TripReportScreen.js's date-scoped share-sheet
// report calls tripRoutes.js's own GET /all (a completely separate
// Cloud Function, ${API.trips}/all) instead.
// ─────────────────────────────────────────────────────────

// ─── GET /trip-day ────────────────────────────────────────
// Phase 10 redesign — Trip Day Report. Any single date, past or future
// (query param `date`, defaults to today) — supports the "pull tomorrow's
// bookings ahead of a strike notice" use case from PHASE10_DESIGN.md.
// Access widened to include admin_incharge, per that report's spec.
// PDF export now available to every role with access to the report, not
// reception-only — matches the universal "PDF export on every report"
// rule; reception's driver-facing use case still works exactly as before.
router.get('/trip-day', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
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
      .map(b => ({ ...b, hospital: b.hospital || hospitalMap[b.doctorId] || null }))
      .sort((a, b) => (a.pickupHouse || '').localeCompare(b.pickupHouse || ''));
    // ↑ prefers the booking's own snapshot hospital (Day 22 fix) and only
    // falls back to the doctorDirectory lookup for pre-fix bookings that
    // have hospital: null, per SCHEMA_REFERENCE.md's guidance on this field.

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

        // Column headers — now includes employeeNumber, Referral, Return
        // per PHASE10_DESIGN.md's 10-column spec. Landscape-style column
        // positions kept tight since this is a driver-facing single-page
        // handout, not a data-dense export.
        const cols = {
          no: 40, name: 65, empNum: 145, house: 205, phone: 260,
          doctor: 320, hospital: 385, ref: 445, ret: 490,
        };
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('#',        cols.no,      doc.y, { width: 20 });  doc.moveUp();
        doc.text('Patient',  cols.name,    doc.y, { width: 78 });  doc.moveUp();
        doc.text('Emp #',    cols.empNum,  doc.y, { width: 58 });  doc.moveUp();
        doc.text('Pickup',   cols.house,   doc.y, { width: 53 });  doc.moveUp();
        doc.text('Phone',    cols.phone,   doc.y, { width: 58 });  doc.moveUp();
        doc.text('Doctor',   cols.doctor,  doc.y, { width: 63 });  doc.moveUp();
        doc.text('Hospital', cols.hospital,doc.y, { width: 58 });  doc.moveUp();
        doc.text('Referral', cols.ref,     doc.y, { width: 43 });  doc.moveUp();
        doc.text('Return',   cols.ret,     doc.y, { width: 45 });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        // Rows
        doc.fontSize(8).font('Helvetica');
        bookings.forEach((b, i) => {
          const y = doc.y;
          doc.text(String(i + 1),               cols.no,      y, { width: 20 }); doc.moveUp();
          doc.text(b.patientName   || '—',      cols.name,    y, { width: 78 }); doc.moveUp();
          doc.text(b.employeeNumber|| '—',      cols.empNum,  y, { width: 58 }); doc.moveUp();
          doc.text(b.pickupHouse   || '—',      cols.house,   y, { width: 53 }); doc.moveUp();
          doc.text(b.phone         || '—',      cols.phone,   y, { width: 58 }); doc.moveUp();  // ← Day 13 fix: real field is `phone`
          doc.text(b.doctorName    || '—',      cols.doctor,  y, { width: 63 }); doc.moveUp();
          doc.text(b.hospital      || '—',      cols.hospital,y, { width: 58 }); doc.moveUp();
          doc.text(b.referralConfirmed ? 'Yes' : 'No', cols.ref, y, { width: 43 }); doc.moveUp();
          doc.text(b.returnTrip        ? 'Yes' : 'No', cols.ret, y, { width: 45 });
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

// ─── GET /trips/range ─────────────────────────────────────
// Phase 10 — Trip Range Report. Full replacement of the old
// /trips/monthly (month+year picker) with a from/to date-range query —
// per PHASE10_DESIGN.md, "not a variant, a full replacement." The old
// "1600 finalize rule" (a snapshot/lock for a printed driver PDF) was
// explicitly dropped once Trip Day and Trip Range were split apart —
// live data only, always, no snapshot/lock logic anywhere in this route.
// CMO only. Past dates only, unlimited span — enforced two ways: the
// requested range is clamped to today, and the result set itself is
// filtered to tripDate <= today as a second check, same
// belt-and-suspenders pattern already used elsewhere in this file
// (Blood Donor Report's live-status filtering).
router.get('/trips/range', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const todayStr = new Date().toISOString().split('T')[0];
    let { fromDate, toDate, format } = req.query;

    if (fromDate && fromDate > todayStr) fromDate = todayStr;
    if (toDate && toDate > todayStr) toDate = todayStr;

    const bookingsSnap = await db.collection('tripBookings')
      .where('status', '==', 'confirmed')
      .get();

    let rawBookings = bookingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    rawBookings = rawBookings.filter(b => inDateRange(b.tripDate, fromDate, toDate));
    rawBookings = rawBookings.filter(b => (b.tripDate || '') <= todayStr); // belt-and-suspenders

    const hospitalMap = await getHospitalMap(db, rawBookings.map(b => b.doctorId));

    // 8 columns per spec — same set as Trip Day Report minus
    // houseNumber and employeePhoneNumber (a historical-review report
    // has no need for driver-logistics fields).
    const rows = rawBookings.map(b => ({
      id:                b.id,
      tripDate:          b.tripDate,
      patientName:       b.patientName     || '—',
      employeeName:      b.employeeName    || '—',
      employeeNumber:    b.employeeNumber  || '—',
      patientRelation:   b.patientRelation || '—',
      doctorName:        b.doctorName      || '—',
      hospital:          b.hospital || hospitalMap[b.doctorId] || '—',
      referralConfirmed: !!b.referralConfirmed,
      returnTrip:        !!b.returnTrip,
    })).sort((a, b) => (b.tripDate || '').localeCompare(a.tripDate || ''));

    if (format === 'pdf') {
      return sendPDF(res, `trip-range-report-${fromDate || 'start'}-to-${toDate || todayStr}.pdf`, (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text(`Trip Range Report — ${fromDate || 'earliest'} to ${toDate || todayStr}`, { align: 'center' });
        doc.fontSize(10).font('Helvetica')
           .text(`Total Bookings: ${rows.length}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        if (rows.length === 0) {
          doc.fontSize(12).text('No confirmed bookings for this range.', { align: 'center' });
          return;
        }

        const cols = { date: 40, name: 90, empNum: 175, rel: 230, doctor: 285, hosp: 355, ref: 425, ret: 475 };
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Date',     cols.date,   doc.y, { width: 48 }); doc.moveUp();
        doc.text('Patient',  cols.name,   doc.y, { width: 82 }); doc.moveUp();
        doc.text('Emp #',    cols.empNum, doc.y, { width: 52 }); doc.moveUp();
        doc.text('Relation', cols.rel,    doc.y, { width: 52 }); doc.moveUp();
        doc.text('Doctor',   cols.doctor, doc.y, { width: 68 }); doc.moveUp();
        doc.text('Hospital', cols.hosp,   doc.y, { width: 68 }); doc.moveUp();
        doc.text('Referral', cols.ref,    doc.y, { width: 48 }); doc.moveUp();
        doc.text('Return',   cols.ret,    doc.y, { width: 45 });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fontSize(8).font('Helvetica');
        rows.forEach(r => {
          const y = doc.y;
          doc.text(r.tripDate,                          cols.date,   y, { width: 48 }); doc.moveUp();
          doc.text(r.patientName,                       cols.name,   y, { width: 82 }); doc.moveUp();
          doc.text(r.employeeNumber,                    cols.empNum, y, { width: 52 }); doc.moveUp();
          doc.text(r.patientRelation,                   cols.rel,    y, { width: 52 }); doc.moveUp();
          doc.text(r.doctorName,                        cols.doctor, y, { width: 68 }); doc.moveUp();
          doc.text(r.hospital,                          cols.hosp,   y, { width: 68 }); doc.moveUp();
          doc.text(r.referralConfirmed ? 'Yes' : 'No',  cols.ref,    y, { width: 48 }); doc.moveUp();
          doc.text(r.returnTrip ? 'Yes' : 'No',         cols.ret,    y, { width: 45 });
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
      fromDate: fromDate || null,
      toDate:   toDate || todayStr,
      total:    rows.length,
      rows,
    });

  } catch (error) {
    console.error('Trip range report error:', error);
    return errorResponse(res, 'Failed to generate trip range report', 500);
  }
});

// ─────────────────────────────────────────────────────────
// ─── OTHER ROUTES (unchanged) ────────────────────────────
// ─────────────────────────────────────────────────────────

// ─── GET /ambulance/kpis ──────────────────────────────────
// Phase 10 redesign — Ambulance KPI Report (Daily + Range). Same 12
// columns for both modes, unlike Trip Report's day/range split — this
// report's row-level detail doesn't shrink for a wider date window.
// Access narrowed to CMO only (was CMO + Doctor) per PHASE10_DESIGN.md.
// Past dates only, unlimited span — clamped both ways (requested range
// and result set), same belt-and-suspenders pattern as Trip Range
// Report, since ambulance requests are on-demand and have no legitimate
// future date the way Trip bookings do.
//
// houseNumber now reads the auto-locked snapshot field added to
// ambulanceRequests at creation (Phase 10 — see ambulanceRoutes.js
// POST /request). Requests created before that change will show
// houseNumber: null, a permanent gap with no way to backfill — same
// shape as this session's dateOfBirth/gender gaps.
//
// falseEmergencyFlag was already a fully built, live feature (Phase
// 5.8.3) — this route is the first thing to surface it in a report; no
// new capture work needed, just reading a field that already existed.
router.get('/ambulance/kpis', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const todayStr = new Date().toISOString().split('T')[0];
    let { date, fromDate, toDate, format } = req.query;

    if (date && date > todayStr) date = todayStr;
    if (fromDate && fromDate > todayStr) fromDate = todayStr;
    if (toDate && toDate > todayStr) toDate = todayStr;

    const snapshot = await db.collection('ambulanceRequests')
      .orderBy('createdAt', 'desc')
      .get();

    let requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (date) {
      requests = requests.filter(r => r.createdAt && r.createdAt.startsWith(date));
    } else if (fromDate || toDate) {
      requests = requests.filter(r => inDateRange((r.createdAt || '').slice(0, 10), fromDate, toDate));
    }
    requests = requests.filter(r => (r.createdAt || '').slice(0, 10) <= todayStr); // belt-and-suspenders

    // employeeName join, via employeeNumber (officialEmployeeNumber) —
    // ambulanceRequests.employeeNumber stores the official number, not a
    // uid, so the lookup map is keyed the same way.
    const empSnapshot = await db.collection('employees').get();
    const empByNumber = {};
    empSnapshot.docs.forEach(doc => {
      const e = doc.data();
      if (e.officialEmployeeNumber) empByNumber[e.officialEmployeeNumber] = e;
    });

    const NATURE_LABEL = {
      emergency: 'Emergency',
      routine_consultation: 'Routine Consultation',
      physiotherapy: 'Physiotherapy',
      dental: 'Dental',
      lab_sample: 'Lab Sample',
    };
    const TRIP_RANGE_LABEL = { intra_township: 'Intra-Township', intercity: 'Intercity' };

    const kpiRows = requests.map(r => {
      const emp = empByNumber[r.employeeNumber] || {};
      return {
        id:                 r.id,
        createdAt:          r.createdAt || null,
        patientName:        r.patientName || '—',
        employeeName:       emp.fullName || '—',
        employeeNumber:     r.employeeNumber || '—',
        relation:           r.patientRelation || '—',
        houseNumber:        r.houseNumber || '—',
        natureOfVisit:      NATURE_LABEL[r.purposeOfVisit] || r.purposeOfVisit || '—',
        responseTime:       diffMinutes(r.createdAt, r.dispatchedAt),
        arrivalTime:        diffMinutes(r.dispatchedAt, r.pickedUpAt),
        returnTime:         diffMinutes(r.pickedUpAt, r.completedAt),
        dropOff:            r.dropOffOutcome === 'dropped_off',
        tripRange:          TRIP_RANGE_LABEL[r.tripType] || r.tripType || '—',
        falseEmergencyFlag: !!r.falseEmergencyFlag,
        totalTripTime:      diffMinutes(r.createdAt, r.completedAt), // for the top summary only, not one of the 12 columns
      };
    });

    const avg = (field) => {
      const vals = kpiRows.filter(r => r[field] !== null).map(r => r[field]);
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    };

    const completed = requests.filter(r => r.status === 'completed');

    const summary = {
      totalRequests:    requests.length,
      completed:        completed.length,
      avgResponseTime:  avg('responseTime'),
      avgArrivalTime:   avg('arrivalTime'),
      avgReturnTime:    avg('returnTime'),
      avgTotalTripTime: avg('totalTripTime'),
    };

    if (format === 'pdf') {
      return sendPDF(res, 'ambulance-kpi-report.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Ambulance KPI Report', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
           .text(
             `Total Requests: ${summary.totalRequests}  |  Completed: ${summary.completed}  |  ` +
             `Avg Response: ${summary.avgResponseTime ?? '—'} min  |  Avg Arrival: ${summary.avgArrivalTime ?? '—'} min`,
             { align: 'center' }
           );
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        if (kpiRows.length === 0) {
          doc.fontSize(12).text('No ambulance requests for this selection.', { align: 'center' });
          return;
        }

        const cols = { patient: 40, emp: 108, empNum: 172, rel: 215, house: 250, nature: 285, resp: 355, arr: 388, ret: 420, drop: 452, range: 483, flag: 522 };
        doc.fontSize(6).font('Helvetica-Bold');
        doc.text('Patient',  cols.patient, doc.y, { width: 66 }); doc.moveUp();
        doc.text('Employee', cols.emp,     doc.y, { width: 62 }); doc.moveUp();
        doc.text('Emp #',    cols.empNum,  doc.y, { width: 41 }); doc.moveUp();
        doc.text('Relation', cols.rel,     doc.y, { width: 33 }); doc.moveUp();
        doc.text('House',    cols.house,   doc.y, { width: 33 }); doc.moveUp();
        doc.text('Nature',   cols.nature,  doc.y, { width: 68 }); doc.moveUp();
        doc.text('Resp',     cols.resp,    doc.y, { width: 31 }); doc.moveUp();
        doc.text('Arr',      cols.arr,     doc.y, { width: 30 }); doc.moveUp();
        doc.text('Ret',      cols.ret,     doc.y, { width: 30 }); doc.moveUp();
        doc.text('Drop',     cols.drop,    doc.y, { width: 29 }); doc.moveUp();
        doc.text('Range',    cols.range,   doc.y, { width: 37 }); doc.moveUp();
        doc.text('FalseE',   cols.flag,    doc.y, { width: 30 });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fontSize(6).font('Helvetica');
        kpiRows.forEach(r => {
          const y = doc.y;
          doc.text(r.patientName,                                              cols.patient, y, { width: 66 }); doc.moveUp();
          doc.text(r.employeeName,                                             cols.emp,     y, { width: 62 }); doc.moveUp();
          doc.text(r.employeeNumber,                                           cols.empNum,  y, { width: 41 }); doc.moveUp();
          doc.text(r.relation,                                                 cols.rel,     y, { width: 33 }); doc.moveUp();
          doc.text(r.houseNumber,                                              cols.house,   y, { width: 33 }); doc.moveUp();
          doc.text(r.natureOfVisit,                                            cols.nature,  y, { width: 68 }); doc.moveUp();
          doc.text(r.responseTime !== null ? String(r.responseTime) : '—',     cols.resp,    y, { width: 31 }); doc.moveUp();
          doc.text(r.arrivalTime !== null ? String(r.arrivalTime) : '—',       cols.arr,     y, { width: 30 }); doc.moveUp();
          doc.text(r.returnTime !== null ? String(r.returnTime) : '—',         cols.ret,     y, { width: 30 }); doc.moveUp();
          doc.text(r.dropOff ? 'Yes' : 'No',                                   cols.drop,    y, { width: 29 }); doc.moveUp();
          doc.text(r.tripRange,                                                cols.range,   y, { width: 37 }); doc.moveUp();
          doc.text(r.falseEmergencyFlag ? 'Yes' : 'No',                        cols.flag,    y, { width: 30 });
          doc.moveDown(0.15);
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#eeeeee');
          doc.moveDown(0.15);
          if (doc.y > 750) doc.addPage();
        });

        doc.moveDown();
        doc.fontSize(9).font('Helvetica-Oblique')
           .text(`Generated: ${new Date().toLocaleString('en-PK')}`, { align: 'right' });
      });
    }

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

// ─── GET /population/report ───────────────────────────────
// Phase 10 — Population Report (new). Grouped summary tiles, not a row
// table — a statistics dashboard, genuinely different shape from every
// other report in this batch. Deliberately a NEW route, not a rewrite of
// /population/township, /population/non-township, or
// /population/employees-only below — those still back
// PopulationReportScreen.js/EmployeeOnlyReportScreen.js and were left
// untouched (see the /employees/report comment above for the same
// reasoning). All figures numbered per PHASE10_DESIGN.md's spec.
//
// Join-key correction: familyMembers are matched by e.userId (the
// sponsoring employee's Auth UID), not e.id — same fix as
// /employees/report above and /family-report below. Originally built
// against the wrong key; caught and fixed same-session.
//
// Figures 7 & 8 (age brackets, gender) segregate by the sponsoring
// employee's employeeType — spec text named only management/
// non-management, but employees actually have a third value, ESB
// (school staff). Confirmed with Homi directly: ESB gets its own third
// bucket in both figures, not folded into non-management.
//
// Figure 9 (maritalStatus breakdown) is built as a company-wide employee
// count, not scoped to township residents — it's spec'd as a standalone
// numbered figure, not nested under the "5-8" township group the way the
// age/gender bullets explicitly are. Flagged as an assumption, not a
// confirmed instruction — worth a quick look together at review time.
router.get('/population/report', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { format } = req.query;

    const [empSnapshot, familySnapshot, activeUserMap] = await Promise.all([
      db.collection('employees').where('isValidated', '==', true).get(),
      db.collection('familyMembers').get(),
      getActiveUserMap(db),
    ]);

    // Phase 10 — census report: exclude employees whose linked users
    // account is disabled. Filtering here, before any figure is computed,
    // automatically excludes their family headcount too — every figure
    // below only ever iterates this filtered `employees` array.
    const employees = empSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(e => activeUserMap[e.userId] === true);

    const FAMILY_RELATIONS = ['spouse', 'son', 'daughter'];
    const familyByEmployee = {};
    familySnapshot.docs.forEach(doc => {
      const f = doc.data();
      if (!FAMILY_RELATIONS.includes((f.relation || '').toLowerCase())) return;
      if (!f.isActive || f.status !== 'validated') return;
      if (!familyByEmployee[f.employeeId]) familyByEmployee[f.employeeId] = [];
      familyByEmployee[f.employeeId].push(f);
    });

    const isTownship = (e) => !!(e.townshipResidentWithFamily || e.townshipResidentBachelor);

    // Figures 1-4 — plain employee counts by employeeType.
    const totalEmployees = employees.length;
    const managementCount    = employees.filter(e => e.employeeType === 'management').length;
    const nonManagementCount = employees.filter(e => e.employeeType === 'non_management').length;
    const esbCount            = employees.filter(e => e.employeeType === 'ESB').length;

    const townshipEmployees = employees.filter(isTownship);
    const outsideEmployees  = employees.filter(e => !isTownship(e));

    // Figure 5 — township population headcount: employees + their
    // active/validated spouse and children.
    const townshipFamilyCount = townshipEmployees.reduce(
      (sum, e) => sum + (familyByEmployee[e.userId]?.length || 0), 0
    );
    const townshipPopulationTotal = townshipEmployees.length + townshipFamilyCount;

    // Figure 6 — house-type-wise breakdown of that same headcount,
    // grouped by the sponsor's residenceType (family members inherit it —
    // they have no house type of their own).
    const houseTypeBreakdown = {};
    townshipEmployees.forEach(e => {
      const type = e.residenceType || 'Unspecified';
      const familyCount = familyByEmployee[e.userId]?.length || 0;
      houseTypeBreakdown[type] = (houseTypeBreakdown[type] || 0) + 1 + familyCount;
    });

    // Figures 7 & 8 — every person in the township population (employee
    // + their family), each with their own age and gender, classified by
    // the sponsoring employee's employeeType (own, if the person IS the
    // employee). Three buckets: management, non_management, ESB.
    const ageBracket = (age) => {
      if (age === null || age === undefined) return null;
      if (age < 2) return 'under2';
      if (age <= 12) return '2to12';
      if (age < 18) return '13to17';   // spec says "13-18" / "18 and above" —
      return '18plus';                  // exact age 18 resolved into 18plus to avoid double-counting.
    };

    const emptyBracketSet = () => ({
      management:     { under2: 0, '2to12': 0, '13to17': 0, '18plus': 0 },
      non_management: { under2: 0, '2to12': 0, '13to17': 0, '18plus': 0 },
      ESB:            { under2: 0, '2to12': 0, '13to17': 0, '18plus': 0 },
    });
    const emptyGenderSet = () => ({
      management:     { male: 0, female: 0, unspecified: 0 },
      non_management: { male: 0, female: 0, unspecified: 0 },
      ESB:            { male: 0, female: 0, unspecified: 0 },
    });

    const ageBrackets = emptyBracketSet();
    const genderBreakdown = emptyGenderSet();

    const tallyPerson = (dob, gender, employeeType) => {
      const bucket = ['management', 'non_management', 'ESB'].includes(employeeType) ? employeeType : null;
      if (!bucket) return; // employeeType not set — can't classify, skip rather than guess
      const age = calcAge(dob);
      const bracket = ageBracket(age);
      if (bracket) ageBrackets[bucket][bracket]++;
      if (gender === 'male' || gender === 'female') genderBreakdown[bucket][gender]++;
      else genderBreakdown[bucket].unspecified++;
    };

    townshipEmployees.forEach(e => {
      const dob = e.dateOfBirth ? tsToDateStr(e.dateOfBirth) : null;
      tallyPerson(dob, e.gender, e.employeeType);
      (familyByEmployee[e.userId] || []).forEach(f => {
        const fdob = f.dateOfBirth ? tsToDateStr(f.dateOfBirth) : null;
        tallyPerson(fdob, f.gender, e.employeeType); // inherits sponsor's employeeType
      });
    });

    // Figure 9 — maritalStatus breakdown, company-wide (see comment
    // above the route).
    const maritalStatusBreakdown = {};
    ['married', 'unmarried', 'divorced', 'widowed'].forEach(s => { maritalStatusBreakdown[s] = 0; });
    employees.forEach(e => {
      const s = (e.maritalStatus || '').toLowerCase();
      if (maritalStatusBreakdown[s] !== undefined) maritalStatusBreakdown[s]++;
    });

    // Figure 10 — township vs outside employee count.
    const residencySplit = {
      township: townshipEmployees.length,
      outside:  outsideEmployees.length,
    };

    // Figure 11 — total population living outside: non-resident
    // employees + their active/validated spouse and children.
    const outsideFamilyCount = outsideEmployees.reduce(
      (sum, e) => sum + (familyByEmployee[e.userId]?.length || 0), 0
    );
    const outsidePopulationTotal = outsideEmployees.length + outsideFamilyCount;

    // Figure 12 — family-member count for bachelor-housed + married
    // employees (family lives elsewhere, per the agreed inference rule).
    const bachelorMarriedEmployees = employees.filter(
      e => e.townshipResidentBachelor === true && (e.maritalStatus || '').toLowerCase() === 'married'
    );
    const bachelorMarriedFamilyCount = bachelorMarriedEmployees.reduce(
      (sum, e) => sum + (familyByEmployee[e.userId]?.length || 0), 0
    );

    const summary = {
      totalEmployees,
      managementCount,
      nonManagementCount,
      esbCount,
      townshipPopulationTotal,
      houseTypeBreakdown,
      ageBrackets,
      genderBreakdown,
      maritalStatusBreakdown,
      residencySplit,
      outsidePopulationTotal,
      bachelorMarriedEmployeeCount: bachelorMarriedEmployees.length,
      bachelorMarriedFamilyCount,
    };

    if (format === 'pdf') {
      return sendPDF(res, 'population-report.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Population Report', { align: 'center' });
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        const line = (label, value) => { doc.fontSize(10).font('Helvetica').text(`${label}: ${value}`); doc.moveDown(0.15); };

        doc.fontSize(11).font('Helvetica-Bold').text('Employees'); doc.moveDown(0.2);
        line('Total Employees', totalEmployees);
        line('Management', managementCount);
        line('Non-Management', nonManagementCount);
        line('ESB', esbCount);
        doc.moveDown(0.4);

        doc.fontSize(11).font('Helvetica-Bold').text('Township Population'); doc.moveDown(0.2);
        line('Total (employees + spouse/children)', townshipPopulationTotal);
        Object.entries(houseTypeBreakdown).forEach(([type, count]) => line(`House Type: ${type}`, count));
        doc.moveDown(0.4);

        doc.fontSize(11).font('Helvetica-Bold').text('Age Brackets (Township Population)'); doc.moveDown(0.2);
        ['management', 'non_management', 'ESB'].forEach(bucket => {
          const b = ageBrackets[bucket];
          line(bucket, `<2: ${b.under2}  |  2-12: ${b['2to12']}  |  13-17: ${b['13to17']}  |  18+: ${b['18plus']}`);
        });
        doc.moveDown(0.4);

        doc.fontSize(11).font('Helvetica-Bold').text('Gender (Township Population)'); doc.moveDown(0.2);
        ['management', 'non_management', 'ESB'].forEach(bucket => {
          const g = genderBreakdown[bucket];
          line(bucket, `Male: ${g.male}  |  Female: ${g.female}  |  Unspecified: ${g.unspecified}`);
        });
        doc.moveDown(0.4);

        doc.fontSize(11).font('Helvetica-Bold').text('Marital Status (All Employees)'); doc.moveDown(0.2);
        Object.entries(maritalStatusBreakdown).forEach(([status, count]) => line(status, count));
        doc.moveDown(0.4);

        doc.fontSize(11).font('Helvetica-Bold').text('Residency'); doc.moveDown(0.2);
        line('Township Resident Employees', residencySplit.township);
        line('Outside Employees', residencySplit.outside);
        line('Total Population Living Outside', outsidePopulationTotal);
        line('Bachelor-Housed + Married Employees', bachelorMarriedEmployees.length);
        line('Their Family Members (living elsewhere)', bachelorMarriedFamilyCount);

        doc.moveDown();
        doc.fontSize(9).font('Helvetica-Oblique')
           .text(`Generated: ${new Date().toLocaleString('en-PK')}`, { align: 'right' });
      });
    }

    return successResponse(res, { summary });
  } catch (error) {
    console.error('Population report error:', error);
    return errorResponse(res, 'Failed to generate population report', 500);
  }
});

// ─── GET /family-report ───────────────────────────────────
// Phase 10 — Family Report (new). Split out from Employee Report
// specifically to keep that one strictly one-row-per-employee — this
// report carries the household detail instead. Spouse and children
// groups both default-capped (1 spouse, 5 children) with collapse-to-
// expand in-app; the PDF branch below always renders every family
// member with no cap, per PHASE10_DESIGN.md's explicit instruction
// (PDFs are shared as soft copies, so a capped PDF would be an
// incomplete document in the recipient's hands).
//
// Multi-spouse handling mirrors the children pattern exactly — confirmed
// with Homi directly at the start of this session (Pakistani family law
// permits up to four wives, so this isn't a hypothetical edge case).
//
// Family member inclusion: isActive:true AND status:"validated" only —
// same standard as Employee Report's household count. Children sorted
// eldest to youngest by dateOfBirth.
//
// Join-key correction: familyByEmployee below is keyed and looked up by
// e.userId (the sponsoring employee's Auth UID) — familyMembers.employeeId
// stores the UID, not the employees collection's own doc ID. Originally
// built against e.id; caught and fixed same-session, before this report
// was used for any real decision.
router.get('/family-report', verifyToken, verifyRole([
  ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { format } = req.query;

    const [empSnapshot, familySnapshot, activeUserMap] = await Promise.all([
      db.collection('employees').where('isValidated', '==', true).get(),
      db.collection('familyMembers').get(),
      getActiveUserMap(db),
    ]);

    // Phase 10 — census report: exclude employees whose linked users
    // account is disabled (resigned/deactivated), not just unvalidated.
    const employees = empSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(e => activeUserMap[e.userId] === true);

    const familyByEmployee = {};
    familySnapshot.docs.forEach(doc => {
      const f = doc.data();
      if (!f.isActive || f.status !== 'validated') return;
      if (!familyByEmployee[f.employeeId]) familyByEmployee[f.employeeId] = [];
      familyByEmployee[f.employeeId].push(f);
    });

    const memberShape = (f) => ({
      name:       f.name || '—',
      age:        calcAge(f.dateOfBirth ? tsToDateStr(f.dateOfBirth) : null),
      bloodGroup: f.bloodGroup || '—',
    });

    const rows = employees.map(e => {
      const familyMembers = familyByEmployee[e.userId] || [];
      const spouses = familyMembers
        .filter(f => f.relation === 'spouse')
        .map(memberShape);
      const children = familyMembers
        .filter(f => f.relation === 'son' || f.relation === 'daughter')
        .sort((a, b) => {
          // eldest first — earlier dateOfBirth sorts first; missing DOB sorts last
          const da = a.dateOfBirth ? tsToDateStr(a.dateOfBirth) : null;
          const db_ = b.dateOfBirth ? tsToDateStr(b.dateOfBirth) : null;
          if (!da && !db_) return 0;
          if (!da) return 1;
          if (!db_) return -1;
          return da.localeCompare(db_);
        })
        .map(memberShape);

      return {
        id:               e.id,
        employeeName:     e.fullName || '—',
        employeeNumber:   e.officialEmployeeNumber || '—',
        townshipResident: !!(e.townshipResidentWithFamily || e.townshipResidentBachelor),
        houseType:        e.residenceType || '—',
        houseNumber:      e.houseNumber || e.roomNumber || '—',
        spouses,
        children,
      };
    }).sort((a, b) => (a.employeeName || '').localeCompare(b.employeeName || ''));

    if (format === 'pdf') {
      return sendPDF(res, 'family-report.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Family Report', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
           .text(`Total Employees: ${rows.length}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        // PDF always renders every spouse/child, no cap — unlike the
        // in-app collapsible view.
        rows.forEach((r, i) => {
          if (doc.y > 700) doc.addPage();
          doc.fontSize(10).font('Helvetica-Bold')
             .text(`${r.employeeName}  (${r.employeeNumber})`);
          doc.fontSize(8).font('Helvetica')
             .text(`${r.townshipResident ? 'Township' : 'Non-Township'} · ${r.houseType} · ${r.houseNumber}`);
          doc.moveDown(0.2);

          if (r.spouses.length === 0 && r.children.length === 0) {
            doc.fontSize(8).font('Helvetica-Oblique').text('No family members on file.');
          } else {
            r.spouses.forEach((sp, si) => {
              doc.fontSize(8).font('Helvetica')
                 .text(`  Spouse ${r.spouses.length > 1 ? si + 1 : ''}: ${sp.name} · Age ${sp.age ?? '—'} · ${sp.bloodGroup}`);
            });
            r.children.forEach((c, ci) => {
              doc.fontSize(8).font('Helvetica')
                 .text(`  Child ${ci + 1}: ${c.name} · Age ${c.age ?? '—'} · ${c.bloodGroup}`);
            });
          }
          doc.moveDown(0.4);
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#eeeeee');
          doc.moveDown(0.4);
        });

        doc.moveDown();
        doc.fontSize(9).font('Helvetica-Oblique')
           .text(`Generated: ${new Date().toLocaleString('en-PK')}`, { align: 'right' });
      });
    }

    return successResponse(res, { total: rows.length, employees: rows });
  } catch (error) {
    console.error('Family report error:', error);
    return errorResponse(res, 'Failed to generate family report', 500);
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

// ─── GET /blood-donors/report ─────────────────────────────
// Phase 10 — Blood Donor Report (redesign). Reads bloodDonorRegistry —
// a genuinely different dataset from the Blood Group Distribution grid
// below, which stays exactly as-is per PHASE10_DESIGN.md (unchanged
// employee-only census, still backed by /blood-groups/csv's employees
// query). This route is the actual donor list: who to call, live-status
// filtered so a resigned/deactivated employee's old consent record — or
// their family's — never surfaces someone who can't actually be reached
// or who shouldn't be contacted anymore.
//
// bloodDonorRegistry mixes two document-ID schemes in one collection
// (per SCHEMA_REFERENCE.md's Day 14 section):
//   - Employee-keyed: doc ID = the employee's own Auth UID, and the
//     employeeId field holds that same UID — NOT the employees
//     collection's own doc ID. Joined here via employeeByUserId, a map
//     keyed by employees.userId (not employees.id) — same join-key
//     lesson as /employees/report, /population/report, /family-report
//     above.
//   - Family-member-keyed: doc ID = `family_{familyMemberId}`. employeeId
//     here is the SPONSORING employee's UID, not the donor's own — the
//     donor is identified by familyMemberId instead.
//
// Live-status filtering (per Homi's confirmed design, same session):
//   - Employee-keyed entry: included only if the employee is
//     isValidated AND their linked users doc has isActive:true.
//   - Family-member-keyed entry: included only if the SPONSORING
//     employee passes the same active+validated check above, AND the
//     family member's own record has isActive:true and
//     status:"validated".
router.get('/blood-donors/report', verifyToken, verifyRole([
  ROLES.ADMIN_INCHARGE, ROLES.RECEPTION, ROLES.DOCTOR, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { format } = req.query;

    const [registrySnap, empSnap, usersSnap, familySnap] = await Promise.all([
      db.collection('bloodDonorRegistry').get(),
      db.collection('employees').get(),
      db.collection('users').get(),
      db.collection('familyMembers').get(),
    ]);

    const employeeByUserId = {};
    empSnap.docs.forEach(doc => {
      const e = doc.data();
      if (e.userId) employeeByUserId[e.userId] = { id: doc.id, ...e };
    });

    const userActiveByUid = {};
    usersSnap.docs.forEach(doc => {
      userActiveByUid[doc.id] = doc.data().isActive === true;
    });

    const familyById = {};
    familySnap.docs.forEach(doc => {
      familyById[doc.id] = doc.data();
    });

    const isTownship = (e) => !!(e?.townshipResidentWithFamily || e?.townshipResidentBachelor);

    const rows = [];
    registrySnap.docs.forEach(doc => {
      const data = doc.data();
      const isFamilyKeyed = doc.id.startsWith('family_') || !!data.familyMemberId;

      if (isFamilyKeyed) {
        const sponsor = employeeByUserId[data.employeeId];
        if (!sponsor || !sponsor.isValidated) return;
        if (userActiveByUid[data.employeeId] !== true) return;

        const member = familyById[data.familyMemberId];
        if (!member || member.isActive !== true || member.status !== 'validated') return;

        rows.push({
          id:               doc.id,
          bloodDonorName:   data.fullName || member.name || '—',
          employeeNumber:   data.officialEmployeeNumber || '—',
          relation:         (data.relation || member.relation || '—')
                               .replace(/^\w/, c => c.toUpperCase()),
          age:              calcAge(member.dateOfBirth ? tsToDateStr(member.dateOfBirth) : null),
          bloodGroup:       data.bloodGroup || '—',
          phoneNumber:      data.phoneNumber || '—',
          residentialStatus: isTownship(sponsor) ? 'Township Resident' : 'Non-Resident',
        });
      } else {
        const employee = employeeByUserId[data.employeeId] || employeeByUserId[doc.id];
        if (!employee || !employee.isValidated) return;
        if (userActiveByUid[data.employeeId || doc.id] !== true) return;

        rows.push({
          id:               doc.id,
          bloodDonorName:   data.fullName || '—',
          employeeNumber:   data.officialEmployeeNumber || '—',
          relation:         'Self',
          age:              calcAge(employee.dateOfBirth ? tsToDateStr(employee.dateOfBirth) : null),
          bloodGroup:       data.bloodGroup || '—',
          phoneNumber:      data.phoneNumber || '—',
          residentialStatus: isTownship(employee) ? 'Township Resident' : 'Non-Resident',
        });
      }
    });

    rows.sort((a, b) => (a.bloodGroup || '').localeCompare(b.bloodGroup || '') || (a.bloodDonorName || '').localeCompare(b.bloodDonorName || ''));

    if (format === 'csv') {
      const csvRows = rows.map(r => ({
        'Donor Name':         r.bloodDonorName,
        'Employee Number':    r.employeeNumber,
        'Relation':           r.relation,
        'Age':                r.age !== null ? r.age : '—',
        'Blood Group':        r.bloodGroup,
        'Phone Number':       r.phoneNumber,
        'Residential Status': r.residentialStatus,
      }));
      if (!csvRows.length) {
        return errorResponse(res, 'No active blood donors found', 404);
      }
      const parser = new Parser({
        fields: ['Donor Name', 'Employee Number', 'Relation', 'Age', 'Blood Group', 'Phone Number', 'Residential Status'],
      });
      const csv = parser.parse(csvRows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="blood-donor-report.csv"');
      return res.send(csv);
    }

    if (format === 'pdf') {
      return sendPDF(res, 'blood-donor-report.pdf', (doc) => {
        doc.fontSize(16).font('Helvetica-Bold')
           .text('FFL Medical Centre', { align: 'center' });
        doc.fontSize(12).font('Helvetica')
           .text('Blood Donor Report', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
           .text(`Total Active Donors: ${rows.length}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        if (rows.length === 0) {
          doc.fontSize(12).text('No active blood donors found.', { align: 'center' });
          return;
        }

        const cols = { name: 40, num: 150, rel: 215, age: 260, bg: 295, phone: 340, res: 420 };
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Donor',    cols.name,  doc.y, { width: 108 }); doc.moveUp();
        doc.text('Emp #',    cols.num,   doc.y, { width: 62 });  doc.moveUp();
        doc.text('Relation', cols.rel,   doc.y, { width: 42 });  doc.moveUp();
        doc.text('Age',      cols.age,   doc.y, { width: 32 });  doc.moveUp();
        doc.text('Group',    cols.bg,    doc.y, { width: 42 });  doc.moveUp();
        doc.text('Phone',    cols.phone, doc.y, { width: 78 });  doc.moveUp();
        doc.text('Residential Status', cols.res, doc.y, { width: 115 });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fontSize(8).font('Helvetica');
        rows.forEach(r => {
          const y = doc.y;
          doc.text(r.bloodDonorName,                       cols.name,  y, { width: 108 }); doc.moveUp();
          doc.text(r.employeeNumber,                       cols.num,   y, { width: 62 });  doc.moveUp();
          doc.text(r.relation,                             cols.rel,   y, { width: 42 });  doc.moveUp();
          doc.text(r.age !== null ? String(r.age) : '—',   cols.age,   y, { width: 32 });  doc.moveUp();
          doc.text(r.bloodGroup,                           cols.bg,    y, { width: 42 });  doc.moveUp();
          doc.text(r.phoneNumber,                          cols.phone, y, { width: 78 });  doc.moveUp();
          doc.text(r.residentialStatus,                    cols.res,   y, { width: 115 });
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

    return successResponse(res, { total: rows.length, rows });
  } catch (error) {
    console.error('Blood donor report error:', error);
    return errorResponse(res, 'Failed to generate blood donor report', 500);
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