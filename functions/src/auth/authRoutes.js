//  FFL Medical Centre — authRoutes.js
//  Path: functions/src/auth/authRoutes.js
// ─────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { successResponse, errorResponse, nowISO } = require('../utils');
const { ROLES } = require('../constants');

// ─── MIDDLEWARE — VERIFY TOKEN ───────────────────────────
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'Unauthorized — no token provided', 401);
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return errorResponse(res, 'Unauthorized — invalid token', 401);
  }
};

// ─── MIDDLEWARE — VERIFY ROLE ────────────────────────────
const verifyRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      if (!userDoc.exists) {
        return errorResponse(res, 'User record not found', 404);
      }
      const userData = userDoc.data();
      if (!allowedRoles.includes(userData.role)) {
        return errorResponse(res, 'Forbidden — insufficient permissions', 403);
      }
      req.userRole = userData.role;
      req.userRecord = userData;
      next();
    } catch (error) {
      return errorResponse(res, 'Role verification failed', 500);
    }
  };
};

// ─── POST /register ──────────────────────────────────────
router.post('/register', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      fullName,
      phoneNumber,
      employeeNumber,
      townshipResidentWithFamily,
      townshipResidentBachelor,
      residenceType,
      houseNumber,
      roomNumber,
      cityOfResidence,
    } = req.body;

    if (!fullName || !phoneNumber || !employeeNumber) {
      return errorResponse(res, 'fullName, phoneNumber and employeeNumber are required', 400);
    }

    const existingUser = await db.collection('users').doc(req.user.uid).get();
    if (existingUser.exists) {
      return errorResponse(res, 'User already registered', 409);
    }

    const empCheck = await db.collection('employees')
      .where('officialEmployeeNumber', '==', employeeNumber)
      .get();
    if (!empCheck.empty) {
      return errorResponse(res, 'Employee number already registered', 409);
    }

    const batch = db.batch();

    const userRef = db.collection('users').doc(req.user.uid);
    batch.set(userRef, {
      email:       req.user.email || null,
      phone:       phoneNumber,
      role:        ROLES.EMPLOYEE,
      isActive:    false,
      approvedAt:  null, // explicitly null so it's distinguishable from "was approved, later disabled"
      createdAt:   nowISO(),
      lastLoginAt: nowISO(),
    });

    const employeeData = {
      userId:                 req.user.uid,
      fullName,
      officialEmployeeNumber: employeeNumber,
      phoneNumber,
      isValidated:            false,
      createdAt:              nowISO(),
      townshipResidentWithFamily: townshipResidentWithFamily === true,
      townshipResidentBachelor:   townshipResidentBachelor   === true,
      residenceType:              residenceType   || null,
      houseNumber:                houseNumber     || null,
      roomNumber:                 roomNumber      || null,
      cityOfResidence:            cityOfResidence || null,
    };

    const employeeRef = db.collection('employees').doc();
    batch.set(employeeRef, employeeData);

    await batch.commit();

    try {
      await db.collection('mail').add({
        to:      'admin@ffl.com',
        message: {
          subject: '🔔 New Signup Request — FFL Medical Centre',
          html: `
            <p>A new employee has registered and is awaiting your approval.</p>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
              <tr><td style="padding:6px 12px;color:#555;">Name</td>
                  <td style="padding:6px 12px;font-weight:bold;">${fullName}</td></tr>
              <tr><td style="padding:6px 12px;color:#555;">Employee No.</td>
                  <td style="padding:6px 12px;font-weight:bold;">${employeeNumber}</td></tr>
              <tr><td style="padding:6px 12px;color:#555;">Phone</td>
                  <td style="padding:6px 12px;">${phoneNumber}</td></tr>
              <tr><td style="padding:6px 12px;color:#555;">Email</td>
                  <td style="padding:6px 12px;">${req.user.email || '—'}</td></tr>
              <tr><td style="padding:6px 12px;color:#555;">Submitted</td>
                  <td style="padding:6px 12px;">${nowISO()}</td></tr>
            </table>
            <br/>
            <p>Please open the <strong>FFL Medical Centre Admin Dashboard</strong>
               and go to <strong>User Approvals</strong> to review this request.</p>
          `,
        },
      });
    } catch (mailErr) {
      console.warn('Admin email notification failed:', mailErr.message);
    }

    return successResponse(res, {
      uid:        req.user.uid,
      employeeId: employeeRef.id,
    }, 'Registration successful. Awaiting admin validation.', 201);

  } catch (error) {
    console.error('Register error:', error);
    return errorResponse(res, 'Registration failed', 500);
  }
});

