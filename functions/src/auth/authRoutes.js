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
// Day 14 (Phase 4, Step C): cnic and maritalStatus added — captured at
// signup per PHASE4_DESIGN.md §3. Both required, same as the other
// identity fields below. cnic is admin-owned after this point (see
// employeeRoutes.js PUT /:employeeId, Step A) — this is the only place
// it's ever self-entered. maritalStatus stays employee-editable later.
router.post('/register', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      fullName,
      phoneNumber,
      employeeNumber,
      cnic,           // ← Day 14, Step C
      maritalStatus,  // ← Day 14, Step C
      isSmoker,       // ← Day 14 fix #5
      townshipResidentWithFamily,
      townshipResidentBachelor,
      residenceType,
      houseNumber,
      roomNumber,
      cityOfResidence,
    } = req.body;

    if (!fullName || !phoneNumber || !employeeNumber || !cnic || !maritalStatus || isSmoker === undefined || isSmoker === null) {
      return errorResponse(res, 'fullName, phoneNumber, employeeNumber, cnic, maritalStatus and isSmoker are required', 400);
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

    // Day 14, Step C — CNIC is identity data, same duplicate-guard treatment
    // as employee number above.
    const cnicCheck = await db.collection('employees')
      .where('cnic', '==', cnic)
      .get();
    if (!cnicCheck.empty) {
      return errorResponse(res, 'This CNIC is already registered', 409);
    }

    const batch = db.batch();

    const userRef = db.collection('users').doc(req.user.uid);
    batch.set(userRef, {
      email:       req.user.email || null,
      phone:       phoneNumber,
      role:        ROLES.EMPLOYEE,
      isActive:    false,
      approvedAt:  null,
      createdAt:   nowISO(),
      lastLoginAt: nowISO(),
    });

    const employeeData = {
      userId:                 req.user.uid,
      fullName,
      officialEmployeeNumber: employeeNumber,
      phoneNumber,
      cnic,           // ← Day 14, Step C
      maritalStatus,  // ← Day 14, Step C
      isSmoker:            isSmoker === true, // ← Day 14 fix #5
      // Day 14, Fix #2 — set explicitly at signup, not left undefined.
      // A married-at-signup employee needs this set to 'needs_update' so
      // they actually show up in admin's flagged-employee query later
      // (Firestore's 'in' filter never matches a field that's simply
      // missing from the document).
      familyDataStatus:    maritalStatus === 'married' ? 'needs_update' : 'not_applicable',
      familyDataFlagNote:  null,
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

// ─── POST /confirm-profile ────────────────────────────────
// Day 14 (Phase 4, Step B): repurposed from the old, unused /complete-profile
// route. That route let an employee self-write cnic/designation/department/
// bloodGroup/maritalStatus/houseNumber/etc in one unguarded call — but per
// the Phase 4 design, admin enters that data (medical centre already holds
// it), and the employee's only job post-approval is to CONFIRM it's correct
// and set their blood donor consent. Nothing called the old route, so this
// is a clean repurpose, not a breaking change.
//
// dataConfirmed must be explicitly true — this is the employee ticking
// "I confirm the data above is correct" (see PHASE4_DESIGN.md §5).
//
// bloodDonorConsent write logic below intentionally mirrors employeeRoutes.js
// PUT /:employeeId's blood donor registry handling — kept manually in sync
// rather than extracted into a shared helper, to keep this file simple. If
// you change one, check the other.
router.post('/confirm-profile', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const { dataConfirmed, bloodDonorConsent } = req.body;

    if (dataConfirmed !== true) {
      return errorResponse(res, 'dataConfirmed must be true to submit this confirmation', 400);
    }

    const empQuery = await db.collection('employees')
      .where('userId', '==', req.user.uid)
      .get();

    if (empQuery.empty) {
      return errorResponse(res, 'Employee record not found', 404);
    }

    const empDoc = empQuery.docs[0];
    const empData = empDoc.data();

    const updates = {
      dataConfirmedByEmployee: true,
      dataConfirmedAt:         nowISO(),
    };

    if (bloodDonorConsent !== undefined) {
      updates.bloodDonorConsent = bloodDonorConsent;

      const donorRef = db.collection('bloodDonorRegistry').doc(empDoc.id);
      if (bloodDonorConsent && empData.bloodGroup) {
        await donorRef.set({
          employeeId:             empDoc.id,
          userId:                 req.user.uid,
          fullName:               empData.fullName,
          officialEmployeeNumber: empData.officialEmployeeNumber || null,
          bloodGroup:             empData.bloodGroup,
          phoneNumber:            empData.phoneNumber,
          consentGiven:           true,
          consentUpdatedAt:       nowISO(),
        });
      } else if (!bloodDonorConsent) {
        await donorRef.delete();
      }
    }

    await empDoc.ref.update(updates);

    return successResponse(res, null, 'Profile confirmed successfully');

  } catch (error) {
    console.error('Confirm profile error:', error);
    return errorResponse(res, 'Profile confirmation failed', 500);
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
// Day 16 (Phase 5, Step 5.6.1) — also marks a driver on-duty at login.
// Only meaningful for the driver role; harmless no-op field for everyone
// else. This is the natural, already-existing hook LoginScreen.js calls
// right after every successful sign-in, so no new call site was needed on
// the login side — only the off-duty counterpart below is new.
router.post('/update-last-login', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();

    const updates = { lastLoginAt: nowISO() };
    if (userDoc.exists && userDoc.data().role === ROLES.DRIVER) {
      updates.onDuty = true;
    }

    await userRef.update(updates);
    return successResponse(res, null, 'Last login updated');
  } catch (error) {
    return errorResponse(res, 'Failed to update login time', 500);
  }
});

// ─── POST /set-off-duty ────────────────────────────────────
// Day 16 (Phase 5, Step 5.6.1) — called by DriverHome.js immediately
// before signOut, so the on-duty flag doesn't stay stuck true after a
// driver logs out. Driver-only. Powers ambulance auto-assign
// (ambulanceRoutes.js) and the on-duty info box shown to reception.
router.post('/set-off-duty', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists || userDoc.data().role !== ROLES.DRIVER) {
      return errorResponse(res, 'Driver access only', 403);
    }

    await userRef.update({ onDuty: false });
    return successResponse(res, null, 'Marked off duty');
  } catch (error) {
    return errorResponse(res, 'Failed to update duty status', 500);
  }
});

// ─── GET /pending-users ───────────────────────────────────
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
        // Day 14 fix #6 — surfaced here so Manage Users can flag it without
        // an extra read per employee.
        correctionRequested:    empData.correctionRequested || false,
        correctionRequestNote:  empData.correctionRequestNote || null,
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