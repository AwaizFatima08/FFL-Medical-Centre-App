// app/src/screens/fitness/FitnessAdminScreen.js
// Admin Incharge / CMO / Doctor manages annual fitness appointments.
// Tabs: Pending Action | All Appointments | Schedule New
//
// Role-aware actions:
//   Schedule, Approve/Reject reschedule, Cancel → admin_incharge + cmo
//   Mark examination complete + outcome        → doctor + cmo
//   View all appointments                      → all three roles

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, TextInput,
  RefreshControl, Platform,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import DatePickerField from '../../components/DatePickerField';

// ─── Status display config ────────────────────────────────────────────────────
const STATUS_CONFIG = {
  scheduled:            { label: 'Scheduled',            color: '#2b6cb0', bg: '#ebf8ff', icon: '📅' },
  confirmed:            { label: 'Confirmed',            color: '#276749', bg: '#f0fff4', icon: '✅' },
  reschedule_requested: { label: 'Reschedule Requested', color: '#c05621', bg: '#fffaf0', icon: '🔄' },
  rescheduled:          { label: 'Rescheduled',          color: '#6b46c1', bg: '#faf5ff', icon: '📅' },
  reschedule_rejected:  { label: 'Reschedule Declined',  color: '#c53030', bg: '#fff5f5', icon: '❌' },
  completed:            { label: 'Completed',            color: '#22543d', bg: '#c6f6d5', icon: '✅' },
  cancelled:            { label: 'Cancelled',            color: '#742a2a', bg: '#fff5f5', icon: '🚫' },
};

const OUTCOME_OPTIONS = [
  { label: '✅ Fit for Duty',           value: 'fit' },
  { label: '❌ Unfit for Duty',         value: 'unfit' },
  { label: '⚠️ Fit with Restrictions', value: 'fit_with_restrictions' },
];

const TABS = ['Pending', 'All', 'Schedule'];

// ─── Role permission helpers ──────────────────────────────────────────────────
const canSchedule        = (role) => ['admin_incharge', 'cmo'].includes(role);
const canApproveReject   = (role) => ['admin_incharge', 'cmo'].includes(role);
const canComplete        = (role) => ['doctor', 'cmo'].includes(role);
const canCancel          = (role) => ['admin_incharge', 'cmo'].includes(role);

// ─── Small helper components ──────────────────────────────────────────────────
function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '—'}</Text>
    </View>
  );
}

