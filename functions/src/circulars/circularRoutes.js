// functions/src/circulars/circularRoutes.js
// Flow 3 — Health Awareness Circulars & Administrative Notices
// File upload handled by client directly to Firebase Storage
// This backend only saves/retrieves metadata in Firestore

const express = require('express');
const admin   = require('firebase-admin');

const router = express.Router();

const UPLOAD_ROLES = ['admin_incharge', 'cmo'];
const CATEGORIES   = ['medical', 'administrative'];

const db = () => admin.firestore();

async function getUserRole(uid) {
  const doc = await db().collection('users').doc(uid).get();
  if (!doc.exists) throw new Error('User not found');
  return doc.data().role;
}

// ── GET /list — fetch all circulars, optionally filtered by category ──────────
router.get('/list', async (req, res) => {
  try {
    await getUserRole(req.user.uid);

    const { category } = req.query;
    let query = db().collection('circulars').orderBy('createdAt', 'desc');
    if (category && CATEGORIES.includes(category)) {
      query = db().collection('circulars')
        .where('category', '==', category)
        .orderBy('createdAt', 'desc');
    }

    const snapshot = await query.get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data });

  } catch (error) {
    console.error('Circulars list error:', error);
    res.status(500).json({ success: false, message: 'Failed to load circulars', error: error.message });
  }
});

// ── POST /save — save circular metadata after client uploads file to Storage ──
router.post('/save', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    if (!UPLOAD_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Only admin and CMO can upload circulars' });
    }

    const { title, category, fileUrl, storagePath, mimeType, originalFilename } = req.body;

    if (!title?.trim())    return res.status(400).json({ success: false, message: 'Title is required' });
    if (!category || !CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Valid category is required' });
    }
    if (!fileUrl?.trim())  return res.status(400).json({ success: false, message: 'File URL is required' });

    const circular = {
      title:            title.trim(),
      category,
      fileUrl,
      storagePath:      storagePath || null,
      mimeType:         mimeType || null,
      originalFilename: originalFilename || null,
      uploadedBy:       uid,
      uploadedByRole:   role,
      createdAt:        admin.firestore.Timestamp.now(),
    };

    const ref = await db().collection('circulars').add(circular);
    res.json({ success: true, message: 'Circular saved successfully', data: { id: ref.id, ...circular } });

  } catch (error) {
    console.error('Circular save error:', error);
    res.status(500).json({ success: false, message: 'Failed to save circular', error: error.message });
  }
});

// ── DELETE /:id — remove circular metadata and storage file ──────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    if (!UPLOAD_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Only admin and CMO can delete circulars' });
    }

    const ref = db().collection('circulars').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Circular not found' });

    // Delete from Storage if path exists
    const { storagePath } = doc.data();
    if (storagePath) {
      try {
        await admin.storage().bucket().file(storagePath).delete();
      } catch {
        // File may already be deleted — proceed
      }
    }

    await ref.delete();
    res.json({ success: true, message: 'Circular deleted successfully' });

  } catch (error) {
    console.error('Circular delete error:', error);
    res.status(500).json({ success: false, message: 'Delete failed', error: error.message });
  }
});

module.exports = router;