// ─── POST /complete-profile ──────────────────────────────
router.post('/complete-profile', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      cnic,
      designation,
      department,
      houseNumber,
      emergencyPhoneNumber,
      landlineExtension,
      bloodGroup,
      bloodDonorConsent,
      maritalStatus,
    } = req.body;

    const empQuery = await db.collection('employees')
      .where('userId', '==', req.user.uid)
      .get();

    if (empQuery.empty) {
      return errorResponse(res, 'Employee record not found', 404);
    }

    const empDoc = empQuery.docs[0];

    await empDoc.ref.update({
      cnic:                 cnic || null,
      designation:          designation || null,
      department:           department || null,
      houseNumber:          houseNumber || null,
      emergencyPhoneNumber: emergencyPhoneNumber || null,
      landlineExtension:    landlineExtension || null,
      bloodGroup:           bloodGroup || null,
      bloodDonorConsent:    bloodDonorConsent || false,
      maritalStatus:        maritalStatus || null,
      profileCompletedAt:   nowISO(),
    });

    if (bloodDonorConsent && bloodGroup) {
      await db.collection('bloodDonorRegistry').doc(empDoc.id).set({
        employeeId:       empDoc.id,
        userId:           req.user.uid,
        fullName:         empDoc.data().fullName,
        bloodGroup,
        phoneNumber:      empDoc.data().phoneNumber,
        consentGiven:     true,
        consentUpdatedAt: nowISO(),
      });
    }

    return successResponse(res, null, 'Profile updated successfully');

  } catch (error) {
    console.error('Complete profile error:', error);
    return errorResponse(res, 'Profile update failed', 500);
  }
});

// ─── GET /me ─────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();

    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return errorResponse(res, 'User not found', 404);
    }

    const empQuery = await db.collection('employees')
      .where('userId', '==', req.user.uid)
      .get();

    const employeeData = empQuery.empty ? null : {
      id: empQuery.docs[0].id,
      ...empQuery.docs[0].data(),
    };

    if (employeeData) {
      delete employeeData.communityGroup;
    }

    return successResponse(res, {
      user:     { id: userDoc.id, ...userDoc.data() },
      employee: employeeData,
    });

  } catch (error) {
    console.error('Get me error:', error);
    return errorResponse(res, 'Failed to fetch profile', 500);
  }
});

// ─── POST /update-last-login ──────────────────────────────
router.post('/update-last-login', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    await db.collection('users').doc(req.user.uid).update({
      lastLoginAt: nowISO(),
    });
    return successResponse(res, null, 'Last login updated');
  } catch (error) {
    return errorResponse(res, 'Failed to update login time', 500);
  }
});

// ─── GET /pending-users ───────────────────────────────────
// "Pending" means: inactive AND never approved before (approvedAt is falsy).
// This is what keeps previously-approved-then-disabled users OUT of this
// queue — critical, since this screen's Reject button permanently deletes
// the account. Filtering happens in code (not via Firestore query) so it
// stays safe even for older documents created before `approvedAt` existed.
router.get('/pending-users', verifyToken, verifyRole([ROLES.ADMIN_INCHARGE, ROLES.CMO]), async (req, res) => {
  try {
    const db = admin.firestore();

    const usersSnap = await db.collection('users')
      .where('isActive', '==', false)
      .get();

    if (usersSnap.empty) {
      return successResponse(res, [], 'No pending users');
    }

    const neverApprovedDocs = usersSnap.docs.filter(doc => !doc.data().approvedAt);

    const pending = await Promise.all(neverApprovedDocs.map(async (userDoc) => {
      const userData = userDoc.data();
      const empSnap = await db.collection('employees')
        .where('userId', '==', userDoc.id)
        .limit(1)
        .get();
      const empData = empSnap.empty ? {} : empSnap.docs[0].data();

      return {
        uid:                    userDoc.id,
        email:                  userData.email || null,
        phone:                  userData.phone || null,
        role:                   userData.role,
        createdAt:              userData.createdAt,
        fullName:               empData.fullName               || '—',
        officialEmployeeNumber: empData.officialEmployeeNumber || '—',
        phoneNumber:            empData.phoneNumber || userData.phone || '—',
        employeeId:             empSnap.empty ? null : empSnap.docs[0].id,
      };
    }));

    pending.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return successResponse(res, pending, 'Pending users fetched');
  } catch (error) {
    console.error('Pending users error:', error);
    return errorResponse(res, 'Failed to fetch pending users', 500);
  }
});

