// functions/src/notifications/notificationRoutes.js

const express = require('express');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { ROLES } = require('../constants');

const router = express.Router();

// ─── HELPER: get db instance ─────────────────────────────────────────────────
// Called inside functions only — never at module load time
// This avoids "app/no-app" error during Firebase CLI static analysis
function db() {
  return getFirestore();
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = await getAuth().verifyIdToken(token);
    const userDoc = await db().collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) return res.status(401).json({ success: false, message: 'User not found' });

    const userData = userDoc.data();
    if (!userData.isActive) return res.status(403).json({ success: false, message: 'Account not active' });

    req.user = { uid: decoded.uid, role: userData.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ─── HELPER: Write a notification document ───────────────────────────────────
// Called internally by other route files to create notifications.
async function createNotification({ recipientUid, recipientRole, title, body, type, referenceId = null }) {
  await db().collection('notifications').add({
    recipientUid,
    recipientRole: recipientRole || null,
    title,
    body,
    type,
    referenceId,
    isRead:    false,
    createdAt: new Date().toISOString(),
  });
}

// Export helper so other route files can use it
router.createNotification = createNotification;

// ─── GET /my ──────────────────────────────────────────────────────────────────
router.get('/my', authenticate, async (req, res) => {
  try {
    const snapshot = await db().collection('notifications')
      .where('recipientUid', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// ─── POST /:id/read ───────────────────────────────────────────────────────────
router.post('/:id/read', authenticate, async (req, res) => {
  try {
    const notifRef = db().collection('notifications').doc(req.params.id);
    const notifDoc = await notifRef.get();

    if (!notifDoc.exists) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    if (notifDoc.data().recipientUid !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await notifRef.update({ isRead: true, readAt: new Date().toISOString() });
    return res.json({ success: true, message: 'Marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

// ─── POST /read-all ───────────────────────────────────────────────────────────
router.post('/read-all', authenticate, async (req, res) => {
  try {
    const snapshot = await db().collection('notifications')
      .where('recipientUid', '==', req.user.uid)
      .where('isRead', '==', false)
      .get();

    if (snapshot.empty) {
      return res.json({ success: true, message: 'No unread notifications' });
    }

    const batch = db().batch();
    const now = new Date().toISOString();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { isRead: true, readAt: now });
    });
    await batch.commit();

    return res.json({ success: true, message: `Marked ${snapshot.size} notifications as read` });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
});

// ─── GET /log ─────────────────────────────────────────────────────────────────
router.get('/log', authenticate, async (req, res) => {
  try {
    const allowedRoles = [ROLES.ADMIN_INCHARGE, ROLES.CMO];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { type, limit = 100 } = req.query;
    const snapshot = await db().collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();

    let notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (type) notifications = notifications.filter(n => n.type === type);

    return res.json({ success: true, data: notifications });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch notification log' });
  }
});

module.exports = router;