// scripts/wipeTestData.js
//
// Pre-launch data wipe. Clears every collection except:
//   - config/dropdowns (structural — the app cannot function without it)
//   - ONE surviving admin account, in both `users` and `employees`
//
// Everything else is wiped, including `vaccineSchedule` — despite looking
// structural, Vaccination is deliberately unreviewed V2 scope (per
// COMMAND_BOARD.md, Day 24) and none of its current data is trusted as real.
//
// Uses db.recursiveDelete() for every document — this also removes known
// subcollections (employees/{id}/private/medical, doctorAvailability/{id}/
// statusLog) and any others, in one call per doc, rather than needing
// separate manual subcollection cleanup. Requires firebase-admin >= 10.5.0.
//
// Firebase Auth accounts are deleted too, not just Firestore docs — leaving
// them would block future signup with the same email and orphan the
// `users` collection's 1:1 relationship with Auth.
//
// ── SAFETY ──────────────────────────────────────────────────────────────
// Dry-run by default. Prints exactly what would be deleted and what
// survives — deletes NOTHING until you re-run with --confirm.
//
// ── USAGE ───────────────────────────────────────────────────────────────
//   node scripts/wipeTestData.js <admin-email-or-employee-number>
//     → dry run, shows the plan, deletes nothing
//
//   node scripts/wipeTestData.js <admin-email-or-employee-number> --confirm
//     → actually performs the wipe
//
// Example:
//   node scripts/wipeTestData.js homi.home@gmail.com
//   node scripts/wipeTestData.js homi.home@gmail.com --confirm

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Every top-level collection EXCEPT `config` — that one is never touched,
// full stop, not even listed here as a safeguard against a future
// copy-paste mistake adding it back in.
const COLLECTIONS_TO_WIPE_FULLY = [
  'ambulanceRequests',
  'bloodDonorRegistry',
  'circulars',
  'doctorAvailability',
  'doctorDirectory',
  'familyMembers',
  'feedback',
  'fitnessAppointments',
  'healthTips',
  'mail',
  'notifications',
  'suggestions',
  'tripBookings',
  'vaccinationRecords',
  'vaccinationReports',
  'vaccineSchedule',
];

// These two get wiped too, but with one document excluded — the admin.
const COLLECTIONS_WITH_ADMIN_EXCLUDED = ['users', 'employees'];

async function resolveAdmin(identifier) {
  const isEmail = identifier.includes('@');

  if (isEmail) {
    const userSnap = await db.collection('users')
      .where('email', '==', identifier)
      .limit(1)
      .get();
    if (userSnap.empty) {
      throw new Error(`No users document found with email "${identifier}".`);
    }
    const userDoc = userSnap.docs[0];
    const empSnap = await db.collection('employees')
      .where('userId', '==', userDoc.id)
      .limit(1)
      .get();
    return {
      uid: userDoc.id,
      userData: userDoc.data(),
      employeeId: empSnap.empty ? null : empSnap.docs[0].id,
    };
  }

  // Treat as an official employee number instead.
  const empSnap = await db.collection('employees')
    .where('officialEmployeeNumber', '==', identifier.toUpperCase())
    .limit(1)
    .get();
  if (empSnap.empty) {
    throw new Error(`No employees document found with officialEmployeeNumber "${identifier}".`);
  }
  const empDoc = empSnap.docs[0];
  const empData = empDoc.data();
  const userDoc = await db.collection('users').doc(empData.userId).get();
  if (!userDoc.exists) {
    throw new Error(`Employee "${identifier}" has userId "${empData.userId}" but no matching users document exists.`);
  }
  return {
    uid: userDoc.id,
    userData: userDoc.data(),
    employeeId: empDoc.id,
  };
}

