// app/src/screens/admin/UserManagementScreen.js
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
                    <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.expandedPanel}>
                  <View style={styles.divider} />

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