// End-to-end checks against the LOCAL emulator (demo-sahulat). Run seed.js first.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const acc = require('./.test-accounts.json');
const admin = require(`${ROOT}/functions/node_modules/firebase-admin`);
admin.initializeApp({ projectId: 'demo-sahulat' });
const adb = admin.firestore();
const { initializeApp } = require(`${ROOT}/app/node_modules/firebase/app`);
const fa = require(`${ROOT}/app/node_modules/firebase/auth`);
const ff = require(`${ROOT}/app/node_modules/firebase/firestore`);

const FN = (f) => `http://127.0.0.1:5001/demo-sahulat/asia-south1/${f}`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✔ ${name}`); } else { fail++; console.log(`  ✘ ${name} ${extra}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function token(who) {
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: acc[who].email, password: acc[who].password, returnSecureToken: true }),
  });
  return (await r.json()).idToken;
}
async function call(who, method, url, body) {
  const r = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token(who)}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {}; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const org = (who, body) => call(who, 'POST', `${FN('employees')}/org-structure`, body);
const claimsOf = async (who) => (await admin.auth().getUser(acc[who].uid)).customClaims || {};

// Client SDK session per user, so Firestore rules are enforced.
const sessions = {};
async function client(who) {
  if (sessions[who]) return sessions[who];
  const app = initializeApp({ projectId: 'demo-sahulat', apiKey: 'fake' }, `c-${who}-${Date.now()}`);
  const auth = fa.getAuth(app); fa.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = ff.getFirestore(app); ff.connectFirestoreEmulator(db, '127.0.0.1', 8085);
  await fa.signInWithEmailAndPassword(auth, acc[who].email, acc[who].password);
  sessions[who] = db;
  return db;
}
const denied = async (p) => { try { await p; return false; } catch (e) { return e.code === 'permission-denied'; } };
const ok = async (p) => { try { await p; return true; } catch (e) { console.log('     ', e.code, e.message.split('\n')[0]); return false; } };

