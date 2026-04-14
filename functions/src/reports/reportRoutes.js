const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
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

// ─── GET /ambulance ───────────────────────────────────────
// Daily & monthly ambulance dispatch report
router.get('/ambulance', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { fromDate, toDate, priorityFlag, vehicleType } = req.query;

    const snapshot = await db.collection('ambulanceRequests')
      .orderBy('createdAt', 'desc')
      .get();

    let requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Date filter
    requests = requests.filter(r =>
      inDateRange(r.createdAt, fromDate, toDate)
    );

    // Optional filters
    if (priorityFlag) {
      requests = requests.filter(r => r.priorityFlag === priorityFlag);
    }
    if (vehicleType) {
      requests = requests.filter(r => r.vehicleAssigned === vehicleType);
    }

    // Summary stats
    const summary = {
      total:      requests.length,
      byStatus:   {},
      byVehicle:  {},
      byPriority: {},
      byTripType: {},
    };

    requests.forEach(r => {
      summary.byStatus[r.status]       = (summary.byStatus[r.status]       || 0) + 1;
      summary.byVehicle[r.vehicleAssigned]  = (summary.byVehicle[r.vehicleAssigned]  || 0) + 1;
      summary.byPriority[r.priorityFlag]    = (summary.byPriority[r.priorityFlag]    || 0) + 1;
      summary.byTripType[r.tripType]        = (summary.byTripType[r.tripType]        || 0) + 1;
    });

    return successResponse(res, { summary, requests });
  } catch (error) {
    return errorResponse(res, 'Failed to generate ambulance report', 500);
  }
});

// ─── GET /trips ───────────────────────────────────────────
// Medical trip utilization report
router.get('/trips', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { fromDate, toDate, month, year } = req.query;

    const snapshot = await db.collection('medicalTrips')
      .orderBy('tripDate', 'desc')
      .get();

    let trips = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter by date range
    if (fromDate || toDate) {
      trips = trips.filter(t =>
        inDateRange(t.tripDate, fromDate, toDate)
      );
    }

    // Filter by month/year
    if (month && year) {
      trips = trips.filter(t => {
        const date = new Date(t.tripDate);
        return date.getMonth() + 1 === parseInt(month) &&
               date.getFullYear() === parseInt(year);
      });
    }

    // For each trip get booking details
    const tripsWithBookings = await Promise.all(trips.map(async (trip) => {
      const bookingsSnapshot = await db.collection('medicalTrips')
        .doc(trip.id)
        .collection('bookings')
        .get();

      const bookings = bookingsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      const approvedBookings = bookings.filter(
        b => b.status === BOOKING_STATUS.APPROVED
      );

      return {
        ...trip,
        bookings,
        approvedCount:  approvedBookings.length,
        totalPassengers: approvedBookings.reduce(
          (sum, b) => sum + (b.seatsRequired || 1), 0
        ),
      };
    }));

    // Summary
    const summary = {
      totalTrips:        trips.length,
      totalBookings:     tripsWithBookings.reduce(
        (sum, t) => sum + t.bookings.length, 0
      ),
      totalPassengers:   tripsWithBookings.reduce(
        (sum, t) => sum + t.totalPassengers, 0
      ),
      averageOccupancy:  trips.length > 0
        ? Math.round(
            tripsWithBookings.reduce(
              (sum, t) => sum + (t.seatsBooked / t.totalSeats * 100), 0
            ) / trips.length
          )
        : 0,
      byDayOfWeek: {},
    };

    tripsWithBookings.forEach(t => {
      summary.byDayOfWeek[t.dayOfWeek] =
        (summary.byDayOfWeek[t.dayOfWeek] || 0) + 1;
    });

    return successResponse(res, { summary, trips: tripsWithBookings });
  } catch (error) {
    return errorResponse(res, 'Failed to generate trip report', 500);
  }
});

// ─── GET /vaccination ─────────────────────────────────────
// Vaccination compliance report
router.get('/vaccination', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();

    const profilesSnapshot = await db.collection('vaccinationProfiles').get();

    const profilesWithSchedule = await Promise.all(
      profilesSnapshot.docs.map(async (profileDoc) => {
        const profile = { id: profileDoc.id, ...profileDoc.data() };

        const scheduleSnapshot = await db.collection('vaccinationProfiles')
          .doc(profileDoc.id)
          .collection('scheduleItems')
          .get();

        const schedule = scheduleSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        const administered = schedule.filter(
          s => s.status === VACCINE_STATUS.ADMINISTERED
        ).length;
        const pending = schedule.filter(
          s => s.status === VACCINE_STATUS.PENDING
        ).length;
        const missed = schedule.filter(
          s => s.status === VACCINE_STATUS.MISSED
        ).length;
        const rescheduled = schedule.filter(
          s => s.status === VACCINE_STATUS.RESCHEDULED
        ).length;

        const overdue = schedule.filter(s => {
          const effectiveDate = s.rescheduledDate || s.dueDate;
          return s.status === VACCINE_STATUS.PENDING &&
                 effectiveDate < new Date().toISOString().split('T')[0];
        }).length;

        return {
          ...profile,
          stats: {
            total:        schedule.length,
            administered,
            pending,
            missed,
            rescheduled,
            overdue,
            complianceRate: schedule.length > 0
              ? Math.round((administered / schedule.length) * 100)
              : 0,
          },
        };
      })
    );

    // Overall summary
    const summary = {
      totalChildren:     profilesWithSchedule.length,
      fullyCompliant:    profilesWithSchedule.filter(
        p => p.stats.pending === 0 && p.stats.missed === 0
      ).length,
      withOverdue:       profilesWithSchedule.filter(
        p => p.stats.overdue > 0
      ).length,
      averageCompliance: profilesWithSchedule.length > 0
        ? Math.round(
            profilesWithSchedule.reduce(
              (sum, p) => sum + p.stats.complianceRate, 0
            ) / profilesWithSchedule.length
          )
        : 0,
    };

    return successResponse(res, {
      summary,
      profiles: profilesWithSchedule,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to generate vaccination report', 500);
  }
});

