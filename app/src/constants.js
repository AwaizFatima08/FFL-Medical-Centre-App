// app/src/constants.js
// Fallback constants — dynamic lists managed in Firestore config/dropdowns

// ─── ROLES ────────────────────────────────────────────────────────────────────
export const ROLES = {
  EMPLOYEE:         'employee',
  RECEPTION:        'reception',
  DRIVER:           'driver',
  DOCTOR:           'doctor',
  NURSE:            'nurse',
  LAB_TECHNOLOGIST: 'lab_technologist',
  PHARMACY_INCHARGE:'pharmacy_incharge',
  ADMIN_INCHARGE:   'admin_incharge',
  CMO:              'cmo',
};

// ─── EMPLOYEE TYPE ────────────────────────────────────────────────────────────
export const EMPLOYEE_TYPES = {
  MANAGEMENT:     'management',
  NON_MANAGEMENT: 'non_management',
  ESB:            'ESB',   // ← Day 13 fix: live config value is "ESB" (capital), was "esb"
};

// ─── COMMUNITY GROUPS ─────────────────────────────────────────────────────────
export const COMMUNITY_GROUPS = {
  MANAGEMENT:        'management',
  NON_MANAGEMENT:    'non_management',
  EDUCATION_SOCIETY: 'education_society',
  FEMALE:            'female',
};

// ─── BLOOD GROUPS ─────────────────────────────────────────────────────────────
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// ─── MARITAL STATUS ───────────────────────────────────────────────────────────
export const MARITAL_STATUSES = ['married', 'unmarried', 'divorced', 'widowed'];

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────
// Groups are for display only — not stored in Firestore
export const DEPARTMENT_GROUPS = {
  PLANT: {
    label: 'Plant Functions',
    departments: [
      { label: 'Admin',                value: 'admin' },
      { label: 'Production (N)',        value: 'Production_n' },
      { label: 'Production (S)',        value: 'Production_S' },
      { label: 'Maintenance',          value: 'maintenance' },
      { label: 'AIM',                  value: 'AIM' },
      { label: 'BD',                   value: 'BD' },
      { label: 'HSEQT',               value: 'HSEQT' },
      { label: 'E&I',                  value: 'EI' },
      { label: 'DBN',                  value: 'DBN' },
      { label: 'Process Engineering',  value: 'process_Engineering' },
      { label: 'Project Engineering',  value: 'project_Engineering' },
    ],
  },
  HO: {
    label: 'HO Functions',
    departments: [
      { label: 'IT',             value: 'HO_IT' },
      { label: 'HR',             value: 'HO_HR' },
      { label: 'Finance',        value: 'HO_Finance' },
      { label: 'SCF',            value: 'HO_SCF' },
      { label: 'Marketing',      value: 'HO_Marketing' },
      { label: 'Internal Audit', value: 'HO_Internal_Audit' },
    ],
  },
  ESB: {
    label: 'Education Society Board',
    departments: [
      { label: 'Education Society Board', value: 'ESB' },
    ],
  },
};

// Flat list — used for Firestore storage and filtering
export const DEPARTMENTS = [
  'admin', 'Production_n', 'Production_S', 'maintenance',
  'AIM', 'BD', 'HSEQT', 'EI', 'DBN',
  'process_Engineering', 'project_Engineering',
  'HO_IT', 'HO_HR', 'HO_Finance', 'HO_SCF', 'HO_Marketing', 'HO_Internal_Audit',
  'ESB',
];

