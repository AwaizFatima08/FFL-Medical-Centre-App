// functions/src/directory/directoryRoutes.js
// Flow 5 — Doctor Directory
// Accessible to: employee, reception, doctor, cmo (read)
//                admin_incharge (read + write)

const express = require('express');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const router = express.Router();
const db = getFirestore();

const READ_ROLES  = ['employee', 'reception', 'doctor', 'cmo', 'admin_incharge'];
const WRITE_ROLES = ['admin_incharge'];

// Helper: get user role from users collection
async function getUserRole(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) throw new Error('User not found');
  return doc.data().role;
}

// ── GET /list — fetch all directory entries ───────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    if (!READ_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const snapshot = await db.collection('doctorDirectory')
      .orderBy('createdAt', 'desc')
      .get();

    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data });

  } catch (error) {
    console.error('Directory list error:', error);
    res.status(500).json({ success: false, message: 'Failed to load directory', error: error.message });
  }
});

// ── GET /:id — fetch single entry ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    if (!READ_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const doc = await db.collection('doctorDirectory').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    res.json({ success: true, data: { id: doc.id, ...doc.data() } });

  } catch (error) {
    console.error('Directory get error:', error);
    res.status(500).json({ success: false, message: 'Failed to load entry', error: error.message });
  }
});

// ── POST /add — create new entry ─────────────────────────────────────────────
router.post('/add', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    if (!WRITE_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Only admin can add entries' });
    }

    const { name, speciality, hospital, address, phone, city } = req.body;

    if (!name?.trim())       return res.status(400).json({ success: false, message: 'Name is required' });
    if (!speciality?.trim()) return res.status(400).json({ success: false, message: 'Speciality is required' });
    if (!hospital?.trim())   return res.status(400).json({ success: false, message: 'Hospital is required' });
    if (!phone?.trim())      return res.status(400).json({ success: false, message: 'Phone is required' });
    if (!city?.trim())       return res.status(400).json({ success: false, message: 'City is required' });

    const entry = {
      name:       name.trim(),
      speciality: speciality.trim(),
      hospital:   hospital.trim(),
      address:    address?.trim() || null,
      phone:      phone.trim(),
      city:       city.trim(),
      createdBy:  req.user.uid,
      createdAt:  Timestamp.now(),
      updatedAt:  Timestamp.now(),
    };

    const ref = await db.collection('doctorDirectory').add(entry);
    res.json({ success: true, message: 'Doctor added successfully', data: { id: ref.id, ...entry } });

  } catch (error) {
    console.error('Directory add error:', error);
    res.status(500).json({ success: false, message: 'Failed to add entry', error: error.message });
  }
});

// ── PUT /:id — update existing entry ─────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    if (!WRITE_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Only admin can edit entries' });
    }

    const ref = db.collection('doctorDirectory').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    const { name, speciality, hospital, address, phone, city } = req.body;

    if (!name?.trim())       return res.status(400).json({ success: false, message: 'Name is required' });
    if (!speciality?.trim()) return res.status(400).json({ success: false, message: 'Speciality is required' });
    if (!hospital?.trim())   return res.status(400).json({ success: false, message: 'Hospital is required' });
    if (!phone?.trim())      return res.status(400).json({ success: false, message: 'Phone is required' });
    if (!city?.trim())       return res.status(400).json({ success: false, message: 'City is required' });

    const updates = {
      name:       name.trim(),
      speciality: speciality.trim(),
      hospital:   hospital.trim(),
      address:    address?.trim() || null,
      phone:      phone.trim(),
      city:       city.trim(),
      updatedBy:  req.user.uid,
      updatedAt:  Timestamp.now(),
    };

    await ref.update(updates);
    res.json({ success: true, message: 'Doctor updated successfully', data: { id: req.params.id, ...updates } });

  } catch (error) {
    console.error('Directory update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update entry', error: error.message });
  }
});

// ── DELETE /:id — remove entry ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const role = await getUserRole(req.user.uid);
    if (!WRITE_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Only admin can delete entries' });
    }

    const ref = db.collection('doctorDirectory').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    await ref.delete();
    res.json({ success: true, message: 'Doctor removed from directory' });

  } catch (error) {
    console.error('Directory delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete entry', error: error.message });
  }
});

module.exports = router;