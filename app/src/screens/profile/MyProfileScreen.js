// app/src/screens/profile/MyProfileScreen.js
//
// Day 14 (Phase 4, Step E). Two states on one screen:
//
//   1. NOT YET CONFIRMED (employee.dataConfirmedByEmployee !== true) —
//      shows the greeting, the admin-entered data for review, and the two
//      required checkboxes (data accuracy + blood donor consent). Submits
//      via POST /confirm-profile.
//
//   2. ALREADY CONFIRMED — a normal profile view. Admin-owned fields show
//      read-only. Marital status is the one field the employee can keep
//      editing themselves at any time (PHASE4_DESIGN.md §6) — self-edit via
//      PUT /:employeeId, same route hardened in Step A. Blood donor consent
//      also stays editable here (opt in/out), same route.
//
// Chronic disease is DELIBERATELY never fetched or shown here — it's
// admin/CMO-visible only (see employeeRoutes.js /:employeeId/medical,
// Step E security fix). This screen never calls that route.
//
// Design note: PHASE4_DESIGN.md §5 describes this as something the employee
// sees "on first login after approval." Built here as a normal tile screen
// (added to EmployeeHome.js tiles) rather than a forced popup on login —
// consistent with the rest of the app avoiding blocking modals (same
// reasoning as the Family tab's tap-in-to-see pattern). The Home tile shows
// an unconfirmed-state badge so it's still a visible nudge, not silent.

import { webAlert } from '../../utils/webAlert';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Switch, TextInput,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { API } from '../../config/api';
import NotificationBell from '../../components/NotificationBell';
import {
  MARITAL_STATUSES, DEPARTMENT_GROUPS,
  MANAGEMENT_DESIGNATIONS, NON_MANAGEMENT_DESIGNATIONS, ESB_DESIGNATIONS,
  EMPLOYEE_TYPES,
} from '../../constants';

// ─── Label lookups — stored values are codes, these map back to display text
const ALL_DEPARTMENTS = [
  ...DEPARTMENT_GROUPS.PLANT.departments,
  ...DEPARTMENT_GROUPS.HO.departments,
  ...DEPARTMENT_GROUPS.ESB.departments,
];
const ALL_DESIGNATIONS = [
  ...MANAGEMENT_DESIGNATIONS, ...NON_MANAGEMENT_DESIGNATIONS, ...ESB_DESIGNATIONS,
];
const EMPLOYEE_TYPE_LABELS = {
  [EMPLOYEE_TYPES.MANAGEMENT]:     'Management',
  [EMPLOYEE_TYPES.NON_MANAGEMENT]: 'Non-Management',
  [EMPLOYEE_TYPES.ESB]:            'ESB',
};

const labelFor = (list, value) => list.find(o => o.value === value)?.label || value || '—';

// ─── Read-only field row ──────────────────────────────────────────────────
function FieldRow({ label, value }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '—'}</Text>
    </View>
  );
}

