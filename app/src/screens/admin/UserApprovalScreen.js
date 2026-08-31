// app/src/screens/admin/UserApprovalScreen.js
//
// Day 14 (Phase 4, Step D): approval panel now also captures the employee's
// profile data (employee type, department, unit, designation, blood group,
// chronic disease) at the same time as approving their account — per
// PHASE4_DESIGN.md §4, medical centre already holds this data, so admin
// enters it once here rather than the employee self-entering it later.
//
// Employee Type is picked FIRST (not derivable from department — a person
// in "Production" could be Management or Non-Management). Department, Unit,
// and Designation all cascade from it, using the same constants.js lists
// already locked in Phase 3 (EMPLOYEE_TYPES, DEPARTMENT_GROUPS, UNITS,
// getDesignationsByType, BLOOD_GROUPS).
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
  RefreshControl, Platform,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import NotificationBell from '../../components/NotificationBell';
import {
  EMPLOYEE_TYPES, DEPARTMENT_GROUPS, UNITS,
  getDesignationsByType, BLOOD_GROUPS, CHRONIC_DISEASE_OPTIONS,
} from '../../constants';

const ROLE_OPTIONS = [
  { label: 'Employee',          value: 'employee' },
  { label: 'Reception',         value: 'reception' },
  { label: 'Doctor',            value: 'doctor' },
  { label: 'Nurse',             value: 'nurse' },
  { label: 'Lab Technologist',  value: 'lab_technologist' },
  { label: 'Pharmacy Incharge', value: 'pharmacy_incharge' },
  { label: 'Driver',            value: 'driver' },
  { label: 'Admin Incharge',    value: 'admin_incharge' },
  { label: 'CMO',               value: 'cmo' },
];

// Day 14, Step D — Employee Type options for the new profile section
const EMPLOYEE_TYPE_OPTIONS = [
  { label: 'Management',     value: EMPLOYEE_TYPES.MANAGEMENT },
  { label: 'Non-Management', value: EMPLOYEE_TYPES.NON_MANAGEMENT },
  { label: 'ESB',            value: EMPLOYEE_TYPES.ESB },
];

// Day 14, Step D — Plant + HO departments only; ESB is auto-handled
// separately since it's a single fixed value with no real choice to make.
const DEPARTMENT_OPTIONS = [
  ...DEPARTMENT_GROUPS.PLANT.departments,
  ...DEPARTMENT_GROUPS.HO.departments,
];

const ESB_DEPARTMENT_VALUE = DEPARTMENT_GROUPS.ESB.departments[0].value; // 'ESB'

// Alert.alert is silent on Expo web — use window.confirm instead.
// On native (Android/iOS) Alert.alert works normally.
const webAlert = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const webConfirm = (title, message, onConfirm, destructive = false) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: destructive ? 'Reject' : 'Approve',
        style: destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);
  }
};

