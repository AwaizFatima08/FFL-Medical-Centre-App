const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO } = require('../utils');
const { ROLES, COMMUNITY_GROUPS } = require('../constants');

// ─── GET /all ─────────────────────────────────────────────
// Admin, CMO, Reception can view all employees
router.get('/all', verifyToken, verifyRole([
  ROLES.ADMIN_INCHARGE, ROLES.CMO, ROLES.RECEPTION,
  ROLES.DOCTOR, ROLES.NURSE,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { validated, department, bloodGroup } = req.query;

    let query = db.collection('employees');

    if (validated !== undefined) {
      query = query.where('isValidated', '==', validated === 'true');
    }
    if (department) {
      query = query.where('department', '==', department);
    }
    if (bloodGroup) {
      query = query.where('bloodGroup', '==', bloodGroup);
    }

    const snapshot = await query.get();
    const employees = snapshot.docs.map(doc => {
      const data = doc.data();
      // Hide communityGroup from non-admin roles
      if (req.userRole !== ROLES.ADMIN_INCHARGE) {
        delete data.communityGroup;
      }
      return { id: doc.id, ...data };
    });

    return successResponse(res, employees);
  } catch (error) {
    console.error('Get all employees error:', error);
    return errorResponse(res, 'Failed to fetch employees', 500);
  }
});

// ─── GET /pending-validation ──────────────────────────────
// Admin only — employees awaiting validation
router.get('/pending-validation', verifyToken,
  verifyRole([ROLES.ADMIN_INCHARGE]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const snapshot = await db.collection('employees')
        .where('isValidated', '==', false)
        .get();

      const employees = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      return successResponse(res, employees);
    } catch (error) {
      return errorResponse(res, 'Failed to fetch pending employees', 500);
    }
  }
);

// ─── GET /:employeeId ─────────────────────────────────────
router.get('/:employeeId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const doc = await db.collection('employees').doc(req.params.employeeId).get();

    if (!doc.exists) {
      return errorResponse(res, 'Employee not found', 404);
    }

    const data = doc.data();

    // Only admin can see communityGroup
    if (req.userRole !== ROLES.ADMIN_INCHARGE) {
      delete data.communityGroup;
    }

    // Employee can only view own record
    if (req.userRole === ROLES.EMPLOYEE && data.userId !== req.user.uid) {
      return errorResponse(res, 'Forbidden', 403);
    }

    return successResponse(res, { id: doc.id, ...data });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch employee', 500);
  }
});

// ─── POST /validate/:employeeId ───────────────────────────
// Admin validates employee and assigns community group
router.post('/validate/:employeeId', verifyToken,
  verifyRole([ROLES.ADMIN_INCHARGE]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { communityGroup } = req.body;

      if (!communityGroup || !Object.values(COMMUNITY_GROUPS).includes(communityGroup)) {
        return errorResponse(res,
          `communityGroup is required. Valid values: ${Object.values(COMMUNITY_GROUPS).join(', ')}`,
          400);
      }

      const empRef = db.collection('employees').doc(req.params.employeeId);
      const empDoc = await empRef.get();

      if (!empDoc.exists) {
        return errorResponse(res, 'Employee not found', 404);
      }

      const empData = empDoc.data();

      // Validate employee record
      await empRef.update({
        isValidated:    true,
        communityGroup,
        validatedBy:    req.user.uid,
        validatedAt:    nowISO(),
      });

      // Activate user account
      await db.collection('users').doc(empData.userId).update({
        isActive: true,
      });

      return successResponse(res, null, 'Employee validated successfully');
    } catch (error) {
      console.error('Validate employee error:', error);
      return errorResponse(res, 'Validation failed', 500);
    }
  }
);

// ─── PUT /:employeeId ─────────────────────────────────────
// Employee updates own profile / Admin updates any
router.put('/:employeeId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const empRef = db.collection('employees').doc(req.params.employeeId);
    const empDoc = await empRef.get();

    if (!empDoc.exists) {
      return errorResponse(res, 'Employee not found', 404);
    }

    const empData = empDoc.data();

    // Employee can only update own record
    if (req.userRole === ROLES.EMPLOYEE && empData.userId !== req.user.uid) {
      return errorResponse(res, 'Forbidden', 403);
    }

    const {
      fullName,
      cnic,
      designation,
      department,
      houseNumber,
      phoneNumber,
      emergencyPhoneNumber,
      landlineExtension,
      bloodGroup,
      bloodDonorConsent,
      maritalStatus,
    } = req.body;

    const updates = {};
    if (fullName)              updates.fullName              = fullName;
    if (cnic)                  updates.cnic                  = cnic;
    if (designation)           updates.designation           = designation;
    if (department)            updates.department            = department;
    if (houseNumber)           updates.houseNumber           = houseNumber;
    if (phoneNumber)           updates.phoneNumber           = phoneNumber;
    if (emergencyPhoneNumber)  updates.emergencyPhoneNumber  = emergencyPhoneNumber;
    if (landlineExtension)     updates.landlineExtension     = landlineExtension;
    if (bloodGroup)            updates.bloodGroup            = bloodGroup;
    if (maritalStatus)         updates.maritalStatus         = maritalStatus;

    if (bloodDonorConsent !== undefined) {
      updates.bloodDonorConsent = bloodDonorConsent;
      // Update blood donor registry
      const donorRef = db.collection('bloodDonorRegistry').doc(req.params.employeeId);
      if (bloodDonorConsent && bloodGroup) {
        await donorRef.set({
          employeeId:       req.params.employeeId,
          userId:           empData.userId,
          fullName:         fullName || empData.fullName,
          bloodGroup:       bloodGroup || empData.bloodGroup,
          phoneNumber:      phoneNumber || empData.phoneNumber,
          consentGiven:     true,
          consentUpdatedAt: nowISO(),
        });
      } else if (!bloodDonorConsent) {
        await donorRef.delete();
      }
    }

    updates.updatedAt = nowISO();
    await empRef.update(updates);

    return successResponse(res, null, 'Employee updated successfully');
  } catch (error) {
    console.error('Update employee error:', error);
    return errorResponse(res, 'Update failed', 500);
  }
});

