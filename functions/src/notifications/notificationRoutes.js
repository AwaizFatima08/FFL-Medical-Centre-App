const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO } = require('../utils');
const {
  ROLES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TARGET_TYPES,
  COMMUNITY_GROUPS,
} = require('../constants');

// ─── ROLE TO ALLOWED CATEGORIES MAP ──────────────────────
const ROLE_ALLOWED_CATEGORIES = {
  [ROLES.DOCTOR]:            Object.values(NOTIFICATION_CATEGORIES),
  [ROLES.CMO]:               Object.values(NOTIFICATION_CATEGORIES),
  [ROLES.NURSE]:             Object.values(NOTIFICATION_CATEGORIES),
  [ROLES.RECEPTION]:         Object.values(NOTIFICATION_CATEGORIES),
  [ROLES.LAB_TECHNOLOGIST]:  [NOTIFICATION_CATEGORIES.LAB_REPORT],
  [ROLES.PHARMACY_INCHARGE]: [NOTIFICATION_CATEGORIES.PHARMACY],
  [ROLES.ADMIN_INCHARGE]:    [NOTIFICATION_CATEGORIES.CLAIM_HOLD,
                               NOTIFICATION_CATEGORIES.FITNESS_APPOINTMENT,
                               NOTIFICATION_CATEGORIES.GENERAL],
};

// ─── PREDEFINED TEMPLATES ────────────────────────────────
const QUICK_TEMPLATES = {
  [NOTIFICATION_CATEGORIES.LAB_REPORT]: {
    title: 'Lab Report Ready',
    body:  'Your lab report is ready for collection at the Medical Centre laboratory.',
  },
  [NOTIFICATION_CATEGORIES.PHARMACY]: {
    title: 'Medicine Ready',
    body:  'Your medicine is ready for collection at the Medical Centre pharmacy.',
  },
  [NOTIFICATION_CATEGORIES.CLAIM_HOLD]: {
    title: 'Medical Claim On Hold',
    body:  'Your medical claim is on hold due to a query. Please visit the Medical Centre office in person to resolve.',
  },
};

// ─── POST /send ───────────────────────────────────────────
// Send a notification — full compose for authorized roles
router.post('/send', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO, ROLES.NURSE, ROLES.RECEPTION,
  ROLES.LAB_TECHNOLOGIST, ROLES.PHARMACY_INCHARGE, ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      title,
      body,
      category,
      targetType,
      targetEmployeeId,
      targetGroup,
      attachmentUrl,
    } = req.body;

    // Validate category
    if (!category ||
        !Object.values(NOTIFICATION_CATEGORIES).includes(category)) {
      return errorResponse(res,
        `Invalid category. Valid values: ${Object.values(NOTIFICATION_CATEGORIES).join(', ')}`,
        400);
    }

    // Check role is allowed to send this category
    const allowedCategories = ROLE_ALLOWED_CATEGORIES[req.userRole] || [];
    if (!allowedCategories.includes(category)) {
      return errorResponse(res,
        'You are not authorized to send this category of notification',
        403);
    }

    // Validate target
    if (!targetType ||
        !Object.values(NOTIFICATION_TARGET_TYPES).includes(targetType)) {
      return errorResponse(res,
        `Invalid targetType. Valid values: ${Object.values(NOTIFICATION_TARGET_TYPES).join(', ')}`,
        400);
    }

    // Limited roles can only send to individuals
    const limitedRoles = [
      ROLES.LAB_TECHNOLOGIST,
      ROLES.PHARMACY_INCHARGE,
      ROLES.ADMIN_INCHARGE,
    ];
    if (limitedRoles.includes(req.userRole) &&
        targetType !== NOTIFICATION_TARGET_TYPES.INDIVIDUAL) {
      return errorResponse(res,
        'Your role can only send notifications to individual employees',
        403);
    }

    if (targetType === NOTIFICATION_TARGET_TYPES.INDIVIDUAL &&
        !targetEmployeeId) {
      return errorResponse(res,
        'targetEmployeeId is required for individual notifications',
        400);
    }

    if (targetType === NOTIFICATION_TARGET_TYPES.GROUP && !targetGroup) {
      return errorResponse(res,
        'targetGroup is required for group notifications',
        400);
    }

    // Use template if quick-push category
    const isQuickPush = Object.keys(QUICK_TEMPLATES).includes(category);
    const finalTitle  = isQuickPush ? QUICK_TEMPLATES[category].title : title;
    const finalBody   = isQuickPush ? QUICK_TEMPLATES[category].body  : body;

    if (!finalTitle || !finalBody) {
      return errorResponse(res, 'title and body are required', 400);
    }

    const notificationRef = db.collection('notifications').doc();
    await notificationRef.set({
      title:            finalTitle,
      body:             finalBody,
      category,
      targetType,
      targetEmployeeId: targetEmployeeId || null,
      targetGroup:      targetGroup      || null,
      attachmentUrl:    attachmentUrl    || null,
      sentBy:           req.user.uid,
      sentByRole:       req.userRole,
      sentAt:           nowISO(),
      whatsappDeferred: true,
    });

    // Create receipt records for targeted employees
    await createReceipts(db, notificationRef.id, targetType,
      targetEmployeeId, targetGroup);

    return successResponse(res,
      { notificationId: notificationRef.id },
      'Notification sent successfully',
      201
    );
  } catch (error) {
    console.error('Send notification error:', error);
    return errorResponse(res, 'Failed to send notification', 500);
  }
});

