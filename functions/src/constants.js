// app/src/config/constants.js
// Fallback constants — dynamic lists managed in Firestore config/dropdowns

// ─── ROLES ────────────────────────────────────────────────
export const ROLES = {
  EMPLOYEE:          'employee',
  RECEPTION:         'reception',
  DRIVER:            'driver',
  DOCTOR:            'doctor',
  NURSE:             'nurse',
  LAB_TECHNOLOGIST:  'lab_technologist',
  PHARMACY_INCHARGE: 'pharmacy_incharge',
  ADMIN_INCHARGE:    'admin_incharge',
  CMO:               'cmo',
};

// ─── EMPLOYEE TYPE ────────────────────────────────────────
export const EMPLOYEE_TYPES = {
  MANAGEMENT:     'management',
  NON_MANAGEMENT: 'non_management',
  ESB:            'esb',
};

// ─── COMMUNITY GROUPS ─────────────────────────────────────
export const COMMUNITY_GROUPS = {
  MANAGEMENT:        'management',
  NON_MANAGEMENT:    'non_management',
  EDUCATION_SOCIETY: 'education_society',
  FEMALE:            'female',
};

// ─── BLOOD GROUPS ─────────────────────────────────────────
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// ─── MARITAL STATUS ───────────────────────────────────────
export const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed'];

