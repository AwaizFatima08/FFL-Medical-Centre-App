// scripts/syncRoleClaims.js
// Copies each users doc's role/isActive into its Auth custom claims, which
// firestore.rules now read instead of fetching the users doc. New changes are
// synced by the backend; run this once for accounts that existed before.
//
//   node scripts/syncRoleClaims.js            → dry run
//   node scripts/syncRoleClaims.js --confirm  → apply

const admin = require('../functions/node_modules/firebase-admin');

admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  const users = await admin.firestore().collection('users').get();
  let changed = 0;
  for (const doc of users.docs) {
    const { role, isActive } = doc.data();
    if (!role) continue;
    const wanted = { role, active: isActive === true };
    let current = {};
    try {
      current = (await admin.auth().getUser(doc.id)).customClaims || {};
    } catch (err) {
      console.log(`  ${doc.id}: no Auth account (${err.code}) — skipped`);
      continue;
    }
    if (current.role === wanted.role && current.active === wanted.active) continue;
    changed++;
    console.log(`  ${doc.id}: ${JSON.stringify(current)} → ${JSON.stringify(wanted)}`);
    if (CONFIRM) await admin.auth().setCustomUserClaims(doc.id, { ...current, ...wanted });
  }
  console.log(`\n${users.size} users, ${changed} ${CONFIRM ? 'updated' : 'to update'}.`);
  if (!CONFIRM && changed) console.log('Re-run with --confirm to apply.');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
