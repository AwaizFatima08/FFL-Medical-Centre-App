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

// ─── GET /lookup ──────────────────────────────────────────
// Admin, CMO, Doctor look up an employee by officialEmployeeNumber
// Used by FitnessAdminScreen to confirm employee before scheduling
router.get('/lookup', verifyToken, verifyRole([
  ROLES.ADMIN_INCHARGE, ROLES.CMO, ROLES.DOCTOR,
]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { employeeNumber } = req.query;

    if (!employeeNumber || !employeeNumber.trim()) {
      return errorResponse(res, 'employeeNumber query parameter is required', 400);
    }

    const snapshot = await db.collection('employees')
      .where('officialEmployeeNumber', '==', employeeNumber.trim().toUpperCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return errorResponse(res, 'No employee found with this employee number', 404);
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    return successResponse(res, {
      id:                     doc.id,
      fullName:               data.fullName               || null,
      officialEmployeeNumber: data.officialEmployeeNumber || null,
      department:             data.department             || null,
      designation:            data.designation            || null,
    });

  } catch (error) {
    console.error('Employee lookup error:', error);
    return errorResponse(res, 'Lookup failed', 500);
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
//
// Day 14 fix (Phase 4, Step A): previously ANY field in the accepted list
// below could be written by an employee editing their own record — including
// department, designation, bloodGroup and cnic, which the Phase 4 design
// deliberately makes admin-owned (medical centre already holds this data;
// employee only confirms it, does not self-enter it). Those four fields are
// now gated to non-employee callers (admin/other privileged roles) only.
// An employee's own PUT request silently drops those fields rather than
// erroring — matches this route's existing "include only what was sent"
// pattern. maritalStatus and bloodDonorConsent remain open to self-edit,
// per Phase 4 design (§2 of PHASE4_DESIGN.md). All other pre-existing
// fields (fullName, contact info, residence fields) are UNCHANGED and
// remain self-editable, as they were never part of the Phase 4 scope
// discussion — not touched here to avoid guessing at scope not agreed on.
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

    // Day 14: is this call self-service (employee editing their own record)?
    // Used below to gate the admin-owned fields.
    const isSelfService = req.userRole === ROLES.EMPLOYEE;

    const {
      fullName,
      cnic,
      designation,
      department,
      unit,                        // ← Day 14, Step D
      employeeType,                // ← Day 14, Step D
      houseNumber,
      roomNumber,                  // ← NEW
      phoneNumber,
      emergencyPhoneNumber,
      landlineExtension,
      bloodGroup,
      bloodDonorConsent,
      maritalStatus,
      // ── Residence fields ──────────────────────────────
      townshipResidentWithFamily,  // ← NEW
      townshipResidentBachelor,    // ← NEW
      residenceType,               // ← NEW
      cityOfResidence,             // ← NEW
    } = req.body;

    const updates = {};
    if (fullName)             updates.fullName             = fullName;

    // Day 14 fix — admin-owned fields (Phase 4 design): an employee editing
    // their own record can no longer set these, regardless of what's in the
    // request body. Admin/other privileged roles are unaffected.
    if (cnic && !isSelfService)           updates.cnic           = cnic;
    if (designation && !isSelfService)    updates.designation    = designation;
    if (department && !isSelfService)     updates.department     = department;
    if (bloodGroup && !isSelfService)     updates.bloodGroup     = bloodGroup;
    if (unit && !isSelfService)           updates.unit           = unit;
    if (employeeType && !isSelfService)   updates.employeeType   = employeeType;
    // chronicDisease is intentionally NOT accepted here — Day 14 (Step E fix):
    // it moved to employees/{employeeId}/private/medical, a separate,
    // restricted-access document, because Firestore rules can't hide a
    // single field within this otherwise openly-readable document. See the
    // new PUT /:employeeId/medical route below.

    if (houseNumber)          updates.houseNumber          = houseNumber;
    if (roomNumber)           updates.roomNumber           = roomNumber;           // ← NEW
    if (phoneNumber)          updates.phoneNumber          = phoneNumber;
    if (emergencyPhoneNumber) updates.emergencyPhoneNumber = emergencyPhoneNumber;
    if (landlineExtension)    updates.landlineExtension    = landlineExtension;
    // maritalStatus stays open to self-edit — Phase 4 design deliberately
    // makes this the one identity-adjacent field an employee can change
    // themselves at any time (drives the Family tab alert state elsewhere).
    if (maritalStatus)        updates.maritalStatus        = maritalStatus;

    // Day 14, Step F — auto-flag family data when marital status transitions
    // INTO 'married' from anything else. Server-computed only — the request
    // body never carries familyDataStatus for this path, so there's nothing
    // for a client to spoof. Applies uniformly whether the caller is the
    // employee themselves (self-edit) or admin.
    if (maritalStatus === 'married' && empData.maritalStatus !== 'married') {
      updates.familyDataStatus   = 'needs_update';
      updates.familyDataFlagNote = null;
    }

    // Day 14, Step F — admin-only explicit control: mark family data
    // complete, or manually re-flag with an optional note (e.g. HR reported
    // a birth the employee hasn't logged yet). Placed after the
    // auto-transition above so an explicit admin call always wins if both
    // happen to be present in the same request.
    if (req.body.familyDataStatus && !isSelfService) {
      updates.familyDataStatus = req.body.familyDataStatus;
    }
    if (req.body.familyDataFlagNote !== undefined && !isSelfService) {
      updates.familyDataFlagNote = req.body.familyDataFlagNote?.trim() || null;
    }

    // Residence fields — use explicit undefined check so false values are saved
    if (townshipResidentWithFamily !== undefined)
      updates.townshipResidentWithFamily = townshipResidentWithFamily;            // ← NEW
    if (townshipResidentBachelor !== undefined)
      updates.townshipResidentBachelor   = townshipResidentBachelor;              // ← NEW
    if (residenceType !== undefined)
      updates.residenceType              = residenceType;                         // ← NEW
    if (cityOfResidence !== undefined)
      updates.cityOfResidence            = cityOfResidence;                       // ← NEW

    // bloodDonorConsent stays open to self-edit — Phase 4 design explicitly
    // allows the employee to opt in/out at any time.
    if (bloodDonorConsent !== undefined) {
      updates.bloodDonorConsent = bloodDonorConsent;
      // Update blood donor registry
      // Day 13 fix: officialEmployeeNumber now included so the directory can
      // display it — was previously omitted, so the read side had nothing to show.
      const donorRef = db.collection('bloodDonorRegistry').doc(req.params.employeeId);
      if (bloodDonorConsent && bloodGroup) {
        await donorRef.set({
          employeeId:             req.params.employeeId,
          userId:                 empData.userId,
          fullName:               fullName || empData.fullName,
          officialEmployeeNumber: empData.officialEmployeeNumber || null,  // ← Day 13 fix
          bloodGroup:             bloodGroup || empData.bloodGroup,
          phoneNumber:            phoneNumber || empData.phoneNumber,
          consentGiven:           true,
          consentUpdatedAt:       nowISO(),
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

// ─── PUT /:employeeId/medical ─────────────────────────────
// Day 14 (Phase 4, Step E fix). Admin/CMO only — writes chronic disease to
// employees/{employeeId}/private/medical, NOT the main employee document.
// Reason: firestore.rules allows any authenticated user to read
// employees/{employeeId} (needed for directory/report features elsewhere),
// and Firestore rules cannot hide a single field within an otherwise-open
// document. This subcollection has its own restrictive rule instead.
router.put('/:employeeId/medical', verifyToken,
  verifyRole([ROLES.ADMIN_INCHARGE, ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const { chronicDisease } = req.body;

      const empDoc = await db.collection('employees').doc(req.params.employeeId).get();
      if (!empDoc.exists) {
        return errorResponse(res, 'Employee not found', 404);
      }

      await db.collection('employees').doc(req.params.employeeId)
        .collection('private').doc('medical')
        .set({
          chronicDisease: chronicDisease?.trim() || null,
          updatedAt:      nowISO(),
          updatedBy:      req.user.uid,
        });

      return successResponse(res, null, 'Medical data updated successfully');
    } catch (error) {
      console.error('Update medical data error:', error);
      return errorResponse(res, 'Failed to update medical data', 500);
    }
  }
);

// ─── GET /:employeeId/medical ─────────────────────────────
// Day 14 (Phase 4, Step E fix). Admin/CMO only.
router.get('/:employeeId/medical', verifyToken,
  verifyRole([ROLES.ADMIN_INCHARGE, ROLES.CMO]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const doc = await db.collection('employees').doc(req.params.employeeId)
        .collection('private').doc('medical').get();

      return successResponse(res, doc.exists ? doc.data() : { chronicDisease: null });
    } catch (error) {
      return errorResponse(res, 'Failed to fetch medical data', 500);
    }
  }
);

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
      dateOfBirth:             dateOfBirth             || null,
      gender:                  gender                  || null,
      bloodGroup:              bloodGroup              || null,
      maritalStatus:           maritalStatus           || null,
      employmentStatus:        employmentStatus        || null,
      differentlyAbled:        differentlyAbled        || false,
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
// Directory search by blood group — visible to ALL roles
// Day 13 fix: previously restricted to DOCTOR/CMO/NURSE/RECEPTION only,
// which blocked ADMIN_INCHARGE and EMPLOYEE with "Forbidden — insufficient
// permissions" even though the frontend tile is shown to everyone.
router.get('/blood-donors/:bloodGroup', verifyToken,
  verifyRole([
    ROLES.EMPLOYEE, ROLES.RECEPTION, ROLES.DRIVER, ROLES.DOCTOR,
    ROLES.NURSE, ROLES.LAB_TECHNOLOGIST, ROLES.PHARMACY_INCHARGE,
    ROLES.ADMIN_INCHARGE, ROLES.CMO,
  ]),
  async (req, res) => {
    try {
      const db = admin.firestore();
      const snapshot = await db.collection('bloodDonorRegistry')
        .where('bloodGroup', '==', req.params.bloodGroup)
        .get();

      const donors = snapshot.docs.map(doc => ({
        id:                     doc.id,
        fullName:               doc.data().fullName,
        officialEmployeeNumber: doc.data().officialEmployeeNumber || null,  // ← Day 13 fix
        bloodGroup:             doc.data().bloodGroup,
        phoneNumber:            doc.data().phoneNumber,
      }));

      return successResponse(res, donors);
    } catch (error) {
      return errorResponse(res, 'Failed to fetch donors', 500);
    }
  }
);

module.exports = router;