// functions/src/vaccination/vaccinationRoutes.js
// Firebase Functions v2 — compatible with existing index.js
// ─────────────────────────────────────────────────────────────────────────────

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule }        = require('firebase-functions/v2/scheduler');
const admin                 = require('firebase-admin');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');

// ─── Inline constants ─────────────────────────────────────────────────────────
const VACCINATION_NURSE = {
  name:         'Zulaikha Yameen',
  designation:  'In-charge Nurse',
  organisation: 'Fatima Fertilizer Medical Centre',
};
const CMO_CREDENTIALS = {
  name:         'Dr. Humayun Shahzad',
  designation:  'Chief Medical Officer',
  organisation: 'Fatima Fertilizer Medical Centre',
};
const VACCINATION_REPORT_DISCLAIMER =
  'This is an electronically generated report from the official FFL Medical Centre App ' +
  'and does not require further signature or manual validation.';

const REGION = 'asia-south1';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getFCMTokensByRole(role) {
  const db   = admin.firestore();
  const snap = await db.collection('users')
    .where('role',     '==', role)
    .where('isActive', '==', true)
    .get();
  return snap.docs.map(d => d.data().fcmToken).filter(Boolean);
}

async function sendMulticast(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) return;
  try {
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: { priority: 'high' },
    });
  } catch (err) {
    console.error('FCM multicast error:', err.message);
  }
}

// Same shape as notificationRoutes.createNotification — GET /my filters on
// recipientUid and orders by an ISO-string createdAt. These previously wrote
// `userId` + a server Timestamp, so nobody ever saw them in the app.
async function saveNotification(uid, title, body, type, referenceId = null) {
  const db = admin.firestore();
  await db.collection('notifications').add({
    recipientUid:  uid,
    recipientRole: null,
    title,
    body,
    type,
    referenceId,
    isRead:    false,
    createdAt: new Date().toISOString(),
  });
}

// users docs carry no name — it lives on the linked employees record.
async function employeeNameByUid(uid, fallback) {
  if (!uid) return fallback;
  const snap = await admin.firestore().collection('employees')
    .where('userId', '==', uid).limit(1).get();
  return snap.empty ? fallback : (snap.docs[0].data().fullName || fallback);
}

const tsToISO = (ts) => (ts && ts.toDate ? ts.toDate().toISOString() : null);

// Per-child counts stored on the familyMembers doc so the nurse's child list
// needs one read per child instead of reading every vaccination record.
// Overdue / due-soon depend on "today", so the client derives them from
// scheduledDates.
function buildVaxSummary(records) {
  const live = records.filter(r => r.status !== 'na');
  return {
    total:          live.length,
    administered:   live.filter(r => r.status === 'administered').length,
    missed:         live.filter(r => r.status === 'missed').length,
    scheduledDates: live.filter(r => r.status === 'scheduled')
      .map(r => tsToISO(r.plannedDate)).filter(Boolean).sort(),
    updatedAt:      new Date().toISOString(),
  };
}

