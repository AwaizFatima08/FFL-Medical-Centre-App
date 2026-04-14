const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO, addDays, formatDate } = require('../utils');
const { ROLES, VACCINE_STATUS } = require('../constants');

// ─── EPI VACCINATION SCHEDULE (Pakistan) ─────────────────
// Days from birth when vaccine is due
const EPI_SCHEDULE = [
  { name: 'BCG',                    daysFromBirth: 0   },
  { name: 'Polio (OPV-0)',          daysFromBirth: 0   },
  { name: 'Hepatitis B (Birth)',    daysFromBirth: 0   },
  { name: 'DPT-HepB-Hib (Penta-1)',daysFromBirth: 42  }, // 6 weeks
  { name: 'Polio (OPV-1)',          daysFromBirth: 42  },
  { name: 'Pneumococcal (PCV-1)',   daysFromBirth: 42  },
  { name: 'Rotavirus (RV-1)',       daysFromBirth: 42  },
  { name: 'DPT-HepB-Hib (Penta-2)',daysFromBirth: 70  }, // 10 weeks
  { name: 'Polio (OPV-2)',          daysFromBirth: 70  },
  { name: 'Pneumococcal (PCV-2)',   daysFromBirth: 70  },
  { name: 'Rotavirus (RV-2)',       daysFromBirth: 70  },
  { name: 'DPT-HepB-Hib (Penta-3)',daysFromBirth: 98  }, // 14 weeks
  { name: 'Polio (OPV-3)',          daysFromBirth: 98  },
  { name: 'Pneumococcal (PCV-3)',   daysFromBirth: 98  },
  { name: 'IPV',                    daysFromBirth: 98  },
  { name: 'Measles (MR-1)',         daysFromBirth: 274 }, // 9 months
  { name: 'Measles (MR-2)',         daysFromBirth: 456 }, // 15 months
  { name: 'Typhoid (TCV)',          daysFromBirth: 456 }, // 15 months
  { name: 'Meningococcal (MenA)',   daysFromBirth: 456 }, // 15 months
  { name: 'Booster DPT',           daysFromBirth: 548 }, // 18 months
  { name: 'Booster OPV',           daysFromBirth: 548 }, // 18 months
];

// ─── POST /profile ────────────────────────────────────────
// Nurse/Reception creates child vaccination profile
// Auto-generates EPI schedule from DOB
router.post('/profile', verifyToken, verifyRole([
  ROLES.NURSE, ROLES.RECEPTION, ROLES.CMO,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      employeeId,
      familyMemberId,
      childName,
      dateOfBirth,
      gender,
    } = req.body;

    if (!employeeId || !childName || !dateOfBirth) {
      return errorResponse(res,
        'employeeId, childName and dateOfBirth are required',
        400);
    }

    // Verify employee exists
    const empDoc = await db.collection('employees').doc(employeeId).get();
    if (!empDoc.exists) {
      return errorResponse(res, 'Employee not found', 404);
    }

    // Check profile not already created for this child
    if (familyMemberId) {
      const existing = await db.collection('vaccinationProfiles')
        .where('familyMemberId', '==', familyMemberId)
        .get();
      if (!existing.empty) {
        return errorResponse(res,
          'Vaccination profile already exists for this child',
          409);
      }
    }

    const dob = new Date(dateOfBirth);
    const profileRef = db.collection('vaccinationProfiles').doc();
    const batch = db.batch();

    // Create profile document
    batch.set(profileRef, {
      employeeId,
      familyMemberId:  familyMemberId || null,
      childName,
      dateOfBirth,
      gender:          gender || null,
      createdBy:       req.user.uid,
      createdAt:       nowISO(),
    });

    // Auto-generate EPI schedule
    for (const vaccine of EPI_SCHEDULE) {
      const dueDate = formatDate(addDays(dob, vaccine.daysFromBirth));
      const itemRef = profileRef.collection('scheduleItems').doc();
      batch.set(itemRef, {
        vaccineName:              vaccine.name,
        dueDate,
        status:                   VACCINE_STATUS.PENDING,
        administeredBy:           null,
        administeredAt:           null,
        rescheduleRequestedBy:    null,
        rescheduledDate:          null,
        notes:                    null,
        createdAt:                nowISO(),
      });
    }

    await batch.commit();

    return successResponse(res,
      { profileId: profileRef.id },
      'Vaccination profile created with EPI schedule',
      201
    );
  } catch (error) {
    console.error('Create vaccination profile error:', error);
    return errorResponse(res, 'Failed to create vaccination profile', 500);
  }
});

