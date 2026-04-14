const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO } = require('../utils');
const { ROLES } = require('../constants');

// ─── VALID CITIES ─────────────────────────────────────────
const VALID_CITIES = ['RYK', 'Sadiqabad', 'other'];

// ─── POST /add ────────────────────────────────────────────
// Authorized roles add a new doctor entry
router.post('/add', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO, ROLES.NURSE, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      doctorName,
      specialization,
      hospitalName,
      address,
      city,
      phoneNumbers,
    } = req.body;

    if (!doctorName || !specialization || !hospitalName || !city) {
      return errorResponse(res,
        'doctorName, specialization, hospitalName and city are required',
        400);
    }

    if (!VALID_CITIES.includes(city)) {
      return errorResponse(res,
        `Invalid city. Valid values: ${VALID_CITIES.join(', ')}`,
        400);
    }

    if (!phoneNumbers || !Array.isArray(phoneNumbers) ||
        phoneNumbers.length === 0) {
      return errorResponse(res,
        'At least one phone number is required',
        400);
    }

    const entryRef = db.collection('doctorsDirectory').doc();
    await entryRef.set({
      doctorName,
      specialization,
      hospitalName,
      address:      address || null,
      city,
      phoneNumbers,
      isActive:     true,
      addedBy:      req.user.uid,
      updatedBy:    null,
      createdAt:    nowISO(),
      updatedAt:    null,
    });

    return successResponse(res,
      { entryId: entryRef.id },
      'Doctor added to directory successfully',
      201
    );
  } catch (error) {
    console.error('Add doctor directory error:', error);
    return errorResponse(res, 'Failed to add doctor', 500);
  }
});

// ─── GET /all ─────────────────────────────────────────────
// All authenticated users can browse directory
router.get('/all', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const { city, specialization, search } = req.query;

    const snapshot = await db.collection('doctorsDirectory')
      .where('isActive', '==', true)
      .orderBy('doctorName', 'asc')
      .get();

    let entries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter by city
    if (city) {
      entries = entries.filter(e =>
        e.city.toLowerCase() === city.toLowerCase()
      );
    }

    // Filter by specialization
    if (specialization) {
      entries = entries.filter(e =>
        e.specialization.toLowerCase()
          .includes(specialization.toLowerCase())
      );
    }

    // Search by name or hospital
    if (search) {
      const searchLower = search.toLowerCase();
      entries = entries.filter(e =>
        e.doctorName.toLowerCase().includes(searchLower)    ||
        e.hospitalName.toLowerCase().includes(searchLower)  ||
        e.specialization.toLowerCase().includes(searchLower)
      );
    }

    return successResponse(res, entries);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch directory', 500);
  }
});

// ─── GET /:entryId ────────────────────────────────────────
router.get('/:entryId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const doc = await db.collection('doctorsDirectory')
      .doc(req.params.entryId).get();

    if (!doc.exists) {
      return errorResponse(res, 'Entry not found', 404);
    }

    return successResponse(res, { id: doc.id, ...doc.data() });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch entry', 500);
  }
});

// ─── PUT /:entryId ────────────────────────────────────────
// Authorized roles update an entry
router.put('/:entryId', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO, ROLES.NURSE, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      doctorName,
      specialization,
      hospitalName,
      address,
      city,
      phoneNumbers,
    } = req.body;

    const entryRef = db.collection('doctorsDirectory')
      .doc(req.params.entryId);
    const entryDoc = await entryRef.get();

    if (!entryDoc.exists) {
      return errorResponse(res, 'Entry not found', 404);
    }

    if (city && !VALID_CITIES.includes(city)) {
      return errorResponse(res,
        `Invalid city. Valid values: ${VALID_CITIES.join(', ')}`,
        400);
    }

    const updates = { updatedBy: req.user.uid, updatedAt: nowISO() };
    if (doctorName)     updates.doctorName     = doctorName;
    if (specialization) updates.specialization = specialization;
    if (hospitalName)   updates.hospitalName   = hospitalName;
    if (address)        updates.address        = address;
    if (city)           updates.city           = city;
    if (phoneNumbers && Array.isArray(phoneNumbers)) {
      updates.phoneNumbers = phoneNumbers;
    }

    await entryRef.update(updates);

    return successResponse(res, null, 'Entry updated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to update entry', 500);
  }
});

// ─── POST /:entryId/deactivate ────────────────────────────
// Soft delete — marks entry as inactive
router.post('/:entryId/deactivate', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO, ROLES.NURSE, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const entryRef = db.collection('doctorsDirectory')
      .doc(req.params.entryId);
    const entryDoc = await entryRef.get();

    if (!entryDoc.exists) {
      return errorResponse(res, 'Entry not found', 404);
    }

    await entryRef.update({
      isActive:      false,
      deactivatedBy: req.user.uid,
      deactivatedAt: nowISO(),
    });

    return successResponse(res, null, 'Entry deactivated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to deactivate entry', 500);
  }
});

// ─── POST /:entryId/reactivate ────────────────────────────
router.post('/:entryId/reactivate', verifyToken, verifyRole([
  ROLES.DOCTOR, ROLES.CMO, ROLES.RECEPTION,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const entryRef = db.collection('doctorsDirectory')
      .doc(req.params.entryId);
    const entryDoc = await entryRef.get();

    if (!entryDoc.exists) {
      return errorResponse(res, 'Entry not found', 404);
    }

    await entryRef.update({
      isActive:      true,
      reactivatedBy: req.user.uid,
      reactivatedAt: nowISO(),
    });

    return successResponse(res, null, 'Entry reactivated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to reactivate entry', 500);
  }
});

module.exports = router;