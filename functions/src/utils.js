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
  getNextTripDates,
  getPaginationParams,
};