// ─── GET /employee/:employeeId ────────────────────────────
// Get all vaccination profiles for an employee's children
router.get('/employee/:employeeId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();

    // Employee can only view own children
    if (req.userRole === ROLES.EMPLOYEE) {
      const empDoc = await db.collection('employees')
        .doc(req.params.employeeId).get();
      if (!empDoc.exists || empDoc.data().userId !== req.user.uid) {
        return errorResponse(res, 'Forbidden', 403);
      }
    }

    const snapshot = await db.collection('vaccinationProfiles')
      .where('employeeId', '==', req.params.employeeId)
      .get();

    const profiles = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return successResponse(res, profiles);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch profiles', 500);
  }
});

// ─── GET /:profileId/schedule ─────────────────────────────
// Get full vaccination schedule for a child
router.get('/:profileId/schedule', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const profileDoc = await db.collection('vaccinationProfiles')
      .doc(req.params.profileId).get();

    if (!profileDoc.exists) {
      return errorResponse(res, 'Profile not found', 404);
    }

    // Employee can only view own child schedule
    if (req.userRole === ROLES.EMPLOYEE) {
      const empQuery = await db.collection('employees')
        .where('userId', '==', req.user.uid).get();
      if (empQuery.empty ||
          empQuery.docs[0].id !== profileDoc.data().employeeId) {
        return errorResponse(res, 'Forbidden', 403);
      }
    }

    const scheduleSnapshot = await db.collection('vaccinationProfiles')
      .doc(req.params.profileId)
      .collection('scheduleItems')
      .orderBy('dueDate', 'asc')
      .get();

    const schedule = scheduleSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return successResponse(res, {
      profile:  { id: profileDoc.id, ...profileDoc.data() },
      schedule,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch schedule', 500);
  }
});

// ─── POST /:profileId/schedule/:itemId/administer ─────────
// Nurse marks vaccine as administered
router.post('/:profileId/schedule/:itemId/administer',
  verifyToken,
  verifyRole([ROLES.NURSE, ROLES.DOCTOR, ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { notes } = req.body;

      const itemRef = db.collection('vaccinationProfiles')
        .doc(req.params.profileId)
        .collection('scheduleItems')
        .doc(req.params.itemId);

      const itemDoc = await itemRef.get();
      if (!itemDoc.exists) {
        return errorResponse(res, 'Schedule item not found', 404);
      }

      if (itemDoc.data().status === VACCINE_STATUS.ADMINISTERED) {
        return errorResponse(res, 'Vaccine already administered', 409);
      }

      await itemRef.update({
        status:         VACCINE_STATUS.ADMINISTERED,
        administeredBy: req.user.uid,
        administeredAt: nowISO(),
        notes:          notes || null,
      });

      return successResponse(res, null, 'Vaccine marked as administered');
    } catch (error) {
      return errorResponse(res, 'Failed to update vaccine status', 500);
    }
  }
);

