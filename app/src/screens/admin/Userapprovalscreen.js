// app/src/screens/admin/UserApprovalScreen.js
// Admin reviews pending signup requests, assigns role, approves or rejects.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
  RefreshControl,
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

function RolePicker({ selected, onSelect }) {
  return (
    <View style={styles.roleGrid}>
      {ROLE_OPTIONS.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.roleChip, selected === opt.value && styles.roleChipSelected]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={[styles.roleChipText, selected === opt.value && styles.roleChipTextSelected]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function UserApprovalScreen({ navigation }) {
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState(null);   // uid of expanded card
  const [roles,      setRoles]      = useState({});     // { uid: selectedRole }
  const [actioning,  setActioning]  = useState(null);   // uid being actioned

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
        // Pre-select 'employee' as default role for each
        const defaultRoles = {};
        (data.data || []).forEach(u => { defaultRoles[u.uid] = 'employee'; });
        setRoles(prev => ({ ...defaultRoles, ...prev }));
      }
    } catch (err) {
      Alert.alert('Error', 'Could not load pending users.');
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

  const handleApprove = async (uid) => {
    const role = roles[uid];
    if (!role) { Alert.alert('Select Role', 'Please select a role before approving.'); return; }

    Alert.alert(
      'Confirm Approval',
      `Approve this user as ${ROLE_OPTIONS.find(r => r.value === role)?.label}?\n\nThey will receive an email to verify their address and can then log in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActioning(uid);
            try {
              const token = await getToken();
              const res = await fetch(`${API.auth}/approve-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ uid, role }),
              });
              const data = await res.json();
              if (res.ok) {
                Alert.alert('✅ Approved', 'User has been activated and notified.');
                setUsers(prev => prev.filter(u => u.uid !== uid));
                setExpanded(null);
              } else {
                Alert.alert('Failed', data.message || 'Could not approve user.');
              }
            } catch {
              Alert.alert('Error', 'Network error.');
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = async (uid, fullName) => {
    Alert.alert(
      'Reject Request',
      `Reject signup request from ${fullName}?\n\nThis will permanently delete their account and they will need to sign up again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
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
                Alert.alert('Rejected', 'Signup request has been removed.');
                setUsers(prev => prev.filter(u => u.uid !== uid));
                setExpanded(null);
              } else {
                Alert.alert('Failed', data.message || 'Could not reject user.');
              }
            } catch {
              Alert.alert('Error', 'Network error.');
            } finally {
              setActioning(null);
            }
          },
        },
      ]
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
      {/* Header */}
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
        {/* Summary */}
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

        {/* Empty state */}
        {users.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptySubtitle}>No pending signup requests at this time.</Text>
          </View>
        )}

        {/* User cards */}
        {users.map(user => {
          const isExpanded = expanded === user.uid;
          const isActioning = actioning === user.uid;

          return (
            <TouchableOpacity
              key={user.uid}
              style={styles.card}
              onPress={() => setExpanded(isExpanded ? null : user.uid)}
              activeOpacity={0.85}
            >
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.userName}>{user.fullName}</Text>
                  <Text style={styles.userMeta}>
                    {user.officialEmployeeNumber}  ·  {user.phoneNumber}
                  </Text>
                  <Text style={styles.userEmail}>{user.email || 'No email'}</Text>
                </View>
                <View style={styles.cardHeaderRight}>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Pending</Text>
                  </View>
                  <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                </View>
              </View>

              <Text style={styles.submittedAt}>Submitted: {formatDate(user.createdAt)}</Text>

              {/* Expanded panel */}
              {isExpanded && (
                <View style={styles.expandedPanel}>
                  <View style={styles.divider} />

                  {/* Verification reminder */}
                  <View style={styles.verifyBox}>
                    <Text style={styles.verifyIcon}>📞</Text>
                    <Text style={styles.verifyText}>
                      Call <Text style={styles.verifyBold}>{user.phoneNumber}</Text> to verify this person's identity before approving.
                    </Text>
                  </View>

                  {/* Role assignment */}
                  <Text style={styles.roleLabel}>Assign Role</Text>
                  <RolePicker
                    selected={roles[user.uid] || 'employee'}
                    onSelect={(role) => setRoles(prev => ({ ...prev, [user.uid]: role }))}
                  />

                  {/* Action buttons */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.btnReject, isActioning && styles.btnDisabled]}
                      onPress={() => handleReject(user.uid, user.fullName)}
                      disabled={isActioning}
                    >
                      {isActioning
                        ? <ActivityIndicator color="#e53e3e" size="small" />
                        : <Text style={styles.btnRejectText}>❌ Reject</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnApprove, isActioning && styles.btnDisabled]}
                      onPress={() => handleApprove(user.uid)}
                      disabled={isActioning}
                    >
                      {isActioning
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.btnApproveText}>✅ Approve</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </TouchableOpacity>
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

  emptyBox:     { alignItems: 'center', marginTop: 60 },
  emptyIcon:    { fontSize: 56, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: '600', color: '#2d3748', marginBottom: 8 },
  emptySubtitle:{ fontSize: 13, color: '#718096' },

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
  submittedAt: { fontSize: 11, color: '#a0aec0', marginTop: 6 },

  pendingBadge: {
    backgroundColor: '#fef3c7', paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 10,
  },
  pendingBadgeText: { fontSize: 11, color: '#92400e', fontWeight: '700' },
  chevron:          { fontSize: 12, color: '#a0aec0' },

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

  actionRow: { flexDirection: 'row', gap: 10 },
  btnReject: {
    flex: 1, borderRadius: 8, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#fc8181',
    backgroundColor: '#fff5f5',
  },
  btnRejectText:  { color: '#c53030', fontSize: 14, fontWeight: '700' },
  btnApprove: {
    flex: 2, borderRadius: 8, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#2563eb',
  },
  btnApproveText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  btnDisabled:    { opacity: 0.5 },
});