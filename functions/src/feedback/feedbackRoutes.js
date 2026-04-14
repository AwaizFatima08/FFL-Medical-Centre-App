const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO } = require('../utils');
const { ROLES } = require('../constants');

// ─── VALID RATING RANGE ───────────────────────────────────
const isValidRating = (rating) =>
  Number.isInteger(rating) && rating >= 1 && rating <= 5;

// ─── POST /submit ─────────────────────────────────────────
// Employee submits feedback
router.post('/submit', verifyToken,
  verifyRole([ROLES.EMPLOYEE, ROLES.RECEPTION, ROLES.NURSE,
              ROLES.DOCTOR, ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const {
        isAnonymous,
        staffBehaviourRating,
        cleanlinessRating,
        servicesRating,
        comments,
      } = req.body;

      // Validate at least one rating or comment provided
      if (!staffBehaviourRating && !cleanlinessRating &&
          !servicesRating && !comments) {
        return errorResponse(res,
          'Please provide at least one rating or comment',
          400);
      }

      // Validate rating ranges
      if (staffBehaviourRating && !isValidRating(staffBehaviourRating)) {
        return errorResponse(res,
          'staffBehaviourRating must be between 1 and 5',
          400);
      }
      if (cleanlinessRating && !isValidRating(cleanlinessRating)) {
        return errorResponse(res,
          'cleanlinessRating must be between 1 and 5',
          400);
      }
      if (servicesRating && !isValidRating(servicesRating)) {
        return errorResponse(res,
          'servicesRating must be between 1 and 5',
          400);
      }

      // Get employee record for identity
      const empQuery = await db.collection('employees')
        .where('userId', '==', req.user.uid).get();

      const employeeId = empQuery.empty ? null : empQuery.docs[0].id;

      const feedbackRef = db.collection('feedback').doc();
      await feedbackRef.set({
        submittedBy:          isAnonymous ? null : employeeId,
        isAnonymous:          isAnonymous || false,
        staffBehaviourRating: staffBehaviourRating || null,
        cleanlinessRating:    cleanlinessRating    || null,
        servicesRating:       servicesRating       || null,
        comments:             comments             || null,
        submittedAt:          nowISO(),
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
// Doctor/CMO/Reception views all feedback
router.get('/all', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { fromDate, toDate, minRating } = req.query;

    const snapshot = await db.collection('feedback')
      .orderBy('submittedAt', 'desc')
      .get();

    let feedbacks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter by date range
    if (fromDate) {
      feedbacks = feedbacks.filter(f => f.submittedAt >= fromDate);
    }
    if (toDate) {
      feedbacks = feedbacks.filter(f => f.submittedAt <= toDate + 'T23:59:59');
    }

    // Filter by minimum average rating
    if (minRating) {
      const min = parseFloat(minRating);
      feedbacks = feedbacks.filter(f => {
        const ratings = [
          f.staffBehaviourRating,
          f.cleanlinessRating,
          f.servicesRating,
        ].filter(r => r !== null);
        if (ratings.length === 0) return false;
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        return avg >= min;
      });
    }

    return successResponse(res, feedbacks);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch feedback', 500);
  }
});

// ─── GET /summary ─────────────────────────────────────────
// CMO views aggregated ratings summary
router.get('/summary', verifyToken, verifyRole([
  ROLES.CMO, ROLES.DOCTOR,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { month, year } = req.query;

    const snapshot = await db.collection('feedback')
      .orderBy('submittedAt', 'desc')
      .get();

    let feedbacks = snapshot.docs.map(doc => doc.data());

    // Filter by month/year if provided
    if (month && year) {
      feedbacks = feedbacks.filter(f => {
        const date = new Date(f.submittedAt);
        return date.getMonth() + 1 === parseInt(month) &&
               date.getFullYear() === parseInt(year);
      });
    }

    // Calculate averages
    const calcAvg = (field) => {
      const values = feedbacks
        .map(f => f[field])
        .filter(v => v !== null && v !== undefined);
      if (values.length === 0) return null;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.round(avg * 10) / 10;
    };

    // Rating distribution
    const distribution = (field) => {
      const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      feedbacks.forEach(f => {
        if (f[field] >= 1 && f[field] <= 5) dist[f[field]]++;
      });
      return dist;
    };

    const totalFeedbacks    = feedbacks.length;
    const anonymousCount    = feedbacks.filter(f => f.isAnonymous).length;
    const withCommentsCount = feedbacks.filter(
      f => f.comments && f.comments.trim() !== ''
    ).length;

    const summary = {
      totalFeedbacks,
      anonymousCount,
      namedCount:         totalFeedbacks - anonymousCount,
      withCommentsCount,
      averageRatings: {
        staffBehaviour: calcAvg('staffBehaviourRating'),
        cleanliness:    calcAvg('cleanlinessRating'),
        services:       calcAvg('servicesRating'),
        overall:        (() => {
          const avgs = [
            calcAvg('staffBehaviourRating'),
            calcAvg('cleanlinessRating'),
            calcAvg('servicesRating'),
          ].filter(v => v !== null);
          if (avgs.length === 0) return null;
          const overall = avgs.reduce((a, b) => a + b, 0) / avgs.length;
          return Math.round(overall * 10) / 10;
        })(),
      },
      ratingDistribution: {
        staffBehaviour: distribution('staffBehaviourRating'),
        cleanliness:    distribution('cleanlinessRating'),
        services:       distribution('servicesRating'),
      },
    };

    return successResponse(res, summary);
  } catch (error) {
    return errorResponse(res, 'Failed to generate summary', 500);
  }
});

// ─── GET /:feedbackId ─────────────────────────────────────
router.get('/:feedbackId', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const doc = await db.collection('feedback')
      .doc(req.params.feedbackId).get();

    if (!doc.exists) {
      return errorResponse(res, 'Feedback not found', 404);
    }

    return successResponse(res, { id: doc.id, ...doc.data() });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch feedback', 500);
  }
});

// ─── DELETE /:feedbackId ──────────────────────────────────
// CMO can delete feedback
router.delete('/:feedbackId', verifyToken,
  verifyRole([ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const docRef = db.collection('feedback')
        .doc(req.params.feedbackId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return errorResponse(res, 'Feedback not found', 404);
      }

      await docRef.delete();

      return successResponse(res, null, 'Feedback deleted successfully');
    } catch (error) {
      return errorResponse(res, 'Failed to delete feedback', 500);
    }
  }
);

module.exports = router;