async function countDocs(collectionName) {
  const snap = await db.collection(collectionName).count().get();
  return snap.data().count;
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const identifier = args.find(a => !a.startsWith('--'));

  if (!identifier) {
    console.error('Usage: node scripts/wipeTestData.js <admin-email-or-employee-number> [--confirm]');
    process.exit(1);
  }

  console.log(`\nResolving admin account for "${identifier}"...`);
  const admin_ = await resolveAdmin(identifier);

  if (admin_.userData.role !== 'admin_incharge') {
    console.log(`\n⚠️  WARNING: this account's role is "${admin_.userData.role}", not "admin_incharge".`);
    console.log('   Proceeding anyway since you specified this identifier directly — double-check this is really the account you meant to preserve.');
  }

  console.log('\n── Account to PRESERVE ──────────────────────────');
  console.log(`   users/${admin_.uid}  (email: ${admin_.userData.email || '—'}, role: ${admin_.userData.role})`);
  console.log(`   employees/${admin_.employeeId || '⚠️  NO MATCHING EMPLOYEE DOC FOUND'}`);

  console.log('\n── Collections to be FULLY wiped ────────────────');
  let totalToDelete = 0;
  for (const name of COLLECTIONS_TO_WIPE_FULLY) {
    const count = await countDocs(name);
    totalToDelete += count;
    console.log(`   ${name}: ${count} document(s)`);
  }

  console.log('\n── Collections wiped EXCEPT the admin doc ───────');
  for (const name of COLLECTIONS_WITH_ADMIN_EXCLUDED) {
    const count = await countDocs(name);
    const excludeId = name === 'users' ? admin_.uid : admin_.employeeId;
    const willDelete = excludeId ? count - 1 : count;
    totalToDelete += Math.max(willDelete, 0);
    console.log(`   ${name}: ${count} document(s) total, ${willDelete} will be deleted, 1 preserved`);
  }

  console.log('\n── NEVER touched ─────────────────────────────────');
  console.log('   config (dropdowns, etc.) — structural, required for the app to function');

  console.log(`\n── Total documents to delete: ~${totalToDelete} ──`);
  console.log('── Firebase Auth accounts will also be deleted for every uid except the preserved admin ──\n');

  if (!confirm) {
    console.log('DRY RUN — nothing has been deleted. Re-run with --confirm to actually perform this wipe.\n');
    process.exit(0);
  }

  console.log('--confirm passed. Starting deletion...\n');

  // ── Fully-wiped collections ──
  for (const name of COLLECTIONS_TO_WIPE_FULLY) {
    const snap = await db.collection(name).get();
    console.log(`Deleting ${snap.size} document(s) from ${name}...`);
    for (const doc of snap.docs) {
      await db.recursiveDelete(doc.ref);
    }
  }

  // ── users, employees — admin excluded ──
  for (const name of COLLECTIONS_WITH_ADMIN_EXCLUDED) {
    const excludeId = name === 'users' ? admin_.uid : admin_.employeeId;
    const snap = await db.collection(name).get();
    let deleted = 0;
    for (const doc of snap.docs) {
      if (doc.id === excludeId) continue;
      await db.recursiveDelete(doc.ref);
      deleted++;
    }
    console.log(`Deleted ${deleted} document(s) from ${name}, preserved 1.`);
  }

  // ── Firebase Auth accounts ──
  console.log('\nDeleting Firebase Auth accounts (except the preserved admin)...');
  let nextPageToken;
  let authDeleted = 0;
  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    const toDelete = result.users
      .map(u => u.uid)
      .filter(uid => uid !== admin_.uid);
    for (const uid of toDelete) {
      await admin.auth().deleteUser(uid);
      authDeleted++;
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);
  console.log(`Deleted ${authDeleted} Auth account(s), preserved 1.`);

  console.log('\n✅ Wipe complete.');
  console.log(`Preserved: users/${admin_.uid}, employees/${admin_.employeeId}, and the Auth account for "${identifier}".`);
  console.log('config was never touched.\n');
}

main().catch(err => {
  console.error('\n❌ Script failed:', err.message);
  process.exit(1);
});
