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
// Returns list of doctors for consulting doctor dropdown.
// Phase 9: also returns dentist/physiotherapist providers, appended after
// real doctors. Those two roles have no doctorAvailability doc by design
// (feedback-attribution only, no scheduling — see Command Board Phase 9
// entry), so they're looked up separately via their role on `users`,
// rather than through the doctorAvailability collection like real doctors.
router.get('/doctors', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();

    const availSnapshot = await db.collection('doctorAvailability').get();
    const doctorUserIds = availSnapshot.docs.map(doc => doc.id);

    const providerSnapshot = await db.collection('users')
      .where('role', 'in', ['dentist', 'physiotherapist'])
      .get();
    const providerUserIds = providerSnapshot.docs.map(doc => doc.id);

    const allUserIds = [...doctorUserIds, ...providerUserIds];
    if (allUserIds.length === 0) return successResponse(res, []);

    // Firestore 'in' queries cap at 10 values — chunk so this doesn't
    // silently drop names once doctors + providers together exceed 10.
    const nameMap = {};
    for (let i = 0; i < allUserIds.length; i += 10) {
      const chunk = allUserIds.slice(i, i + 10);
      const empSnapshot = await db.collection('employees')
        .where('userId', 'in', chunk).get();
      empSnapshot.docs.forEach(doc => {
        const data = doc.data();
        nameMap[data.userId] = data.fullName || 'Unknown';
      });
    }

    const doctors = [...doctorUserIds, ...providerUserIds].map(id => ({
      id,
      fullName: nameMap[id] || 'Unknown',
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
// CMO views all feedback. Phase 9 — admin access removed entirely;
// this was previously CMO + ADMIN_INCHARGE, locked down to CMO only for
// the same privacy reasoning as the rest of this module (protecting who
// said what about a teammate). isCMO below is now always true given the
// role check above, but left as-is rather than simplified away, since it
// costs nothing to leave and keeps this route's shape closer to /:feedbackId.
router.get('/all', verifyToken, verifyRole([
  ROLES.CMO,
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
// CMO views a single feedback entry. Phase 9 — admin access removed,
// same reasoning as GET /all above.
router.get('/:feedbackId', verifyToken, verifyRole([
  ROLES.CMO,
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

// ─── SUGGESTIONS (Phase 9) ──────────────────────────────────────────────
// Standalone from visit feedback — a general suggestion box, not tied to
// any specific visit. Reached via a toggle at the top of the Feedback
// submission form on the employee side; reviewed as a second tab on the
// CMO's Feedback list screen. Same access model as feedback itself: any
// employee can submit, only CMO can review or delete — kept consistent
// with the decision to lock all feedback review to CMO only, for the same
// privacy reason (protecting who said what about a teammate).

// ─── POST /suggestions/submit ───────────────────────────────
router.post('/suggestions/submit', verifyToken, verifyRole([ROLES.EMPLOYEE]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { suggestionText } = req.body;

      if (!suggestionText?.trim()) {
        return errorResponse(res, 'suggestionText is required', 400);
      }

      const empQuery = await db.collection('employees')
        .where('userId', '==', req.user.uid).get();
      const employeeId = empQuery.empty ? null : empQuery.docs[0].id;

      const ref = db.collection('suggestions').doc();
      await ref.set({
        suggestionText: suggestionText.trim(),
        submittedBy:    req.user.uid,
        employeeId,
        submittedAt:    nowISO(),
      });

      return successResponse(res,
        { suggestionId: ref.id },
        'Thank you for your suggestion!',
        201
      );
    } catch (error) {
      console.error('Submit suggestion error:', error);
      return errorResponse(res, 'Failed to submit suggestion', 500);
    }
  }
);

// ─── GET /suggestions/all ───────────────────────────────────
// CMO only — same reasoning as GET /all for feedback.
router.get('/suggestions/all', verifyToken, verifyRole([ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const snapshot = await db.collection('suggestions')
        .orderBy('submittedAt', 'desc').get();

      const submitterIds = [...new Set(
        snapshot.docs.map(doc => doc.data().submittedBy).filter(Boolean)
      )];
      let nameMap = {};
      if (submitterIds.length > 0) {
        const empSnapshot = await db.collection('employees')
          .where('userId', 'in', submitterIds).get();
        empSnapshot.docs.forEach(doc => {
          const data = doc.data();
          nameMap[data.userId] = data.fullName || 'Unknown';
        });
      }

      const suggestions = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id:              doc.id,
          suggestionText:  data.suggestionText,
          submittedAt:     data.submittedAt,
          submittedByName: nameMap[data.submittedBy] || 'Unknown',
        };
      });

      return successResponse(res, suggestions);
    } catch (error) {
      console.error('Fetch suggestions error:', error);
      return errorResponse(res, 'Failed to fetch suggestions', 500);
    }
  }
);

// ─── DELETE /suggestions/:id ─────────────────────────────────
router.delete('/suggestions/:id', verifyToken, verifyRole([ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const ref = db.collection('suggestions').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) return errorResponse(res, 'Suggestion not found', 404);

      await ref.delete();
      return successResponse(res, null, 'Suggestion deleted');
    } catch (error) {
      return errorResponse(res, 'Failed to delete suggestion', 500);
    }
  }
);

module.exports = router;