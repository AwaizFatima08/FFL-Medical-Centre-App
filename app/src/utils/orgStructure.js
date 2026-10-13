// app/src/utils/orgStructure.js
// Departments, units and designations — editable by admin in
// OrgStructureScreen, stored in Firestore config/orgStructure. Loaded once
// per app session (one document read) and shared by every screen through
// useOrgStructure(). Falls back to the built-in lists in constants.js until
// the document exists or if it can't be read.

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  DEPARTMENT_GROUPS, UNITS, EMPLOYEE_TYPES,
  MANAGEMENT_DESIGNATIONS, NON_MANAGEMENT_DESIGNATIONS, ESB_DESIGNATIONS,
} from '../constants';

export const ESB_DEPARTMENT = 'ESB';

const humanize = (value) => String(value)
  .split('_')
  .filter(Boolean)
  .map(w => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
  .join(' ');

// Mirrors buildSeed() in functions/src/org/orgStructureRoutes.js.
export function buildFallback() {
  return {
    departmentGroups: Object.entries(DEPARTMENT_GROUPS).map(([key, g]) => ({ key, label: g.label })),
    departments: Object.entries(DEPARTMENT_GROUPS).flatMap(([key, g]) =>
      g.departments.map(d => ({
        value: d.value, label: d.label, group: key, archived: false,
        ...(d.value === ESB_DEPARTMENT ? { locked: true } : {}),
      }))),
    units: Object.fromEntries(Object.entries(UNITS).map(([dept, list]) => [
      dept,
      list.map(v => ({
        value: v, label: humanize(v), archived: false,
        ...(dept === ESB_DEPARTMENT ? { locked: true } : {}),
      })),
    ])),
    designations: {
      [EMPLOYEE_TYPES.MANAGEMENT]:     MANAGEMENT_DESIGNATIONS.map(d => ({ ...d, archived: false })),
      [EMPLOYEE_TYPES.NON_MANAGEMENT]: NON_MANAGEMENT_DESIGNATIONS.map(d => ({ ...d, archived: false })),
      [EMPLOYEE_TYPES.ESB]:            ESB_DESIGNATIONS.map(d => ({ ...d, archived: false })),
    },
  };
}

let cache = null;
let inflight = null;
const listeners = new Set();

const publish = (s) => {
  cache = s;
  listeners.forEach(fn => fn(s));
};

export function loadOrgStructure({ force = false } = {}) {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = getDoc(doc(db, 'config', 'orgStructure'))
    .then(snap => {
      publish(snap.exists() ? snap.data() : buildFallback());
      return cache;
    })
    .catch(err => {
      console.error('Could not load org structure:', err);
      return cache || buildFallback();
    })
    .finally(() => { inflight = null; });
  return inflight;
}

// Called after a successful admin edit with the structure the server returned.
export function setOrgStructure(structure) {
  publish(structure);
}

export function useOrgStructure() {
  const [structure, setStructure] = useState(cache || buildFallback());
  useEffect(() => {
    listeners.add(setStructure);
    loadOrgStructure().then(setStructure);
    return () => { listeners.delete(setStructure); };
  }, []);
  return structure;
}

// ─── Option helpers for pickers ──────────────────────────────────────────────
// Archived entries are hidden from new selections, except the one an
// existing record already has (so editing that record doesn't drop it).
const visible = (list, current) =>
  (list || []).filter(i => !i.archived || i.value === current);

export function departmentOptions(s, { current, includeESB = false } = {}) {
  return visible(s.departments, current)
    .filter(d => includeESB || d.value !== ESB_DEPARTMENT);
}

export function unitOptions(s, department, { current } = {}) {
  return visible(s.units?.[department], current);
}

export function designationOptions(s, employeeType, { current } = {}) {
  if (!employeeType) return [];
  const key = Object.keys(s.designations || {})
    .find(k => k.toLowerCase() === String(employeeType).toLowerCase());
  return key ? visible(s.designations[key], current) : [];
}

export function departmentLabel(s, value) {
  return s.departments.find(d => d.value === value)?.label || value || '—';
}

export function unitLabel(s, department, value) {
  const inDept = s.units?.[department]?.find(u => u.value === value);
  if (inDept) return inDept.label;
  const anywhere = Object.values(s.units || {}).flat().find(u => u.value === value);
  return anywhere?.label || (value ? humanize(value) : '—');
}

export function designationLabel(s, value) {
  return Object.values(s.designations || {}).flat().find(d => d.value === value)?.label || value || '—';
}
