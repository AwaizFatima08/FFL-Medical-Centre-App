const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

// ─── INITIALIZE FIREBASE ADMIN ───────────────────────────
admin.initializeApp();

// ─── IMPORT ROUTE HANDLERS ───────────────────────────────
const authRoutes         = require('./src/auth/authRoutes');
const employeeRoutes     = require('./src/employees/employeeRoutes');
const ambulanceRoutes    = require('./src/ambulance/ambulanceRoutes');
const tripRoutes         = require('./src/trips/tripRoutes');
const vaccinationRoutes  = require('./src/vaccination/vaccinationRoutes');
const notificationRoutes = require('./src/notifications/notificationRoutes');
const availabilityRoutes = require('./src/availability/availabilityRoutes');
const fitnessRoutes      = require('./src/fitness/fitnessRoutes');
const directoryRoutes    = require('./src/directory/directoryRoutes');
const feedbackRoutes     = require('./src/feedback/feedbackRoutes');
const reportRoutes       = require('./src/reports/reportRoutes');

// ─── SCHEDULED JOBS ──────────────────────────────────────
const { autoUpdateAvailability } = require('./src/availability/availabilityScheduler');
const { sendVaccinationReminders } = require('./src/vaccination/vaccinationScheduler');
const { sendTripReminders } = require('./src/trips/tripScheduler');
const { sendFitnessReminders } = require('./src/fitness/fitnessScheduler');

// ─── HTTP ENDPOINTS ──────────────────────────────────────
exports.auth         = onRequest({ region: 'asia-south1' }, authRoutes);
exports.employees    = onRequest({ region: 'asia-south1' }, employeeRoutes);
exports.ambulance    = onRequest({ region: 'asia-south1' }, ambulanceRoutes);
exports.trips        = onRequest({ region: 'asia-south1' }, tripRoutes);
exports.vaccination  = onRequest({ region: 'asia-south1' }, vaccinationRoutes);
exports.notifications= onRequest({ region: 'asia-south1' }, notificationRoutes);
exports.availability = onRequest({ region: 'asia-south1' }, availabilityRoutes);
exports.fitness      = onRequest({ region: 'asia-south1' }, fitnessRoutes);
exports.directory    = onRequest({ region: 'asia-south1' }, directoryRoutes);
exports.feedback     = onRequest({ region: 'asia-south1' }, feedbackRoutes);
exports.reports      = onRequest({ region: 'asia-south1' }, reportRoutes);

// ─── SCHEDULED FUNCTIONS ─────────────────────────────────

// Runs every 15 minutes — auto updates doctor availability status
exports.scheduledAvailabilityUpdate = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-south1' },
  autoUpdateAvailability
);

// Runs daily at 8am PKT — sends vaccination reminders
exports.scheduledVaccinationReminders = onSchedule(
  { schedule: '0 3 * * *', region: 'asia-south1' }, // 3am UTC = 8am PKT
  sendVaccinationReminders
);

// Runs on trip days at 12pm PKT — sends trip reminders
exports.scheduledTripReminders = onSchedule(
  { schedule: '0 7 * * 1,3,6', region: 'asia-south1' }, // 7am UTC = 12pm PKT
  sendTripReminders
);

// Runs daily at 9am PKT — sends fitness appointment reminders
exports.scheduledFitnessReminders = onSchedule(
  { schedule: '0 4 * * *', region: 'asia-south1' }, // 4am UTC = 9am PKT
  sendFitnessReminders
);