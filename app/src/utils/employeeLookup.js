// app/src/utils/employeeLookup.js
// Resolves an Auth UID to its employees record. `users` docs carry no name —
// the name lives on employees (keyed by auto-ID, linked via userId). Results
// are cached for the app session so lists don't re-read the same employee.

import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

const cache = new Map();

export async function getEmployeeByUid(uid) {
  if (!uid) return null;
  if (cache.has(uid)) return cache.get(uid);
  const pending = getDocs(query(collection(db, 'employees'), where('userId', '==', uid), limit(1)))
    .then(snap => (snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }))
    .catch((err) => {
      cache.delete(uid);
      console.error('Employee lookup failed:', err);
      return null;
    });
  cache.set(uid, pending);
  return pending;
}
