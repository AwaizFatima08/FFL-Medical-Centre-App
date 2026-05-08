// functions/src/circulars/circularRoutes.js
// Flow 3 — Health Awareness Circulars & Administrative Notices
// Upload by: admin_incharge, cmo
// View by: all roles

const express  = require('express');
const admin    = require('firebase-admin');
const Busboy   = require('busboy');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const UPLOAD_ROLES = ['admin_incharge', 'cmo'];
const CATEGORIES   = ['medical', 'administrative'];

// Helpers — called inside handlers so admin is already initialized
const db      = () => admin.firestore();
const storage = () => admin.storage().bucket();

async function getUserRole(uid) {
  const doc = await db().collection('users').doc(uid).get();
  if (!doc.exists) throw new Error('User not found');
  return doc.data().role;
}

// ── GET /list ─────────────────────────────────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    await getUserRole(req.user.uid); // any authenticated user

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

// ── POST /upload ──────────────────────────────────────────────────────────────
router.post('/upload', async (req, res) => {
  try {
    const { uid } = req.user;
    const role = await getUserRole(uid);

    if (!UPLOAD_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Only admin and CMO can upload circulars' });
    }

    let title = '';
    let category = '';
    let fileBuffer = null;
    let originalFilename = '';
    let mimeType = '';

    await new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });

      busboy.on('field', (fieldname, value) => {
        if (fieldname === 'title')    title    = value.trim();
        if (fieldname === 'category') category = value.trim();
      });

      busboy.on('file', (fieldname, file, info) => {
        originalFilename = info.filename;
        mimeType         = info.mimeType;
        const chunks     = [];
        file.on('data', chunk => chunks.push(chunk));
        file.on('end',  ()    => { fileBuffer = Buffer.concat(chunks); });
      });

      busboy.on('finish', resolve);
      busboy.on('error',  reject);
      req.pipe(busboy);
    });

    if (!title)    return res.status(400).json({ success: false, message: 'Title is required' });
    if (!category || !CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Valid category is required' });
    }
    if (!fileBuffer) return res.status(400).json({ success: false, message: 'File is required' });

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ success: false, message: 'Only PDF, JPG and PNG files are allowed' });
    }

    // Upload to Firebase Storage
    const ext         = path.extname(originalFilename) || (mimeType === 'application/pdf' ? '.pdf' : '.jpg');
    const storageName = `${uuidv4()}${ext}`;
    const storagePath = `circulars/${category}/${storageName}`;
    const fileRef     = storage().file(storagePath);
    const token       = uuidv4();

    await fileRef.save(fileBuffer, {
      metadata: {
        contentType: mimeType,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${storage().name}/${storagePath}`;

    const circular = {
      title,
      category,
      fileUrl:          publicUrl,
      storagePath,
      mimeType,
      originalFilename,
      uploadedBy:       uid,
      uploadedByRole:   role,
      createdAt:        admin.firestore.Timestamp.now(),
    };

    const ref = await db().collection('circulars').add(circular);
    res.json({ success: true, message: 'Circular uploaded successfully', data: { id: ref.id, ...circular } });

  } catch (error) {
    console.error('Circular upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed', error: error.message });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
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

    const { storagePath } = doc.data();
    if (storagePath) {
      try { await storage().file(storagePath).delete(); } catch {}
    }

    await ref.delete();
    res.json({ success: true, message: 'Circular deleted successfully' });

  } catch (error) {
    console.error('Circular delete error:', error);
    res.status(500).json({ success: false, message: 'Delete failed', error: error.message });
  }
});

module.exports = router;