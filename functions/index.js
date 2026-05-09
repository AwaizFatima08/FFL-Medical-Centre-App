const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin   = require('firebase-admin');
const express = require('express');
const cors    = require('cors');
const circularRoutes = require('./src/circulars/circularRoutes');

// ─── INITIALIZE FIREBASE ADMIN ────────────────────────────────────────────────
admin.initializeApp();

// ─── IMPORT ROUTE HANDLERS ────────────────────────────────────────────────────
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

// ─── SCHEDULED JOBS ───────────────────────────────────────────────────────────
const { sendVaccinationReminders } = require('./src/vaccination/vaccinationScheduler');
const { sendTripReminders }        = require('./src/trips/tripScheduler');
const { sendFitnessReminders }     = require('./src/fitness/fitnessScheduler');

// ─── CORS MIDDLEWARE ──────────────────────────────────────────────────────────
// Allow requests from any origin — required for web and mobile clients
const corsMiddleware = cors({ origin: true });

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// ─── HELPER: wrap a router in an Express app with CORS + AUTH ─────────────────
function makeApp(router, skipAuth = false) {
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json());
  if (!skipAuth) {
    app.use(authMiddleware);
  }
  app.use(router);
  return app;
}

// ─── HTTP ENDPOINTS ───────────────────────────────────────────────────────────
const OPTS = { region: 'asia-south1', cors: true };

exports.auth          = onRequest(OPTS, makeApp(authRoutes, true));
exports.employees     = onRequest(OPTS, makeApp(employeeRoutes));
exports.ambulance     = onRequest(OPTS, makeApp(ambulanceRoutes));
exports.trips         = onRequest(OPTS, makeApp(tripRoutes));

exports.notifications = onRequest(OPTS, makeApp(notificationRoutes));
exports.availability  = onRequest(OPTS, makeApp(availabilityRoutes));
exports.fitness       = onRequest(OPTS, makeApp(fitnessRoutes));
exports.directory     = onRequest(OPTS, makeApp(directoryRoutes));
exports.feedback      = onRequest(OPTS, makeApp(feedbackRoutes));
exports.reports       = onRequest(OPTS, makeApp(reportRoutes));
exports.circulars = onRequest(OPTS, makeApp(circularRoutes));

// ─── SCHEDULED FUNCTIONS ──────────────────────────────────────────────────────
exports.scheduledVaccinationReminders = onSchedule(
  { schedule: '0 3 * * *', region: 'asia-south1' },
  sendVaccinationReminders
);
exports.scheduledTripReminders = onSchedule(
  { schedule: '0 7 * * 1,3,6', region: 'asia-south1' },
  sendTripReminders
);
exports.scheduledFitnessReminders = onSchedule(
  { schedule: '0 4 * * *', region: 'asia-south1' },
  sendFitnessReminders
);

// ─── VACCINATION + FAMILY CLOUD FUNCTIONS ────────────────────────────────────
const vaccinationFunctions = require('./src/vaccination/vaccinationRoutes');

exports.onFamilyMemberValidated   = vaccinationFunctions.onFamilyMemberValidated;
exports.onFamilyMemberEdited      = vaccinationFunctions.onFamilyMemberEdited;
exports.onVaccinationAdministered = vaccinationFunctions.onVaccinationAdministered;
exports.dailyVaccinationReminder  = vaccinationFunctions.dailyVaccinationReminder;
exports.missedAppointmentDetector = vaccinationFunctions.missedAppointmentDetector;
exports.fridayWeeklyReport        = vaccinationFunctions.fridayWeeklyReport;
exports.childTurns25Notifier      = vaccinationFunctions.childTurns25Notifier;
