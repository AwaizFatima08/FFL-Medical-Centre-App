// functions/src/availability/availabilityRoutes.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO, getPakistanToday } = require('../utils');
const { ROLES, AVAILABILITY_STATUS } = require('../constants');
// ─── GET /all ─────────────────────────────────────────────
// Everyone can view all doctors' availability
router.get('/all', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    // Fetch all availability documents
    const availSnapshot = await db.collection('doctorAvailability').get();
    if (availSnapshot.empty) {
      return successResponse(res, []);
    }
    // Collect all userIds to fetch names from employees collection
    const userIds = availSnapshot.docs.map(doc => doc.id);
    // Fetch employee records for these userIds
    const empSnapshot = await db.collection('employees')
      .where('userId', 'in', userIds)
      .get();
    // Build a map: userId -> fullName
    const nameMap = {};
    empSnapshot.docs.forEach(doc => {
      const data = doc.data();
      nameMap[data.userId] = data.fullName || 'Unknown';
    });
    // Phase 6 — leave scheduling. today's date (PKT) is checked against
    // each doc's scheduledLeave window, if one exists, to decide whether
    // the displayed status should be overridden to "on_leave". This is
    // computed fresh on every request — nothing is auto-written back to
    // currentStatus, so no background job is needed to "start" or "end"
    // a scheduled leave. Before the window starts or after it ends, the
    // doctor's manually-set currentStatus is shown, unchanged.
    const today = getPakistanToday();
    const doctors = availSnapshot.docs.map(doc => {
      const data = doc.data();
      const leave = data.scheduledLeave || null;
      const onScheduledLeave = !!leave &&
        today >= leave.startDate && today <= leave.endDate;
      return {
        id:             doc.id,
        fullName:       nameMap[doc.id] || 'Unknown',
        status:         onScheduledLeave ? AVAILABILITY_STATUS.ON_LEAVE : data.currentStatus,
        // Phase 6 (follow-up) — tentative return time for Not Available.
        // Force null whenever the displayed status isn't actually
        // not_available (including when a scheduled leave is overriding
        // the display) so a stale time can never show next to a
        // different status badge.
        expectedBackAt: (!onScheduledLeave && data.currentStatus === AVAILABILITY_STATUS.NOT_AVAILABLE)
          ? (data.expectedBackAt || null)
          : null,
        updatedAt:      data.updatedAt,
        scheduledLeave: leave,
      };
    });
    return successResponse(res, doctors);
  } catch (error) {
    console.error('Fetch all availability error:', error);
    return errorResponse(res, 'Failed to fetch availability', 500);
  }
});
// ─── POST /:doctorUserId/update ───────────────────────────
// Only reception and admin_incharge can toggle status
router.post('/:doctorUserId/update', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { status, expectedBackAt } = req.body;
    const validStatuses = [
      AVAILABILITY_STATUS.AVAILABLE,
      AVAILABILITY_STATUS.NOT_AVAILABLE,
      AVAILABILITY_STATUS.ON_LEAVE,
    ];
    if (!status || !validStatuses.includes(status)) {
      return errorResponse(res,
        'status must be available, not_available or on_leave', 400);
    }

    // Phase 6 (follow-up) — expectedBackAt (tentative return time, plain
    // "HH:mm" 24-hour string, always meaning "today") only makes sense
    // for not_available. It's forced to null for any other status so a
    // stale time can never linger once a doctor becomes Available or
    // On Leave. It's genuinely optional even for not_available — reception
    // can confirm with no time given.
    let normalizedExpectedBackAt = null;
    if (status === AVAILABILITY_STATUS.NOT_AVAILABLE &&
        expectedBackAt !== undefined && expectedBackAt !== null) {
      const timeFormat = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!timeFormat.test(expectedBackAt)) {
        return errorResponse(res,
          'expectedBackAt must be in HH:mm 24-hour format', 400);
      }
      normalizedExpectedBackAt = expectedBackAt;
    }

    const docRef = db.collection('doctorAvailability')
      .doc(req.params.doctorUserId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return errorResponse(res,
        'Doctor availability record not found', 404);
    }
    // Write status log entry
    await docRef.collection('statusLog').add({
      status,
      expectedBackAt: normalizedExpectedBackAt,
      updatedBy:   req.user.uid,
      updatedAt:   nowISO(),
    });
    // Update main document
    await docRef.update({
      currentStatus:  status,
      expectedBackAt: normalizedExpectedBackAt,
      updatedBy:      req.user.uid,
      updatedAt:      nowISO(),
    });
    return successResponse(res, null, 'Status updated successfully');
  } catch (error) {
    console.error('Update availability error:', error);
    return errorResponse(res, 'Failed to update status', 500);
  }
});
// ─── POST /:doctorUserId/schedule-leave ───────────────────
// Phase 6 — pre-schedule a future leave window. Only reception and
// admin_incharge can set it, same permission as the manual toggle above.
// Doesn't touch currentStatus at all — GET /all decides live, each time
// it's called, whether today falls inside this window. Setting a new
// window here always replaces any existing one on this doc (no merging
// of multiple leave periods) — kept simple since one leave at a time is
// the real-world case.
router.post('/:doctorUserId/schedule-leave', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { startDate, endDate } = req.body;

    const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate || !endDate || !dateFormat.test(startDate) || !dateFormat.test(endDate)) {
      return errorResponse(res,
        'startDate and endDate are required in YYYY-MM-DD format', 400);
    }
    if (startDate > endDate) {
      return errorResponse(res,
        'startDate must be on or before endDate', 400);
    }

    const docRef = db.collection('doctorAvailability')
      .doc(req.params.doctorUserId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return errorResponse(res,
        'Doctor availability record not found', 404);
    }

    await docRef.update({
      scheduledLeave: {
        startDate,
        endDate,
        setBy: req.user.uid,
        setAt: nowISO(),
      },
    });

    return successResponse(res, null, 'Leave scheduled successfully');
  } catch (error) {
    console.error('Schedule leave error:', error);
    return errorResponse(res, 'Failed to schedule leave', 500);
  }
});
// ─── POST /:doctorUserId/cancel-leave ──────────────────────
// Phase 6 — clears a scheduled leave window, whether it's still upcoming
// or already active. Once cleared, GET /all immediately falls back to
// showing this doc's currentStatus again, same as if no leave had ever
// been scheduled.
router.post('/:doctorUserId/cancel-leave', verifyToken, verifyRole([
  ROLES.RECEPTION, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const docRef = db.collection('doctorAvailability')
      .doc(req.params.doctorUserId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return errorResponse(res,
        'Doctor availability record not found', 404);
    }

    await docRef.update({
      scheduledLeave: admin.firestore.FieldValue.delete(),
    });

    return successResponse(res, null, 'Scheduled leave cancelled');
  } catch (error) {
    console.error('Cancel leave error:', error);
    return errorResponse(res, 'Failed to cancel scheduled leave', 500);
  }
});
module.exports = router;