// ─── POST /:employeeId/family-members ────────────────────
router.post('/:employeeId/family-members', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const empDoc = await db.collection('employees')
      .doc(req.params.employeeId).get();

    if (!empDoc.exists) {
      return errorResponse(res, 'Employee not found', 404);
    }

    // Only own employee or admin can add family members
    if (req.userRole === ROLES.EMPLOYEE &&
        empDoc.data().userId !== req.user.uid) {
      return errorResponse(res, 'Forbidden', 403);
    }

    const {
      fullName,
      relation,
      dateOfBirth,
      gender,
      bloodGroup,
      maritalStatus,
      employmentStatus,
      differentlyAbled,
      differentlyAbledDetails,
    } = req.body;

    if (!fullName || !relation) {
      return errorResponse(res, 'fullName and relation are required', 400);
    }

    const memberRef = db.collection('employees')
      .doc(req.params.employeeId)
      .collection('familyMembers')
      .doc();

    await memberRef.set({
      fullName,
      relation,
      dateOfBirth:             dateOfBirth || null,
      gender:                  gender || null,
      bloodGroup:              bloodGroup || null,
      maritalStatus:           maritalStatus || null,
      employmentStatus:        employmentStatus || null,
      differentlyAbled:        differentlyAbled || false,
      differentlyAbledDetails: differentlyAbledDetails || null,
      createdAt:               nowISO(),
    });

    return successResponse(res,
      { memberId: memberRef.id },
      'Family member added successfully',
      201
    );
  } catch (error) {
    console.error('Add family member error:', error);
    return errorResponse(res, 'Failed to add family member', 500);
  }
});

// ─── GET /:employeeId/family-members ─────────────────────
router.get('/:employeeId/family-members', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const empDoc = await db.collection('employees')
      .doc(req.params.employeeId).get();

    if (!empDoc.exists) {
      return errorResponse(res, 'Employee not found', 404);
    }

    if (req.userRole === ROLES.EMPLOYEE &&
        empDoc.data().userId !== req.user.uid) {
      return errorResponse(res, 'Forbidden', 403);
    }

    const snapshot = await db.collection('employees')
      .doc(req.params.employeeId)
      .collection('familyMembers')
      .get();

    const members = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return successResponse(res, members);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch family members', 500);
  }
});

// ─── PUT /:employeeId/family-members/:memberId ────────────
router.put('/:employeeId/family-members/:memberId',
  verifyToken, async (req, res) => {
    try {
      const db = admin.firestore();
      const empDoc = await db.collection('employees')
        .doc(req.params.employeeId).get();

      if (!empDoc.exists) {
        return errorResponse(res, 'Employee not found', 404);
      }

      if (req.userRole === ROLES.EMPLOYEE &&
          empDoc.data().userId !== req.user.uid) {
        return errorResponse(res, 'Forbidden', 403);
      }

      const memberRef = db.collection('employees')
        .doc(req.params.employeeId)
        .collection('familyMembers')
        .doc(req.params.memberId);

      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) {
        return errorResponse(res, 'Family member not found', 404);
      }

      const updates = { ...req.body, updatedAt: nowISO() };
      await memberRef.update(updates);

      return successResponse(res, null, 'Family member updated successfully');
    } catch (error) {
      return errorResponse(res, 'Failed to update family member', 500);
    }
  }
);

// ─── GET /blood-donors/:bloodGroup ───────────────────────
// Medical staff searches donor registry by blood group
router.get('/blood-donors/:bloodGroup', verifyToken,
  verifyRole([ROLES.DOCTOR, ROLES.CMO, ROLES.NURSE, ROLES.RECEPTION]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const snapshot = await db.collection('bloodDonorRegistry')
        .where('bloodGroup', '==', req.params.bloodGroup)
        .get();

      const donors = snapshot.docs.map(doc => ({
        id:          doc.id,
        fullName:    doc.data().fullName,
        bloodGroup:  doc.data().bloodGroup,
        phoneNumber: doc.data().phoneNumber,
      }));

      return successResponse(res, donors);
    } catch (error) {
      return errorResponse(res, 'Failed to fetch donors', 500);
    }
  }
);

module.exports = router;