// ─── UNITS (cascading — keyed by department value) ────────────────────────────
export const UNITS = {
  admin:                ['admin', 'industrial_relations', 'horticulture', 'CET', 'medical_centre', 'security', 'management_club'],
  Production_n:         ['OU', 'Ammonia', 'Nitric_Acid', 'Urea'],
  Production_S:         ['CAN', 'PHS', 'NP'],
  maintenance:          ['OU_Equipment', 'OU_Machinery', 'NP_Equipment', 'NP_Machinery', 'Ammonia_Equipment', 'Ammonia_Machinery', 'Urea_Equipment', 'Urea_Machinery', 'NA_Equipment', 'NA_Machinery', 'CAN_Equipment', 'CAN_Machinery', 'Workshop', 'Planning', 'PHS_Equipment', 'PHS_Machinery'],
  HSEQT:                ['HSE', 'Learning_Development_Centre'],
  BD:                   ['BD'],
  DBN:                  ['DBN'],
  AIM:                  ['Inspection'],
  EI:                   ['Electrical', 'Instrument', 'Control_Systems'],
  process_Engineering:  ['Laboratory', 'Process_N', 'Process_S'],
  project_Engineering:  ['Warehouse', 'Civil_Plantsite', 'Projects'],
  HO_IT:                ['HO_IT'],
  HO_HR:                ['HO_HR'],
  HO_Finance:           ['HO_Finance'],
  HO_SCF:               ['HO_SCF'],
  HO_Marketing:         ['HO_Marketing'],
  HO_Internal_Audit:    ['HO_Internal_Audit'],
  ESB:                  ['ESB'], // corrected — live config has one value here, not empty
};

// ─── DESIGNATIONS ─────────────────────────────────────────────────────────────

export const MANAGEMENT_DESIGNATIONS = [
  { label: 'GMM (M-13)',                         value: 'GMM_M13' },
  { label: 'Senior Department Manager (M-12A)',  value: 'Senior_Department_Manager_M12A' },
  { label: 'Department Manager (M-12)',           value: 'Department_Manager_M12' },
  { label: 'Unit Manager (M-11)',                 value: 'Unit_Manager_M11' },
  { label: 'Senior Staff Engineer (M-11)',        value: 'Senior_Staff_Engineer_M11' },
  { label: 'Section Head (M-10)',                 value: 'Section_Head_M10' },
  { label: 'Staff Engineer (M-10)',               value: 'Staff_Engineer_M10' },
  { label: 'Senior Engineer (M-9A)',              value: 'Senior_Engineer_M9A' },
  { label: 'Senior Engineer (M-9)',               value: 'Senior_Engineer_M9' },
  { label: 'Engineer I (M-8)',                    value: 'Engineer_I_M8' },
  { label: 'Engineer II (M-7)',                   value: 'Engineer_II_M7' },
  { label: 'Engineer III (M-6)',                  value: 'Engineer_III_M6' },
  { label: 'Graduate Trainee Engineer (M-5)',     value: 'GTE_M5' },
  { label: 'Sr. Sub Engineer I (MT-6)',           value: 'Sr_Sub_Engineer_I_MT6' },
  { label: 'Sr. Sub Engineer II (MT-5)',          value: 'Sr_Sub_Engineer_II_MT5' },
  { label: 'Sr. Sub Engineer III (MT-4)',         value: 'Sr_Sub_Engineer_III_MT4' },
  { label: 'Sub Engineer I (MT-3)',               value: 'Sub_Engineer_I_MT3' },
  { label: 'Sub Engineer II (MT-2)',              value: 'Sub_Engineer_II_MT2' },
  { label: 'Sub Engineer III (MT-1)',             value: 'Sub_Engineer_III_MT1' },
];

export const NON_MANAGEMENT_DESIGNATIONS = [
  { label: 'Supervisor I (S-8)',     value: 'Supervisor_I_S8' },
  { label: 'Supervisor II (S-7)',    value: 'Supervisor_II_S7' },
  { label: 'Supervisor III (S-6)',   value: 'Supervisor_III_S6' },
  { label: 'Head Operator (S-5)',    value: 'Head_Operator_S5' },
  { label: 'Senior Operator (S-4)',  value: 'Senior_Operator_S4' },
  { label: 'Operator I (S-3)',       value: 'Operator_I_S3' },
  { label: 'Operator II (S-2)',      value: 'Operator_II_S2' },
  { label: 'Operator III (S-1)',     value: 'Operator_III_S1' },
];

