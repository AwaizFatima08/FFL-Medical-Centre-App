// importVaccineSchedule.js
// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME SCRIPT — run once to populate the vaccineSchedule collection.
// Place this file in your project root (same folder as package.json).
// Run: node importVaccineSchedule.js
// Delete this file after successful import.
// ─────────────────────────────────────────────────────────────────────────────

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const path = require('path');

// ── Firebase Admin init ───────────────────────────────────────────────────────
// Download your service account key from Firebase Console:
// Project Settings → Service Accounts → Generate New Private Key
// Save it as serviceAccountKey.json in your project root.
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Vaccine schedule data ─────────────────────────────────────────────────────
const vaccines = [
  {
    vaccineName: 'BCG',
    doseNumber: '1st shot',
    ageValue: 1,
    ageUnit: 'weeks',
    vaccineType: 'live',
    route: 'intradermal',
    site: 'left upper arm',
    minimumIntervalDays: null,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'DPT + IPV + Hep B + Hib',
    doseNumber: '1st shot',
    ageValue: 6,
    ageUnit: 'weeks',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'Rotarix',
    doseNumber: '1st shot',
    ageValue: 6,
    ageUnit: 'weeks',
    vaccineType: 'oral',
    route: 'oral',
    site: 'oral',
    minimumIntervalDays: 28,
    maximumAgeDays: 168,
    isActive: true,
  },
  {
    vaccineName: 'PCV',
    doseNumber: '1st shot',
    ageValue: 8,
    ageUnit: 'weeks',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'DPT + IPV + Hep B + Hib',
    doseNumber: '2nd shot',
    ageValue: 10,
    ageUnit: 'weeks',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'Rotarix',
    doseNumber: '2nd shot',
    ageValue: 10,
    ageUnit: 'weeks',
    vaccineType: 'oral',
    route: 'oral',
    site: 'oral',
    minimumIntervalDays: null,
    maximumAgeDays: 168,
    isActive: true,
  },
  {
    vaccineName: 'DPT + IPV + Hep B + Hib',
    doseNumber: '3rd shot',
    ageValue: 14,
    ageUnit: 'weeks',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'PCV',
    doseNumber: '2nd shot',
    ageValue: 16,
    ageUnit: 'weeks',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'PCV',
    doseNumber: '3rd shot',
    ageValue: 24,
    ageUnit: 'weeks',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'Typhoid',
    doseNumber: '1st shot',
    ageValue: 10,
    ageUnit: 'months',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: null,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'MMR',
    doseNumber: '1st shot',
    ageValue: 12,
    ageUnit: 'months',
    vaccineType: 'live',
    route: 'subcutaneous',
    site: 'upper arm',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'Varicella',
    doseNumber: '1st shot',
    ageValue: 14,
    ageUnit: 'months',
    vaccineType: 'live',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'MenACWY',
    doseNumber: '1st shot',
    ageValue: 15,
    ageUnit: 'months',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: null,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'Hep A',
    doseNumber: '1st shot',
    ageValue: 16,
    ageUnit: 'months',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: 168,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'MMR',
    doseNumber: 'Booster shot',
    ageValue: 18,
    ageUnit: 'months',
    vaccineType: 'live',
    route: 'subcutaneous',
    site: 'upper arm',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'DPT + IPV + Hep B + Hib',
    doseNumber: '1st Booster',
    ageValue: 20,
    ageUnit: 'months',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'upper arm',
    minimumIntervalDays: null,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'PCV',
    doseNumber: '1st Booster',
    ageValue: 21,
    ageUnit: 'months',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'upper arm',
    minimumIntervalDays: null,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'Hep A',
    doseNumber: '2nd shot',
    ageValue: 24,
    ageUnit: 'months',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'upper arm',
    minimumIntervalDays: null,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'DPT + IPV + Hep B + Hib',
    doseNumber: '2nd Booster',
    ageValue: 48,
    ageUnit: 'months',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'upper arm',
    minimumIntervalDays: null,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'PCV',
    doseNumber: '2nd Booster',
    ageValue: 50,
    ageUnit: 'months',
    vaccineType: 'inactivated',
    route: 'intramuscular',
    site: 'upper arm',
    minimumIntervalDays: null,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'MMR',
    doseNumber: '2nd Booster',
    ageValue: 52,
    ageUnit: 'months',
    vaccineType: 'live',
    route: 'subcutaneous',
    site: 'upper arm',
    minimumIntervalDays: 28,
    maximumAgeDays: null,
    isActive: true,
  },
  {
    vaccineName: 'Varicella',
    doseNumber: 'Booster shot',
    ageValue: 54,
    ageUnit: 'months',
    vaccineType: 'live',
    route: 'intramuscular',
    site: 'lateral aspect of thigh',
    minimumIntervalDays: null,
    maximumAgeDays: null,
    isActive: true,
  },
];

// ── Import function ───────────────────────────────────────────────────────────
async function importSchedule() {
  const collection = db.collection('vaccineSchedule');
  const now = Timestamp.now();
  let count = 0;

  for (const vaccine of vaccines) {
    await collection.add({
      ...vaccine,
      createdAt: now,
      updatedAt: now,
    });
    count++;
    console.log(`✓ ${count}/${vaccines.length} — ${vaccine.vaccineName} (${vaccine.doseNumber})`);
  }

  console.log(`\n✅ Import complete. ${count} vaccine documents added to Firestore.`);
  console.log('You can now delete this file and serviceAccountKey.json from your project root.');
  process.exit(0);
}

importSchedule().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
