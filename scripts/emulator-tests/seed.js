// Seeds the LOCAL Firebase emulator (project demo-sahulat) with test data.
// Never points at production: it only talks to the emulator hosts below.
//   firebase emulators:start --only auth,firestore,functions --project demo-sahulat
//   node scripts/emulator-tests/seed.js && node scripts/emulator-tests/run.js
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
const admin = require(`${ROOT}/functions/node_modules/firebase-admin`);
admin.initializeApp({ projectId: 'demo-sahulat' });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

const OUT = path.join(__dirname, '.test-accounts.json');   // gitignored; generated passwords
const pw = () => crypto.randomBytes(9).toString('base64url') + 'A1!';
const accounts = {
  admin:     { role: 'admin_incharge', active: true },
  cmo:       { role: 'cmo',            active: true },
  nurse:     { role: 'nurse',          active: true },
  reception: { role: 'reception',      active: true },
  empA:      { role: 'employee',       active: true },
  empC:      { role: 'employee',       active: true },
  pendingB:  { role: 'employee',       active: false, pending: true },
};
const yearsAgo = (y, extraDays = 0) => {
  const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setDate(d.getDate() - extraDays); d.setHours(0, 0, 0, 0); return d;
};

(async () => {
  const src = fs.readFileSync(`${ROOT}/scripts/importVaccineSchedule.js`, 'utf8');
  const start = src.indexOf('const vaccines = [');
  const vaccines = eval('(' + src.slice(start + 'const vaccines ='.length, src.indexOf('];', start) + 1) + ')');
  for (const v of vaccines) await db.collection('vaccineSchedule').add({ ...v, createdAt: Timestamp.now() });

  const out = {};
  for (const [key, a] of Object.entries(accounts)) {
    const email = `${key.toLowerCase()}@test.local`;
    const password = pw();
    const u = await admin.auth().createUser({ email, password, emailVerified: true });
    out[key] = { uid: u.uid, email, password, role: a.role };
    await db.collection('users').doc(u.uid).set({
      email, phone: '03000000000', role: a.role, isActive: a.active,
      approvedAt: a.pending ? null : new Date().toISOString(), createdAt: new Date().toISOString(),
    });
    const emp = await db.collection('employees').add({
      userId: u.uid, fullName: `Test ${key}`, officialEmployeeNumber: `T-${key.toUpperCase()}`,
      phoneNumber: '03001234567', dateOfBirth: Timestamp.fromDate(yearsAgo(35)), gender: 'male',
      cnic: '12345-1234567-1', maritalStatus: 'married', employeeType: 'management',
      department: 'admin', unit: 'medical_centre', designation: 'Engineer_I_M8', bloodGroup: 'B+',
      isValidated: !a.pending, townshipResidentWithFamily: true, houseNumber: `H-${key}`,
      createdAt: new Date().toISOString(),
    });
    out[key].employeeId = emp.id;
  }

  const A = out.empA.uid;
  const kid = (name, relation, dob, status, owner = A) => db.collection('familyMembers').add({
    employeeId: owner, name, relation, dateOfBirth: Timestamp.fromDate(dob),
    gender: relation === 'son' ? 'male' : 'female', status, isActive: true, pendingRevision: null,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
  out.kids = {
    pendingBaby: (await kid('Baby Pending', 'son', yearsAgo(0, 120), 'pending')).id,
    toddler:     (await kid('Toddler Valid', 'daughter', yearsAgo(3), 'validated')).id,
    turning25:   (await kid('Turns Twentyfive', 'daughter', yearsAgo(25), 'validated')).id,
    olderKid:    (await kid('Older Kid', 'son', yearsAgo(10), 'validated')).id,
    cKid:        (await kid('C Kid', 'son', yearsAgo(2), 'validated', out.empC.uid)).id,
  };

  for (let i = 0; i < 4; i++) {
    await db.collection('notifications').add({
      recipientUid: A, title: `Test ${i}`, body: 'b', type: 'trip', isRead: i === 3,
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
    });
  }
  await db.collection('notifications').add({ recipientUid: out.empC.uid, title: 'C only', body: 'b', type: 'trip', isRead: false, createdAt: new Date().toISOString() });
  await db.collection('doctorAvailability').doc('docA').set({ currentStatus: 'available', role: 'doctor', fullName: 'Dr A' });
  await db.collection('doctorAvailability').doc('docB').set({ currentStatus: 'not_available', role: 'doctor', fullName: 'Dr B' });
  await db.collection('ambulanceRequests').add({ employeeNumber: 'T-EMPA', patientName: 'X', status: 'completed', createdAt: '2026-10-01T05:00:00.000Z', priorityFlag: 'routine' });
  await db.collection('ambulanceRequests').add({ employeeNumber: 'T-EMPC', patientName: 'Y', status: 'completed', createdAt: '2026-09-01T05:00:00.000Z', priorityFlag: 'routine' });

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('seeded:', Object.keys(out).join(', '));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