// ─── HELPER — CREATE RECEIPT RECORDS ─────────────────────
const createReceipts = async (
  db, notificationId, targetType, targetEmployeeId, targetGroup
) => {
  try {
    const notificationRef = db.collection('notifications').doc(notificationId);
    const batch = db.batch();

    if (targetType === NOTIFICATION_TARGET_TYPES.INDIVIDUAL) {
      const receiptRef = notificationRef
        .collection('receipts')
        .doc(targetEmployeeId);
      batch.set(receiptRef, {
        receivedAt: nowISO(),
        readAt:     null,
      });

    } else if (targetType === NOTIFICATION_TARGET_TYPES.GROUP) {
      const empSnapshot = await db.collection('employees')
        .where('communityGroup', '==', targetGroup)
        .where('isValidated', '==', true)
        .get();

      for (const empDoc of empSnapshot.docs) {
        const receiptRef = notificationRef
          .collection('receipts')
          .doc(empDoc.id);
        batch.set(receiptRef, {
          receivedAt: nowISO(),
          readAt:     null,
        });
      }

    } else if (targetType === NOTIFICATION_TARGET_TYPES.ALL) {
      const empSnapshot = await db.collection('employees')
        .where('isValidated', '==', true)
        .get();

      for (const empDoc of empSnapshot.docs) {
        const receiptRef = notificationRef
          .collection('receipts')
          .doc(empDoc.id);
        batch.set(receiptRef, {
          receivedAt: nowISO(),
          readAt:     null,
        });
      }
    }

    await batch.commit();
  } catch (error) {
    console.error('Create receipts error:', error);
  }
};

// ─── GET /my-notifications ────────────────────────────────
// Employee views own notifications
router.get('/my-notifications', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();

    // Get employee record
    const empQuery = await db.collection('employees')
      .where('userId', '==', req.user.uid)
      .get();

    if (empQuery.empty) {
      return errorResponse(res, 'Employee record not found', 404);
    }

    const employeeId = empQuery.docs[0].id;

    // Get all notifications — all, individual to me, or my group
    const empData = empQuery.docs[0].data();

    const allNotifications = await db.collection('notifications')
      .orderBy('sentAt', 'desc')
      .get();

    const myNotifications = allNotifications.docs.filter(doc => {
      const n = doc.data();
      return (
        n.targetType === NOTIFICATION_TARGET_TYPES.ALL ||
        (n.targetType === NOTIFICATION_TARGET_TYPES.INDIVIDUAL &&
          n.targetEmployeeId === employeeId) ||
        (n.targetType === NOTIFICATION_TARGET_TYPES.GROUP &&
          n.targetGroup === empData.communityGroup)
      );
    });

    const result = myNotifications.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return successResponse(res, result);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch notifications', 500);
  }
});

// ─── POST /my-notifications/:notificationId/read ──────────
// Employee marks notification as read
router.post('/my-notifications/:notificationId/read',
  verifyToken, async (req, res) => {
    try {
      const db = admin.firestore();

      const empQuery = await db.collection('employees')
        .where('userId', '==', req.user.uid).get();

      if (empQuery.empty) {
        return errorResponse(res, 'Employee record not found', 404);
      }

      const employeeId = empQuery.docs[0].id;
      const receiptRef = db.collection('notifications')
        .doc(req.params.notificationId)
        .collection('receipts')
        .doc(employeeId);

      await receiptRef.set({
        receivedAt: nowISO(),
        readAt:     nowISO(),
      }, { merge: true });

      return successResponse(res, null, 'Marked as read');
    } catch (error) {
      return errorResponse(res, 'Failed to mark as read', 500);
    }
  }
);

// ─── GET /all ─────────────────────────────────────────────
// Medical staff views all sent notifications
router.get('/all', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO, ROLES.NURSE, ROLES.RECEPTION,
  ROLES.ADMIN_INCHARGE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { category, targetType } = req.query;

    let query = db.collection('notifications').orderBy('sentAt', 'desc');

    const snapshot = await query.get();
    let notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (category) {
      notifications = notifications.filter(n => n.category === category);
    }
    if (targetType) {
      notifications = notifications.filter(n => n.targetType === targetType);
    }

    return successResponse(res, notifications);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch notifications', 500);
  }
});

// ─── GET /:notificationId ─────────────────────────────────
router.get('/:notificationId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const doc = await db.collection('notifications')
      .doc(req.params.notificationId).get();

    if (!doc.exists) {
      return errorResponse(res, 'Notification not found', 404);
    }

    return successResponse(res, { id: doc.id, ...doc.data() });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch notification', 500);
  }
});

module.exports = router;