(async () => {
  console.log('\n— Counts');
  let r = await call('empA', 'GET', `${FN('notifications')}/unread-count`);
  check('unread-count = 3 for empA', r.status === 200 && r.json.data.count === 3, JSON.stringify(r));
  r = await call('admin', 'GET', `${FN('auth')}/pending-count`);
  check('pending-count = 1 for admin', r.status === 200 && r.json.data.count === 1, JSON.stringify(r));
  r = await call('empA', 'GET', `${FN('auth')}/pending-count`);
  check('pending-count forbidden for employee', r.status === 403);

  console.log('\n— Org structure');
  r = await org('admin', { op: 'add', kind: 'department', label: 'Quality Control', group: 'PLANT' });
  check('add department', r.status === 200 && r.json.data.item.value === 'Quality_Control', JSON.stringify(r.json));
  const qc = r.json.data?.item?.value;
  r = await org('admin', { op: 'add', kind: 'department', label: 'quality control', group: 'HO' });
  check('duplicate department rejected (409)', r.status === 409);
  r = await org('admin', { op: 'add', kind: 'department', label: 'Bad', group: 'ESB' });
  check('ESB group rejected (400)', r.status === 400);
  r = await org('admin', { op: 'add', kind: 'unit', department: qc, label: 'QC Lab' });
  check('add unit to new department', r.status === 200 && r.json.data.structure.units[qc].length === 1);
  r = await org('admin', { op: 'add', kind: 'designation', employeeType: 'non_management', label: 'Technician (S-4)' });
  check('add designation', r.status === 200);
  const tech = r.json.data?.item?.value;
  r = await org('admin', { op: 'rename', kind: 'designation', employeeType: 'non_management', value: tech, label: 'Senior Technician (S-4)' });
  check('rename keeps the stored value', r.status === 200 && r.json.data.item.label === 'Senior Technician (S-4)' && r.json.data.item.value === tech);
  r = await org('admin', { op: 'archive', kind: 'unit', department: 'admin', value: 'horticulture' });
  check('archive unit', r.status === 200 && r.json.data.item.archived === true);
  r = await org('admin', { op: 'restore', kind: 'unit', department: 'admin', value: 'horticulture' });
  check('restore unit', r.status === 200 && r.json.data.item.archived === false);
  r = await org('admin', { op: 'delete', kind: 'department', value: 'admin' });
  check('delete in-use department blocked with count', r.status === 409 && r.json.data.inUse === 7, JSON.stringify(r.json));
  r = await org('admin', { op: 'delete', kind: 'unit', department: 'admin', value: 'medical_centre' });
  check('delete in-use unit blocked (409)', r.status === 409);
  r = await org('admin', { op: 'delete', kind: 'designation', value: 'Engineer_I_M8', employeeType: 'management' });
  check('delete in-use designation blocked (409)', r.status === 409);
  r = await org('admin', { op: 'archive', kind: 'department', value: 'ESB' });
  check('required ESB entry cannot be archived (400)', r.status === 400);
  r = await org('admin', { op: 'delete', kind: 'department', value: qc });
  check('delete unused department and its units', r.status === 200 && !r.json.data.structure.units[qc]);
  r = await org('empA', { op: 'add', kind: 'department', label: 'Hack', group: 'PLANT' });
  check('employee cannot edit org structure (403)', r.status === 403);
  r = await org('cmo', { op: 'add', kind: 'unit', department: 'BD', label: 'Market Research' });
  check('CMO can edit org structure', r.status === 200);
  const saved = (await adb.collection('config').doc('orgStructure').get()).data();
  check('structure persisted in config/orgStructure', saved.designations.non_management.some(d => d.value === tech));

  console.log('\n— Employee update guard');
  r = await call('pendingB', 'PUT', `${FN('employees')}/${acc.empA.employeeId}`, { department: 'BD', cnic: '99999-9999999-9' });
  check('unapproved signup cannot edit another employee (403)', r.status === 403, JSON.stringify(r));
  r = await call('empC', 'PUT', `${FN('employees')}/${acc.empA.employeeId}`, { phoneNumber: '03110000000' });
  check('employee cannot edit another employee (403)', r.status === 403, JSON.stringify(r));
  r = await call('empA', 'PUT', `${FN('employees')}/${acc.empA.employeeId}`, { department: 'BD', maritalStatus: 'married' });
  let empA = (await adb.collection('employees').doc(acc.empA.employeeId).get()).data();
  check('self-edit allowed but department ignored', r.status === 200 && empA.department === 'admin');
  r = await call('admin', 'PUT', `${FN('employees')}/${acc.empA.employeeId}`, { department: 'BD', unit: 'BD' });
  empA = (await adb.collection('employees').doc(acc.empA.employeeId).get()).data();
  check('admin can change department', r.status === 200 && empA.department === 'BD');
  r = await call('empA', 'PUT', `${FN('employees')}/${acc.empA.employeeId}`, { bloodDonorConsent: true });
  const donor = await adb.collection('bloodDonorRegistry').doc(acc.empA.employeeId).get();
  check('self opt-in reaches blood donor directory', r.status === 200 && donor.exists && donor.data().bloodGroup === 'B+');

  console.log('\n— all-users join');
  r = await call('admin', 'GET', `${FN('auth')}/all-users`);
  const listed = (r.json.data || []).find(u => u.uid === acc.empA.uid);
  check('all-users lists approved users with employeeId', r.status === 200 && listed?.employeeId === acc.empA.employeeId && !(r.json.data || []).some(u => u.uid === acc.pendingB.uid));

  console.log('\n— Role claims');
  r = await call('admin', 'POST', `${FN('auth')}/approve-user`, { uid: acc.pendingB.uid, role: 'employee' });
  let c = await claimsOf('pendingB');
  check('approve sets role claim', r.status === 200 && c.role === 'employee' && c.active === true, JSON.stringify(c));
  r = await call('admin', 'POST', `${FN('auth')}/change-role`, { uid: acc.empC.uid, role: 'reception' });
  c = await claimsOf('empC');
  check('change-role updates claim', r.status === 200 && c.role === 'reception' && c.active === true, JSON.stringify(c));
  r = await call('admin', 'POST', `${FN('auth')}/change-role`, { uid: acc.empC.uid, role: 'employee' });
  r = await call('admin', 'POST', `${FN('auth')}/disable-user`, { uid: acc.pendingB.uid });
  c = await claimsOf('pendingB');
  check('disable clears active claim', r.status === 200 && c.active === false, JSON.stringify(c));
  r = await call('admin', 'POST', `${FN('auth')}/enable-user`, { uid: acc.pendingB.uid });
  c = await claimsOf('pendingB');
  check('re-enable restores active claim', r.status === 200 && c.active === true, JSON.stringify(c));

  console.log('\n— Firestore rules (client SDK)');
  const dA = await client('empA');
  check('read config/orgStructure', await ok(ff.getDoc(ff.doc(dA, 'config', 'orgStructure'))));
  check('cannot write config', await denied(ff.setDoc(ff.doc(dA, 'config', 'orgStructure'), { x: 1 })));
  check('cannot promote self to admin', await denied(ff.updateDoc(ff.doc(dA, 'users', acc.empA.uid), { role: 'admin_incharge' })));
  check('cannot create own users doc', await denied(ff.setDoc(ff.doc(dA, 'users', 'someone-new'), { role: 'admin_incharge', isActive: true })));
  check('can save own push token', await ok(ff.updateDoc(ff.doc(dA, 'users', acc.empA.uid), { fcmToken: 'tok' })));
  check('can read own employee record', await ok(ff.getDocs(ff.query(ff.collection(dA, 'employees'), ff.where('userId', '==', acc.empA.uid)))));
  check("cannot read another employee's record", await denied(ff.getDoc(ff.doc(dA, 'employees', acc.empC.employeeId))));
  check('cannot list all employees', await denied(ff.getDocs(ff.collection(dA, 'employees'))));
  check('can read own family', await ok(ff.getDocs(ff.query(ff.collection(dA, 'familyMembers'), ff.where('employeeId', '==', acc.empA.uid), ff.where('isActive', '==', true)))));
  check("cannot read another employee's family", await denied(ff.getDoc(ff.doc(dA, 'familyMembers', acc.kids.cKid))));
  const base = { employeeId: acc.empA.uid, name: 'Rule Kid', relation: 'son', dateOfBirth: ff.Timestamp.now(), isActive: true, pendingRevision: null };
  check('cannot create family member as validated', await denied(ff.addDoc(ff.collection(dA, 'familyMembers'), { ...base, status: 'validated' })));
  check('cannot create family member for someone else', await denied(ff.addDoc(ff.collection(dA, 'familyMembers'), { ...base, employeeId: acc.empC.uid, status: 'pending' })));
  check('can create own pending family member', await ok(ff.addDoc(ff.collection(dA, 'familyMembers'), { ...base, status: 'pending' })));
  const mine = ff.doc(dA, 'familyMembers', acc.kids.pendingBaby);
  check('cannot self-validate family member', await denied(ff.updateDoc(mine, { status: 'validated' })));
  check('can submit edit request', await ok(ff.updateDoc(mine, { pendingRevision: { name: 'x' }, updatedAt: ff.Timestamp.now() })));
  check('can toggle donor consent', await ok(ff.updateDoc(mine, { bloodDonorConsent: true, updatedAt: ff.Timestamp.now() })));
  check('can read own notifications', await ok(ff.getDocs(ff.query(ff.collection(dA, 'notifications'), ff.where('recipientUid', '==', acc.empA.uid)))));
  check("cannot read others' notifications", await denied(ff.getDocs(ff.query(ff.collection(dA, 'notifications'), ff.where('recipientUid', '==', acc.empC.uid)))));
  const dR = await client('reception');
  check('reception (no claim, users-doc fallback) can look up employee by number', await ok(ff.getDocs(ff.query(ff.collection(dR, 'employees'), ff.where('officialEmployeeNumber', '==', 'T-EMPA')))));
  check("reception can read an employee's family", await ok(ff.getDocs(ff.query(ff.collection(dR, 'familyMembers'), ff.where('employeeId', '==', acc.empA.uid), ff.where('isActive', '==', true)))));
  const dB = await client('pendingB');   // signed in after approve → token carries claims
  check('claim-based role works for own records', await ok(ff.getDocs(ff.query(ff.collection(dB, 'employees'), ff.where('userId', '==', acc.pendingB.uid)))));
  check('claim-based employee still cannot read others', await denied(ff.getDoc(ff.doc(dB, 'employees', acc.empA.employeeId))));
  const dAdm = await client('admin');
  check('admin can update a family member', await ok(ff.updateDoc(ff.doc(dAdm, 'familyMembers', acc.kids.olderKid), { updatedAt: ff.Timestamp.now() })));

  console.log('\n— Vaccination trigger (code kept for V2)');
  await adb.collection('familyMembers').doc(acc.kids.pendingBaby).update({ status: 'validated' });
  let kidDoc;
  for (let i = 0; i < 20; i++) { await sleep(1000); kidDoc = (await adb.collection('familyMembers').doc(acc.kids.pendingBaby).get()).data(); if (kidDoc.vaxSummary) break; }
  const recs = await adb.collection('vaccinationRecords').where('familyMemberId', '==', acc.kids.pendingBaby).get();
  check('schedule + summary created on validation', recs.size > 0 && kidDoc.vaxSummary && kidDoc.sponsorName === 'Test empA');
  const notif = await adb.collection('notifications').where('recipientUid', '==', acc.admin.uid).get();
  check('family-edit notification reaches admin inbox', notif.docs.some(d => d.data().type === 'family'), `count=${notif.size}`);

  console.log('\n— Schedulers');
  const vacc = require(`${ROOT}/functions/src/vaccination/vaccinationRoutes.js`);
  const beforeN = (await adb.collection('notifications').where('recipientUid', '==', acc.admin.uid).get()).size;
  await vacc.childTurns25Notifier.run({});
  const afterN = await adb.collection('notifications').where('recipientUid', '==', acc.admin.uid).get();
  check('turns-25 job notifies admin for birthday child', afterN.size === beforeN + 1);
  const { autoUpdateAvailability } = require(`${ROOT}/functions/src/availability/availabilityScheduler.js`);
  await autoUpdateAvailability({});
  const docA = (await adb.collection('doctorAvailability').doc('docA').get()).data();
  const { isWithinWorkingHours } = require(`${ROOT}/functions/src/utils.js`);
  check('availability job updates available doctors correctly', isWithinWorkingHours('doctor') ? docA.currentStatus === 'available' : docA.currentStatus === 'not_available');
  const pk = (d) => new Date(Date.now() + 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
  for (const [d, st] of [[1, 'scheduled'], [0, 'completed'], [5, 'scheduled']]) {
    await adb.collection('fitnessAppointments').add({ employeeUid: acc.empC.uid, scheduledDate: pk(d), scheduledTime: '09:00', status: st });
  }
  const { sendFitnessReminders } = require(`${ROOT}/functions/src/fitness/fitnessScheduler.js`);
  await sendFitnessReminders({});
  const fn = await adb.collection('notifications').where('recipientUid', '==', acc.empC.uid).where('type', '==', 'fitness').get();
  check("fitness job reminds only tomorrow's active appointment", fn.size === 1);

  console.log('\n— Reports (CMO)');
  for (const p of ['/ambulance?fromDate=2026-09-15&toDate=2026-10-31', '/ambulance', '/ambulance/kpis?fromDate=2026-09-15', '/employees/report', '/population/report', '/family-report', '/blood-donors/report', '/chronic-disease', '/fitness', '/employees?validated=true']) {
    r = await call('cmo', 'GET', `${FN('reports')}${p}`);
    check(`GET reports${p} → 200`, r.status === 200, `${r.status} ${r.json.message || ''}`);
    if (p.startsWith('/ambulance?from')) check('  date range applied in query', r.json.data.requests.length === 1);
    if (p.startsWith('/ambulance/kpis')) check('  KPI rows carry employee name', JSON.stringify(r.json).includes('Test empA'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
