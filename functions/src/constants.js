// ─── ROLES ───────────────────────────────────────────────
const ROLES = {
  EMPLOYEE: 'employee',
  RECEPTION: 'reception',
  DRIVER: 'driver',
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  LAB_TECHNOLOGIST: 'lab_technologist',
  PHARMACY_INCHARGE: 'pharmacy_incharge',
  ADMIN_INCHARGE: 'admin_incharge',
  CMO: 'cmo',
};

// ─── COMMUNITY GROUPS ────────────────────────────────────
const COMMUNITY_GROUPS = {
  MANAGEMENT: 'management',
  NON_MANAGEMENT: 'non_management',
  EDUCATION_SOCIETY: 'education_society',
  FEMALE: 'female',
};

// ─── AMBULANCE ───────────────────────────────────────────
const VEHICLE_TYPES = {
  MINI: 'mini',
  BLS: 'BLS',
};

const PRIORITY_FLAGS = {
  ROUTINE: 'routine',
  EMERGENCY: 'emergency',
};

const TRIP_TYPES = {
  INTRA_TOWNSHIP: 'intra_township',
  INTERCITY: 'intercity',
};

const AMBULANCE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DISPATCHED: 'dispatched',
  PICKED_UP: 'picked_up',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
};

// ─── MEDICAL TRIP ─────────────────────────────────────────
const MEDICAL_TRIP_DAYS = ['monday', 'wednesday', 'saturday'];

const MEDICAL_TRIP_DEPARTURE_MC = '17:30';
const MEDICAL_TRIP_DEPARTURE_RYK = '21:00';
const MEDICAL_TRIP_TOTAL_SEATS = 26;

const BOOKING_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
};

const TRIP_STATUS = {
  OPEN: 'open',
  FULL: 'full',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// ─── VACCINATION ──────────────────────────────────────────
const VACCINE_STATUS = {
  PENDING: 'pending',
  ADMINISTERED: 'administered',
  RESCHEDULED: 'rescheduled',
  MISSED: 'missed',
};

// ─── NOTIFICATIONS ────────────────────────────────────────
const NOTIFICATION_CATEGORIES = {
  HEALTH_AWARENESS: 'health_awareness',
  GENERAL: 'general',
  LAB_REPORT: 'lab_report',
  PHARMACY: 'pharmacy',
  CLAIM_HOLD: 'claim_hold',
  FITNESS_APPOINTMENT: 'fitness_appointment',
  VACCINATION_REMINDER: 'vaccination_reminder',
  TRIP_REMINDER: 'trip_reminder',
  DISPATCH_UPDATE: 'dispatch_update',
};

const NOTIFICATION_TARGET_TYPES = {
  INDIVIDUAL: 'individual',
  GROUP: 'group',
  ALL: 'all',
};

// ─── DOCTOR AVAILABILITY ──────────────────────────────────
const AVAILABILITY_STATUS = {
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not_available',
  OFF_DUTY: 'off_duty',
};

// ─── FITNESS ──────────────────────────────────────────────
const FITNESS_STATUS = {
  FIT: 'fit',
  UNFIT: 'unfit',
  CONDITIONAL: 'conditional',
};

const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  RESCHEDULED: 'rescheduled',
  COMPLETED: 'completed',
  MISSED: 'missed',
};

// ─── WORKING HOURS ────────────────────────────────────────
const WORKING_HOURS = {
  DOCTOR: {
    MON_THU: { start: '07:30', end: '17:15', lunchStart: '13:00', lunchEnd: '14:00' },
    FRIDAY:  { start: '07:30', end: '12:45' },
    SATURDAY:{ start: '07:30', end: '17:15', lunchStart: '13:00', lunchEnd: '14:00' },
  },
  CMO: {
    MON_THU: { start: '09:15', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
    FRIDAY:  { start: '07:30', end: '12:45' },
    SATURDAY:{ start: '07:30', end: '17:15', lunchStart: '13:00', lunchEnd: '14:00' },
  },
};

module.exports = {
  ROLES,
  COMMUNITY_GROUPS,
  VEHICLE_TYPES,
  PRIORITY_FLAGS,
  TRIP_TYPES,
  AMBULANCE_STATUS,
  MEDICAL_TRIP_DAYS,
  MEDICAL_TRIP_DEPARTURE_MC,
  MEDICAL_TRIP_DEPARTURE_RYK,
  MEDICAL_TRIP_TOTAL_SEATS,
  BOOKING_STATUS,
  TRIP_STATUS,
  VACCINE_STATUS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TARGET_TYPES,
  AVAILABILITY_STATUS,
  FITNESS_STATUS,
  APPOINTMENT_STATUS,
  WORKING_HOURS,
};