// ─── Marital status dropdown (simple chip picker, matches app convention) ──
function MaritalStatusPicker({ value, onSelect, disabled }) {
  return (
    <View style={styles.chipRow}>
      {MARITAL_STATUSES.map(opt => (
        <TouchableOpacity
          key={opt}
          disabled={disabled}
          style={[styles.chip, value === opt && styles.chipSelected]}
          onPress={() => onSelect(opt)}
        >
          <Text style={[styles.chipText, value === opt && styles.chipTextSelected]}>
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function MyProfileScreen({ navigation }) {
  const [loading,      setLoading]      = useState(true);
  const [employeeId,   setEmployeeId]   = useState(null);
  const [employee,     setEmployee]     = useState(null);

  // Confirmation-step local state
  const [dataConfirmed,     setDataConfirmed]     = useState(false);
  const [bloodDonorConsent, setBloodDonorConsent] = useState(false);
  const [submitting,        setSubmitting]        = useState(false);

  // Post-confirmation editable state
  const [maritalStatus,    setMaritalStatus]    = useState('');
  const [savingMarital,    setSavingMarital]    = useState(false);
  const [savingConsent,    setSavingConsent]    = useState(false);

  // Day 14 fix #5 — smoker status
  const [isSmoker,      setIsSmoker]      = useState(false);
  const [savingSmoker,  setSavingSmoker]  = useState(false);

  // Day 14 fix #6 — correction request
  const [correctionRequested, setCorrectionRequested] = useState(false);
  const [correctionNote,      setCorrectionNote]      = useState('');
  const [correctionInput,     setCorrectionInput]     = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  const db = getFirestore();

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  // ─── Load own employee record ──────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    try {
      const auth = getAuth();
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const q = query(collection(db, 'employees'), where('userId', '==', uid));
      const snap = await getDocs(q);
      if (snap.empty) {
        webAlert('Error', 'Employee record not found.');
        setLoading(false);
        return;
      }

      const doc = snap.docs[0];
      const data = doc.data();
      setEmployeeId(doc.id);
      setEmployee(data);
      setBloodDonorConsent(!!data.bloodDonorConsent);
      setMaritalStatus(data.maritalStatus || '');
      setIsSmoker(!!data.isSmoker); // Day 14 fix #5
      // Day 14 fix #6
      setCorrectionRequested(!!data.correctionRequested);
      setCorrectionNote(data.correctionRequestNote || '');
    } catch (err) {
      console.error('MyProfileScreen fetch error:', err);
      webAlert('Error', 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    fetchProfile();
    const unsubscribe = navigation.addListener('focus', fetchProfile);
    return unsubscribe;
  }, [fetchProfile, navigation]);

  // ─── Submit initial confirmation ───────────────────────────────────────
  const handleConfirm = async () => {
    if (!dataConfirmed) {
      webAlert('Required', 'Please confirm the data above is correct before continuing.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API.auth}/confirm-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dataConfirmed: true, bloodDonorConsent }),
      });
      const data = await res.json();
      if (res.ok) {
        webAlert('Confirmed', 'Thank you — your profile is now confirmed.');
        fetchProfile();
      } else {
        webAlert('Error', data.message || 'Could not confirm your profile.');
      }
    } catch (err) {
      console.error('Confirm profile error:', err);
      webAlert('Error', 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Marital status self-edit (post-confirmation) ──────────────────────
  const handleSaveMaritalStatus = async (newStatus) => {
    if (newStatus === employee?.maritalStatus) return; // no change, skip the call
    setMaritalStatus(newStatus);
    setSavingMarital(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API.employees}/${employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ maritalStatus: newStatus }),
      });
      if (res.ok) {
        setEmployee(prev => ({ ...prev, maritalStatus: newStatus }));
        webAlert('Updated', 'Marital status updated.');
      } else {
        const data = await res.json();
        webAlert('Error', data.message || 'Could not update marital status.');
        setMaritalStatus(employee?.maritalStatus || ''); // revert on failure
      }
    } catch (err) {
      console.error('Update marital status error:', err);
      webAlert('Error', 'Network error. Please try again.');
      setMaritalStatus(employee?.maritalStatus || '');
    } finally {
      setSavingMarital(false);
    }
  };

  // ─── Blood donor consent self-edit (post-confirmation) ─────────────────
  const handleToggleConsent = async (value) => {
    setBloodDonorConsent(value);
    setSavingConsent(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API.employees}/${employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bloodDonorConsent: value }),
      });
      if (!res.ok) {
        const data = await res.json();
        webAlert('Error', data.message || 'Could not update blood donor consent.');
        setBloodDonorConsent(!value); // revert on failure
      }
    } catch (err) {
      console.error('Update consent error:', err);
      webAlert('Error', 'Network error. Please try again.');
      setBloodDonorConsent(!value);
    } finally {
      setSavingConsent(false);
    }
  };

  // ─── Smoker status self-edit (post-confirmation) — Day 14 fix #5 ───────
  const handleToggleSmoker = async (value) => {
    setIsSmoker(value);
    setSavingSmoker(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API.employees}/${employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isSmoker: value }),
      });
      if (!res.ok) {
        const data = await res.json();
        webAlert('Error', data.message || 'Could not update smoker status.');
        setIsSmoker(!value); // revert on failure
      }
    } catch (err) {
      console.error('Update smoker status error:', err);
      webAlert('Error', 'Network error. Please try again.');
      setIsSmoker(!value);
    } finally {
      setSavingSmoker(false);
    }
  };

  // ─── Correction request — Day 14 fix #6 ─────────────────────────────────
  const handleSubmitCorrection = async () => {
    if (!correctionInput.trim()) {
      webAlert('Required', 'Please describe what needs correcting.');
      return;
    }
    setSubmittingCorrection(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API.employees}/${employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          correctionRequested: true,
          correctionRequestNote: correctionInput.trim(),
        }),
      });
      if (res.ok) {
        setCorrectionRequested(true);
        setCorrectionNote(correctionInput.trim());
        setCorrectionInput('');
        webAlert('Submitted', 'Admin has been notified and will review your request.');
      } else {
        const data = await res.json();
        webAlert('Error', data.message || 'Could not submit request.');
      }
    } catch (err) {
      console.error('Submit correction error:', err);
      webAlert('Error', 'Network error. Please try again.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!employee) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText}>Could not load your profile.</Text>
      </View>
    );
  }

  const isConfirmed = !!employee.dataConfirmedByEmployee;
  const departmentLabel   = labelFor(ALL_DEPARTMENTS, employee.department);
  const designationLabel  = labelFor(ALL_DESIGNATIONS, employee.designation);
  const employeeTypeLabel = EMPLOYEE_TYPE_LABELS[employee.employeeType] || '—';

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <NotificationBell navigation={navigation} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>

        {!isConfirmed ? (
          <>
            {/* ─── First-time confirmation state ─────────────────────── */}
            <View style={styles.welcomeCard}>
              <Text style={styles.welcomeTitle}>🎉 Your account has been validated!</Text>
              <Text style={styles.welcomeSub}>
                Please review the details below, entered by the Medical Centre from your
                employment records, and confirm they're correct.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Your Details</Text>
            <View style={styles.card}>
              <FieldRow label="Employee Type" value={employeeTypeLabel} />
              <FieldRow label="Department"    value={departmentLabel} />
              <FieldRow label="Unit"          value={employee.unit} />
              <FieldRow label="Designation"   value={designationLabel} />
              <FieldRow label="Blood Group"   value={employee.bloodGroup} />
            </View>

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setDataConfirmed(!dataConfirmed)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, dataConfirmed && styles.checkboxChecked]}>
                {dataConfirmed && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>I confirm the data above is correct</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setBloodDonorConsent(!bloodDonorConsent)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, bloodDonorConsent && styles.checkboxChecked]}>
                {bloodDonorConsent && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>
                I consent to being listed in the Blood Donor Directory
                {employee.bloodGroup ? ` (${employee.bloodGroup})` : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, (!dataConfirmed || submitting) && styles.submitBtnDisabled]}
              onPress={handleConfirm}
              disabled={!dataConfirmed || submitting}
              activeOpacity={0.8}
            >
              {submitting
                ? <ActivityIndicator color="#ffffff" />
                : <Text style={styles.submitText}>Confirm My Profile</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* ─── Normal profile view, post-confirmation ────────────── */}
            <Text style={styles.sectionTitle}>Employee Details</Text>
            <View style={styles.card}>
              <FieldRow label="Employee Type" value={employeeTypeLabel} />
              <FieldRow label="Department"    value={departmentLabel} />
              <FieldRow label="Unit"          value={employee.unit} />
              <FieldRow label="Designation"   value={designationLabel} />
              <FieldRow label="Blood Group"   value={employee.bloodGroup} />
            </View>
            <Text style={styles.infoNote}>
              These details are managed by the Medical Centre admin.
            </Text>

            {/* Day 14 fix #6 — correction request */}
            {correctionRequested ? (
              <View style={styles.correctionPendingBox}>
                <Text style={styles.correctionPendingTitle}>⏳ Correction request sent</Text>
                <Text style={styles.correctionPendingNote}>{correctionNote}</Text>
                <Text style={styles.correctionPendingHint}>Admin has been notified and will review this.</Text>
              </View>
            ) : (
              <View style={styles.correctionBox}>
                <Text style={styles.correctionTitle}>See something wrong above?</Text>
                <TextInput
                  style={styles.correctionInput}
                  placeholder="e.g. My department should be Maintenance, not Production"
                  placeholderTextColor="#a0aec0"
                  value={correctionInput}
                  onChangeText={setCorrectionInput}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.correctionBtn, submittingCorrection && styles.submitBtnDisabled]}
                  onPress={handleSubmitCorrection}
                  disabled={submittingCorrection}
                >
                  {submittingCorrection
                    ? <ActivityIndicator color="#ffffff" size="small" />
                    : <Text style={styles.correctionBtnText}>Report Incorrect Data</Text>
                  }
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.sectionTitle}>Marital Status</Text>
            <View style={styles.card}>
              <MaritalStatusPicker
                value={maritalStatus}
                onSelect={handleSaveMaritalStatus}
                disabled={savingMarital}
              />
              {savingMarital && <ActivityIndicator style={{ marginTop: 8 }} color="#3b82f6" />}
            </View>

            {/* Day 14 fix #5 — Smoker status */}
            <Text style={styles.sectionTitle}>Smoker Status</Text>
            <View style={[styles.card, styles.consentRow]}>
              <Text style={styles.consentLabel}>I am a smoker</Text>
              <Switch
                value={isSmoker}
                onValueChange={handleToggleSmoker}
                disabled={savingSmoker}
                trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
                thumbColor={isSmoker ? '#3b82f6' : '#cbd5e0'}
              />
            </View>

            <Text style={styles.sectionTitle}>Blood Donor Consent</Text>
            <View style={[styles.card, styles.consentRow]}>
              <Text style={styles.consentLabel}>
                Listed in Blood Donor Directory{employee.bloodGroup ? ` (${employee.bloodGroup})` : ''}
              </Text>
              <Switch
                value={bloodDonorConsent}
                onValueChange={handleToggleConsent}
                disabled={savingConsent}
                trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
                thumbColor={bloodDonorConsent ? '#3b82f6' : '#cbd5e0'}
              />
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, color: '#718096' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 20, backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:     { paddingRight: 8 },
  backText:    { fontSize: 15, color: '#3b82f6', fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#2d3748' },

  container: { padding: 16 },

  welcomeCard: {
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 18,
    marginBottom: 20, borderWidth: 1, borderColor: '#bfdbfe',
  },
  welcomeTitle: { fontSize: 17, fontWeight: '700', color: '#1e40af', marginBottom: 6 },
  welcomeSub:   { fontSize: 13, color: '#1e40af', lineHeight: 19 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#718096',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 8, marginBottom: 8,
  },

  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },

  fieldRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f4f8',
  },
  fieldLabel: { fontSize: 13, color: '#718096' },
  fieldValue: { fontSize: 13, color: '#2d3748', fontWeight: '500' },

  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 2, borderColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10, backgroundColor: '#fff',
  },
  checkboxChecked: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  checkmark:       { color: '#fff', fontSize: 13, fontWeight: '900' },
  checkLabel:      { flex: 1, fontSize: 13, color: '#2d3748' },

  submitBtn: {
    backgroundColor: '#3b82f6', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText:        { color: '#ffffff', fontSize: 15, fontWeight: '600' },

  infoNote: { fontSize: 12, color: '#a0aec0', marginBottom: 12, lineHeight: 17 },

  // Day 14 fix #6
  correctionBox: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0',
  },
  correctionTitle: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 8 },
  correctionInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#2d3748',
    minHeight: 60, textAlignVertical: 'top', backgroundColor: '#f7fafc', marginBottom: 10,
  },
  correctionBtn: {
    backgroundColor: '#f59e0b', borderRadius: 8,
    paddingVertical: 11, alignItems: 'center',
  },
  correctionBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  correctionPendingBox: {
    backgroundColor: '#fffbeb', borderRadius: 12, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: '#fde68a',
  },
  correctionPendingTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 6 },
  correctionPendingNote:  { fontSize: 13, color: '#78350f', marginBottom: 6, lineHeight: 18 },
  correctionPendingHint:  { fontSize: 11, color: '#a16207' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#f7fafc',
  },
  chipSelected:     { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  chipText:         { fontSize: 13, color: '#4a5568', fontWeight: '500' },
  chipTextSelected: { color: '#1d4ed8', fontWeight: '700' },

  consentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  consentLabel: { fontSize: 13, color: '#2d3748', flex: 1, marginRight: 12 },
});