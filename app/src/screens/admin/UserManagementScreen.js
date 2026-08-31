// app/src/screens/admin/UserManagementScreen.js
//
// Day 14 fixes #1 and #6: previously this screen could only change role or
// disable/enable an account — there was no way to edit an already-approved
// employee's profile data (department/designation/blood group/etc), and no
// visibility into an employee's request to correct wrong data. Both are
// added here, in the same expanded panel used for role changes.
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
  RefreshControl, Platform, TextInput,
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

const EMPLOYEE_TYPE_OPTIONS = [
  { label: 'Management',     value: EMPLOYEE_TYPES.MANAGEMENT },
  { label: 'Non-Management', value: EMPLOYEE_TYPES.NON_MANAGEMENT },
  { label: 'ESB',            value: EMPLOYEE_TYPES.ESB },
];

const DEPARTMENT_OPTIONS = [
  ...DEPARTMENT_GROUPS.PLANT.departments,
  ...DEPARTMENT_GROUPS.HO.departments,
];

const ESB_DEPARTMENT_VALUE = DEPARTMENT_GROUPS.ESB.departments[0].value; // 'ESB'

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
        text: destructive ? 'Disable' : 'Confirm',
        style: destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);
  }
};

export default function UserManagementScreen({ navigation }) {
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState(null);
  const [actioning,  setActioning]  = useState(null);
  const [search,     setSearch]     = useState('');

  // Day 14 fix #1 — profile-data edit panel state, keyed by employeeId
  const [editingProfile,   setEditingProfile]   = useState(null);
  const [profileLoading,   setProfileLoading]   = useState(false);
  const [profileData,      setProfileData]      = useState({});
  const [profileSaving,    setProfileSaving]    = useState(false);

  // Day 14 fix #6 — resolving a correction request
  const [resolvingCorrection, setResolvingCorrection] = useState(null);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchUsers = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API.auth}/all-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.data || []);
      } else {
        webAlert('Error', data.message || 'Could not load users.');
      }
    } catch {
      webAlert('Error', 'Could not load users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchUsers();
  }, [fetchUsers]));

  const onRefresh = () => { setRefreshing(true); fetchUsers(); };

  const filteredUsers = users.filter(u => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.officialEmployeeNumber.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  const handleDisable = (uid, fullName) => {
    webConfirm(
      'Disable User',
      `Disable ${fullName}? They will not be able to log in until re-enabled. This does not delete their account or data.`,
      async () => {
        setActioning(uid);
        try {
          const token = await getToken();
          const res = await fetch(`${API.auth}/disable-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ uid }),
          });
          const data = await res.json();
          if (res.ok) {
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, isActive: false } : u));
          } else {
            webAlert('Failed', data.message || 'Could not disable user.');
          }
        } catch {
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setActioning(null);
        }
      },
      true
    );
  };

  const handleEnable = (uid, fullName) => {
    webConfirm(
      'Re-enable User',
      `Re-enable ${fullName}? They will be able to log in again immediately.`,
      async () => {
        setActioning(uid);
        try {
          const token = await getToken();
          const res = await fetch(`${API.auth}/enable-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ uid }),
          });
          const data = await res.json();
          if (res.ok) {
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, isActive: true } : u));
          } else {
            webAlert('Failed', data.message || 'Could not re-enable user.');
          }
        } catch {
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setActioning(null);
        }
      }
    );
  };

  const handleChangeRole = (uid, fullName, newRole) => {
    const roleLabel = ROLE_OPTIONS.find(r => r.value === newRole)?.label;
    webConfirm(
      'Change Role',
      `Change ${fullName}'s role to ${roleLabel}?`,
      async () => {
        setActioning(uid);
        try {
          const token = await getToken();
          const res = await fetch(`${API.auth}/change-role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ uid, role: newRole }),
          });
          const data = await res.json();
          if (res.ok) {
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role: newRole } : u));
          } else {
            webAlert('Failed', data.message || 'Could not change role.');
          }
        } catch {
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setActioning(null);
        }
      }
    );
  };

  // ─── Day 14 fix #1 — load an employee's editable profile data ───────────
  const openProfileEdit = async (employeeId) => {
    if (editingProfile === employeeId) { setEditingProfile(null); return; }
    setEditingProfile(employeeId);
    setProfileLoading(true);
    try {
      const token = await getToken();
      const [empRes, medicalRes] = await Promise.all([
        fetch(`${API.employees}/${employeeId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API.employees}/${employeeId}/medical`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const empJson = await empRes.json();
      const medicalJson = medicalRes.ok ? await medicalRes.json() : { data: { chronicDisease: null } };

      if (empRes.ok) {
        const emp = empJson.data;
        setProfileData(prev => ({
          ...prev,
          [employeeId]: {
            employeeType: emp.employeeType || '',
            department:   emp.department   || '',
            unit:         emp.unit         || '',
            designation:  emp.designation  || '',
            bloodGroup:   emp.bloodGroup    || '',
            cnic:         emp.cnic         || '',
            chronicDisease: medicalJson.data?.chronicDisease || [],
          },
        }));
      } else {
        webAlert('Error', 'Could not load employee profile data.');
        setEditingProfile(null);
      }
    } catch (err) {
      console.error('Load profile data error:', err);
      webAlert('Error', 'Network error. Please try again.');
      setEditingProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const getProfile = (employeeId) => profileData[employeeId] || {
    employeeType: '', department: '', unit: '', designation: '',
    bloodGroup: '', cnic: '', chronicDisease: [],
  };

  const setProfileField = (employeeId, field, value) => {
    setProfileData(prev => ({
      ...prev,
      [employeeId]: { ...getProfile(employeeId), [field]: value },
    }));
  };

  const toggleChronicDisease = (employeeId, condition) => {
    const current = getProfile(employeeId).chronicDisease || [];
    const next = current.includes(condition)
      ? current.filter(c => c !== condition)
      : [...current, condition];
    setProfileField(employeeId, 'chronicDisease', next);
  };

  const handleEmployeeTypeChange = (employeeId, employeeType) => {
    if (employeeType === EMPLOYEE_TYPES.ESB) {
      const esbUnit = UNITS[ESB_DEPARTMENT_VALUE]?.[0] || '';
      setProfileData(prev => ({
        ...prev,
        [employeeId]: {
          ...getProfile(employeeId),
          employeeType, department: ESB_DEPARTMENT_VALUE, unit: esbUnit, designation: '',
        },
      }));
    } else {
      setProfileData(prev => ({
        ...prev,
        [employeeId]: {
          ...getProfile(employeeId),
          employeeType, department: '', unit: '', designation: '',
        },
      }));
    }
  };

  const handleDepartmentChange = (employeeId, department) => {
    const options = UNITS[department] || [];
    const autoUnit = options.length === 1 ? options[0] : '';
    setProfileData(prev => ({
      ...prev,
      [employeeId]: { ...getProfile(employeeId), department, unit: autoUnit },
    }));
  };

  // ─── Day 14 fix #1 — save edited profile data ────────────────────────────
  const handleSaveProfile = async (employeeId, fullName) => {
    const profile = getProfile(employeeId);
    webConfirm(
      'Save Changes',
      `Update employee profile data for ${fullName}?`,
      async () => {
        setProfileSaving(true);
        try {
          const token = await getToken();
          const mainRes = await fetch(`${API.employees}/${employeeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              employeeType: profile.employeeType,
              department:   profile.department,
              unit:         profile.unit,
              designation:  profile.designation,
              bloodGroup:   profile.bloodGroup,
              cnic:         profile.cnic,
            }),
          });
          const medicalRes = await fetch(`${API.employees}/${employeeId}/medical`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ chronicDisease: profile.chronicDisease }),
          });

          if (mainRes.ok && medicalRes.ok) {
            webAlert('Saved', 'Employee profile data updated successfully.');
            setEditingProfile(null);
          } else {
            webAlert('Partial Failure', 'Some changes may not have saved. Please re-open and check.');
          }
        } catch (err) {
          console.error('Save profile data error:', err);
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setProfileSaving(false);
        }
      }
    );
  };

  // ─── Day 14 fix #6 — resolve a correction request ────────────────────────
  const handleResolveCorrection = (uid, employeeId, fullName) => {
    webConfirm(
      'Mark Resolved',
      `Mark ${fullName}'s correction request as resolved? Make sure you've already fixed the data above.`,
      async () => {
        setResolvingCorrection(uid);
        try {
          const token = await getToken();
          const res = await fetch(`${API.employees}/${employeeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ correctionRequested: false, correctionRequestNote: null }),
          });
          if (res.ok) {
            setUsers(prev => prev.map(u => u.uid === uid
              ? { ...u, correctionRequested: false, correctionRequestNote: null }
              : u));
          } else {
            const data = await res.json();
            webAlert('Failed', data.message || 'Could not resolve request.');
          }
        } catch {
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setResolvingCorrection(null);
        }
      }
    );
  };

  const roleLabelFor = (value) => ROLE_OPTIONS.find(r => r.value === value)?.label || value;

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
        <Text style={styles.headerTitle}>Manage Users</Text>
        <NotificationBell navigation={navigation} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, employee number, or email"
          placeholderTextColor="#a0aec0"
          value={search}
          onChangeText={setSearch}
        />

        {filteredUsers.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No users found</Text>
            <Text style={styles.emptySubtitle}>
              {search ? 'Try a different search.' : 'Approved users will appear here.'}
            </Text>
          </View>
        )}

        {filteredUsers.map(user => {
          const isExpanded = expanded === user.uid;
          const isActioning = actioning === user.uid;
          const isEditingProfile = editingProfile === user.employeeId;
          const profile = getProfile(user.employeeId);
          const unitOptions = UNITS[profile.department] || [];
          const designationOptions = profile.employeeType
            ? getDesignationsByType(profile.employeeType)
            : [];
          const isESB = profile.employeeType === EMPLOYEE_TYPES.ESB;
          const isResolvingThis = resolvingCorrection === user.uid;

          return (
            <View key={user.uid} style={styles.card}>
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
                    <Text style={styles.roleText}>{roleLabelFor(user.role)}</Text>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <View style={[styles.statusBadge, user.isActive ? styles.activeBadge : styles.disabledBadge]}>
                      <Text style={[styles.statusBadgeText, user.isActive ? styles.activeBadgeText : styles.disabledBadgeText]}>
                        {user.isActive ? 'Active' : 'Disabled'}
                      </Text>
                    </View>
                    {user.correctionRequested && (
                      <View style={styles.correctionBadge}>
                        <Text style={styles.correctionBadgeText}>Data Issue Reported</Text>
                      </View>
                    )}
                    <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.expandedPanel}>
                  <View style={styles.divider} />

                  {user.correctionRequested && (
                    <View style={styles.correctionNoteBox}>
                      <Text style={styles.correctionNoteTitle}>📌 Employee reported an issue:</Text>
                      <Text style={styles.correctionNoteText}>{user.correctionRequestNote}</Text>
                      <TouchableOpacity
                        style={[styles.resolveBtn, isResolvingThis && styles.btnDisabledOpacity]}
                        disabled={isResolvingThis}
                        onPress={() => handleResolveCorrection(user.uid, user.employeeId, user.fullName)}
                      >
                        {isResolvingThis
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.resolveBtnText}>Mark Resolved</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={styles.roleLabel}>Change Role</Text>
                  <View style={styles.roleGrid}>
                    {ROLE_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.roleChip,
                          user.role === opt.value && styles.roleChipSelected,
                        ]}
                        disabled={isActioning || user.role === opt.value}
                        onPress={() => handleChangeRole(user.uid, user.fullName, opt.value)}
                      >
                        <Text style={[
                          styles.roleChipText,
                          user.role === opt.value && styles.roleChipTextSelected,
                        ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {user.employeeId && (
                    <>
                      <TouchableOpacity
                        style={styles.editProfileToggle}
                        onPress={() => openProfileEdit(user.employeeId)}
                      >
                        <Text style={styles.editProfileToggleText}>
                          {isEditingProfile ? '▲ Hide Employee Profile Data' : '▼ Edit Employee Profile Data'}
                        </Text>
                      </TouchableOpacity>

                      {isEditingProfile && (
                        profileLoading ? (
                          <ActivityIndicator color="#3b82f6" style={{ marginVertical: 12 }} />
                        ) : (
                          <View style={styles.profileEditBox}>
                            <Text style={styles.roleLabel}>Employee Type</Text>
                            <View style={styles.roleGrid}>
                              {EMPLOYEE_TYPE_OPTIONS.map(opt => (
                                <TouchableOpacity
                                  key={opt.value}
                                  style={[styles.roleChip, profile.employeeType === opt.value && styles.roleChipSelected]}
                                  onPress={() => handleEmployeeTypeChange(user.employeeId, opt.value)}
                                >
                                  <Text style={[styles.roleChipText, profile.employeeType === opt.value && styles.roleChipTextSelected]}>
                                    {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>

                            {profile.employeeType && !isESB && (
                              <>
                                <Text style={styles.roleLabel}>Department</Text>
                                <View style={styles.roleGrid}>
                                  {DEPARTMENT_OPTIONS.map(opt => (
                                    <TouchableOpacity
                                      key={opt.value}
                                      style={[styles.roleChip, profile.department === opt.value && styles.roleChipSelected]}
                                      onPress={() => handleDepartmentChange(user.employeeId, opt.value)}
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

                            {profile.department && unitOptions.length > 0 && (
                              <>
                                <Text style={styles.roleLabel}>Unit</Text>
                                <View style={styles.roleGrid}>
                                  {unitOptions.map(opt => (
                                    <TouchableOpacity
                                      key={opt}
                                      style={[styles.roleChip, profile.unit === opt && styles.roleChipSelected]}
                                      onPress={() => setProfileField(user.employeeId, 'unit', opt)}
                                    >
                                      <Text style={[styles.roleChipText, profile.unit === opt && styles.roleChipTextSelected]}>
                                        {opt}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </>
                            )}

                            {profile.employeeType && designationOptions.length > 0 && (
                              <>
                                <Text style={styles.roleLabel}>Designation</Text>
                                <View style={styles.roleGrid}>
                                  {designationOptions.map(opt => (
                                    <TouchableOpacity
                                      key={opt.value}
                                      style={[styles.roleChip, profile.designation === opt.value && styles.roleChipSelected]}
                                      onPress={() => setProfileField(user.employeeId, 'designation', opt.value)}
                                    >
                                      <Text style={[styles.roleChipText, profile.designation === opt.value && styles.roleChipTextSelected]}>
                                        {opt.label}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </>
                            )}

                            <Text style={styles.roleLabel}>Blood Group</Text>
                            <View style={styles.roleGrid}>
                              {BLOOD_GROUPS.map(opt => (
                                <TouchableOpacity
                                  key={opt}
                                  style={[styles.roleChip, profile.bloodGroup === opt && styles.roleChipSelected]}
                                  onPress={() => setProfileField(user.employeeId, 'bloodGroup', opt)}
                                >
                                  <Text style={[styles.roleChipText, profile.bloodGroup === opt && styles.roleChipTextSelected]}>
                                    {opt}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>

                            <Text style={styles.roleLabel}>CNIC</Text>
                            <TextInput
                              style={styles.cnicInput}
                              placeholder="XXXXX-XXXXXXX-X"
                              placeholderTextColor="#a0aec0"
                              value={profile.cnic}
                              onChangeText={(text) => setProfileField(user.employeeId, 'cnic', text)}
                            />

                            <Text style={styles.roleLabel}>Chronic Disease (admin/CMO-visible only)</Text>
                            <View style={styles.roleGrid}>
                              {CHRONIC_DISEASE_OPTIONS.map(opt => {
                                const selected = (profile.chronicDisease || []).includes(opt);
                                return (
                                  <TouchableOpacity
                                    key={opt}
                                    style={[styles.roleChip, selected && styles.roleChipSelected]}
                                    onPress={() => toggleChronicDisease(user.employeeId, opt)}
                                  >
                                    <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>
                                      {opt}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>

                            <TouchableOpacity
                              style={[styles.saveProfileBtn, profileSaving && styles.btnDisabledOpacity]}
                              disabled={profileSaving}
                              onPress={() => handleSaveProfile(user.employeeId, user.fullName)}
                            >
                              {profileSaving
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Text style={styles.saveProfileBtnText}>Save Profile Changes</Text>
                              }
                            </TouchableOpacity>
                          </View>
                        )
                      )}
                    </>
                  )}

                  <View style={styles.actionRow}>
                    {user.isActive ? (
                      <TouchableOpacity
                        style={[styles.btnDisable, isActioning && styles.btnDisabledOpacity]}
                        disabled={isActioning}
                        onPress={() => handleDisable(user.uid, user.fullName)}
                      >
                        {isActioning
                          ? <ActivityIndicator color="#c53030" size="small" />
                          : <Text style={styles.btnDisableText}>Disable Account</Text>
                        }
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.btnEnable, isActioning && styles.btnDisabledOpacity]}
                        disabled={isActioning}
                        onPress={() => handleEnable(user.uid, user.fullName)}
                      >
                        {isActioning
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.btnEnableText}>Re-enable Account</Text>
                        }
                      </TouchableOpacity>
                    )}
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

  searchInput: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#1e293b', backgroundColor: '#fff',
    marginBottom: 16,
  },

  emptyBox:      { alignItems: 'center', marginTop: 60 },
  emptyTitle:    { fontSize: 16, fontWeight: '600', color: '#2d3748', marginBottom: 6 },
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

  userName:  { fontSize: 15, fontWeight: '700', color: '#2d3748', marginBottom: 3 },
  userMeta:  { fontSize: 12, color: '#718096', marginBottom: 2 },
  userEmail: { fontSize: 12, color: '#4a5568', marginBottom: 2 },
  roleText:  { fontSize: 12, color: '#3182ce', fontWeight: '600' },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  activeBadge:   { backgroundColor: '#e6fffa' },
  disabledBadge: { backgroundColor: '#fff5f5' },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  activeBadgeText:   { color: '#2c7a7b' },
  disabledBadgeText: { color: '#c53030' },
  chevron: { fontSize: 12, color: '#a0aec0', marginTop: 4 },

  correctionBadge: {
    backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  correctionBadgeText: { fontSize: 10, color: '#92400e', fontWeight: '700' },
  correctionNoteBox: {
    backgroundColor: '#fffbeb', borderRadius: 8, padding: 12,
    marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#f59e0b',
  },
  correctionNoteTitle: { fontSize: 12, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  correctionNoteText:  { fontSize: 13, color: '#78350f', marginBottom: 10, lineHeight: 18 },
  resolveBtn: {
    backgroundColor: '#10b981', borderRadius: 8,
    paddingVertical: 9, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 16,
  },
  resolveBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },

  expandedPanel: { marginTop: 12 },
  divider:       { height: 1, backgroundColor: '#e2e8f0', marginBottom: 14 },

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

  editProfileToggle: { paddingVertical: 10, marginBottom: 4 },
  editProfileToggleText: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },
  profileEditBox: {
    backgroundColor: '#f7fafc', borderRadius: 10, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0',
  },
  readOnlyNote: {
    backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
  },
  readOnlyNoteText: { fontSize: 12, color: '#4a5568' },
  cnicInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#2d3748',
    backgroundColor: '#ffffff', marginBottom: 16,
  },
  saveProfileBtn: {
    backgroundColor: '#2563eb', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  saveProfileBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },

  actionRow: { flexDirection: 'row' },
  btnDisable: {
    flex: 1, borderRadius: 8, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1.5,
    borderColor: '#fc8181', backgroundColor: '#fff5f5',
  },
  btnDisableText: { color: '#c53030', fontSize: 14, fontWeight: '700' },
  btnEnable: {
    flex: 1, borderRadius: 8, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#2563eb',
  },
  btnEnableText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  btnDisabledOpacity: { opacity: 0.5 },
});