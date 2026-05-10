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
// Called after Firebase Auth creates the user on client side
// Creates the user document in Firestore
router.post('/register', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const { fullName, phoneNumber, employeeNumber } = req.body;

    if (!fullName || !phoneNumber || !employeeNumber) {
      return errorResponse(res, 'fullName, phoneNumber and employeeNumber are required', 400);
    }

    // Check if user document already exists
    const existingUser = await db.collection('users').doc(req.user.uid).get();
    if (existingUser.exists) {
      return errorResponse(res, 'User already registered', 409);
    }

    // Check employee number not already registered
    const empCheck = await db.collection('employees')
      .where('officialEmployeeNumber', '==', employeeNumber)
      .get();
    if (!empCheck.empty) {
      return errorResponse(res, 'Employee number already registered', 409);
    }

    const batch = db.batch();

    // Create user document
    const userRef = db.collection('users').doc(req.user.uid);
    batch.set(userRef, {
      email: req.user.email || null,
      phone: phoneNumber,
      role: ROLES.EMPLOYEE, // default role, admin will validate
      isActive: false,       // inactive until admin validates
      createdAt: nowISO(),
      lastLoginAt: nowISO(),
    });

    // Create employee document
    const employeeRef = db.collection('employees').doc();
    batch.set(employeeRef, {
      userId: req.user.uid,
      fullName,
      officialEmployeeNumber: employeeNumber,
      phoneNumber,
      isValidated: false,
      createdAt: nowISO(),
    });

    await batch.commit();

    return successResponse(res, {
      uid: req.user.uid,
      employeeId: employeeRef.id,
    }, 'Registration successful. Awaiting admin validation.', 201);

  } catch (error) {
    console.error('Register error:', error);
    return errorResponse(res, 'Registration failed', 500);
  }
});

// ─── POST /complete-profile ──────────────────────────────
// Employee fills in full profile after registration
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

    // Find employee document by userId
    const empQuery = await db.collection('employees')
      .where('userId', '==', req.user.uid)
      .get();

    if (empQuery.empty) {
      return errorResponse(res, 'Employee record not found', 404);
    }

    const empDoc = empQuery.docs[0];

    await empDoc.ref.update({
      cnic:                  cnic || null,
      designation:           designation || null,
      department:            department || null,
      houseNumber:           houseNumber || null,
      emergencyPhoneNumber:  emergencyPhoneNumber || null,
      landlineExtension:     landlineExtension || null,
      bloodGroup:            bloodGroup || null,
      bloodDonorConsent:     bloodDonorConsent || false,
      maritalStatus:         maritalStatus || null,
      profileCompletedAt:    nowISO(),
    });

    // If blood donor consent given, add to donor registry
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
// Returns current user profile
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

    // Remove sensitive/admin-only fields from employee data
    if (employeeData) {
      delete employeeData.communityGroup;
    }

    return successResponse(res, {
      user: { id: userDoc.id, ...userDoc.data() },
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

// ─── GET /pending-users — Admin lists all pending approval requests ────────────
router.get('/pending-users', verifyToken, verifyRole([ROLES.ADMIN_INCHARGE, ROLES.CMO]), async (req, res) => {
  try {
    const db = admin.firestore();

    // Get all inactive users
    const usersSnap = await db.collection('users')
      .where('isActive', '==', false)
      .get();

    if (usersSnap.empty) {
      return successResponse(res, [], 'No pending users');
    }

    // Enrich with employee data
    const pending = await Promise.all(usersSnap.docs.map(async (userDoc) => {
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
        fullName:               empData.fullName || '—',
        officialEmployeeNumber: empData.officialEmployeeNumber || '—',
        phoneNumber:            empData.phoneNumber || userData.phone || '—',
        employeeId:             empSnap.empty ? null : empSnap.docs[0].id,
      };
    }));

    // Sort newest first
    pending.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return successResponse(res, pending, 'Pending users fetched');
  } catch (error) {
    console.error('Pending users error:', error);
    return errorResponse(res, 'Failed to fetch pending users', 500);
  }
});

// ─── POST /approve-user — Admin approves a signup request ────────────────────
// Body: { uid, role }
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

    // Activate user and assign role
    await db.collection('users').doc(uid).update({
      isActive:   true,
      role:       role,
      approvedBy: req.user.uid,
      approvedAt: nowISO(),
    });

    // Mark employee as validated
    const empSnap = await db.collection('employees')
      .where('userId', '==', uid)
      .limit(1)
      .get();
    if (!empSnap.empty) {
      await empSnap.docs[0].ref.update({
        isValidated:  true,
        validatedAt:  nowISO(),
        validatedBy:  req.user.uid,
      });
    }

    // Send email verification via Firebase Auth
    try {
      const verificationLink = await admin.auth().generateEmailVerificationLink(
        userDoc.data().email,
        { url: 'https://ffl-medical-centre-app.firebaseapp.com' }
      );
      // Note: In production, send this via email service
      // For now Firebase Auth handles delivery via sendSignInLinkToEmail on client
      console.log('Verification link generated for:', userDoc.data().email);
    } catch (emailErr) {
      // Non-fatal — account is still activated
      console.warn('Email verification link failed:', emailErr.message);
    }

    return successResponse(res, { uid, role }, 'User approved and activated successfully');
  } catch (error) {
    console.error('Approve user error:', error);
    return errorResponse(res, 'Failed to approve user', 500);
  }
});

// ─── POST /reject-user — Admin rejects a signup request ──────────────────────
// Body: { uid, reason }
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

    // Delete Firebase Auth account
    await admin.auth().deleteUser(uid);

    // Delete Firestore user document
    await db.collection('users').doc(uid).delete();

    // Delete employee document
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

// ─── Export verifyToken & verifyRole for use in other routes
module.exports = router;
module.exports.verifyToken = verifyToken;
module.exports.verifyRole = verifyRole;