// ─── POST /approve-user ───────────────────────────────────
router.post('/approve-user', verifyToken, verifyRole([ROLES.ADMIN_INCHARGE]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { uid, role } = req.body;

    if (!uid || !role) {
      return errorResponse(res, 'uid and role are required', 400);
    }

    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(role)) {
      return errorResponse(res, `Invalid role. Valid roles: ${validRoles.join(', ')}`, 400);
    }

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return errorResponse(res, 'User not found', 404);
    }
    if (userDoc.data().isActive) {
      return errorResponse(res, 'User is already active', 409);
    }

    await db.collection('users').doc(uid).update({
      isActive:   true,
      role:       role,
      approvedBy: req.user.uid,
      approvedAt: nowISO(),
    });

    const empSnap = await db.collection('employees')
      .where('userId', '==', uid)
      .limit(1)
      .get();
    if (!empSnap.empty) {
      await empSnap.docs[0].ref.update({
        isValidated: true,
        validatedAt: nowISO(),
        validatedBy: req.user.uid,
      });
    }

    try {
      await admin.auth().generateEmailVerificationLink(
        userDoc.data().email,
        { url: 'https://ffl-medical-centre-app.firebaseapp.com' }
      );
      console.log('Verification link generated for:', userDoc.data().email);
    } catch (emailErr) {
      console.warn('Email verification link failed:', emailErr.message);
    }

    return successResponse(res, { uid, role }, 'User approved and activated successfully');
  } catch (error) {
    console.error('Approve user error:', error);
    return errorResponse(res, 'Failed to approve user', 500);
  }
});

// ─── POST /reject-user ────────────────────────────────────
// Only ever safe to call on someone who has NEVER been approved
// (guarded here — this permanently deletes the Firebase Auth account).
router.post('/reject-user', verifyToken, verifyRole([ROLES.ADMIN_INCHARGE]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { uid, reason } = req.body;

    if (!uid) {
      return errorResponse(res, 'uid is required', 400);
    }

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return errorResponse(res, 'User not found', 404);
    }
    if (userDoc.data().isActive) {
      return errorResponse(res, 'Cannot reject an already active user', 409);
    }
    if (userDoc.data().approvedAt) {
      return errorResponse(res, 'This user was previously approved — use Disable instead of Reject to avoid permanently deleting their account.', 409);
    }

    await admin.auth().deleteUser(uid);
    await db.collection('users').doc(uid).delete();

    const empSnap = await db.collection('employees')
      .where('userId', '==', uid)
      .limit(1)
      .get();
    if (!empSnap.empty) {
      await empSnap.docs[0].ref.delete();
    }

    return successResponse(res, { uid }, 'User rejected and removed successfully');
  } catch (error) {
    console.error('Reject user error:', error);
    return errorResponse(res, 'Failed to reject user', 500);
  }
});

