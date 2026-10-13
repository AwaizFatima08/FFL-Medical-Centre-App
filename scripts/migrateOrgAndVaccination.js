// scripts/migrateOrgAndVaccination.js
// One-time, idempotent migration for the editable org structure and the
// stored per-child vaccination summary.
//
//   1. Seeds config/orgStructure from the built-in lists if it doesn't exist.
//   2. For every validated, active son/daughter:
//        - no vaccination records yet → creates their schedule (needs
//          vaccineSchedule — run importVaccineSchedule.js first if empty)
//        - otherwise → recomputes familyMembers.vaxSummary
//        - fills in sponsorName (parent's name) if missing
//
// Dry run by default. Re-run with --confirm to write. --org-only stops after
// step 1 (vaccination is still deferred to V2).
//   node scripts/migrateOrgAndVaccination.js
//   node scripts/migrateOrgAndVaccination.js --org-only --confirm

const admin = require('../functions/node_modules/firebase-admin');

admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });

const { buildSeed } = require('../functions/src/org/orgStructureRoutes');
const {
  createVaccinationSchedule, refreshVaxSummary, employeeNameByUid,
} = require('../functions/src/vaccination/vaccinationRoutes');

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  const db = admin.firestore();
  console.log(CONFIRM ? '\n=== APPLYING CHANGES ===\n' : '\n=== DRY RUN — nothing will be written ===\n');

  const orgRef = db.collection('config').doc('orgStructure');
  if ((await orgRef.get()).exists) {
    console.log('config/orgStructure: already exists — left unchanged');
  } else {
    console.log('config/orgStructure: missing — seeding from built-in lists');
    if (CONFIRM) {
      await orgRef.set({ ...buildSeed(), updatedAt: new Date().toISOString(), updatedBy: 'migration' });
    }
  }

  if (process.argv.includes('--org-only')) return;

  const scheduleCount = (await db.collection('vaccineSchedule')
    .where('isActive', '==', true).count().get()).data().count;
  console.log(`vaccineSchedule: ${scheduleCount} active entries`);
  if (scheduleCount === 0) {
    console.log('  ⚠ Empty — children cannot get schedules. Run: node scripts/importVaccineSchedule.js');
  }

  const kids = await db.collection('familyMembers')
    .where('relation', 'in', ['son', 'daughter'])
    .where('status', '==', 'validated')
    .where('isActive', '==', true)
    .get();
  console.log(`\nValidated children: ${kids.size}`);

  const tally = { scheduled: 0, summarised: 0, named: 0, skipped: 0 };
  for (const kid of kids.docs) {
    const member = kid.data();
    const records = (await db.collection('vaccinationRecords')
      .where('familyMemberId', '==', kid.id).count().get()).data().count;

    if (records === 0 && scheduleCount > 0) {
      console.log(`  ${kid.id} ${member.name}: create schedule`);
      tally.scheduled++;
      if (CONFIRM) await createVaccinationSchedule(kid.id, member);   // also sets sponsorName
      continue;
    } else if (records > 0) {
      console.log(`  ${kid.id} ${member.name}: refresh summary (${records} records)`);
      tally.summarised++;
      if (CONFIRM) await refreshVaxSummary(kid.id);
    } else {
      tally.skipped++;
    }

    if (!member.sponsorName) {
      const name = await employeeNameByUid(member.employeeId, null);
      if (name) {
        tally.named++;
        if (CONFIRM) await kid.ref.set({ sponsorName: name }, { merge: true });
      }
    }
  }

  console.log(`\nSchedules ${CONFIRM ? 'created' : 'to create'}: ${tally.scheduled}`);
  console.log(`Summaries ${CONFIRM ? 'refreshed' : 'to refresh'}: ${tally.summarised}`);
  console.log(`Parent names ${CONFIRM ? 'filled' : 'to fill'}: ${tally.named}`);
  if (tally.skipped) console.log(`Skipped (no schedule available): ${tally.skipped}`);
  if (!CONFIRM) console.log('\nRe-run with --confirm to apply.');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
