const { WORKING_HOURS, AVAILABILITY_STATUS } = require('./constants');

// ─── TIMESTAMP ───────────────────────────────────────────
const nowISO = () => new Date().toISOString();

// ─── RESPONSE HELPERS ────────────────────────────────────
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const errorResponse = (res, message = 'An error occurred', statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
  });
};

// ─── ROLE VERIFICATION ───────────────────────────────────
const verifyRole = (userRole, allowedRoles) => {
  return allowedRoles.includes(userRole);
};

// ─── WORKING HOURS CHECK ─────────────────────────────────
const isWithinWorkingHours = (role) => {
  const now = new Date();

  // Pakistan Standard Time (UTC+5)
  const pkOffset = 5 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const pkMinutes = (utcMinutes + pkOffset) % (24 * 60);
  const pkHour = Math.floor(pkMinutes / 60);
  const pkMin = pkMinutes % 60;
  const currentTime = `${String(pkHour).padStart(2, '0')}:${String(pkMin).padStart(2, '0')}`;

  // 0=Sunday, 1=Monday ... 6=Saturday in UTC
  // Adjust day to PKT
  const pkTotalMinutes = utcMinutes + pkOffset;
  const pkDay = (now.getUTCDay() + Math.floor(pkTotalMinutes / (24 * 60))) % 7;

  // Sunday = day off for all
  if (pkDay === 0) return false;

  const schedule = role === 'cmo' ? WORKING_HOURS.CMO : WORKING_HOURS.DOCTOR;

  let hours;
  if (pkDay === 5) {
    // Friday
    hours = schedule.FRIDAY;
  } else if (pkDay === 6) {
    // Saturday
    hours = schedule.SATURDAY;
  } else {
    // Monday to Thursday
    hours = schedule.MON_THU;
  }

  if (!hours) return false;

  const isAfterStart  = currentTime >= hours.start;
  const isBeforeEnd   = currentTime <= hours.end;
  const isInLunch     = hours.lunchStart && hours.lunchEnd &&
                        currentTime >= hours.lunchStart &&
                        currentTime <= hours.lunchEnd;

  return isAfterStart && isBeforeEnd && !isInLunch;
};

// ─── AUTO STATUS RESOLVER ────────────────────────────────
const resolveAutoStatus = (role, currentStatus) => {
  if (!isWithinWorkingHours(role)) {
    return AVAILABILITY_STATUS.OFF_DUTY;
  }
  return currentStatus;
};

// ─── DATE HELPERS ────────────────────────────────────────
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const formatDate = (date) => {
  return new Date(date).toISOString().split('T')[0];
};

const getDayOfWeek = (date) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday',
                'thursday', 'friday', 'saturday'];
  return days[new Date(date).getDay()];
};

// ─── PAKISTAN "TODAY" DATE STRING (Phase 6 — leave scheduling) ───────────
// Returns today's date as YYYY-MM-DD in Pakistan Standard Time (UTC+5),
// not server/UTC time — same offset convention as isWithinWorkingHours
// above, so a leave window's start/end date lines up with the same "day"
// reception sees on their clock, not a UTC day that could be a few hours
// off near midnight.
const getPakistanToday = () => {
  const pkOffsetMs = 5 * 60 * 60 * 1000;
  const pkNow = new Date(Date.now() + pkOffsetMs);
  return pkNow.toISOString().split('T')[0];
};

// ─── NEXT MEDICAL TRIP DATE ──────────────────────────────
const getNextTripDates = (count = 3) => {
  const tripDays = [1, 3, 6]; // Monday, Wednesday, Saturday
  const dates = [];
  let current = new Date();

  while (dates.length < count) {
    current = addDays(current, 1);
    if (tripDays.includes(current.getDay())) {
      dates.push(formatDate(current));
    }
  }
  return dates;
};

// ─── PAGINATION HELPER ───────────────────────────────────
const getPaginationParams = (query) => {
  const page  = parseInt(query.page)  || 1;
  const limit = parseInt(query.limit) || 20;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

// Firestore 'in'/'not-in' queries cap at 10 values. Splits an array into
// chunks of (at most) 10 so a caller can issue one query per chunk instead
// of silently dropping results once the array grows past 10 items.
const chunkArray = (array, size = 10) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// Neutralizes CSV formula injection: a string value starting with
// =, +, -, or @ is interpreted as a formula by Excel/Sheets when the
// exported CSV is opened. Prefixing with a leading apostrophe forces it
// to be read as plain text. Applied to every string field in a row right
// before handing rows to json2csv.
const sanitizeCsvRow = (row) => {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
      out[key] = `'${value}`;
    } else {
      out[key] = value;
    }
  }
  return out;
};

module.exports = {
  nowISO,
  successResponse,
  errorResponse,
  verifyRole,
  isWithinWorkingHours,
  resolveAutoStatus,
  addDays,
  formatDate,
  getDayOfWeek,
  getPakistanToday,
  getNextTripDates,
  getPaginationParams,
  chunkArray,
  sanitizeCsvRow,
};