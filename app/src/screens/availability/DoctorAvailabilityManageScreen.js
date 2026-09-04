// app/src/screens/availability/DoctorAvailabilityManageScreen.js
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import DatePickerField from '../../components/DatePickerField';

const STATUS_CONFIG = {
  available:     { label: 'Available',     color: '#276749', bg: '#c6f6d5', icon: '🟢' },
  not_available: { label: 'Not Available', color: '#742a2a', bg: '#fff5f5', icon: '🔴' },
  on_leave:      { label: 'On Leave',      color: '#744210', bg: '#fefcbf', icon: '🟡' },
};

const STATUS_OPTIONS = [
  { value: 'available',     label: 'Available',     icon: '🟢' },
  { value: 'not_available', label: 'Not Available', icon: '🔴' },
  { value: 'on_leave',      label: 'On Leave',      icon: '🟡' },
];

const IS_WEB = Platform.OS === 'web';

// Phase 6 — local-date (not UTC) conversion to 'YYYY-MM-DD', matching the
// same convention DatePickerField itself uses internally, to avoid the
// timezone-shift bug this project has hit before with date fields.
const toDateString = (date) => {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatLeaveDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

// Phase 6 (follow-up) — expectedBackAt is stored as a plain "HH:mm"
// 24-hour string, always meaning "today". Converts it to a display
// string like "3:30 PM".
const formatTimeOfDay = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Phase 6 (follow-up) — a scheduled leave "wins" over the manual toggle
// on the backend for as long as today falls inside its window (see
// GET /all in availabilityRoutes.js). Tapping a status button during that
// window would silently do nothing useful — the very next refresh flips
// it back to On Leave. This check drives disabling those buttons so
// that's visible instead of surprising. Uses local device date, same as
// the rest of this screen's date handling — fine for a single-timezone
// (Pakistan-only) app.
const isLeaveActiveToday = (leave) => {
  if (!leave) return false;
  const today = toDateString(new Date());
  return today >= leave.startDate && today <= leave.endDate;
};

// Phase 6 (follow-up) — local, screen-only time-of-day picker. Mirrors
// DatePickerField's web/native split pattern, but for time instead of
// date. Kept local to this file rather than promoted to a shared
// component, since this is currently the only screen that needs a time
// picker — easy to promote later if that changes.
function TimeOfDayField({ label, value, onChange }) {
  const [show, setShow] = useState(false);

  const handleChange = (event, selectedDate) => {
    setShow(Platform.OS === 'ios');
    if (selectedDate) onChange(selectedDate);
  };

  const formatDisplay = (date) => {
    if (!date) return 'Not set';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const toInputValue = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (IS_WEB) {
    return (
      <View style={timeFieldStyles.container}>
        {label && <Text style={timeFieldStyles.label}>{label}</Text>}
        {React.createElement('input', {
          type: 'time',
          value: toInputValue(value),
          onChange: (e) => {
            if (e.target.value) {
              const [h, m] = e.target.value.split(':').map(Number);
              const d = new Date();
              d.setHours(h, m, 0, 0);
              onChange(d);
            }
          },
          style: webTimeInputStyle,
        })}
      </View>
    );
  }

  return (
    <View style={timeFieldStyles.container}>
      {label && <Text style={timeFieldStyles.label}>{label}</Text>}
      <TouchableOpacity style={timeFieldStyles.input} onPress={() => setShow(true)}>
        <Text style={value ? timeFieldStyles.valueText : timeFieldStyles.placeholder}>
          {formatDisplay(value)}
        </Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={value || new Date()}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

const webTimeInputStyle = {
  borderWidth: 1,
  borderColor: '#ddd',
  borderRadius: 8,
  padding: 12,
  backgroundColor: '#fff',
  fontSize: 14,
  color: '#333',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};

const timeFieldStyles = StyleSheet.create({
  container:  { marginBottom: 15 },
  label:      { fontSize: 14, color: '#555', marginBottom: 5, fontWeight: '600' },
  input:      { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  valueText:  { fontSize: 14, color: '#333' },
  placeholder:{ fontSize: 14, color: '#aaa' },
});

export default function DoctorAvailabilityManageScreen({ navigation }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(null); // doctorId being updated

  // Phase 6 — leave scheduling state
  const [leaveFormFor, setLeaveFormFor] = useState(null); // doctorId with the form open
  const [leaveStart, setLeaveStart] = useState(null);
  const [leaveEnd, setLeaveEnd] = useState(null);
  const [savingLeave, setSavingLeave] = useState(false);
  const [cancellingLeave, setCancellingLeave] = useState(null); // doctorId

  // Phase 6 (follow-up) — Not Available tentative-return-time state
  const [notAvailableFormFor, setNotAvailableFormFor] = useState(null); // doctorId
  const [notAvailableTime, setNotAvailableTime] = useState(null);

  const fetchAvailability = async () => {
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.availability}/all`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setDoctors(data.data || []);
      } else {
        alert(data.message || 'Failed to load availability.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchAvailability();
  }, []));

  const onRefresh = () => {
    setRefreshing(true);
    fetchAvailability();
  };

  // Used for the Available / On Leave transitions — unchanged flow.
  const handleStatusChange = async (doctorId, doctorName, newStatus) => {
    const config = STATUS_CONFIG[newStatus];
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Set ${doctorName} to "${config.label}"?`)
      : true;
    if (!confirmed) return;

    setUpdating(doctorId);
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.availability}/${doctorId}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();
      if (response.ok) {
        // Update local state immediately — no need to refetch.
        // expectedBackAt is always cleared when moving away from
        // not_available (the backend enforces this too).
        setDoctors(prev => prev.map(d =>
          d.id === doctorId
            ? { ...d, status: newStatus, expectedBackAt: null, updatedAt: new Date().toISOString() }
            : d
        ));
      } else {
        alert(data.message || 'Failed to update status.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setUpdating(null);
    }
  };

  // ─── Phase 6 (follow-up) — Not Available + tentative time handlers ──

  const openNotAvailableForm = (doctor) => {
    setNotAvailableFormFor(doctor.id);
    // Pre-fill if this doctor is already Not Available with a time set —
    // treated as "adjusting" the existing tentative time.
    if (doctor.status === 'not_available' && doctor.expectedBackAt) {
      const [h, m] = doctor.expectedBackAt.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      setNotAvailableTime(d);
    } else {
      setNotAvailableTime(null);
    }
  };

  const closeNotAvailableForm = () => {
    setNotAvailableFormFor(null);
    setNotAvailableTime(null);
  };

  const toTimeOfDayString = (date) => {
    const d = new Date(date);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Time is genuinely optional — Confirm works whether or not one was
  // picked, so there's no separate "skip" action needed.
  const handleConfirmNotAvailable = async (doctorId) => {
    setUpdating(doctorId);
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const expectedBackAt = notAvailableTime ? toTimeOfDayString(notAvailableTime) : null;
      const response = await fetch(`${API.availability}/${doctorId}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'not_available', expectedBackAt }),
      });
      const data = await response.json();
      if (response.ok) {
        setDoctors(prev => prev.map(d =>
          d.id === doctorId
            ? { ...d, status: 'not_available', expectedBackAt, updatedAt: new Date().toISOString() }
            : d
        ));
        closeNotAvailableForm();
      } else {
        alert(data.message || 'Failed to update status.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setUpdating(null);
    }
  };

  // ─── Phase 6 — leave scheduling handlers ─────────────────

  const openLeaveForm = (doctorId) => {
    setLeaveFormFor(doctorId);
    setLeaveStart(null);
    setLeaveEnd(null);
  };

  const closeLeaveForm = () => {
    setLeaveFormFor(null);
    setLeaveStart(null);
    setLeaveEnd(null);
  };

  const handleSaveLeave = async (doctorId) => {
    if (!leaveStart || !leaveEnd) {
      alert('Please select both a start and end date.');
      return;
    }
    if (toDateString(leaveStart) > toDateString(leaveEnd)) {
      alert('Start date must be on or before end date.');
      return;
    }
    setSavingLeave(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.availability}/${doctorId}/schedule-leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          startDate: toDateString(leaveStart),
          endDate:   toDateString(leaveEnd),
        }),
      });
      const data = await response.json();
      if (response.ok) {
        closeLeaveForm();
        fetchAvailability();
      } else {
        alert(data.message || 'Failed to schedule leave.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setSavingLeave(false);
    }
  };

  const handleCancelLeave = async (doctorId, doctorName) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Cancel the scheduled leave for ${doctorName}?`)
      : true;
    if (!confirmed) return;

    setCancellingLeave(doctorId);
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.availability}/${doctorId}/cancel-leave`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        fetchAvailability();
      } else {
        alert(data.message || 'Failed to cancel leave.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setCancellingLeave(null);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Manage Availability</Text>
        <Text style={styles.subtitle}>Tap a status to update</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {doctors.map((doctor) => {
            const currentConfig = STATUS_CONFIG[doctor.status] || STATUS_CONFIG.not_available;
            const isUpdating = updating === doctor.id;
            const leaveActive = isLeaveActiveToday(doctor.scheduledLeave);
            return (
              <View key={doctor.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.doctorName}>{doctor.fullName}</Text>
                  <View style={[styles.currentBadge, { backgroundColor: currentConfig.bg }]}>
                    <Text style={[styles.currentLabel, { color: currentConfig.color }]}>
                      {currentConfig.icon} {currentConfig.label}
                    </Text>
                  </View>
                </View>

                {doctor.status === 'not_available' && doctor.expectedBackAt && (
                  <Text style={styles.expectedBackText}>
                    ⏰ Expected back around {formatTimeOfDay(doctor.expectedBackAt)}
                  </Text>
                )}

                {isUpdating ? (
                  <View style={styles.updatingRow}>
                    <ActivityIndicator size="small" color="#3182ce" />
                    <Text style={styles.updatingText}>Updating...</Text>
                  </View>
                ) : (
                  <>
                    <View style={[styles.optionsRow, leaveActive && styles.optionsRowDisabled]}>
                      {STATUS_OPTIONS.map((opt) => {
                        const isActive = doctor.status === opt.value;
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            style={[
                              styles.optionBtn,
                              isActive && styles.optionBtnActive,
                            ]}
                            disabled={isActive || leaveActive}
                            onPress={() => {
                              if (isActive || leaveActive) return;
                              if (opt.value === 'not_available') {
                                openNotAvailableForm(doctor);
                              } else {
                                handleStatusChange(doctor.id, doctor.fullName, opt.value);
                              }
                            }}
                            activeOpacity={(isActive || leaveActive) ? 1 : 0.7}
                          >
                            <Text style={styles.optionIcon}>{opt.icon}</Text>
                            <Text style={[
                              styles.optionLabel,
                              isActive && styles.optionLabelActive,
                            ]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {leaveActive && (
                      <Text style={styles.leaveLockedNote}>
                        🔒 Locked while on scheduled leave — use Cancel below to end it early.
                      </Text>
                    )}
                  </>
                )}

                {/* Phase 6 (follow-up) — optional tentative return time */}
                {notAvailableFormFor === doctor.id && (
                  <View style={styles.notAvailFormBlock}>
                    <TimeOfDayField
                      label="Expected back around (optional)"
                      value={notAvailableTime}
                      onChange={setNotAvailableTime}
                    />
                    <View style={styles.leaveFormButtons}>
                      <TouchableOpacity
                        style={styles.saveLeaveBtn}
                        onPress={() => handleConfirmNotAvailable(doctor.id)}
                        disabled={updating === doctor.id}
                      >
                        <Text style={styles.saveLeaveText}>
                          {updating === doctor.id ? 'Saving...' : 'Confirm'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.cancelFormBtn} onPress={closeNotAvailableForm}>
                        <Text style={styles.cancelFormText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <Text style={styles.updatedAt}>
                  Last updated: {doctor.updatedAt
                    ? new Date(doctor.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </Text>

                {/* Phase 6 — scheduled leave section */}
                <View style={styles.leaveSection}>
                  {doctor.scheduledLeave ? (
                    <View style={styles.leaveInfoRow}>
                      <Text style={styles.leaveDatesText}>
                        📅 Leave: {formatLeaveDate(doctor.scheduledLeave.startDate)} – {formatLeaveDate(doctor.scheduledLeave.endDate)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleCancelLeave(doctor.id, doctor.fullName)}
                        disabled={cancellingLeave === doctor.id}
                      >
                        <Text style={styles.leaveCancelText}>
                          {cancellingLeave === doctor.id ? 'Cancelling...' : 'Cancel'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : leaveFormFor === doctor.id ? (
                    <View style={styles.leaveFormBlock}>
                      <DatePickerField
                        label="Leave start"
                        value={leaveStart}
                        onChange={setLeaveStart}
                        minimumDate={new Date()}
                      />
                      <DatePickerField
                        label="Leave end"
                        value={leaveEnd}
                        onChange={setLeaveEnd}
                        minimumDate={leaveStart || new Date()}
                      />
                      <View style={styles.leaveFormButtons}>
                        <TouchableOpacity
                          style={styles.saveLeaveBtn}
                          onPress={() => handleSaveLeave(doctor.id)}
                          disabled={savingLeave}
                        >
                          <Text style={styles.saveLeaveText}>
                            {savingLeave ? 'Saving...' : 'Save'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelFormBtn} onPress={closeLeaveForm}>
                          <Text style={styles.cancelFormText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => openLeaveForm(doctor.id)}>
                      <Text style={styles.scheduleLeaveText}>+ Schedule Leave</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:          { flex: 1, backgroundColor: '#f0f4f8' },
  header:           { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn:          { marginBottom: 8 },
  backText:         { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:            { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle:         { fontSize: 13, color: '#718096', marginTop: 2 },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  loadingText:      { marginTop: 12, color: '#718096' },
  list:             { padding: 20, gap: 16 },
  card:             { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
  cardHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  doctorName:       { fontSize: 16, fontWeight: '600', color: '#2d3748', flex: 1, marginRight: 8 },
  currentBadge:     { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  currentLabel:     { fontSize: 12, fontWeight: '600' },
  expectedBackText: { fontSize: 12, color: '#c05621', marginBottom: 10, marginTop: -8 },
  optionsRow:       { flexDirection: 'row', gap: 8, marginBottom: 10 },
  optionsRowDisabled: { opacity: 0.4 },
  optionBtn:        { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f7fafc' },
  optionBtnActive:  { backgroundColor: '#ebf8ff', borderColor: '#3182ce' },
  optionIcon:       { fontSize: 16, marginBottom: 2 },
  optionLabel:      { fontSize: 11, color: '#718096', fontWeight: '500', textAlign: 'center' },
  optionLabelActive:{ color: '#2b6cb0', fontWeight: '700' },
  updatingRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, marginBottom: 10 },
  updatingText:     { color: '#718096', fontSize: 14 },
  updatedAt:        { fontSize: 11, color: '#a0aec0' },
  leaveLockedNote:  { fontSize: 11, color: '#c05621', marginBottom: 10, marginTop: -2 },
  notAvailFormBlock:{ backgroundColor: '#f7fafc', borderRadius: 8, padding: 12, marginBottom: 10 },

  // Phase 6 — scheduled leave styles
  leaveSection:      { marginTop: 12 },
  leaveInfoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ebf8ff', borderRadius: 8, padding: 10 },
  leaveDatesText:    { fontSize: 12, color: '#2b6cb0', flex: 1, marginRight: 8 },
  leaveCancelText:   { fontSize: 12, color: '#c53030', fontWeight: '600' },
  scheduleLeaveText: { fontSize: 12, color: '#3182ce', fontWeight: '600' },
  leaveFormBlock:    { backgroundColor: '#f7fafc', borderRadius: 8, padding: 12 },
  leaveFormButtons:  { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveLeaveBtn:      { backgroundColor: '#3182ce', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  saveLeaveText:     { color: '#fff', fontSize: 13, fontWeight: '600' },
  cancelFormBtn:     { paddingVertical: 8, paddingHorizontal: 16 },
  cancelFormText:    { color: '#718096', fontSize: 13, fontWeight: '600' },
});