export default function UserApprovalScreen({ navigation }) {
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState(null);
  const [roles,      setRoles]      = useState({});
  const [actioning,  setActioning]  = useState(null);

  // Day 14, Step D — profile data keyed by uid:
  // { employeeType, department, unit, designation, bloodGroup, chronicDisease }
  const [profileData, setProfileData] = useState({});

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchPending = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API.auth}/pending-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.data || []);
        const defaultRoles = {};
        (data.data || []).forEach(u => { defaultRoles[u.uid] = 'employee'; });
        setRoles(prev => ({ ...defaultRoles, ...prev }));
      }
    } catch {
      webAlert('Error', 'Could not load pending users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchPending();
  }, [fetchPending]));

  const onRefresh = () => { setRefreshing(true); fetchPending(); };

  // ─── Day 14, Step D — profile field helpers ──────────────────────────────
  const getProfile = (uid) => profileData[uid] || {
    employeeType: '', department: '', unit: '', designation: '',
    bloodGroup: '', chronicDisease: [],
  };

  const toggleChronicDisease = (uid, condition) => {
    const current = getProfile(uid).chronicDisease || [];
    const next = current.includes(condition)
      ? current.filter(c => c !== condition)
      : [...current, condition];
    setProfileField(uid, 'chronicDisease', next);
  };

  const setProfileField = (uid, field, value) => {
    setProfileData(prev => ({
      ...prev,
      [uid]: { ...getProfile(uid), [field]: value },
    }));
  };

  // Employee Type change cascades: ESB auto-fills department + unit
  // (both fixed, single-option); anything else resets department/unit/
  // designation so admin picks fresh for the new type.
  const handleEmployeeTypeChange = (uid, employeeType) => {
    if (employeeType === EMPLOYEE_TYPES.ESB) {
      const esbUnit = UNITS[ESB_DEPARTMENT_VALUE]?.[0] || '';
      setProfileData(prev => ({
        ...prev,
        [uid]: {
          ...getProfile(uid),
          employeeType,
          department: ESB_DEPARTMENT_VALUE,
          unit: esbUnit,
          designation: '',
        },
      }));
    } else {
      setProfileData(prev => ({
        ...prev,
        [uid]: {
          ...getProfile(uid),
          employeeType, department: '', unit: '', designation: '',
        },
      }));
    }
  };

  // Department change cascades: reset unit, auto-select if the department
  // only has one possible unit (several do — BD, DBN, AIM, EI's not single
  // but HO_* and BD/DBN are — saves the admin a redundant tap).
  const handleDepartmentChange = (uid, department) => {
    const options = UNITS[department] || [];
    const autoUnit = options.length === 1 ? options[0] : '';
    setProfileData(prev => ({
      ...prev,
      [uid]: { ...getProfile(uid), department, unit: autoUnit },
    }));
  };

  const handleApprove = (uid) => {
    const role = roles[uid];
    if (!role) { webAlert('Select Role', 'Please select a role before approving.'); return; }

    // Day 14, Step D — profile data must be complete before approving.
    const profile = getProfile(uid);
    const unitOptions = UNITS[profile.department] || [];
    if (!profile.employeeType) { webAlert('Required', 'Please select Employee Type.'); return; }
    if (!profile.department)   { webAlert('Required', 'Please select Department.'); return; }
    if (unitOptions.length > 0 && !profile.unit) { webAlert('Required', 'Please select Unit.'); return; }
    if (!profile.designation)  { webAlert('Required', 'Please select Designation.'); return; }
    if (!profile.bloodGroup)   { webAlert('Required', 'Please select Blood Group.'); return; }

    const roleLabel = ROLE_OPTIONS.find(r => r.value === role)?.label;
    const user = users.find(u => u.uid === uid);

    webConfirm(
      'Confirm Approval',
      `Approve this user as ${roleLabel}?\n\nThey will be able to log in immediately.`,
      async () => {
        setActioning(uid);
        try {
          const token = await getToken();

          // 1. Approve the account (existing flow, unchanged)
          const res = await fetch(`${API.auth}/approve-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ uid, role }),
          });
          const data = await res.json();
          if (!res.ok) {
            webAlert('Failed', data.message || 'Could not approve user.');
            setActioning(null);
            return;
          }

          // 2. Day 14, Step D — save profile data onto the employee record.
          // Uses the same PUT /:employeeId route hardened in Step A; admin
          // callers are allowed to write these admin-owned fields.
          if (user?.employeeId) {
            try {
              const profileRes = await fetch(`${API.employees}/${user.employeeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  employeeType: profile.employeeType,
                  department:   profile.department,
                  unit:         profile.unit,
                  designation:  profile.designation,
                  bloodGroup:   profile.bloodGroup,
                }),
              });
              if (!profileRes.ok) {
                webAlert(
                  'Partially Approved',
                  'The user was approved, but their profile data could not be saved. Please edit their profile manually.'
                );
              }

              // 2b. Day 14, Step E fix — chronic disease goes through its
              // own admin/CMO-only route, writing to a restricted
              // subcollection rather than the openly-readable employee
              // document. Separate call, separate failure message, so a
              // failure here doesn't get confused with the main profile save.
              if (profile.chronicDisease && profile.chronicDisease.length > 0) {
                const medicalRes = await fetch(`${API.employees}/${user.employeeId}/medical`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ chronicDisease: profile.chronicDisease }),
                });
                if (!medicalRes.ok) {
                  webAlert(
                    'Partially Approved',
                    'The user was approved, but chronic disease data could not be saved. Please add it manually.'
                  );
                }
              }
            } catch (profileErr) {
              console.error('Save profile error:', profileErr);
              webAlert(
                'Partially Approved',
                'The user was approved, but their profile data could not be saved. Please edit their profile manually.'
              );
            }
          }

          webAlert('Approved', 'User has been activated successfully.');
          setUsers(prev => prev.filter(u => u.uid !== uid));
          setExpanded(null);
        } catch (err) {
          console.error('Approve error:', err);
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setActioning(null);
        }
      }
    );
  };

  const handleReject = (uid, fullName) => {
    webConfirm(
      'Reject Request',
      `Permanently delete signup request from ${fullName}?\n\nThis cannot be undone.`,
      async () => {
        setActioning(uid);
        try {
          const token = await getToken();
          const res = await fetch(`${API.auth}/reject-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ uid }),
          });
          const data = await res.json();
          if (res.ok) {
            webAlert('Rejected', 'Signup request has been removed.');
            setUsers(prev => prev.filter(u => u.uid !== uid));
            setExpanded(null);
          } else {
            webAlert('Failed', data.message || 'Could not reject user.');
          }
        } catch (err) {
          console.error('Reject error:', err);
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setActioning(null);
        }
      },
      true // destructive
    );
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Approvals</Text>
        <NotificationBell navigation={navigation} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            {users.length === 0
              ? 'No pending signup requests'
              : `${users.length} pending request${users.length > 1 ? 's' : ''}`}
          </Text>
          <Text style={styles.summaryHint}>
            Call the employee to verify identity before approving
          </Text>
        </View>

        {users.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptySubtitle}>No pending signup requests at this time.</Text>
          </View>
        )}

        {users.map(user => {
          const isExpanded = expanded === user.uid;
          const isActioning = actioning === user.uid;
          const profile = getProfile(user.uid);
          const unitOptions = UNITS[profile.department] || [];
          const designationOptions = profile.employeeType
            ? getDesignationsByType(profile.employeeType)
            : [];
          const isESB = profile.employeeType === EMPLOYEE_TYPES.ESB;

          return (
            <View key={user.uid} style={styles.card}>

              {/* Only the header row collapses/expands the card */}
              <TouchableOpacity
                onPress={() => setExpanded(isExpanded ? null : user.uid)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.userName}>{user.fullName}</Text>
                    <Text style={styles.userMeta}>
                      {user.officialEmployeeNumber}  ·  {user.phoneNumber}
                    </Text>
                    <Text style={styles.userEmail}>{user.email || 'No email'}</Text>
                    <Text style={styles.submittedAt}>Submitted: {formatDate(user.createdAt)}</Text>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Pending</Text>
                    </View>
                    <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Expanded panel — plain View, no parent touch handler */}
              {isExpanded && (
                <View style={styles.expandedPanel}>
                  <View style={styles.divider} />

                  <View style={styles.verifyBox}>
                    <Text style={styles.verifyIcon}>📞</Text>
                    <Text style={styles.verifyText}>
                      Call <Text style={styles.verifyBold}>{user.phoneNumber}</Text> to verify identity before approving.
                    </Text>
                  </View>

                  <Text style={styles.roleLabel}>Assign Role</Text>
                  <View style={styles.roleGrid}>
                    {ROLE_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.roleChip,
                          (roles[user.uid] || 'employee') === opt.value && styles.roleChipSelected,
                        ]}
                        onPress={() => setRoles(prev => ({ ...prev, [user.uid]: opt.value }))}
                      >
                        <Text style={[
                          styles.roleChipText,
                          (roles[user.uid] || 'employee') === opt.value && styles.roleChipTextSelected,
                        ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* ─── Day 14, Step D — Employee Profile Data ─────────── */}
                  <View style={styles.profileSectionDivider} />
                  <Text style={styles.profileSectionTitle}>Employee Profile Data</Text>
                  <Text style={styles.profileSectionHint}>
                    Enter this from medical centre / HR records. The employee will only
                    confirm it, not edit it, after approval.
                  </Text>

                  {/* Employee Type */}
                  <Text style={styles.roleLabel}>Employee Type</Text>
                  <View style={styles.roleGrid}>
                    {EMPLOYEE_TYPE_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.roleChip, profile.employeeType === opt.value && styles.roleChipSelected]}
                        onPress={() => handleEmployeeTypeChange(user.uid, opt.value)}
                      >
                        <Text style={[styles.roleChipText, profile.employeeType === opt.value && styles.roleChipTextSelected]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Department — hidden for ESB, it's auto-set */}
                  {profile.employeeType && !isESB && (
                    <>
                      <Text style={styles.roleLabel}>Department</Text>
                      <View style={styles.roleGrid}>
                        {DEPARTMENT_OPTIONS.map(opt => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.roleChip, profile.department === opt.value && styles.roleChipSelected]}
                            onPress={() => handleDepartmentChange(user.uid, opt.value)}
                          >
                            <Text style={[styles.roleChipText, profile.department === opt.value && styles.roleChipTextSelected]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                  {isESB && (
                    <View style={styles.readOnlyNote}>
                      <Text style={styles.readOnlyNoteText}>Department: Education Society Board (auto-set)</Text>
                    </View>
                  )}

                  {/* Unit — cascades from department */}
                  {profile.department && unitOptions.length > 0 && (
                    <>
                      <Text style={styles.roleLabel}>Unit</Text>
                      <View style={styles.roleGrid}>
                        {unitOptions.map(opt => (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.roleChip, profile.unit === opt && styles.roleChipSelected]}
                            onPress={() => setProfileField(user.uid, 'unit', opt)}
                          >
                            <Text style={[styles.roleChipText, profile.unit === opt && styles.roleChipTextSelected]}>
                              {opt}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Designation — cascades from employee type */}
                  {profile.employeeType && designationOptions.length > 0 && (
                    <>
                      <Text style={styles.roleLabel}>Designation</Text>
                      <View style={styles.roleGrid}>
                        {designationOptions.map(opt => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.roleChip, profile.designation === opt.value && styles.roleChipSelected]}
                            onPress={() => setProfileField(user.uid, 'designation', opt.value)}
                          >
                            <Text style={[styles.roleChipText, profile.designation === opt.value && styles.roleChipTextSelected]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Blood Group */}
                  <Text style={styles.roleLabel}>Blood Group</Text>
                  <View style={styles.roleGrid}>
                    {BLOOD_GROUPS.map(opt => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.roleChip, profile.bloodGroup === opt && styles.roleChipSelected]}
                        onPress={() => setProfileField(user.uid, 'bloodGroup', opt)}
                      >
                        <Text style={[styles.roleChipText, profile.bloodGroup === opt && styles.roleChipTextSelected]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Chronic Disease — multi-select, optional, admin/CMO-visible only */}
                  <Text style={styles.roleLabel}>Chronic Disease (optional, admin/CMO-visible only)</Text>
                  <View style={styles.roleGrid}>
                    {CHRONIC_DISEASE_OPTIONS.map(opt => {
                      const selected = (profile.chronicDisease || []).includes(opt);
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.roleChip, selected && styles.roleChipSelected]}
                          onPress={() => toggleChronicDisease(user.uid, opt)}
                        >
                          <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.btnReject, isActioning && styles.btnDisabled]}
                      disabled={isActioning}
                      onPress={() => handleReject(user.uid, user.fullName)}
                    >
                      {isActioning
                        ? <ActivityIndicator color="#e53e3e" size="small" />
                        : <Text style={styles.btnRejectText}>Reject</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnApprove, isActioning && styles.btnDisabled]}
                      disabled={isActioning}
                      onPress={() => handleApprove(user.uid)}
                    >
                      {isActioning
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.btnApproveText}>Approve</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:  { flex: 1, backgroundColor: '#f0f4f8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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

  summaryBar: {
    backgroundColor: '#fffbeb', borderRadius: 10,
    padding: 14, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#f59e0b',
  },
  summaryText: { fontSize: 14, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  summaryHint: { fontSize: 12, color: '#b45309' },

  emptyBox:      { alignItems: 'center', marginTop: 60 },
  emptyIcon:     { fontSize: 56, marginBottom: 16 },
  emptyTitle:    { fontSize: 18, fontWeight: '600', color: '#2d3748', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: '#718096' },

  card: {
    backgroundColor: '#ffffff', borderRadius: 12,
    padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },

  cardHeader:      { flexDirection: 'row', justifyContent: 'space-between' },
  cardHeaderLeft:  { flex: 1, marginRight: 8 },
  cardHeaderRight: { alignItems: 'flex-end', gap: 6 },

  userName:    { fontSize: 15, fontWeight: '700', color: '#2d3748', marginBottom: 3 },
  userMeta:    { fontSize: 12, color: '#718096', marginBottom: 2 },
  userEmail:   { fontSize: 12, color: '#4a5568' },
  submittedAt: { fontSize: 11, color: '#a0aec0', marginTop: 4 },

  pendingBadge: {
    backgroundColor: '#fef3c7', paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 10,
  },
  pendingBadgeText: { fontSize: 11, color: '#92400e', fontWeight: '700' },
  chevron:          { fontSize: 12, color: '#a0aec0', marginTop: 4 },

  expandedPanel: { marginTop: 12 },
  divider:       { height: 1, backgroundColor: '#e2e8f0', marginBottom: 14 },

  verifyBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#eff6ff', borderRadius: 8,
    padding: 12, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#3b82f6',
  },
  verifyIcon: { fontSize: 16, marginRight: 8 },
  verifyText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 18 },
  verifyBold: { fontWeight: '700' },

  roleLabel: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 10 },
  roleGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  roleChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: '#e2e8f0', backgroundColor: '#f7fafc',
  },
  roleChipSelected:     { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  roleChipText:         { fontSize: 12, color: '#4a5568', fontWeight: '500' },
  roleChipTextSelected: { color: '#1d4ed8', fontWeight: '700' },

  // Day 14, Step D
  profileSectionDivider: { height: 1, backgroundColor: '#e2e8f0', marginTop: 4, marginBottom: 14 },
  profileSectionTitle:   { fontSize: 14, fontWeight: '700', color: '#2d3748', marginBottom: 4 },
  profileSectionHint:    { fontSize: 12, color: '#718096', marginBottom: 14, lineHeight: 17 },
  readOnlyNote: {
    backgroundColor: '#f7fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
  },
  readOnlyNoteText: { fontSize: 12, color: '#4a5568' },
  chronicInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#2d3748',
    minHeight: 60, textAlignVertical: 'top', backgroundColor: '#ffffff', marginBottom: 16,
  },

  actionRow: { flexDirection: 'row', gap: 10 },
  btnReject: {
    flex: 1, borderRadius: 8, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1.5,
    borderColor: '#fc8181', backgroundColor: '#fff5f5',
  },
  btnRejectText:  { color: '#c53030', fontSize: 14, fontWeight: '700' },
  btnApprove: {
    flex: 2, borderRadius: 8, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#2563eb',
  },
  btnApproveText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  btnDisabled:    { opacity: 0.5 },
});