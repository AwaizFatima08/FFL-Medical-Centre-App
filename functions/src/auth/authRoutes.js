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

const verifyRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      if (!userDoc.exists) {
        return errorResponse(res, 'User record not found', 404);
      }
      const userData = userDoc.data();
      if (userData.isActive !== true) {
        return errorResponse(res, 'Account is disabled or not yet active. Please contact your administrator.', 403);
      }
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

router.post('/register', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const {
      fullName,
      phoneNumber,
      employeeNumber,
      dateOfBirth,
      gender,
      cnic,
      maritalStatus,
      isSmoker,
      townshipResidentWithFamily,
      townshipResidentBachelor,
      residenceType,
      houseNumber,
      roomNumber,
      cityOfResidence,
    } = req.body;

    if (!fullName || !phoneNumber || !employeeNumber || !dateOfBirth || !gender || !cnic || !maritalStatus || isSmoker === undefined || isSmoker === null) {
      return errorResponse(res, 'fullName, phoneNumber, employeeNumber, dateOfBirth, gender, cnic, maritalStatus and isSmoker are required', 400);
    }

    const parsedDob = new Date(dateOfBirth);
    if (isNaN(parsedDob.getTime())) {
      return errorResponse(res, 'dateOfBirth must be a valid date', 400);
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
      dateOfBirth:         admin.firestore.Timestamp.fromDate(parsedDob),
      gender,
      cnic,
      maritalStatus,
      isSmoker:            isSmoker === true,
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
      const adminSnap = await db.collection('users')
        .where('role', '==', ROLES.ADMIN_INCHARGE)
        .where('isActive', '==', true)
        .get();

      const adminEmails = adminSnap.docs
        .map(doc => doc.data().email)
        .filter(email => !!email);

      if (adminEmails.length === 0) {
        console.warn('No active admin_incharge account with an email found — signup notification not sent.');
      } else {
        await db.collection('mail').add({
          to: adminEmails,
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
      }
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

// Address-duplicate check (this revision) — houseNumber (family
// residents) or roomNumber (bachelor residents), whichever this signup
// has, checked against every OTHER employee record for the same value.
// This is informational only — never blocks approval — since a shared
// address is often legitimate (e.g. a working couple sharing one
// company house), not automatically a mistake. Deliberately queries
// the `employees` collection directly rather than `users`: an employees
// doc only ever disappears when POST /reject-user deletes it, so every
// remaining doc — whether its account is active, disabled, or still
// pending approval — is a real, current record. One query therefore
// naturally covers all three statuses without three separate queries.
// Status per match is resolved from the matched employee's own `users`
// doc so the admin can see *why* it's flagged, not just that it matched.
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
      const employeeId = empSnap.empty ? null : empSnap.docs[0].id;

      let duplicateAddressMatches = [];
      const addressField = empData.houseNumber ? 'houseNumber' : (empData.roomNumber ? 'roomNumber' : null);
      const addressValue = addressField ? empData[addressField] : null;

      if (addressField && addressValue) {
        const dupSnap = await db.collection('employees')
          .where(addressField, '==', addressValue)
          .get();

        const otherDocs = dupSnap.docs.filter(d => d.id !== employeeId);

        duplicateAddressMatches = await Promise.all(otherDocs.map(async (dupDoc) => {
          const dupData = dupDoc.data();
          let status = 'unknown';
          try {
            const dupUserDoc = await db.collection('users').doc(dupData.userId).get();
            if (dupUserDoc.exists) {
              const dUserData = dupUserDoc.data();
              status = !dUserData.approvedAt ? 'pending' : (dUserData.isActive ? 'active' : 'disabled');
            }
          } catch (_) {
            // Leave status as 'unknown' — the match itself still matters
            // even if the linked user lookup fails for some reason.
          }

          return {
            employeeId:             dupDoc.id,
            fullName:               dupData.fullName || '—',
            officialEmployeeNumber: dupData.officialEmployeeNumber || '—',
            status,
          };
        }));
      }

      return {
        uid:                    userDoc.id,
        email:                  userData.email || null,
        phone:                  userData.phone || null,
        role:                   userData.role,
        createdAt:              userData.createdAt,
        fullName:               empData.fullName               || '—',
        officialEmployeeNumber: empData.officialEmployeeNumber || '—',
        phoneNumber:            empData.phoneNumber || userData.phone || '—',
        employeeId,
        houseNumber:             empData.houseNumber || null,
        roomNumber:              empData.roomNumber || null,
        duplicateAddressMatches,
      };
    }));

    pending.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return successResponse(res, pending, 'Pending users fetched');
  } catch (error) {
    console.error('Pending users error:', error);
    return errorResponse(res, 'Failed to fetch pending users', 500);
  }
});

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

    if (role === ROLES.DOCTOR || role === ROLES.CMO) {
      const availRef = db.collection('doctorAvailability').doc(uid);
      const availSnap = await availRef.get();
      if (!availSnap.exists) {
        const fullName = empSnap.empty ? '—' : empSnap.docs[0].data().fullName;
        await availRef.set({
          currentStatus: 'available',
          isAvailable:   true,
          fullName,
          role,
          updatedBy:     req.user.uid,
          updatedAt:     nowISO(),
        });
      }
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

    const batch = db.batch();
    const now = nowISO();

    batch.update(db.collection('users').doc(uid), {
      isActive:    false,
      disabledBy:  req.user.uid,
      disabledAt:  now,
    });

    const familySnap = await db.collection('familyMembers')
      .where('employeeId', '==', uid)
      .where('isActive', '==', true)
      .get();

    familySnap.docs.forEach(doc => {
      batch.update(doc.ref, {
        isActive:       false,
        disabledReason: 'sponsor_deactivated',
        disabledAt:     now,
        disabledBy:     req.user.uid,
        updatedAt:      now,
      });
    });

    await batch.commit();

    return successResponse(res,
      { uid, familyMembersDisabled: familySnap.size },
      'User disabled successfully'
    );
  } catch (error) {
    console.error('Disable user error:', error);
    return errorResponse(res, 'Failed to disable user', 500);
  }
});

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

    const batch = db.batch();
    const now = nowISO();

    batch.update(db.collection('users').doc(uid), {
      isActive:      true,
      reEnabledBy:   req.user.uid,
      reEnabledAt:   now,
    });

    const familySnap = await db.collection('familyMembers')
      .where('employeeId', '==', uid)
      .where('isActive', '==', false)
      .where('disabledReason', '==', 'sponsor_deactivated')
      .get();

    familySnap.docs.forEach(doc => {
      batch.update(doc.ref, {
        isActive:       true,
        disabledReason: null,
        disabledAt:     null,
        disabledBy:     null,
        reEnabledAt:    now,
        reEnabledBy:    req.user.uid,
        updatedAt:      now,
      });
    });

    await batch.commit();

    return successResponse(res,
      { uid, familyMembersReEnabled: familySnap.size },
      'User re-enabled successfully'
    );
  } catch (error) {
    console.error('Enable user error:', error);
    return errorResponse(res, 'Failed to enable user', 500);
  }
});

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

module.exports = router;
module.exports.verifyToken = verifyToken;
module.exports.verifyRole  = verifyRole;