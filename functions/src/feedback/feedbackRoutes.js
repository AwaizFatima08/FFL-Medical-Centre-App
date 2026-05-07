// functions/src/feedback/feedbackRoutes.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO } = require('../utils');
const { ROLES } = require('../constants');

const isValidRating = (r) => Number.isInteger(r) && r >= 1 && r <= 5;

const VALID_SERVICES = [
  'consultation', 'pharmacy', 'laboratory',
  'xray', 'nursing', 'dental', 'physiotherapy',
];

// ─── GET /doctors ─────────────────────────────────────────
// Returns list of doctors for consulting doctor dropdown
router.get('/doctors', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();

    const availSnapshot = await db.collection('doctorAvailability').get();
    if (availSnapshot.empty) return successResponse(res, []);

    const userIds = availSnapshot.docs.map(doc => doc.id);

    const empSnapshot = await db.collection('employees')
      .where('userId', 'in', userIds).get();

    const nameMap = {};
    empSnapshot.docs.forEach(doc => {
      const data = doc.data();
      nameMap[data.userId] = data.fullName || 'Unknown';
    });

    const doctors = availSnapshot.docs.map(doc => ({
      id:       doc.id,
      fullName: nameMap[doc.id] || 'Unknown',
    }));

    return successResponse(res, doctors);
  } catch (error) {
    console.error('Fetch doctors error:', error);
    return errorResponse(res, 'Failed to fetch doctors', 500);
  }
});

// ─── POST /submit ─────────────────────────────────────────
// Employee submits feedback
router.post('/submit', verifyToken, verifyRole([ROLES.EMPLOYEE]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const {
        visitDate,
        visitTime,
        consultingDoctorId,
        patientName,
        patientRelation,
        servicesUsed,
        ratings,
        booleans,
        overallExperience,
        suggestion,
      } = req.body;

      // Validate required fields
      if (!visitDate) {
        return errorResponse(res, 'visitDate is required', 400);
      }
      if (!consultingDoctorId) {
        return errorResponse(res, 'consultingDoctorId is required', 400);
      }

      // Validate mandatory ratings
      if (!ratings?.staffBehaviour || !isValidRating(ratings.staffBehaviour)) {
        return errorResponse(res, 'Staff behaviour rating (1-5) is required', 400);
      }
      if (!ratings?.waitingTime || !isValidRating(ratings.waitingTime)) {
        return errorResponse(res, 'Waiting time rating (1-5) is required', 400);
      }
      if (!ratings?.housekeeping || !isValidRating(ratings.housekeeping)) {
        return errorResponse(res, 'Housekeeping rating (1-5) is required', 400);
      }

      // Validate servicesUsed
      const services = Array.isArray(servicesUsed) ? servicesUsed : [];
      const invalidServices = services.filter(s => !VALID_SERVICES.includes(s));
      if (invalidServices.length > 0) {
        return errorResponse(res,
          `Invalid services: ${invalidServices.join(', ')}`, 400);
      }

      // Validate service-specific ratings
      for (const service of services) {
        if (ratings[service] !== undefined && !isValidRating(ratings[service])) {
          return errorResponse(res,
            `${service} rating must be between 1 and 5`, 400);
        }
      }

      // Get employee record
      const empQuery = await db.collection('employees')
        .where('userId', '==', req.user.uid).get();
      const employeeId = empQuery.empty ? null : empQuery.docs[0].id;

      // Build clean ratings object — only include selected services
      const cleanRatings = {
        staffBehaviour: ratings.staffBehaviour,
        waitingTime:    ratings.waitingTime,
        housekeeping:   ratings.housekeeping,
      };
      services.forEach(service => {
        if (ratings[service]) cleanRatings[service] = ratings[service];
      });

      // Build clean booleans object — only include selected services
      const cleanBooleans = {};
      if (booleans && typeof booleans === 'object') {
        Object.keys(booleans).forEach(key => {
          if (typeof booleans[key] === 'boolean') {
            cleanBooleans[key] = booleans[key];
          }
        });
      }

      const feedbackRef = db.collection('feedback').doc();
      await feedbackRef.set({
        submittedBy:        req.user.uid,
        employeeId:         employeeId,
        submittedAt:        nowISO(),
        visitDate:          visitDate,
        visitTime:          visitTime || null,
        consultingDoctorId: consultingDoctorId,
        patientName:        patientName?.trim() || null,
        patientRelation:    patientRelation || null,
        servicesUsed:       services,
        ratings:            cleanRatings,
        booleans:           cleanBooleans,
        overallExperience:  overallExperience?.trim() || null,
        suggestion:         suggestion?.trim() || null,
      });

      return successResponse(res,
        { feedbackId: feedbackRef.id },
        'Feedback submitted successfully. Thank you.',
        201
      );
    } catch (error) {
      console.error('Submit feedback error:', error);
      return errorResponse(res, 'Failed to submit feedback', 500);
    }
  }
);