// ─── DEPARTMENTS ──────────────────────────────────────────
// Groups are for display only — not stored in Firestore
export const DEPARTMENT_GROUPS = {
  PLANT: {
    label: 'Plant Functions',
    departments: [
      { label: 'Admin',               value: 'Admin' },
      { label: 'Production (N)',       value: 'Production_N' },
      { label: 'Production (S)',       value: 'Production_S' },
      { label: 'Maintenance',         value: 'Maintenance' },
      { label: 'AIM',                 value: 'AIM' },
      { label: 'BD',                  value: 'BD' },
      { label: 'HSEQT',               value: 'HSEQT' },
      { label: 'E&I',                 value: 'EI' },
      { label: 'DBN',                 value: 'DBN' },
      { label: 'Process Engineering', value: 'Process_Engineering' },
      { label: 'Project Engineering', value: 'Project_Engineering' },
    ],
  },
  HO: {
    label: 'HO Functions',
    departments: [
      { label: 'IT',              value: 'HO_IT' },
      { label: 'HR',              value: 'HO_HR' },
      { label: 'Finance',         value: 'HO_Finance' },
      { label: 'SCF',             value: 'HO_SCF' },
      { label: 'Marketing',       value: 'HO_Marketing' },
      { label: 'Internal Audit',  value: 'HO_Internal_Audit' },
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
  'Admin', 'Production_N', 'Production_S', 'Maintenance',
  'AIM', 'BD', 'HSEQT', 'EI', 'DBN',
  'Process_Engineering', 'Project_Engineering',
  'HO_IT', 'HO_HR', 'HO_Finance', 'HO_SCF', 'HO_Marketing', 'HO_Internal_Audit',
  'ESB',
];

// ─── UNITS (cascading — keyed by department value) ────────
export const UNITS = {
  Admin:               ['Industrial_Relations', 'Admin', 'Medical_Centre', 'Horticulture', 'CET', 'Security', 'Management_Club'],
  Production_N:        ['Ammonia', 'Urea', 'Nitric_Acid', 'OU'],
  Production_S:        ['NP', 'CAN', 'PHS'],
  Maintenance:         ['Workshop', 'OU_Field', 'OU_Equipment', 'Ammonia_Field', 'Ammonia_Equipment', 'NA_Field', 'NA_Equipment', 'Urea_Field', 'Urea_Equipment', 'PHS_Field', 'PHS_Equipment', 'NP_Field', 'NP_Equipment', 'CAN_Field', 'CAN_Equipment', 'Planning'],
  HSEQT:               ['HSE', 'LDC'],
  BD:                  ['BD'],
  DBN:                 ['DBN'],
  AIM:                 ['AIM'],
  EI:                  ['EI'],
  Process_Engineering: ['Laboratory', 'Process_N', 'Process_S'],
  Project_Engineering: ['Civil_Plant', 'Projects', 'Warehouse'],
  HO_IT:               ['HO_IT'],
  HO_HR:               ['HO_HR'],
  HO_Finance:          ['HO_Finance'],
  HO_SCF:              ['HO_SCF'],
  HO_Marketing:        ['HO_Marketing'],
  HO_Internal_Audit:   ['HO_Internal_Audit'],
  ESB:                 [], // No sub-units
};

// ─── DESIGNATIONS ─────────────────────────────────────────

export const MANAGEMENT_DESIGNATIONS = [
  { label: 'GMM (M-13)',                        value: 'GMM_M13' },
  { label: 'Senior Department Manager (M-12A)', value: 'Senior_Department_Manager_M12A' },
  { label: 'Department Manager (M-12)',          value: 'Department_Manager_M12' },
  { label: 'Unit Manager (M-11)',                value: 'Unit_Manager_M11' },
  { label: 'Senior Staff Engineer (M-11)',       value: 'Senior_Staff_Engineer_M11' },
  { label: 'Section Head (M-10)',                value: 'Section_Head_M10' },
  { label: 'Staff Engineer (M-10)',              value: 'Staff_Engineer_M10' },
  { label: 'Senior Engineer (M-9)',              value: 'Senior_Engineer_M9' },
  { label: 'Engineer I (M-8)',                   value: 'Engineer_I_M8' },
  { label: 'Engineer II (M-7)',                  value: 'Engineer_II_M7' },
  { label: 'Engineer III (M-6)',                 value: 'Engineer_III_M6' },
  { label: 'Graduate Trainee Engineer (M-5)',    value: 'Graduate_Trainee_Engineer_M5' },
  { label: 'Sr. Sub Engineer I (MT-6)',          value: 'Sr_Sub_Engineer_I_MT6' },
  { label: 'Sr. Sub Engineer II (MT-5)',         value: 'Sr_Sub_Engineer_II_MT5' },
  { label: 'Sr. Sub Engineer III (MT-4)',        value: 'Sr_Sub_Engineer_III_MT4' },
  { label: 'Sub Engineer I (MT-3)',              value: 'Sub_Engineer_I_MT3' },
  { label: 'Sub Engineer II (MT-2)',             value: 'Sub_Engineer_II_MT2' },
  { label: 'Sub Engineer III (MT-1)',            value: 'Sub_Engineer_III_MT1' },
];

export const NON_MANAGEMENT_DESIGNATIONS = [
  { label: 'Supervisor I (S-8)',    value: 'Supervisor_I_S8' },
  { label: 'Supervisor II (S-7)',   value: 'Supervisor_II_S7' },
  { label: 'Supervisor III (S-6)', value: 'Supervisor_III_S6' },
  { label: 'Head Operator (S-5)',   value: 'Head_Operator_S5' },
  { label: 'Senior Operator (S-4)', value: 'Senior_Operator_S4' },
  { label: 'Operator I (S-3)',      value: 'Operator_I_S3' },
  { label: 'Operator II (S-2)',     value: 'Operator_II_S2' },
  { label: 'Operator III (S-1)',    value: 'Operator_III_S1' },
  { label: 'Apprentice Technician', value: 'Apprentice_Technician' },
];

export const ESB_DESIGNATIONS = [
  { label: 'Director',          value: 'ESB_Director' },
  { label: 'Principal',         value: 'ESB_Principal' },
  { label: 'Vice Principal',    value: 'ESB_Vice_Principal' },
  { label: 'Head Master',       value: 'ESB_Head_Master' },
  { label: 'Head Mistress',     value: 'ESB_Head_Mistress' },
  { label: 'Senior Teacher I',  value: 'ESB_Senior_Teacher_I' },
  { label: 'Senior Teacher II', value: 'ESB_Senior_Teacher_II' },
  { label: 'Senior Teacher III',value: 'ESB_Senior_Teacher_III' },
  { label: 'Teacher I',         value: 'ESB_Teacher_I' },
  { label: 'Teacher II',        value: 'ESB_Teacher_II' },
  { label: 'Teacher III',       value: 'ESB_Teacher_III' },
  { label: 'Trainee Teacher',   value: 'ESB_Trainee_Teacher' },
  { label: 'Contract Teacher',  value: 'ESB_Contract_Teacher' },
];

// Helper — returns correct designation list based on employee type
export const getDesignationsByType = (employeeType) => {
  switch (employeeType) {
    case 'management':     return MANAGEMENT_DESIGNATIONS;
    case 'non_management': return NON_MANAGEMENT_DESIGNATIONS;
    case 'esb':            return ESB_DESIGNATIONS;
    default:               return [];
  }
};

// ─── AMBULANCE ────────────────────────────────────────────
export const VEHICLE_TYPES    = { MINI: 'mini', BLS: 'BLS' };
export const PRIORITY_FLAGS   = { ROUTINE: 'routine', EMERGENCY: 'emergency' };
export const TRIP_TYPES       = { INTRA_TOWNSHIP: 'intra_township', INTERCITY: 'intercity' };
export const AMBULANCE_STATUS = {
  PENDING: 'pending', ACCEPTED: 'accepted', DISPATCHED: 'dispatched',
  PICKED_UP: 'picked_up', RETURNED: 'returned', CANCELLED: 'cancelled',
};

// ─── MEDICAL TRIP ─────────────────────────────────────────
export const MEDICAL_TRIP_DAYS          = ['monday', 'wednesday', 'saturday'];
export const MEDICAL_TRIP_DEPARTURE_MC  = '17:30';
export const MEDICAL_TRIP_DEPARTURE_RYK = '21:00';
export const MEDICAL_TRIP_TOTAL_SEATS   = 26;
export const BOOKING_STATUS = { PENDING: 'pending', APPROVED: 'approved', CANCELLED: 'cancelled' };
export const TRIP_STATUS    = { OPEN: 'open', FULL: 'full', COMPLETED: 'completed', CANCELLED: 'cancelled' };

// ─── VACCINATION ──────────────────────────────────────────
export const VACCINE_STATUS = {
  PENDING: 'pending', ADMINISTERED: 'administered',
  RESCHEDULED: 'rescheduled', MISSED: 'missed',
};

// ─── NOTIFICATIONS ────────────────────────────────────────
export const NOTIFICATION_CATEGORIES = {
  HEALTH_AWARENESS:      'health_awareness',
  GENERAL:               'general',
  LAB_REPORT:            'lab_report',
  PHARMACY:              'pharmacy',
  CLAIM_HOLD:            'claim_hold',
  FITNESS_APPOINTMENT:   'fitness_appointment',
  VACCINATION_REMINDER:  'vaccination_reminder',
  TRIP_REMINDER:         'trip_reminder',
  DISPATCH_UPDATE:       'dispatch_update',
};
export const NOTIFICATION_TARGET_TYPES = {
  INDIVIDUAL: 'individual', GROUP: 'group', ALL: 'all',
};

// ─── AVAILABILITY ─────────────────────────────────────────
export const AVAILABILITY_STATUS = {
  AVAILABLE: 'available', NOT_AVAILABLE: 'not_available', OFF_DUTY: 'off_duty',
};

// ─── FITNESS ──────────────────────────────────────────────
export const FITNESS_STATUS     = { FIT: 'fit', UNFIT: 'unfit', CONDITIONAL: 'conditional' };
export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled', RESCHEDULED: 'rescheduled',
  COMPLETED: 'completed',  MISSED: 'missed',
};

// ─── WORKING HOURS ────────────────────────────────────────
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