// ─── GET /fitness ─────────────────────────────────────────
// Annual fitness examination report
router.get('/fitness', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { cycleYear } = req.query;

    let query = db.collection('fitnessAppointments');

    const snapshot = await query.get();
    let appointments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (cycleYear) {
      appointments = appointments.filter(
        a => a.cycleYear === parseInt(cycleYear)
      );
    }

    // Get total validated employees for compliance calculation
    const empSnapshot = await db.collection('employees')
      .where('isValidated', '==', true).get();
    const totalEmployees = empSnapshot.size;

    const summary = {
      totalEmployees,
      scheduled:   appointments.filter(
        a => a.status === APPOINTMENT_STATUS.SCHEDULED
      ).length,
      rescheduled: appointments.filter(
        a => a.status === APPOINTMENT_STATUS.RESCHEDULED
      ).length,
      completed:   appointments.filter(
        a => a.status === APPOINTMENT_STATUS.COMPLETED
      ).length,
      missed:      appointments.filter(
        a => a.status === APPOINTMENT_STATUS.MISSED
      ).length,
      notScheduled: totalEmployees - appointments.length,
      byFitnessStatus: {
        fit:         appointments.filter(
          a => a.fitnessStatus === 'fit'
        ).length,
        unfit:       appointments.filter(
          a => a.fitnessStatus === 'unfit'
        ).length,
        conditional: appointments.filter(
          a => a.fitnessStatus === 'conditional'
        ).length,
      },
      complianceRate: totalEmployees > 0
        ? Math.round(
            (appointments.filter(
              a => a.status === APPOINTMENT_STATUS.COMPLETED
            ).length / totalEmployees) * 100
          )
        : 0,
    };

    return successResponse(res, { summary, appointments });
  } catch (error) {
    return errorResponse(res, 'Failed to generate fitness report', 500);
  }
});

// ─── GET /employees ───────────────────────────────────────
// Employee database report
router.get('/employees', verifyToken, verifyRole([
  ROLES.CMO, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { validated, department, bloodGroup } = req.query;

    let query = db.collection('employees');

    if (validated !== undefined) {
      query = query.where('isValidated', '==', validated === 'true');
    }

    const snapshot = await query.get();
    let employees = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (department) {
      employees = employees.filter(e => e.department === department);
    }
    if (bloodGroup) {
      employees = employees.filter(e => e.bloodGroup === bloodGroup);
    }

    // Get family member counts
    const employeesWithFamily = await Promise.all(
      employees.map(async (emp) => {
        const familySnapshot = await db.collection('employees')
          .doc(emp.id)
          .collection('familyMembers')
          .get();
        return {
          ...emp,
          familyMemberCount: familySnapshot.size,
        };
      })
    );

    const summary = {
      total:           employees.length,
      validated:       employees.filter(e => e.isValidated).length,
      pending:         employees.filter(e => !e.isValidated).length,
      bloodDonors:     employees.filter(e => e.bloodDonorConsent).length,
      byDepartment:    {},
      byBloodGroup:    {},
      byCommunity:     {},
    };

    employees.forEach(e => {
      if (e.department) {
        summary.byDepartment[e.department] =
          (summary.byDepartment[e.department] || 0) + 1;
      }
      if (e.bloodGroup) {
        summary.byBloodGroup[e.bloodGroup] =
          (summary.byBloodGroup[e.bloodGroup] || 0) + 1;
      }
      if (e.communityGroup) {
        summary.byCommunity[e.communityGroup] =
          (summary.byCommunity[e.communityGroup] || 0) + 1;
      }
    });

    return successResponse(res, {
      summary,
      employees: employeesWithFamily,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to generate employee report', 500);
  }
});

// ─── GET /feedback ────────────────────────────────────────
// Feedback summary report
router.get('/feedback', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { month, year } = req.query;

    const snapshot = await db.collection('feedback')
      .orderBy('submittedAt', 'desc').get();

    let feedbacks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (month && year) {
      feedbacks = feedbacks.filter(f => {
        const date = new Date(f.submittedAt);
        return date.getMonth() + 1 === parseInt(month) &&
               date.getFullYear() === parseInt(year);
      });
    }

    const calcAvg = (field) => {
      const values = feedbacks
        .map(f => f[field])
        .filter(v => v !== null && v !== undefined);
      if (values.length === 0) return null;
      return Math.round(
        (values.reduce((a, b) => a + b, 0) / values.length) * 10
      ) / 10;
    };

    const summary = {
      total:          feedbacks.length,
      anonymous:      feedbacks.filter(f => f.isAnonymous).length,
      withComments:   feedbacks.filter(
        f => f.comments && f.comments.trim()
      ).length,
      averageRatings: {
        staffBehaviour: calcAvg('staffBehaviourRating'),
        cleanliness:    calcAvg('cleanlinessRating'),
        services:       calcAvg('servicesRating'),
      },
      recentComments: feedbacks
        .filter(f => f.comments && f.comments.trim())
        .slice(0, 10)
        .map(f => ({
          comment:     f.comments,
          submittedAt: f.submittedAt,
          isAnonymous: f.isAnonymous,
        })),
    };

    return successResponse(res, { summary, feedbacks });
  } catch (error) {
    return errorResponse(res, 'Failed to generate feedback report', 500);
  }
});

module.exports = router;