export default function FitnessAdminScreen({ navigation, route }) {
  const userRole = route.params?.userRole || '';

  const [activeTab, setActiveTab]             = useState('Pending');
  const [allAppointments, setAllAppointments] = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [actionLoading, setActionLoading]     = useState(false);

  // ── Schedule new form ──────────────────────────────────────────────────────
  const [empNumInput, setEmpNumInput]         = useState('');
  const [lookupLoading, setLookupLoading]     = useState(false);
  const [lookedUpEmployee, setLookedUpEmployee] = useState(null); // { id, fullName, department, designation }
  const [lookupError, setLookupError]         = useState('');
  const [schedDate, setSchedDate]             = useState('');
  const [schedTime, setSchedTime]             = useState('');
  const [cycleYear, setCycleYear]             = useState(String(new Date().getFullYear()));
  const [schedNotes, setSchedNotes]           = useState('');
  const [scheduling, setScheduling]           = useState(false);

  // ── Reschedule approve panel ───────────────────────────────────────────────
  const [reschedulePanel, setReschedulePanel] = useState(null);
  const [newDate, setNewDate]                 = useState('');
  const [newTime, setNewTime]                 = useState('');

  // ── Reject reschedule panel ────────────────────────────────────────────────
  const [rejectPanel, setRejectPanel]         = useState(null);
  const [adminNote, setAdminNote]             = useState('');

  // ── Complete panel ─────────────────────────────────────────────────────────
  const [completePanel, setCompletePanel]         = useState(null);
  const [selectedOutcome, setSelectedOutcome]     = useState('fit');
  const [completionRemarks, setCompletionRemarks] = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchAppointments = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.fitness}/all`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setAllAppointments(data.data || []);
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

  // ── Employee lookup ────────────────────────────────────────────────────────
  const handleLookup = async () => {
    if (!empNumInput.trim()) {
      setLookupError('Please enter an employee number.');
      return;
    }
    setLookupLoading(true);
    setLookedUpEmployee(null);
    setLookupError('');
    try {
      const token = await getToken();
      const response = await fetch(
        `${API.employees}/lookup?employeeNumber=${encodeURIComponent(empNumInput.trim().toUpperCase())}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const data = await response.json();
      if (response.ok) {
        setLookedUpEmployee(data.data);
      } else {
        setLookupError(data.message || 'No employee found with this number.');
      }
    } catch {
      setLookupError('Network error. Please try again.');
    } finally {
      setLookupLoading(false);
    }
  };

  const clearLookup = () => {
    setEmpNumInput('');
    setLookedUpEmployee(null);
    setLookupError('');
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSchedule = async () => {
    if (!lookedUpEmployee)   { alert('Please search and confirm the employee first.'); return; }
    if (!schedDate.trim())   { alert('Date is required (YYYY-MM-DD).'); return; }
    if (!schedTime.trim())   { alert('Time is required (HH:MM).'); return; }
    if (!cycleYear.trim())   { alert('Cycle year is required.'); return; }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(schedDate)) {
      alert('Date must be in YYYY-MM-DD format. Example: 2025-06-15'); return;
    }
    if (!/^\d{2}:\d{2}$/.test(schedTime)) {
      alert('Time must be in HH:MM format. Example: 09:30'); return;
    }

    setScheduling(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.fitness}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          officialEmployeeNumber: empNumInput.trim().toUpperCase(),
          scheduledDate:          schedDate.trim(),
          scheduledTime:          schedTime.trim(),
          cycleYear:              parseInt(cycleYear),
          notes:                  schedNotes.trim() || null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        alert('Appointment scheduled. Employee has been notified.');
        clearLookup();
        setSchedDate('');
        setSchedTime('');
        setSchedNotes('');
        setActiveTab('All');
        await fetchAppointments();
      } else {
        alert(data.message || 'Failed to schedule appointment.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setScheduling(false);
    }
  };

  const handleApproveReschedule = async () => {
    if (!newDate.trim()) { alert('New date is required.'); return; }
    if (!newTime.trim()) { alert('New time is required.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      alert('Date must be in YYYY-MM-DD format.'); return;
    }
    if (!/^\d{2}:\d{2}$/.test(newTime)) {
      alert('Time must be in HH:MM format.'); return;
    }

    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.fitness}/${reschedulePanel.appointmentId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ newDate: newDate.trim(), newTime: newTime.trim() }),
      });
      const data = await response.json();
      if (response.ok) {
        setReschedulePanel(null);
        setNewDate('');
        setNewTime('');
        await fetchAppointments();
      } else {
        alert(data.message || 'Failed to reschedule.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectReschedule = async () => {
    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.fitness}/${rejectPanel.appointmentId}/reject-reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ adminNote: adminNote.trim() || null }),
      });
      const data = await response.json();
      if (response.ok) {
        setRejectPanel(null);
        setAdminNote('');
        await fetchAppointments();
      } else {
        alert(data.message || 'Failed to reject reschedule request.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.fitness}/${completePanel.appointmentId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          fitnessOutcome:    selectedOutcome,
          completionRemarks: completionRemarks.trim() || null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setCompletePanel(null);
        setCompletionRemarks('');
        setSelectedOutcome('fit');
        await fetchAppointments();
      } else {
        alert(data.message || 'Failed to complete examination.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (appointmentId, employeeName) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Cancel fitness appointment for ${employeeName}?`)
      : true;
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.fitness}/${appointmentId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ reason: 'Cancelled by Admin' }),
      });
      const data = await response.json();
      if (response.ok) {
        await fetchAppointments();
      } else {
        alert(data.message || 'Failed to cancel appointment.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Derived lists ──────────────────────────────────────────────────────────
  const pendingAppointments = allAppointments.filter(a =>
    a.status === 'reschedule_requested'
  );
  const activeAppointments = allAppointments.filter(a =>
    !['completed', 'cancelled'].includes(a.status)
  );

  // ── Render appointment card ────────────────────────────────────────────────
  const renderCard = (appt) => {
    const statusCfg = STATUS_CONFIG[appt.status] || { label: appt.status, color: '#4a5568', bg: '#edf2f7', icon: '📋' };
    const needsRescheduleAction = appt.status === 'reschedule_requested';
    const isActive = !['completed', 'cancelled'].includes(appt.status);

    return (
      <View key={appt.id} style={[styles.card, needsRescheduleAction && styles.cardUrgent]}>
        {needsRescheduleAction && (
          <View style={styles.urgentBadge}>
            <Text style={styles.urgentBadgeText}>⚡ Action Required</Text>
          </View>
        )}

        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.statusText, { color: statusCfg.color }]}>
            {statusCfg.icon} {statusCfg.label}
          </Text>
        </View>

        <View style={styles.detailsSection}>
          <Field label="Employee"   value={appt.fullName || appt.employeeUid} />
          <Field label="Department" value={appt.department} />
          <Field label="Date"       value={appt.scheduledDate} />
          <Field label="Time"       value={appt.scheduledTime} />
          <Field label="Cycle Year" value={String(appt.cycleYear)} />
        </View>

        {appt.status === 'reschedule_requested' && appt.rescheduleReason && (
          <View style={styles.rescheduleReasonBox}>
            <Text style={styles.rescheduleReasonLabel}>Employee's Reason:</Text>
            <Text style={styles.rescheduleReasonText}>{appt.rescheduleReason}</Text>
          </View>
        )}

        {isActive && (
          <View style={styles.actions}>
            {/* Approve/Reject reschedule — admin_incharge + cmo only */}
            {needsRescheduleAction && canApproveReject(userRole) && (
              <>
                <TouchableOpacity
                  style={styles.btnApprove}
                  onPress={() => {
                    setReschedulePanel({
                      appointmentId: appt.id,
                      employeeName:  appt.fullName || 'Employee',
                      currentDate:   appt.scheduledDate,
                      currentTime:   appt.scheduledTime,
                    });
                    setNewDate('');
                    setNewTime('');
                  }}
                  disabled={actionLoading}
                >
                  <Text style={styles.btnApproveText}>📅 Approve — Set New Date</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnReject}
                  onPress={() => {
                    setRejectPanel({ appointmentId: appt.id, employeeName: appt.fullName || 'Employee' });
                    setAdminNote('');
                  }}
                  disabled={actionLoading}
                >
                  <Text style={styles.btnRejectText}>❌ Reject — Keep Original Date</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Complete examination — doctor + cmo only */}
            {!needsRescheduleAction && canComplete(userRole) && (
              <TouchableOpacity
                style={styles.btnComplete}
                onPress={() => {
                  setCompletePanel({ appointmentId: appt.id, employeeName: appt.fullName || 'Employee' });
                  setSelectedOutcome('fit');
                  setCompletionRemarks('');
                }}
                disabled={actionLoading}
              >
                <Text style={styles.btnCompleteText}>✅ Mark Examination Complete</Text>
              </TouchableOpacity>
            )}

            {/* Cancel — admin_incharge + cmo only */}
            {canCancel(userRole) && (
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => handleCancel(appt.id, appt.fullName || 'Employee')}
                disabled={actionLoading}
              >
                <Text style={styles.btnCancelText}>Cancel Appointment</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── Tab content ────────────────────────────────────────────────────────────
  const renderPendingTab = () => (
    pendingAppointments.length === 0 ? (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>✅</Text>
        <Text style={styles.emptyTitle}>No Pending Actions</Text>
        <Text style={styles.emptySubtitle}>All reschedule requests have been handled.</Text>
      </View>
    ) : (
      pendingAppointments.map(renderCard)
    )
  );

  const renderAllTab = () => (
    activeAppointments.length === 0 ? (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📅</Text>
        <Text style={styles.emptyTitle}>No Active Appointments</Text>
        <Text style={styles.emptySubtitle}>Schedule a fitness appointment using the Schedule tab.</Text>
      </View>
    ) : (
      activeAppointments.map(renderCard)
    )
  );

  const renderScheduleTab = () => {
    if (!canSchedule(userRole)) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔒</Text>
          <Text style={styles.emptyTitle}>Not Available</Text>
          <Text style={styles.emptySubtitle}>
            Scheduling appointments is restricted to Admin Incharge and CMO.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.scheduleForm}>
        <Text style={styles.formNote}>
          Enter the employee's official FFL employee number (e.g. FFL-00567),
          search to confirm their identity, then set the appointment date and time.
        </Text>

        {/* Employee number + search */}
        <Text style={styles.inputLabel}>Employee Number *</Text>
        <View style={styles.lookupRow}>
          <TextInput
            style={[styles.input, styles.lookupInput]}
            placeholder="e.g. FFL-00567"
            placeholderTextColor="#a0aec0"
            value={empNumInput}
            onChangeText={(val) => {
              setEmpNumInput(val);
              setLookedUpEmployee(null);
              setLookupError('');
            }}
            autoCapitalize="characters"
            editable={!lookedUpEmployee}
          />
          {!lookedUpEmployee ? (
            <TouchableOpacity
              style={[styles.lookupBtn, lookupLoading && styles.btnDisabled]}
              onPress={handleLookup}
              disabled={lookupLoading}
            >
              {lookupLoading
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <Text style={styles.lookupBtnText}>Search</Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.clearBtn} onPress={clearLookup}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Lookup error */}
        {!!lookupError && (
          <View style={styles.lookupErrorBox}>
            <Text style={styles.lookupErrorText}>⚠️ {lookupError}</Text>
          </View>
        )}

        {/* Confirmed employee card */}
        {lookedUpEmployee && (
          <View style={styles.confirmedEmployeeCard}>
            <Text style={styles.confirmedEmployeeIcon}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.confirmedEmployeeName}>{lookedUpEmployee.fullName}</Text>
              <Text style={styles.confirmedEmployeeSub}>
                {lookedUpEmployee.officialEmployeeNumber}
                {lookedUpEmployee.department ? ` · ${lookedUpEmployee.department}` : ''}
                {lookedUpEmployee.designation ? ` · ${lookedUpEmployee.designation}` : ''}
              </Text>
            </View>
          </View>
        )}

        <DatePickerField
          label="Date *"
          value={schedDate ? new Date(schedDate) : null}
          onChange={(date) => setSchedDate(date.toISOString().split('T')[0])}
          minimumDate={new Date()}
        />

        <Text style={styles.inputLabel}>Time * (HH:MM)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 09:30"
          placeholderTextColor="#a0aec0"
          value={schedTime}
          onChangeText={setSchedTime}
          keyboardType="numbers-and-punctuation"
        />

        <Text style={styles.inputLabel}>Cycle Year *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 2025"
          placeholderTextColor="#a0aec0"
          value={cycleYear}
          onChangeText={setCycleYear}
          keyboardType="number-pad"
        />

        <Text style={styles.inputLabel}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Any special instructions..."
          placeholderTextColor="#a0aec0"
          value={schedNotes}
          onChangeText={setSchedNotes}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.btnSchedule, (scheduling || !lookedUpEmployee) && styles.btnDisabled]}
          onPress={handleSchedule}
          disabled={scheduling || !lookedUpEmployee}
        >
          <Text style={styles.btnScheduleText}>
            {scheduling ? 'Scheduling...' : '📅 Schedule Appointment'}
          </Text>
        </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Fitness Appointments</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
              {tab === 'Pending' && pendingAppointments.length > 0 && (
                <Text style={styles.tabBadge}> {pendingAppointments.length}</Text>
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading appointments...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {activeTab === 'Pending'  && renderPendingTab()}
          {activeTab === 'All'      && renderAllTab()}
          {activeTab === 'Schedule' && renderScheduleTab()}
        </ScrollView>
      )}

      {/* ── Approve reschedule panel ── */}
      {reschedulePanel && (
        <View style={styles.overlay}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Approve Reschedule</Text>
            <Text style={styles.panelSubtitle}>For: {reschedulePanel.employeeName}</Text>
            <Text style={styles.panelCurrentSlot}>
              Current slot: {reschedulePanel.currentDate} at {reschedulePanel.currentTime}
            </Text>
            <DatePickerField
              label="New Date *"
              value={newDate ? new Date(newDate) : null}
              onChange={(date) => setNewDate(date.toISOString().split('T')[0])}
              minimumDate={new Date()}
            />
            <Text style={styles.inputLabel}>New Time * (HH:MM)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 10:00"
              placeholderTextColor="#a0aec0"
              value={newTime}
              onChangeText={setNewTime}
              keyboardType="numbers-and-punctuation"
            />
            <View style={styles.panelActions}>
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={() => setReschedulePanel(null)}
                disabled={actionLoading}
              >
                <Text style={styles.btnOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, actionLoading && styles.btnDisabled]}
                onPress={handleApproveReschedule}
                disabled={actionLoading}
              >
                <Text style={styles.btnPrimaryText}>
                  {actionLoading ? 'Saving...' : 'Confirm New Date'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── Reject reschedule panel ── */}
      {rejectPanel && (
        <View style={styles.overlay}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Reject Reschedule Request</Text>
            <Text style={styles.panelSubtitle}>For: {rejectPanel.employeeName}</Text>
            <Text style={styles.panelCurrentSlot}>
              The original appointment date will be kept.
            </Text>
            <Text style={styles.inputLabel}>Note to employee (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="e.g. Annual fitness must be completed on schedule."
              placeholderTextColor="#a0aec0"
              value={adminNote}
              onChangeText={setAdminNote}
              multiline
              numberOfLines={3}
            />
            <View style={styles.panelActions}>
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={() => setRejectPanel(null)}
                disabled={actionLoading}
              >
                <Text style={styles.btnOutlineText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnDanger, actionLoading && styles.btnDisabled]}
                onPress={handleRejectReschedule}
                disabled={actionLoading}
              >
                <Text style={styles.btnDangerText}>
                  {actionLoading ? 'Rejecting...' : 'Reject Request'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── Complete examination panel ── */}
      {completePanel && (
        <View style={styles.overlay}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Mark Examination Complete</Text>
            <Text style={styles.panelSubtitle}>For: {completePanel.employeeName}</Text>

            <Text style={styles.inputLabel}>Fitness Outcome *</Text>
            {OUTCOME_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.outcomeOption,
                  selectedOutcome === opt.value && styles.outcomeOptionSelected,
                ]}
                onPress={() => setSelectedOutcome(opt.value)}
              >
                <View style={[
                  styles.radioCircle,
                  selectedOutcome === opt.value && styles.radioCircleSelected,
                ]} />
                <Text style={[
                  styles.outcomeOptionText,
                  selectedOutcome === opt.value && styles.outcomeOptionTextSelected,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.inputLabel, { marginTop: 16 }]}>Remarks (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Any medical notes or restrictions..."
              placeholderTextColor="#a0aec0"
              value={completionRemarks}
              onChangeText={setCompletionRemarks}
              multiline
              numberOfLines={3}
            />
            <View style={styles.panelActions}>
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={() => setCompletePanel(null)}
                disabled={actionLoading}
              >
                <Text style={styles.btnOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, actionLoading && styles.btnDisabled]}
                onPress={handleComplete}
                disabled={actionLoading}
              >
                <Text style={styles.btnPrimaryText}>
                  {actionLoading ? 'Saving...' : 'Save Result'}
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
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },

  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    flexDirection: 'row', alignItems: 'flex-end',
  },
  backBtn:     { marginRight: 12, paddingBottom: 2 },
  backText:    { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: '#3182ce' },
  tabText:       { fontSize: 14, color: '#718096', fontWeight: '600' },
  tabTextActive: { color: '#3182ce' },
  tabBadge:      { color: '#e53e3e', fontWeight: '800' },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
  },
  cardUrgent:      { borderWidth: 1.5, borderColor: '#f6ad55' },
  urgentBadge: {
    backgroundColor: '#fffaf0', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#f6ad55',
  },
  urgentBadgeText: { color: '#c05621', fontSize: 11, fontWeight: '700' },

  statusBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, marginBottom: 12,
  },
  statusText: { fontSize: 13, fontWeight: '700' },

  detailsSection: { gap: 8, marginBottom: 12 },
  field:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel:     { fontSize: 13, color: '#718096', fontWeight: '500' },
  fieldValue:     { fontSize: 13, color: '#2d3748', fontWeight: '600', flexShrink: 1, textAlign: 'right', maxWidth: '60%' },

  rescheduleReasonBox: {
    backgroundColor: '#fffaf0', borderRadius: 8, padding: 12, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#f6ad55',
  },
  rescheduleReasonLabel: { fontSize: 12, color: '#c05621', fontWeight: '700', marginBottom: 4 },
  rescheduleReasonText:  { fontSize: 13, color: '#744210' },

  actions:        { gap: 8, marginTop: 4 },
  btnApprove:     { backgroundColor: '#276749', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  btnApproveText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  btnReject: {
    backgroundColor: '#fff5f5', borderRadius: 8, paddingVertical: 11,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#fc8181',
  },
  btnRejectText:   { color: '#c53030', fontSize: 13, fontWeight: '700' },
  btnComplete:     { backgroundColor: '#3182ce', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  btnCompleteText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  btnCancel: {
    borderRadius: 8, paddingVertical: 11, alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  btnCancelText: { color: '#a0aec0', fontSize: 13, fontWeight: '600' },
  btnDisabled:   { opacity: 0.5 },

  // ── Schedule form
  scheduleForm: { gap: 4 },
  formNote: {
    fontSize: 13, color: '#718096', lineHeight: 18,
    backgroundColor: '#ebf8ff', borderRadius: 8,
    padding: 12, marginBottom: 16,
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8, padding: 12,
    fontSize: 14, color: '#2d3748', backgroundColor: '#ffffff', marginBottom: 4,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },

  // ── Lookup row
  lookupRow:     { flexDirection: 'row', gap: 8, marginBottom: 4 },
  lookupInput:   { flex: 1, marginBottom: 0 },
  lookupBtn: {
    backgroundColor: '#3182ce', borderRadius: 8,
    paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center',
    minWidth: 72,
  },
  lookupBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  clearBtn: {
    backgroundColor: '#f7fafc', borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
    paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center',
    minWidth: 72,
  },
  clearBtnText: { color: '#718096', fontWeight: '700', fontSize: 14 },

  // ── Lookup error
  lookupErrorBox: {
    backgroundColor: '#fff5f5', borderRadius: 8, padding: 10, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#fc8181',
  },
  lookupErrorText: { fontSize: 13, color: '#c53030' },

  // ── Confirmed employee card
  confirmedEmployeeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f0fff4', borderRadius: 8, padding: 12, marginBottom: 8,
    borderWidth: 1.5, borderColor: '#9ae6b4', gap: 10,
  },
  confirmedEmployeeIcon: { fontSize: 20 },
  confirmedEmployeeName: { fontSize: 14, fontWeight: '700', color: '#276749' },
  confirmedEmployeeSub:  { fontSize: 12, color: '#48bb78', marginTop: 2 },

  btnSchedule: {
    backgroundColor: '#3182ce', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  btnScheduleText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#718096' },
  emptyState:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:   { fontSize: 48, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: 'bold', color: '#2d3748', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 20 },

  overlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 44,
  },
  panelTitle:       { fontSize: 18, fontWeight: 'bold', color: '#2d3748', marginBottom: 4 },
  panelSubtitle:    { fontSize: 14, color: '#4a5568', marginBottom: 4 },
  panelCurrentSlot: { fontSize: 13, color: '#718096', marginBottom: 16, fontStyle: 'italic' },
  panelActions:     { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnOutline: {
    flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  btnOutlineText: { color: '#718096', fontSize: 14, fontWeight: '600' },
  btnPrimary: {
    flex: 2, backgroundColor: '#3182ce',
    borderRadius: 8, paddingVertical: 12, alignItems: 'center',
  },
  btnPrimaryText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  btnDanger: {
    flex: 2, backgroundColor: '#e53e3e',
    borderRadius: 8, paddingVertical: 12, alignItems: 'center',
  },
  btnDangerText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },

  outcomeOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 8, marginBottom: 6,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f7fafc',
  },
  outcomeOptionSelected:     { borderColor: '#3182ce', backgroundColor: '#ebf8ff' },
  radioCircle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: '#cbd5e0', marginRight: 10,
  },
  radioCircleSelected:       { borderColor: '#3182ce', backgroundColor: '#3182ce' },
  outcomeOptionText:         { fontSize: 14, color: '#4a5568', fontWeight: '500' },
  outcomeOptionTextSelected: { color: '#2b6cb0', fontWeight: '700' },
});