// ─── GET /all ─────────────────────────────────────────────
// CMO and admin view all feedback
// CMO sees submittedBy identity, admin does not
router.get('/all', verifyToken, verifyRole([
  ROLES.CMO, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const isCMO = req.userRole === ROLES.CMO;

    const snapshot = await db.collection('feedback')
      .orderBy('submittedAt', 'desc')
      .get();

    // Fetch doctor names for display
    const availSnapshot = await db.collection('doctorAvailability').get();
    const doctorUserIds = availSnapshot.docs.map(doc => doc.id);
    let doctorNameMap = {};
    if (doctorUserIds.length > 0) {
      const empSnapshot = await db.collection('employees')
        .where('userId', 'in', doctorUserIds).get();
      empSnapshot.docs.forEach(doc => {
        const data = doc.data();
        doctorNameMap[data.userId] = data.fullName || 'Unknown';
      });
    }

    // Fetch employee names for CMO only
    let employeeNameMap = {};
    if (isCMO && !snapshot.empty) {
      const submitterIds = [...new Set(
        snapshot.docs.map(doc => doc.data().submittedBy).filter(Boolean)
      )];
      if (submitterIds.length > 0) {
        const empSnapshot = await db.collection('employees')
          .where('userId', 'in', submitterIds).get();
        empSnapshot.docs.forEach(doc => {
          const data = doc.data();
          employeeNameMap[data.userId] = data.fullName || 'Unknown';
        });
      }
    }

    const feedbacks = snapshot.docs.map(doc => {
      const data = doc.data();
      const entry = {
        id:                 doc.id,
        submittedAt:        data.submittedAt,
        visitDate:          data.visitDate,
        visitTime:          data.visitTime,
        consultingDoctor:   doctorNameMap[data.consultingDoctorId] || 'Unknown',
        patientName:        data.patientName,
        patientRelation:    data.patientRelation,
        servicesUsed:       data.servicesUsed,
        ratings:            data.ratings,
        booleans:           data.booleans,
        overallExperience:  data.overallExperience,
        suggestion:         data.suggestion,
      };
      // Only CMO gets submitter identity
      if (isCMO) {
        entry.submittedByName = employeeNameMap[data.submittedBy] || 'Unknown';
      }
      return entry;
    });

    return successResponse(res, feedbacks);
  } catch (error) {
    console.error('Fetch feedback error:', error);
    return errorResponse(res, 'Failed to fetch feedback', 500);
  }
});

// ─── GET /:feedbackId ─────────────────────────────────────
// CMO and admin view single feedback entry
router.get('/:feedbackId', verifyToken, verifyRole([
  ROLES.CMO, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const isCMO = req.userRole === ROLES.CMO;

    const doc = await db.collection('feedback')
      .doc(req.params.feedbackId).get();

    if (!doc.exists) {
      return errorResponse(res, 'Feedback not found', 404);
    }

    const data = doc.data();

    // Fetch doctor name
    let doctorName = 'Unknown';
    if (data.consultingDoctorId) {
      const empQuery = await db.collection('employees')
        .where('userId', '==', data.consultingDoctorId).get();
      if (!empQuery.empty) doctorName = empQuery.docs[0].data().fullName;
    }

    // Fetch submitter name for CMO only
    let submittedByName = null;
    if (isCMO && data.submittedBy) {
      const empQuery = await db.collection('employees')
        .where('userId', '==', data.submittedBy).get();
      if (!empQuery.empty) submittedByName = empQuery.docs[0].data().fullName;
    }

    const entry = {
      id:               doc.id,
      submittedAt:      data.submittedAt,
      visitDate:        data.visitDate,
      visitTime:        data.visitTime,
      consultingDoctor: doctorName,
      patientName:      data.patientName,
      patientRelation:  data.patientRelation,
      servicesUsed:     data.servicesUsed,
      ratings:          data.ratings,
      booleans:         data.booleans,
      overallExperience: data.overallExperience,
      suggestion:       data.suggestion,
    };
    if (isCMO) entry.submittedByName = submittedByName;

    return successResponse(res, entry);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch feedback', 500);
  }
});

// ─── DELETE /:feedbackId ──────────────────────────────────
// CMO can delete feedback
router.delete('/:feedbackId', verifyToken, verifyRole([ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const docRef = db.collection('feedback').doc(req.params.feedbackId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return errorResponse(res, 'Feedback not found', 404);
      }

      await docRef.delete();
      return successResponse(res, null, 'Feedback deleted');
    } catch (error) {
      return errorResponse(res, 'Failed to delete feedback', 500);
    }
  }
);

module.exports = router;