// ─── POST /:profileId/schedule/:itemId/reschedule-request ─
// Employee requests rescheduling of a vaccine
router.post('/:profileId/schedule/:itemId/reschedule-request',
  verifyToken,
  verifyRole([ROLES.EMPLOYEE]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { reason } = req.body;

      const profileDoc = await db.collection('vaccinationProfiles')
        .doc(req.params.profileId).get();

      if (!profileDoc.exists) {
        return errorResponse(res, 'Profile not found', 404);
      }

      // Verify this is employee's own child
      const empQuery = await db.collection('employees')
        .where('userId', '==', req.user.uid).get();
      if (empQuery.empty ||
          empQuery.docs[0].id !== profileDoc.data().employeeId) {
        return errorResponse(res, 'Forbidden', 403);
      }

      const itemRef = db.collection('vaccinationProfiles')
        .doc(req.params.profileId)
        .collection('scheduleItems')
        .doc(req.params.itemId);

      const itemDoc = await itemRef.get();
      if (!itemDoc.exists) {
        return errorResponse(res, 'Schedule item not found', 404);
      }

      if (itemDoc.data().status === VACCINE_STATUS.ADMINISTERED) {
        return errorResponse(res,
          'Cannot reschedule an already administered vaccine',
          409);
      }

      await itemRef.update({
        rescheduleRequestedBy: req.user.uid,
        rescheduleReason:      reason || null,
        rescheduleRequestedAt: nowISO(),
        status:                VACCINE_STATUS.RESCHEDULED,
      });

      return successResponse(res, null,
        'Reschedule request submitted. Nurse will assign new date.');
    } catch (error) {
      return errorResponse(res, 'Reschedule request failed', 500);
    }
  }
);

// ─── POST /:profileId/schedule/:itemId/set-reschedule-date
// Nurse sets new date after reschedule request
router.post('/:profileId/schedule/:itemId/set-reschedule-date',
  verifyToken,
  verifyRole([ROLES.NURSE, ROLES.DOCTOR, ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { rescheduledDate } = req.body;

      if (!rescheduledDate) {
        return errorResponse(res, 'rescheduledDate is required', 400);
      }

      const itemRef = db.collection('vaccinationProfiles')
        .doc(req.params.profileId)
        .collection('scheduleItems')
        .doc(req.params.itemId);

      const itemDoc = await itemRef.get();
      if (!itemDoc.exists) {
        return errorResponse(res, 'Schedule item not found', 404);
      }

      await itemRef.update({
        rescheduledDate,
        rescheduledBy:  req.user.uid,
        rescheduledAt:  nowISO(),
        status:         VACCINE_STATUS.RESCHEDULED,
      });

      return successResponse(res, null, 'Reschedule date set successfully');
    } catch (error) {
      return errorResponse(res, 'Failed to set reschedule date', 500);
    }
  }
);

// ─── POST /:profileId/schedule/add ───────────────────────
// Nurse/Doctor adds a custom vaccine outside EPI schedule
router.post('/:profileId/schedule/add',
  verifyToken,
  verifyRole([ROLES.NURSE, ROLES.DOCTOR, ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { vaccineName, dueDate, notes } = req.body;

      if (!vaccineName || !dueDate) {
        return errorResponse(res,
          'vaccineName and dueDate are required',
          400);
      }

      const profileDoc = await db.collection('vaccinationProfiles')
        .doc(req.params.profileId).get();

      if (!profileDoc.exists) {
        return errorResponse(res, 'Profile not found', 404);
      }

      const itemRef = db.collection('vaccinationProfiles')
        .doc(req.params.profileId)
        .collection('scheduleItems')
        .doc();

      await itemRef.set({
        vaccineName,
        dueDate,
        status:                VACCINE_STATUS.PENDING,
        isCustom:              true,
        administeredBy:        null,
        administeredAt:        null,
        rescheduleRequestedBy: null,
        rescheduledDate:       null,
        notes:                 notes || null,
        addedBy:               req.user.uid,
        createdAt:             nowISO(),
      });

      return successResponse(res,
        { itemId: itemRef.id },
        'Vaccine added to schedule',
        201
      );
    } catch (error) {
      return errorResponse(res, 'Failed to add vaccine', 500);
    }
  }
);

module.exports = router;