async function refreshVaxSummary(memberId) {
  const db   = admin.firestore();
  const snap = await db.collection('vaccinationRecords')
    .where('familyMemberId', '==', memberId).get();
  await db.collection('familyMembers').doc(memberId).set(
    { vaxSummary: buildVaxSummary(snap.docs.map(d => d.data())) },
    { merge: true },
  );
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1 — onFamilyMemberValidated
// Fires when admin sets status to 'validated' on a son/daughter record
// Creates all vaccinationRecords for that child
// ─────────────────────────────────────────────────────────────────────────────
// Creates every vaccinationRecord for a child from the active schedule.
// Returns how many were created (0 if the child already has records or the
// schedule is empty). Shared by the trigger below and the backfill script.
async function createVaccinationSchedule(memberId, member) {
  const db  = admin.firestore();
  const now = Timestamp.now();

  const existingQ = await db.collection('vaccinationRecords')
    .where('familyMemberId', '==', memberId)
    .limit(1)
    .get();
  if (!existingQ.empty) return 0;

  const scheduleSnap = await db.collection('vaccineSchedule')
    .where('isActive', '==', true)
    .get();
  const schedule = scheduleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (schedule.length === 0) return 0;

  const dob   = member.dateOfBirth.toDate();
  const today = new Date();
  const batch = db.batch();
  const created = [];

  for (const vaccine of schedule) {
    let plannedDate = new Date(dob);
    if (vaccine.ageUnit === 'weeks') {
      plannedDate = addDays(dob, vaccine.ageValue * 7);
    } else if (vaccine.ageUnit === 'months') {
      plannedDate = new Date(dob);
      plannedDate.setMonth(plannedDate.getMonth() + vaccine.ageValue);
    }

    let status        = 'scheduled';
    let naReason      = null;
    let nurseOverride = false;

    // Check maximum age cutoff
    if (vaccine.maximumAgeDays) {
      const maxDate = addDays(dob, vaccine.maximumAgeDays);
      if (today > maxDate) {
        status   = 'na';
        naReason = `Maximum age limit exceeded (${vaccine.maximumAgeDays} days)`;
      }
    }

    // Flag backlog entries for nurse review
    if (status === 'scheduled' && plannedDate < today) {
      nurseOverride = true;
    }

    const recRef = db.collection('vaccinationRecords').doc();
    created.push({ status, plannedDate: Timestamp.fromDate(plannedDate) });
    batch.set(recRef, {
      familyMemberId:    memberId,
      employeeId:        member.employeeId,
      vaccineScheduleId: vaccine.id,
      vaccineName:       vaccine.vaccineName,
      doseNumber:        vaccine.doseNumber,
      status,
      plannedDate:       Timestamp.fromDate(plannedDate),
      actualDate:        null,
      nurseOverride,
      overrideReason:    nurseOverride
        ? 'Backlog — child registered after due date'
        : null,
      naReason,
      administeredBy:    VACCINATION_NURSE.name,
      adverseReaction:   null,
      createdAt:         now,
      updatedAt:         now,
    });
  }

  batch.set(db.collection('familyMembers').doc(memberId), {
    vaxSummary:  buildVaxSummary(created),
    sponsorName: await employeeNameByUid(member.employeeId, null),
  }, { merge: true });
  await batch.commit();
  return created.length;
}

exports.onFamilyMemberValidated = onDocumentUpdated(
  { document: 'familyMembers/{memberId}', region: REGION },
  async (event) => {
    const before   = event.data.before.data();
    const after    = event.data.after.data();
    const memberId = event.params.memberId;

    if (before.status === after.status) return null;
    if (after.status  !== 'validated')  return null;
    if (after.relation !== 'son' && after.relation !== 'daughter') return null;

    try {
      const createdCount = await createVaccinationSchedule(memberId, after);
      if (createdCount === 0) return null;
      console.log(`Created ${createdCount} vaccination records for ${memberId}`);

      // Notify nurse
      const nurseTokens = await getFCMTokensByRole('nurse');
      await sendMulticast(
        nurseTokens,
        'New Child Registered',
        `${after.name} has been validated. Vaccination schedule created.`,
        { type: 'vaccination_new_child', memberId },
      );

      return null;
    } catch (err) {
      console.error('onFamilyMemberValidated error:', err);
      return null;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2 — onFamilyMemberEdited
// Fires when pendingRevision changes from null to an object
// Notifies admin to review the edit
// ─────────────────────────────────────────────────────────────────────────────
exports.onFamilyMemberEdited = onDocumentUpdated(
  { document: 'familyMembers/{memberId}', region: REGION },
  async (event) => {
    const before   = event.data.before.data();
    const after    = event.data.after.data();
    const memberId = event.params.memberId;

    // Only fire when pendingRevision goes from null to an object
    if (before.pendingRevision || !after.pendingRevision) return null;

    const db = admin.firestore();

    try {
      const empName = await employeeNameByUid(after.employeeId, 'An employee');

      const title = 'Family Record Edit Pending';
      const body  = `${empName} submitted an edit for ${after.name}. Please review.`;

      const adminTokens = await getFCMTokensByRole('admin_incharge');
      await sendMulticast(adminTokens, title, body, {
        type: 'family_edit_pending',
        memberId,
      });

      const adminSnap = await db.collection('users')
        .where('role',     '==', 'admin_incharge')
        .where('isActive', '==', true)
        .get();
      await Promise.all(adminSnap.docs.map(d =>
        saveNotification(d.id, title, body, 'family', memberId),
      ));

      return null;
    } catch (err) {
      console.error('onFamilyMemberEdited error:', err);
      return null;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3 — onVaccinationAdministered
// Fires when a vaccinationRecord status changes to 'administered'
// Auto-recalculates next dose planned date if drift > 3 days
// ─────────────────────────────────────────────────────────────────────────────
exports.onVaccinationAdministered = onDocumentUpdated(
  { document: 'vaccinationRecords/{recordId}', region: REGION },
  async (event) => {
    const before   = event.data.before.data();
    const after    = event.data.after.data();
    const recordId = event.params.recordId;

    const plannedChanged = String(tsToISO(before.plannedDate)) !== String(tsToISO(after.plannedDate));
    if ((before.status !== after.status || plannedChanged) && after.familyMemberId) {
      try {
        await refreshVaxSummary(after.familyMemberId);
      } catch (err) {
        console.error('refreshVaxSummary error:', err);
      }
    }

    if (before.status === after.status)   return null;
    if (after.status  !== 'administered') return null;

    // Skip backlog entries — nurse manages manually
    if (after.nurseOverride) return null;

    const db = admin.firestore();

    try {
      if (!after.vaccineScheduleId) return null;
      const schDoc = await db.collection('vaccineSchedule')
        .doc(after.vaccineScheduleId).get();
      if (!schDoc.exists) return null;
      const schedule = schDoc.data();
      if (!schedule.minimumIntervalDays) return null;

      const actualDate  = after.actualDate.toDate();
      const plannedDate = after.plannedDate.toDate();
      const diffDays    = Math.abs(
        (actualDate - plannedDate) / (1000 * 60 * 60 * 24)
      );

      if (diffDays <= 3) return null;

      // Find next scheduled dose for same vaccine and child
      const nextQ = await db.collection('vaccinationRecords')
        .where('familyMemberId', '==', after.familyMemberId)
        .where('vaccineName',    '==', after.vaccineName)
        .where('status',         '==', 'scheduled')
        .get();

      if (nextQ.empty) return null;

      const candidates = nextQ.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.id !== recordId)
        .sort((a, b) => a.plannedDate.toDate() - b.plannedDate.toDate());

      if (candidates.length === 0) return null;

      const autoNext = addDays(actualDate, schedule.minimumIntervalDays);
      await db.collection('vaccinationRecords').doc(candidates[0].id).update({
        plannedDate:   Timestamp.fromDate(autoNext),
        nurseOverride: true,
        overrideReason:'Auto-adjusted based on actual administration date',
        updatedAt:     FieldValue.serverTimestamp(),
      });

      console.log(`Next ${after.vaccineName} dose shifted to ${autoNext.toISOString()}`);
      return null;
    } catch (err) {
      console.error('onVaccinationAdministered error:', err);
      return null;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 4 — dailyVaccinationReminder
// Every day at 08:00 PKT — notifies nurse of today's scheduled vaccines
// ─────────────────────────────────────────────────────────────────────────────
exports.dailyVaccinationReminder = onSchedule(
  // Cron was UTC-offset math ('0 3' = 08:00 PKT in UTC) left over from
  // before timeZone was added below — with timeZone set, the scheduler
  // reads '0 3' as 3:00 AM Karachi time directly, firing 5 hours early.
  // Fixed to state the intended local time plainly.
  { schedule: '0 8 * * *', timeZone: 'Asia/Karachi', region: REGION },
  async () => {
    const db    = admin.firestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    try {
      const snap = await db.collection('vaccinationRecords')
        .where('status',      '==', 'scheduled')
        .where('plannedDate', '>=', Timestamp.fromDate(today))
        .where('plannedDate', '<',  Timestamp.fromDate(tomorrow))
        .get();

      if (snap.empty) {
        console.log('No vaccinations due today');
        return null;
      }

      const records    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const childIds   = [...new Set(records.map(r => r.familyMemberId))];
      const childNames = {};
      await Promise.all(childIds.map(async (cid) => {
        const cDoc      = await db.collection('familyMembers').doc(cid).get();
        childNames[cid] = cDoc.exists ? cDoc.data().name : 'Unknown';
      }));

      const lines = records.map(r =>
        `${childNames[r.familyMemberId]} — ${r.vaccineName} (${r.doseNumber})`,
      );

      const nurseTokens = await getFCMTokensByRole('nurse');
      await sendMulticast(
        nurseTokens,
        `Vaccinations Due Today (${records.length})`,
        lines.join('\n'),
        { type: 'daily_vaccination_reminder' },
      );

      console.log(`Daily reminder sent — ${records.length} doses due`);
      return null;
    } catch (err) {
      console.error('dailyVaccinationReminder error:', err);
      return null;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 5 — missedAppointmentDetector
// Every day at 23:00 PKT — marks overdue scheduled records as 'missed'
// ─────────────────────────────────────────────────────────────────────────────
exports.missedAppointmentDetector = onSchedule(
  // Same UTC/local mismatch as dailyVaccinationReminder above — fixed to
  // the intended 23:00 PKT.
  { schedule: '0 23 * * *', timeZone: 'Asia/Karachi', region: REGION },
  async () => {
    const db    = admin.firestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const snap = await db.collection('vaccinationRecords')
        .where('status',      '==', 'scheduled')
        .where('plannedDate', '<',  Timestamp.fromDate(today))
        .get();

      if (snap.empty) return null;

      const batch = db.batch();
      snap.docs.forEach(d => {
        batch.update(d.ref, {
          status:    'missed',
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();

      console.log(`Marked ${snap.size} records as missed`);
      return null;
    } catch (err) {
      console.error('missedAppointmentDetector error:', err);
      return null;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 6 — fridayWeeklyReport
// Every Friday at 07:00 PKT — generates weekly HTML report to Storage
// Saves URL to vaccinationReports collection — nurse downloads in app
// ─────────────────────────────────────────────────────────────────────────────
exports.fridayWeeklyReport = onSchedule(
  // Same UTC/local mismatch as dailyVaccinationReminder above — fixed to
  // the intended 07:00 PKT on Fridays.
  { schedule: '0 7 * * 5', timeZone: 'Asia/Karachi', region: REGION },
  async () => {
    const db    = admin.firestore();
    const today = new Date();
    const dow   = today.getDay();

    const toMon  = (8 - dow) % 7 || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() + toMon);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const lastMon = new Date(today);
    lastMon.setDate(today.getDate() - (dow - 1));
    lastMon.setHours(0, 0, 0, 0);

    try {
      const upcomingSnap = await db.collection('vaccinationRecords')
        .where('status',      '==', 'scheduled')
        .where('plannedDate', '>=', Timestamp.fromDate(monday))
        .where('plannedDate', '<=', Timestamp.fromDate(sunday))
        .get();

      const missedSnap = await db.collection('vaccinationRecords')
        .where('status',      '==', 'missed')
        .where('plannedDate', '>=', Timestamp.fromDate(lastMon))
        .where('plannedDate', '<',  Timestamp.fromDate(monday))
        .get();

      const upcoming = upcomingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const missed   = missedSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const allIds = [...new Set([...upcoming, ...missed].map(r => r.familyMemberId))];
      const names  = {};
      await Promise.all(allIds.map(async (cid) => {
        const d    = await db.collection('familyMembers').doc(cid).get();
        names[cid] = d.exists ? d.data().name : '—';
      }));

      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const byDay     = {};
      upcoming.forEach(r => {
        const d = r.plannedDate.toDate();
        const k = `${dayLabels[d.getDay()]} ${formatDate(r.plannedDate)}`;
        if (!byDay[k]) byDay[k] = [];
        byDay[k].push(r);
      });

      const monStr = monday.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
      const sunStr = sunday.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });

      let upRows = '';
      Object.entries(byDay).forEach(([day, recs]) => {
        upRows += `<tr style="background:#dbeafe;"><td colspan="3" style="padding:8px 12px;font-weight:700;color:#1e3a5f;">${day}</td></tr>`;
        recs.forEach(r => {
          upRows += `<tr>
            <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;">${names[r.familyMemberId]}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;">${r.vaccineName}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;">${r.doseNumber}</td>
          </tr>`;
        });
      });

      let miRows = '';
      missed.forEach(r => {
        miRows += `<tr>
          <td style="padding:7px 12px;color:#991b1b;">${names[r.familyMemberId]}</td>
          <td style="padding:7px 12px;">${r.vaccineName}</td>
          <td style="padding:7px 12px;">${r.doseNumber}</td>
          <td style="padding:7px 12px;">${formatDate(r.plannedDate)}</td>
        </tr>`;
      });

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  body { font-family:Arial,sans-serif; padding:32px 40px; color:#1e293b; font-size:13px; }
  h1   { color:#1e3a5f; margin-bottom:4px; }
  h2   { color:#1e3a5f; margin:20px 0 8px; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  thead tr { background:#1e3a5f; }
  thead th { padding:8px 12px; color:#fff; text-align:left; font-size:12px; }
  .footer { margin-top:32px; border-top:1px solid #e2e8f0; padding-top:16px; display:flex; justify-content:space-between; }
  .disclaimer { font-size:10px; color:#94a3b8; text-align:center; margin-top:12px; font-style:italic; }
</style>
</head><body>
<h1>Fatima Fertilizer Medical Centre</h1>
<p style="color:#64748b;">Weekly Vaccination Report &nbsp;·&nbsp; ${monStr} — ${sunStr}<br/>
Generated: ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})}</p>

<h2>Upcoming Vaccinations (${upcoming.length})</h2>
<table>
  <thead><tr><th>Child</th><th>Vaccine</th><th>Dose</th></tr></thead>
  <tbody>${upRows || '<tr><td colspan="3" style="padding:10px 12px;color:#64748b;">None scheduled this week.</td></tr>'}</tbody>
</table>

<h2>No-Shows from Past Week (${missed.length})</h2>
<table>
  <thead><tr><th>Child</th><th>Vaccine</th><th>Dose</th><th>Was Planned</th></tr></thead>
  <tbody>${miRows || '<tr><td colspan="4" style="padding:10px 12px;color:#64748b;">None.</td></tr>'}</tbody>
</table>

<div class="footer">
  <div>
    <div style="font-weight:700;color:#1e3a5f;">${VACCINATION_NURSE.name}</div>
    <div style="color:#64748b;font-size:11px;">${VACCINATION_NURSE.designation}</div>
    <div style="color:#64748b;font-size:11px;">${VACCINATION_NURSE.organisation}</div>
  </div>
  <div style="text-align:right;">
    <div style="font-weight:700;color:#1e3a5f;">${CMO_CREDENTIALS.name}</div>
    <div style="color:#64748b;font-size:11px;">${CMO_CREDENTIALS.designation}</div>
    <div style="color:#64748b;font-size:11px;">${CMO_CREDENTIALS.organisation}</div>
  </div>
</div>
<div class="disclaimer">${VACCINATION_REPORT_DISCLAIMER}</div>
</body></html>`;

      const bucket   = admin.storage().bucket();
      const dateStr  = today.toISOString().split('T')[0];
      const fileName = `reports/weekly/vaccination_${dateStr}.html`;
      const file     = bucket.file(fileName);
      await file.save(html, { contentType: 'text/html' });
      await file.makePublic();
      const url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

      await db.collection('vaccinationReports').add({
        weekStart:   Timestamp.fromDate(monday),
        weekEnd:     Timestamp.fromDate(sunday),
        url,
        upcoming:    upcoming.length,
        missed:      missed.length,
        generatedAt: FieldValue.serverTimestamp(),
      });

      // Notify nurse in-app
      const nurseSnap = await db.collection('users')
        .where('role',     '==', 'nurse')
        .where('isActive', '==', true)
        .get();
      await Promise.all(nurseSnap.docs.map(d =>
        saveNotification(
          d.id,
          'Weekly Vaccination Report Ready',
          `Report for ${monStr}–${sunStr}: ${upcoming.length} doses scheduled, ${missed.length} no-shows.`,
          'vaccination',
        ),
      ));

      console.log(`Weekly report saved: ${url}`);
      return null;
    } catch (err) {
      console.error('fridayWeeklyReport error:', err);
      return null;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 7 — childTurns25Notifier
// Every day at 08:05 PKT — notifies admin when a child turns 25
// Record stays validated — no flag, no disruption to employee
// ─────────────────────────────────────────────────────────────────────────────
exports.childTurns25Notifier = onSchedule(
  // Same UTC/local mismatch as dailyVaccinationReminder above — fixed to
  // the intended 08:05 PKT.
  { schedule: '5 8 * * *', timeZone: 'Asia/Karachi', region: REGION },
  async () => {
    const db = admin.firestore();

    try {
      // Only children born on this calendar day 25 years ago are read —
      // previously every validated child was read every day. Dates are
      // compared in Pakistan time: DOBs are stored as local midnight, which
      // is the previous day in UTC.
      const PK_OFFSET_MS = 5 * 60 * 60 * 1000;
      const DAY_MS       = 24 * 60 * 60 * 1000;
      const nowPk  = new Date(Date.now() + PK_OFFSET_MS);
      const target = Date.UTC(nowPk.getUTCFullYear() - 25, nowPk.getUTCMonth(), nowPk.getUTCDate()) - PK_OFFSET_MS;

      const snap = await db.collection('familyMembers')
        .where('relation', 'in', ['son', 'daughter'])
        .where('status',   '==', 'validated')
        .where('isActive', '==', true)
        .where('dateOfBirth', '>=', Timestamp.fromMillis(target - DAY_MS))
        .where('dateOfBirth', '<',  Timestamp.fromMillis(target + 2 * DAY_MS))
        .get();

      const turning25 = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => {
          const dobPk = new Date(m.dateOfBirth.toMillis() + PK_OFFSET_MS);
          return dobPk.getUTCDate()  === nowPk.getUTCDate() &&
                 dobPk.getUTCMonth() === nowPk.getUTCMonth() &&
                 dobPk.getUTCFullYear() === nowPk.getUTCFullYear() - 25;
        });

      if (turning25.length === 0) return null;

      const adminTokens = await getFCMTokensByRole('admin_incharge');
      const adminSnap   = await db.collection('users')
        .where('role',     '==', 'admin_incharge')
        .where('isActive', '==', true)
        .get();

      for (const member of turning25) {
        const empName = member.sponsorName || await employeeNameByUid(member.employeeId, 'Unknown Employee');

        const title = 'Dependent Turned 25';
        const body  = `${member.name}, dependent of ${empName}, has turned 25. Please review marital and employment status.`;

        await sendMulticast(adminTokens, title, body, {
          type:     'dependent_turned_25',
          memberId: member.id,
        });

        await Promise.all(adminSnap.docs.map(d =>
          saveNotification(d.id, title, body, 'family', member.id),
        ));
      }

      console.log(`childTurns25Notifier: ${turning25.length} notification(s) sent`);
      return null;
    } catch (err) {
      console.error('childTurns25Notifier error:', err);
      return null;
    }
  }
);

// For scripts/migrateOrgAndVaccination.js
exports.createVaccinationSchedule = createVaccinationSchedule;
exports.refreshVaxSummary         = refreshVaxSummary;
exports.employeeNameByUid         = employeeNameByUid;