export const ESB_DESIGNATIONS = [
  { label: 'Director',          value: 'Director' },
  { label: 'Principal',         value: 'Principal' },
  { label: 'Vice Principal',    value: 'Vice_Principal' },
  { label: 'Head Mistress',     value: 'Head_Mistress' },
  { label: 'Senior Teacher I',  value: 'Senior_Teacher_I' },
  { label: 'Senior Teacher II', value: 'Senior_Teacher_II' },
  { label: 'Senior Teacher III',value: 'Senior_Teacher_III' },
  { label: 'Teacher I',         value: 'Teacher_I' },
  { label: 'Teacher II',        value: 'Teacher_II' },
  { label: 'Teacher III',       value: 'Teacher_III' },
  { label: 'Trainee Teacher',   value: 'Trainee_Teacher' },
  { label: 'Contract Teacher',  value: 'Contract_Teacher' },
  { label: 'Supervisor',        value: 'Supervisor' },
];

// Helper — returns correct designation list based on employee type
export const getDesignationsByType = (employeeType) => {
  // Day 13 fix: normalize to lowercase before comparing — live config
  // uses "ESB" (capital), the old exact-match switch silently returned []
  switch ((employeeType || '').toLowerCase()) {
    case 'management':     return MANAGEMENT_DESIGNATIONS;
    case 'non_management': return NON_MANAGEMENT_DESIGNATIONS;
    case 'esb':            return ESB_DESIGNATIONS;
    default:               return [];
  }
};

// ─── AMBULANCE ────────────────────────────────────────────────────────────────
export const VEHICLE_TYPES    = { MINI: 'mini', BLS: 'BLS' };
export const PRIORITY_FLAGS   = { ROUTINE: 'routine', EMERGENCY: 'emergency' };
export const TRIP_TYPES       = { INTRA_TOWNSHIP: 'intra_township', INTERCITY: 'intercity' };

// Day 16 (Phase 5, Step 5.2 fix) — was duplicated identically in
// AmbulanceRequestScreen.js and AmbulanceRequestReceptionScreen.js;
// consolidated here as the single source of truth now that the field is
// actually persisted and needs a display-label lookup too.
export const PURPOSE_OF_VISIT_OPTIONS = [
  { label: '🚨 Emergency',              value: 'emergency' },
  { label: '🩺 Routine Consultation',   value: 'routine_consultation' },
  { label: '🦿 Physiotherapy Visit',    value: 'physiotherapy' },
  { label: '🦷 Dental Treatment Visit', value: 'dental' },
  { label: '🧪 Laboratory Sample',      value: 'lab_sample' },
];
export const AMBULANCE_STATUS = {
  PENDING:    'pending',
  ACCEPTED:   'accepted',
  DISPATCHED: 'dispatched',
  PICKED_UP:  'picked_up',
  RETURNED:   'returned',
  // Day 16 (Phase 5, Step 5.6.3) — patient physically back at the Medical
  // Centre; vehicle is free for a new dispatch, but the request stays
  // open (still blocks a duplicate request from the same family) until
  // Drop Off or Drop Off Not Required is resolved.
  ARRIVED:    'arrived',
  COMPLETED:  'completed',   // ← reception marks patient formally received
  CANCELLED:  'cancelled',
};

// Day 16 (Phase 5, Step 5.6.3) — fixed outcomes for closing the drop-off
// leg. Deliberately no free-text reason field — locked to these three.
export const DROP_OFF_OUTCOMES = [
  { label: '🏠 Dropped Off',              value: 'dropped_off' },
  { label: '🏥 Referred to Outside Facility', value: 'referred_outside' },
  { label: '🚶 Patient Opted to Return on Own', value: 'patient_declined' },
];

// ─── MEDICAL TRIP ─────────────────────────────────────────────────────────────
export const MEDICAL_TRIP_DAYS          = ['monday', 'wednesday', 'saturday'];
export const MEDICAL_TRIP_DEPARTURE_MC  = '17:30';
export const MEDICAL_TRIP_DEPARTURE_RYK = '21:00';
export const MEDICAL_TRIP_TOTAL_SEATS   = 26;
export const BOOKING_STATUS = { PENDING: 'pending', APPROVED: 'approved', CANCELLED: 'cancelled' };
export const TRIP_STATUS    = { OPEN: 'open', FULL: 'full', COMPLETED: 'completed', CANCELLED: 'cancelled' };