// ─── GET /all-users ────────────────────────────────────────
// Every user who has ever been approved (active or disabled) — the data
// source for the Manage Users screen. Deliberately excludes never-approved
// pending signups, which stay on the Pending Approvals screen only.
router.get('/all-users', verifyToken, verifyRole([ROLES.ADMIN_INCHARGE, ROLES.CMO]), async (req, res) => {
  try {
    const db = admin.firestore();

    const usersSnap = await db.collection('users').get();
    const approvedDocs = usersSnap.docs.filter(doc => !!doc.data().approvedAt);

    const allUsers = await Promise.all(approvedDocs.map(async (userDoc) => {
      const userData = userDoc.data();
      const empSnap = await db.collection('employees')
        .where('userId', '==', userDoc.id)
        .limit(1)
        .get();
      const empData = empSnap.empty ? {} : empSnap.docs[0].data();

      return {
        uid:                    userDoc.id,
        email:                  userData.email || null,
        phone:                  userData.phone || null,
        role:                   userData.role,
        isActive:               userData.isActive,
        approvedAt:             userData.approvedAt || null,
        disabledAt:             userData.disabledAt || null,
        fullName:               empData.fullName               || '—',
        officialEmployeeNumber: empData.officialEmployeeNumber || '—',
        phoneNumber:            empData.phoneNumber || userData.phone || '—',
        employeeId:             empSnap.empty ? null : empSnap.docs[0].id,
      };
    }));

    allUsers.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return successResponse(res, allUsers, 'All users fetched');
  } catch (error) {
    console.error('All users error:', error);
    return errorResponse(res, 'Failed to fetch users', 500);
  }
});

// ─── POST /disable-user ───────────────────────────────────
// Reversible — blocks login by setting isActive:false, but never touches
// Firebase Auth or Firestore records. Only valid on previously-approved users.
router.post('/disable-user', verifyToken, verifyRole([ROLES.ADMIN_INCHARGE]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { uid } = req.body;

    if (!uid) {
      return errorResponse(res, 'uid is required', 400);
    }

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return errorResponse(res, 'User not found', 404);
    }
    if (!userDoc.data().approvedAt) {
      return errorResponse(res, 'This user was never approved — use Reject instead.', 409);
    }
    if (!userDoc.data().isActive) {
      return errorResponse(res, 'User is already disabled', 409);
    }

    await db.collection('users').doc(uid).update({
      isActive:    false,
      disabledBy:  req.user.uid,
      disabledAt:  nowISO(),
    });

    return successResponse(res, { uid }, 'User disabled successfully');
  } catch (error) {
    console.error('Disable user error:', error);
    return errorResponse(res, 'Failed to disable user', 500);
  }
});

// ─── POST /enable-user ─────────────────────────────────────
// Re-activates a previously-disabled (but originally approved) user.
router.post('/enable-user', verifyToken, verifyRole([ROLES.ADMIN_INCHARGE]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { uid } = req.body;

    if (!uid) {
      return errorResponse(res, 'uid is required', 400);
    }

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return errorResponse(res, 'User not found', 404);
    }
    if (!userDoc.data().approvedAt) {
      return errorResponse(res, 'This user was never approved — use Pending Approvals instead.', 409);
    }
    if (userDoc.data().isActive) {
      return errorResponse(res, 'User is already active', 409);
    }

    await db.collection('users').doc(uid).update({
      isActive:      true,
      reEnabledBy:   req.user.uid,
      reEnabledAt:   nowISO(),
    });

    return successResponse(res, { uid }, 'User re-enabled successfully');
  } catch (error) {
    console.error('Enable user error:', error);
    return errorResponse(res, 'Failed to enable user', 500);
  }
});

// ─── POST /change-role ─────────────────────────────────────
// Changes the role of an already-approved user (active or disabled).
router.post('/change-role', verifyToken, verifyRole([ROLES.ADMIN_INCHARGE]), async (req, res) => {
  try {
    const db = admin.firestore();
    const { uid, role } = req.body;

    if (!uid || !role) {
      return errorResponse(res, 'uid and role are required', 400);
    }

    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(role)) {
      return errorResponse(res, `Invalid role. Valid roles: ${validRoles.join(', ')}`, 400);
    }

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return errorResponse(res, 'User not found', 404);
    }
    if (!userDoc.data().approvedAt) {
      return errorResponse(res, 'This user was never approved — use Pending Approvals instead.', 409);
    }

    await db.collection('users').doc(uid).update({
      role,
      roleChangedBy: req.user.uid,
      roleChangedAt: nowISO(),
    });

    return successResponse(res, { uid, role }, 'Role updated successfully');
  } catch (error) {
    console.error('Change role error:', error);
    return errorResponse(res, 'Failed to change role', 500);
  }
});

// ─── Export verifyToken & verifyRole for use in other routes
module.exports = router;
module.exports.verifyToken = verifyToken;
module.exports.verifyRole  = verifyRole;