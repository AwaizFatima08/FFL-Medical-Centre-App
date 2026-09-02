// app/src/screens/ambulance/MyAmbulanceRequestScreen.js
// Day 16 (Phase 5, Step 5.5) — simple employee-facing screen: shows the
// employee's family's current active ambulance request (if any) and lets
// them cancel it while still pending. Deliberately a separate, minimal
// screen rather than reusing AmbulanceRequestDetailScreen (which carries
// reception/driver/CMO actions that don't belong here) — per Homi's
// explicit choice for this subphase.
//
// At most one active request can exist per family at a time (see the
// duplicate-request block in POST /request), so this screen shows a
// single request, not a list/history.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, TextInput, Platform,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { PURPOSE_OF_VISIT_OPTIONS } from '../../constants';

const PURPOSE_LABELS = Object.fromEntries(
  PURPOSE_OF_VISIT_OPTIONS.map(opt => [opt.value, opt.label])
);

const STATUS_LABELS = {
  pending:    { label: 'Awaiting Reception Review', color: '#d69e2e', bg: '#fefcbf' },
  accepted:   { label: 'Accepted — Awaiting Assignment', color: '#2b6cb0', bg: '#ebf8ff' },
  dispatched: { label: 'Ambulance En Route', color: '#6b46c1', bg: '#faf5ff' },
  picked_up:  { label: 'Patient Picked Up', color: '#276749', bg: '#f0fff4' },
  returned:   { label: 'Returned to Medical Centre', color: '#c05621', bg: '#fffaf0' },
};

export default function MyAmbulanceRequestScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchMyActive = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.ambulance}/my-active`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setRequest(data.data || null);
      } else {
        alert(data.message || 'Failed to load your request.');
      }
    } catch (error) {
      alert('Network error.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setShowCancelForm(false);
    fetchMyActive();
  }, []));

  const handleCancel = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Cancel this ambulance request?')
      : true;
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.ambulance}/${request.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: cancelReason.trim() || 'Cancelled by employee' }),
      });
      const data = await response.json();
      if (response.ok) {
        setShowCancelForm(false);
        setCancelReason('');
        await fetchMyActive();
      } else {
        alert(data.message || 'Could not cancel request.');
      }
    } catch (error) {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const renderField = (label, value) => (
    <View style={styles.field} key={label}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '—'}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3182ce" />
        <Text style={styles.loadingText}>Loading your request...</Text>
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Ambulance Request</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {!request ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🚑</Text>
            <Text style={styles.emptyTitle}>No active ambulance request</Text>
            <Text style={styles.emptySubtitle}>
              You'll see it here once you or reception submits one for you or a family member.
            </Text>
            <TouchableOpacity
              style={styles.newRequestBtn}
              onPress={() => navigation.navigate('AmbulanceRequest')}
            >
              <Text style={styles.newRequestBtnText}>Request Ambulance</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {request.priorityFlag === 'emergency' && (
              <View style={styles.emergencyBanner}>
                <Text style={styles.emergencyText}>🚨 EMERGENCY REQUEST</Text>
              </View>
            )}

            <View style={styles.statusCard}>
              <View style={[
                styles.statusBadge,
                { backgroundColor: (STATUS_LABELS[request.status] || {}).bg || '#edf2f7' },
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: (STATUS_LABELS[request.status] || {}).color || '#4a5568' },
                ]}>
                  {(STATUS_LABELS[request.status] || {}).label || request.status}
                </Text>
              </View>
              {request.status === 'pending' && request.queuePosition && (
                <Text style={styles.queueText}>
                  You are #{request.queuePosition} in queue.
                </Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Patient</Text>
              {renderField('Patient Name', request.patientName)}
              {renderField('Relation', request.patientRelation)}
              {renderField('Condition / Complaint', request.patientCondition)}
              {renderField('Purpose of Visit', PURPOSE_LABELS[request.purposeOfVisit] || '—')}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Trip</Text>
              {renderField('Pickup Location', request.pickupLocation)}
              {renderField('Drop Location', request.dropLocation)}
            </View>

            {request.status === 'pending' && (
              showCancelForm ? (
                <View style={styles.cancelForm}>
                  <Text style={styles.formLabel}>Reason (optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Why are you cancelling?"
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    multiline
                    numberOfLines={2}
                    editable={!actionLoading}
                  />
                  <View style={styles.cancelActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.cancelConfirmBtn]}
                      onPress={handleCancel}
                      disabled={actionLoading}
                    >
                      <Text style={styles.actionBtnText}>
                        {actionLoading ? 'Cancelling...' : 'Confirm Cancel'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.backOutBtn]}
                      onPress={() => setShowCancelForm(false)}
                      disabled={actionLoading}
                    >
                      <Text style={styles.backOutBtnText}>Back</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.cancelBtn]}
                  onPress={() => setShowCancelForm(true)}
                >
                  <Text style={styles.cancelBtnText}>✕  Cancel Request</Text>
                </TouchableOpacity>
              )
            )}

            {request.status !== 'pending' && (
              <Text style={styles.hintText}>
                This request has already been accepted by reception and can no longer be cancelled here. Contact reception if needed.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#f0f4f8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8', gap: 12 },
  loadingText: { fontSize: 14, color: '#718096' },

  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },

  container: { padding: 20, paddingBottom: 48 },

  emptyState: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyIcon: { fontSize: 56, marginBottom: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#2d3748' },
  emptySubtitle: { fontSize: 13, color: '#718096', textAlign: 'center', paddingHorizontal: 20, marginBottom: 16 },
  newRequestBtn: {
    backgroundColor: '#3182ce', borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 24,
  },
  newRequestBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },

  emergencyBanner: {
    backgroundColor: '#fed7d7', padding: 12, borderRadius: 8,
    borderLeftWidth: 4, borderLeftColor: '#e53e3e', marginBottom: 16,
  },
  emergencyText: { color: '#c53030', fontSize: 15, fontWeight: 'bold', textAlign: 'center' },

  statusCard: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    marginBottom: 16, alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  statusText: { fontSize: 14, fontWeight: '700' },
  queueText: { fontSize: 13, color: '#4a5568' },

  section: {
    marginBottom: 16, backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#4a5568', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 6,
  },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: '#718096', marginBottom: 2 },
  fieldValue: { fontSize: 15, color: '#2d3748' },

  hintText: { fontSize: 12, color: '#a0aec0', textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },

  actionBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  actionBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#fc8181' },
  cancelBtnText: { color: '#c53030', fontSize: 14, fontWeight: '600' },
  cancelForm: { gap: 10 },
  formLabel: { fontSize: 13, color: '#4a5568', fontWeight: '600' },
  input: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#2d3748',
  },
  cancelActions: { flexDirection: 'row', gap: 10 },
  cancelConfirmBtn: { backgroundColor: '#e53e3e', flex: 1 },
  backOutBtn: { backgroundColor: '#e2e8f0', flex: 1 },
  backOutBtnText: { color: '#4a5568', fontSize: 15, fontWeight: '600' },
});