// ─── VACCINATION ──────────────────────────────────────────────────────────────
export const VACCINE_STATUS = {
  SCHEDULED:    'scheduled',
  ADMINISTERED: 'administered',
  MISSED:       'missed',
  NA:           'na',
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
export const NOTIFICATION_CATEGORIES = {
  HEALTH_AWARENESS:     'health_awareness',
  GENERAL:              'general',
  LAB_REPORT:           'lab_report',
  PHARMACY:             'pharmacy',
  CLAIM_HOLD:           'claim_hold',
  FITNESS_APPOINTMENT:  'fitness_appointment',
  VACCINATION_REMINDER: 'vaccination_reminder',
  TRIP_REMINDER:        'trip_reminder',
  DISPATCH_UPDATE:      'dispatch_update',
};
export const NOTIFICATION_TARGET_TYPES = {
  INDIVIDUAL: 'individual', GROUP: 'group', ALL: 'all',
};

// ─── AVAILABILITY ─────────────────────────────────────────────────────────────
export const AVAILABILITY_STATUS = {
  AVAILABLE: 'available', NOT_AVAILABLE: 'not_available', ON_LEAVE: 'on_leave',
};

// ─── FITNESS ──────────────────────────────────────────────────────────────────
export const FITNESS_STATUS      = { FIT: 'fit', UNFIT: 'unfit', CONDITIONAL: 'conditional' };
export const APPOINTMENT_STATUS  = {
  SCHEDULED: 'scheduled', RESCHEDULED: 'rescheduled',
  COMPLETED: 'completed',  MISSED: 'missed',
};

// ─── WORKING HOURS ────────────────────────────────────────────────────────────
export const WORKING_HOURS = {
  DOCTOR: {
    MON_THU:  { start: '07:30', end: '17:15', lunchStart: '13:00', lunchEnd: '14:00' },
    FRIDAY:   { start: '07:30', end: '12:45' },
    SATURDAY: { start: '07:30', end: '17:15', lunchStart: '13:00', lunchEnd: '14:00' },
  },
  CMO: {
    MON_THU:  { start: '09:15', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
    FRIDAY:   { start: '07:30', end: '12:45' },
    SATURDAY: { start: '07:30', end: '17:15', lunchStart: '13:00', lunchEnd: '14:00' },
  },
};

// ─── FAMILY MODULE ────────────────────────────────────────────────────────────

// ─── CHRONIC DISEASE (Day 14 fix) ─────────────────────────────────────────────
// Multi-select, exactly these 4 — admin/CMO-visible only (see
// employeeRoutes.js PUT /:employeeId/medical).
export const CHRONIC_DISEASE_OPTIONS = [
  'Diabetes',
  'Hypertension',
  'Ischemic Heart Disease',
  'Deranged Lipid Profile',
];

export const FAMILY_RELATIONS = ['spouse', 'son', 'daughter'];

export const FAMILY_MEMBER_STATUS = {
  PENDING:   'pending',
  VALIDATED: 'validated',
  REJECTED:  'rejected',
};

export const EMPLOYMENT_STATUSES = ['employed', 'unemployed'];


// ─── VACCINATION ADDITIONAL CONSTANTS──────────────────────────────────────────────────────────────

export const VACCINE_TYPES  = ['live', 'inactivated', 'oral'];
export const VACCINE_ROUTES = ['intramuscular', 'subcutaneous', 'intradermal', 'oral'];

export const VACCINATION_NURSE = {
  name:        'Zulaikha Yameen',
  designation: 'In-charge Nurse',
  organisation:'Fatima Fertilizer Medical Centre',
};

export const CMO_CREDENTIALS = {
  name:        'Dr. Humayun Shahzad',
  designation: 'Chief Medical Officer',
  organisation:'Fatima Fertilizer Medical Centre',
};

export const VACCINATION_REPORT_DISCLAIMER =
  'This is an electronically generated report from the official FFL Medical Centre App ' +
  'and does not require further signature or manual validation.';