// app/src/screens/fitness/FitnessEmployeeScreen.js
// Employee views their current annual fitness appointment.
// Actions: Confirm attendance | Request reschedule (with reason)

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, TextInput,
  RefreshControl, Platform,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

// ─── Status display config ────────────────────────────────────────────────────
const STATUS_CONFIG = {
  scheduled:            { label: 'Scheduled',              color: '#2b6cb0', bg: '#ebf8ff', icon: '📅' },
  confirmed:            { label: 'Confirmed',              color: '#276749', bg: '#f0fff4', icon: '✅' },
  reschedule_requested: { label: 'Reschedule Requested',   color: '#c05621', bg: '#fffaf0', icon: '🔄' },
  rescheduled:          { label: 'Rescheduled',            color: '#6b46c1', bg: '#faf5ff', icon: '📅' },
  reschedule_rejected:  { label: 'Reschedule Declined',    color: '#c53030', bg: '#fff5f5', icon: '❌' },
  completed:            { label: 'Completed',              color: '#22543d', bg: '#c6f6d5', icon: '✅' },
  cancelled:            { label: 'Cancelled',              color: '#742a2a', bg: '#fff5f5', icon: '🚫' },
};

const OUTCOME_LABELS = {
  fit:                   '✅ Fit for Duty',
  unfit:                 '❌ Unfit for Duty',
  fit_with_restrictions: '⚠️ Fit with Restrictions',
};

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '—'}</Text>
    </View>
  );
}

