// functions/src/org/orgStructureRoutes.js
// Admin-editable departments, units and designations, stored in a single
// Firestore document (config/orgStructure) so every client loads the whole
// structure with one read. Clients read it directly; all writes go through
// here so values stay unique and in-use entries can't be hard-deleted.
//
// Values are immutable once created (employee records store the value);
// only labels can be renamed. "Archive" hides an entry from new selections
// while keeping its label resolvable for records that still use it.

const express = require('express');
const admin   = require('firebase-admin');
const { verifyToken, verifyRole } = require('../auth/authRoutes');
const { successResponse, errorResponse, nowISO } = require('../utils');
const {
  ROLES, EMPLOYEE_TYPES, DEPARTMENT_GROUPS, UNITS,
  MANAGEMENT_DESIGNATIONS, NON_MANAGEMENT_DESIGNATIONS, ESB_DESIGNATIONS,
} = require('../constants');

const router = express.Router();

const EDITOR_ROLES  = [ROLES.ADMIN_INCHARGE, ROLES.CMO];
const KINDS         = ['department', 'unit', 'designation'];
const OPS           = ['add', 'rename', 'archive', 'restore', 'delete'];
const ESB_DEPT      = 'ESB';
const EMP_TYPE_KEYS = [EMPLOYEE_TYPES.MANAGEMENT, EMPLOYEE_TYPES.NON_MANAGEMENT, EMPLOYEE_TYPES.ESB];
const MAX_LABEL     = 60;

const docRef = () => admin.firestore().collection('config').doc('orgStructure');

const humanize = (value) => String(value)
  .split('_')
  .filter(Boolean)
  .map(w => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
  .join(' ');

const buildSeed = () => ({
  version: 1,
  departmentGroups: Object.entries(DEPARTMENT_GROUPS).map(([key, g]) => ({ key, label: g.label })),
  departments: Object.entries(DEPARTMENT_GROUPS).flatMap(([key, g]) =>
    g.departments.map(d => ({
      value: d.value, label: d.label, group: key, archived: false,
      ...(d.value === ESB_DEPT ? { locked: true } : {}),
    }))),
  units: Object.fromEntries(Object.entries(UNITS).map(([dept, list]) => [
    dept,
    list.map(v => ({
      value: v, label: humanize(v), archived: false,
      ...(dept === ESB_DEPT ? { locked: true } : {}),
    })),
  ])),
  designations: {
    [EMPLOYEE_TYPES.MANAGEMENT]:     MANAGEMENT_DESIGNATIONS.map(d => ({ ...d, archived: false })),
    [EMPLOYEE_TYPES.NON_MANAGEMENT]: NON_MANAGEMENT_DESIGNATIONS.map(d => ({ ...d, archived: false })),
    [EMPLOYEE_TYPES.ESB]:            ESB_DESIGNATIONS.map(d => ({ ...d, archived: false })),
  },
});

// "Quality Control (QC)" → "Quality_Control_QC"; uniqueness enforced by caller.
const slugify = (label) => label
  .normalize('NFKD')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 50) || 'item';

const uniqueValue = (base, taken) => {
  let value = base;
  for (let n = 2; taken.has(value); n += 1) value = `${base}_${n}`;
  return value;
};

const allValues = (s, kind) => {
  if (kind === 'department') return new Set(s.departments.map(d => d.value));
  if (kind === 'unit') return new Set(Object.values(s.units).flat().map(u => u.value));
  return new Set(Object.values(s.designations).flat().map(d => d.value));
};

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

// Returns the array an op acts on, validating the scoping parameter.
const targetList = (s, kind, body) => {
  if (kind === 'department') return s.departments;
  if (kind === 'unit') {
    const dept = body.department;
    if (!s.departments.some(d => d.value === dept)) throw new HttpError(400, 'Unknown department');
    if (!s.units[dept]) s.units[dept] = [];
    return s.units[dept];
  }
  const type = body.employeeType;
  if (!EMP_TYPE_KEYS.includes(type)) throw new HttpError(400, 'Unknown employee type');
  if (!s.designations[type]) s.designations[type] = [];
  return s.designations[type];
};

const usageCount = async (kind, body) => {
  const employees = admin.firestore().collection('employees');
  let q;
  if (kind === 'department') q = employees.where('department', '==', body.value);
  else if (kind === 'unit') q = employees.where('department', '==', body.department).where('unit', '==', body.value);
  else q = employees.where('designation', '==', body.value);
  const snap = await q.count().get();
  return snap.data().count;
};

const applyOp = (s, op, kind, body) => {
  const list = targetList(s, kind, body);
  const label = typeof body.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';

  if (op === 'add') {
    if (!label) throw new HttpError(400, 'Name is required');
    if (label.length > MAX_LABEL) throw new HttpError(400, `Name must be ${MAX_LABEL} characters or fewer`);
    if (list.some(i => i.label.toLowerCase() === label.toLowerCase())) {
      throw new HttpError(409, `"${label}" already exists here`);
    }
    const item = { value: uniqueValue(slugify(label), allValues(s, kind)), label, archived: false };
    if (kind === 'department') {
      const group = body.group;
      if (!s.departmentGroups.some(g => g.key === group) || group === 'ESB') {
        throw new HttpError(400, 'Choose Plant Functions or HO Functions');
      }
      item.group = group;
      s.units[item.value] = [];
    }
    list.push(item);
    return item;
  }

  const item = list.find(i => i.value === body.value);
  if (!item) throw new HttpError(404, 'Entry not found');

  if (op === 'rename') {
    if (!label) throw new HttpError(400, 'Name is required');
    if (label.length > MAX_LABEL) throw new HttpError(400, `Name must be ${MAX_LABEL} characters or fewer`);
    if (list.some(i => i !== item && i.label.toLowerCase() === label.toLowerCase())) {
      throw new HttpError(409, `"${label}" already exists here`);
    }
    item.label = label;
    return item;
  }

  if (item.locked) throw new HttpError(400, 'This entry is required by the app and cannot be archived or deleted');

  if (op === 'archive' || op === 'restore') {
    item.archived = op === 'archive';
    return item;
  }

  // delete — caller has already confirmed it is unused
  list.splice(list.indexOf(item), 1);
  if (kind === 'department') delete s.units[item.value];
  return item;
};

// ─── POST / — mutate the structure ───────────────────────────────────────────
// Body: { op, kind, value?, label?, group?, department?, employeeType? }
// Returns the full updated structure so the client can refresh its cache
// without another read.
router.post('/', verifyToken, verifyRole(EDITOR_ROLES), async (req, res) => {
  const body = req.body || {};
  const { op, kind } = body;
  if (!OPS.includes(op) || !KINDS.includes(kind)) {
    return errorResponse(res, 'Invalid operation', 400);
  }

  try {
    if (op === 'delete') {
      const used = await usageCount(kind, body);
      if (used > 0) {
        return res.status(409).json({
          success: false,
          message: `In use by ${used} employee record${used === 1 ? '' : 's'}. Archive it instead, or reassign those employees first.`,
          data: { inUse: used },
        });
      }
    }

    const db = admin.firestore();
    const updated = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef());
      const s = snap.exists ? snap.data() : buildSeed();
      const item = applyOp(s, op, kind, body);
      s.updatedAt = nowISO();
      s.updatedBy = req.user.uid;
      tx.set(docRef(), s);
      return { structure: s, item };
    });

    return successResponse(res, updated, 'Saved');
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(res, err.message, err.status);
    console.error('Org structure update error:', err);
    return errorResponse(res, 'Could not save the change', 500);
  }
});

module.exports = router;
module.exports.buildSeed = buildSeed;