export default function FitnessEmployeeScreen({ navigation }) {
  const [appointments, setAppointments]     = useState([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [actionLoading, setActionLoading]   = useState(false);

  // Reschedule form state
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleReason, setRescheduleReason]     = useState('');
  const [activeAppointmentId, setActiveAppointmentId] = useState(null);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchAppointments = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.fitness}/my`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setAppointments(data.data || []);
      }
    } catch (error) {
      // Silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchAppointments();
  }, []));

  const onRefresh = () => {
    setRefreshing(true);
    fetchAppointments();
  };

  const handleConfirm = async (appointmentId) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Confirm your attendance for this fitness appointment?')
      : true;
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.fitness}/${appointmentId}/confirm`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        await fetchAppointments();
      } else {
        alert(data.message || 'Failed to confirm appointment.');
      }
    } catch (error) {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const openRescheduleForm = (appointmentId) => {
    setActiveAppointmentId(appointmentId);
    setRescheduleReason('');
    setShowRescheduleForm(true);
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleReason.trim()) {
      alert('Please provide a reason for the reschedule request.');
      return;
    }
    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.fitness}/${activeAppointmentId}/reschedule-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rescheduleReason.trim() }),
      });
      const data = await response.json();
      if (response.ok) {
        setShowRescheduleForm(false);
        setRescheduleReason('');
        setActiveAppointmentId(null);
        await fetchAppointments();
      } else {
        alert(data.message || 'Failed to submit reschedule request.');
      }
    } catch (error) {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  // Most recent appointment shown first (already ordered desc by backend)
  const currentAppointment = appointments[0] || null;
  const pastAppointments   = appointments.slice(1);

  const renderAppointmentCard = (appt, isCurrent = false) => {
    const statusCfg = STATUS_CONFIG[appt.status] || { label: appt.status, color: '#4a5568', bg: '#edf2f7', icon: '📋' };
    const canConfirm = ['scheduled', 'rescheduled', 'reschedule_rejected'].includes(appt.status);
    const canRequestReschedule = ['scheduled', 'confirmed', 'rescheduled', 'reschedule_rejected'].includes(appt.status);
    const isPendingReschedule = appt.status === 'reschedule_requested';

    return (
      <View key={appt.id} style={[styles.card, isCurrent && styles.cardCurrent]}>
        {isCurrent && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Current Appointment</Text>
          </View>
        )}

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.statusText, { color: statusCfg.color }]}>
            {statusCfg.icon} {statusCfg.label}
          </Text>
        </View>

        {/* Appointment details */}
        <View style={styles.detailsSection}>
          <Field label="Date"       value={appt.scheduledDate} />
          <Field label="Time"       value={appt.scheduledTime} />
          <Field label="Cycle Year" value={String(appt.cycleYear)} />
        </View>

        {/* Rejection note from admin */}
        {appt.status === 'reschedule_rejected' && appt.adminNote && (
          <View style={styles.adminNoteBox}>
            <Text style={styles.adminNoteLabel}>Note from Admin:</Text>
            <Text style={styles.adminNoteText}>{appt.adminNote}</Text>
          </View>
        )}

        {/* Completion result */}
        {appt.status === 'completed' && (
          <View style={styles.outcomeBox}>
            <Text style={styles.outcomeLabel}>Examination Result</Text>
            <Text style={styles.outcomeValue}>
              {OUTCOME_LABELS[appt.fitnessOutcome] || appt.fitnessOutcome}
            </Text>
            {appt.completionRemarks && (
              <Text style={styles.outcomeRemarks}>{appt.completionRemarks}</Text>
            )}
          </View>
        )}

        {/* Pending reschedule notice */}
        {isPendingReschedule && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>
              🔄 Your reschedule request is pending admin review.
            </Text>
            {appt.rescheduleReason && (
              <Text style={styles.pendingReason}>Reason: {appt.rescheduleReason}</Text>
            )}
          </View>
        )}

        {/* Action buttons — only on current active appointment */}
        {isCurrent && (
          <View style={styles.actions}>
            {canConfirm && (
              <TouchableOpacity
                style={[styles.btnPrimary, actionLoading && styles.btnDisabled]}
                onPress={() => handleConfirm(appt.id)}
                disabled={actionLoading}
              >
                <Text style={styles.btnPrimaryText}>
                  {actionLoading ? 'Confirming...' : '✅ Confirm Attendance'}
                </Text>
              </TouchableOpacity>
            )}
            {canRequestReschedule && (
              <TouchableOpacity
                style={[styles.btnSecondary, actionLoading && styles.btnDisabled]}
                onPress={() => openRescheduleForm(appt.id)}
                disabled={actionLoading}
              >
                <Text style={styles.btnSecondaryText}>🔄 Request Reschedule</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Annual Fitness</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading your appointment...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {appointments.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏃</Text>
              <Text style={styles.emptyTitle}>No Appointment Scheduled</Text>
              <Text style={styles.emptySubtitle}>
                Your annual medical fitness appointment will appear here once scheduled by the Admin.
              </Text>
            </View>
          ) : (
            <>
              {/* Current appointment */}
              {currentAppointment && renderAppointmentCard(currentAppointment, true)}

              {/* Past appointments */}
              {pastAppointments.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Previous Appointments</Text>
                  {pastAppointments.map(appt => renderAppointmentCard(appt, false))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Reschedule request form — slide-up panel */}
      {showRescheduleForm && (
        <View style={styles.formOverlay}>
          <View style={styles.formPanel}>
            <Text style={styles.formTitle}>Request Reschedule</Text>
            <Text style={styles.formSubtitle}>
              Please explain why you need to reschedule. Admin will review and assign a new date.
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason for reschedule..."
              placeholderTextColor="#a0aec0"
              value={rescheduleReason}
              onChangeText={setRescheduleReason}
              multiline
              numberOfLines={4}
              maxLength={300}
            />
            <Text style={styles.charCount}>{rescheduleReason.length}/300</Text>
            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => {
                  setShowRescheduleForm(false);
                  setRescheduleReason('');
                  setActiveAppointmentId(null);
                }}
                disabled={actionLoading}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSubmit, actionLoading && styles.btnDisabled]}
                onPress={handleRescheduleSubmit}
                disabled={actionLoading}
              >
                <Text style={styles.btnSubmitText}>
                  {actionLoading ? 'Submitting...' : 'Submit Request'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:      { flex: 1, backgroundColor: '#f0f4f8' },

  // Header
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    flexDirection: 'row', alignItems: 'flex-end',
  },
  backBtn:      { marginRight: 12, paddingBottom: 2 },
  backText:     { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  headerTitle:  { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },

  // Scroll
  scroll:         { flex: 1 },
  scrollContent:  { padding: 16, gap: 12 },

  // Card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12, padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
  },
  cardCurrent: {
    borderWidth: 1.5, borderColor: '#3182ce',
  },
  currentBadge: {
    backgroundColor: '#3182ce',
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 10, marginBottom: 12,
  },
  currentBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },

  // Status
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, marginBottom: 14,
  },
  statusText:   { fontSize: 13, fontWeight: '700' },

  // Details
  detailsSection: { gap: 8, marginBottom: 12 },
  field:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel:     { fontSize: 13, color: '#718096', fontWeight: '500' },
  fieldValue:     { fontSize: 13, color: '#2d3748', fontWeight: '600' },

  // Admin note
  adminNoteBox: {
    backgroundColor: '#fff5f5',
    borderRadius: 8, padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#fc8181',
  },
  adminNoteLabel: { fontSize: 12, color: '#c53030', fontWeight: '700', marginBottom: 4 },
  adminNoteText:  { fontSize: 13, color: '#742a2a' },

  // Outcome
  outcomeBox: {
    backgroundColor: '#f0fff4',
    borderRadius: 8, padding: 12, marginBottom: 12,
  },
  outcomeLabel:   { fontSize: 12, color: '#276749', fontWeight: '700', marginBottom: 4 },
  outcomeValue:   { fontSize: 14, color: '#22543d', fontWeight: '700', marginBottom: 4 },
  outcomeRemarks: { fontSize: 13, color: '#2f855a' },

  // Pending reschedule
  pendingBox: {
    backgroundColor: '#fffaf0',
    borderRadius: 8, padding: 12, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#f6ad55',
  },
  pendingText:    { fontSize: 13, color: '#c05621', fontWeight: '600', marginBottom: 4 },
  pendingReason:  { fontSize: 12, color: '#9c4221' },

  // Actions
  actions:        { gap: 10, marginTop: 4 },
  btnPrimary: {
    backgroundColor: '#276749',
    borderRadius: 8, paddingVertical: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  btnSecondary: {
    backgroundColor: '#ffffff',
    borderRadius: 8, paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5, borderColor: '#3182ce',
  },
  btnSecondaryText: { color: '#3182ce', fontSize: 14, fontWeight: '700' },
  btnDisabled:    { opacity: 0.5 },

  // Section label
  sectionLabel: {
    fontSize: 13, fontWeight: '700',
    color: '#718096', marginTop: 8, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // States
  centered: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', paddingTop: 80,
  },
  loadingText:    { marginTop: 12, fontSize: 14, color: '#718096' },
  emptyState: {
    alignItems: 'center', paddingTop: 60, paddingHorizontal: 32,
  },
  emptyIcon:      { fontSize: 48, marginBottom: 16 },
  emptyTitle:     { fontSize: 18, fontWeight: 'bold', color: '#2d3748', marginBottom: 8 },
  emptySubtitle:  { fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 20 },

  // Reschedule form overlay
  formOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  formPanel: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  formTitle:    { fontSize: 18, fontWeight: 'bold', color: '#2d3748', marginBottom: 6 },
  formSubtitle: { fontSize: 13, color: '#718096', marginBottom: 16, lineHeight: 18 },
  reasonInput: {
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 8, padding: 12,
    fontSize: 14, color: '#2d3748',
    minHeight: 100, textAlignVertical: 'top',
    marginBottom: 4,
  },
  charCount: { fontSize: 11, color: '#a0aec0', textAlign: 'right', marginBottom: 16 },
  formActions:  { flexDirection: 'row', gap: 12 },
  btnCancel: {
    flex: 1, borderRadius: 8, paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  btnCancelText:  { color: '#718096', fontSize: 14, fontWeight: '600' },
  btnSubmit: {
    flex: 2, backgroundColor: '#3182ce',
    borderRadius: 8, paddingVertical: 12,
    alignItems: 'center',
  },
  btnSubmitText:  { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});