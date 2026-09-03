// app/src/screens/ambulance/AmbulanceRequestDetailScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Platform } from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { PURPOSE_OF_VISIT_OPTIONS, DROP_OFF_OUTCOMES } from '../../constants';

// Day 16 (Phase 5, Step 5.2 fix) — display-label lookup for purposeOfVisit,
// same pattern already used for STATUS_LABELS/VEHICLE_OPTIONS in this file.
const PURPOSE_LABELS = Object.fromEntries(
  PURPOSE_OF_VISIT_OPTIONS.map(opt => [opt.value, opt.label])
);

// Day 16 (Phase 5, Step 5.6.3) — same pattern, for dropOffOutcome
const DROP_OFF_LABELS = Object.fromEntries(
  DROP_OFF_OUTCOMES.map(opt => [opt.value, opt.label])
);

const STATUS_LABELS = {
  pending: { label: 'Pending Review', color: '#d69e2e', bg: '#fefcbf' },
  accepted: { label: 'Accepted', color: '#2b6cb0', bg: '#ebf8ff' },
  dispatched: { label: 'Dispatched', color: '#6b46c1', bg: '#faf5ff' },
  picked_up: { label: 'Picked Up', color: '#276749', bg: '#f0fff4' },
  returned: { label: 'Returned', color: '#c05621', bg: '#fffaf0' },
  // Day 16 (Phase 5, Step 5.6.3) — patient back at Medical Centre, vehicle
  // free, drop-off leg still open
  arrived: { label: 'Arrived — Drop Off Pending', color: '#805ad5', bg: '#faf5ff' },
  completed: { label: 'Completed', color: '#22543d', bg: '#c6f6d5' },
  cancelled: { label: 'Cancelled', color: '#742a2a', bg: '#fff5f5' },
};

const VEHICLE_OPTIONS = [
  { label: '🚐 Mini Ambulance', value: 'mini' },
  { label: '🚑 BLS Ambulance', value: 'BLS' },
];

export default function AmbulanceRequestDetailScreen({ route, navigation }) {
  const { requestId } = route.params;
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [vehicleType, setVehicleType] = useState('mini');
  const [showCancelForm, setShowCancelForm] = useState(false);
  // Day 16 (Phase 5, Step 5.6.3) — mirrors showCancelForm's toggle pattern
  const [showDropOffReasons, setShowDropOffReasons] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Day 21 (Phase 5.8.3) — false-emergency flag, checked at Drop Off
  // closure per the locked design (can't be judged before the patient
  // arrives, shouldn't be risked on instinct mid-trip). Only rendered for
  // emergency-flagged requests (see canDropOff/isEmergency below) — a
  // routine request has nothing to "falsely" claim. Reset per request
  // load, same as showCancelForm/showDropOffReasons.
  const [falseEmergencyChecked, setFalseEmergencyChecked] = useState(false);

  // Day 16 (Phase 5, Step 5.6.2) — driver picker removed. The backend now
  // auto-assigns whoever is on duty; this screen only needs to show that
  // driver (for reception's visibility) and know whether one exists at
  // all, to enable/disable the dispatch button.
  const [onDutyDriver, setOnDutyDriver] = useState(null);
  const [onDutyLoading, setOnDutyLoading] = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchRequest = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.ambulance}/${requestId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setRequest(data.data);
      } else {
        alert(data.message || 'Failed to load request.');
      }
    } catch (error) {
      alert('Network error.');
    } finally {
      setLoading(false);
    }
  };

  // Day 16 (Phase 5, Step 5.6.1) — who's currently on duty. Now the actual
  // source of truth for who gets assigned (5.6.2), not just an info box.
  const fetchOnDutyDriver = async () => {
    setOnDutyLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.ambulance}/on-duty-driver`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setOnDutyDriver(data.data || null);
      }
    } catch (error) {
      console.log('Failed to load on-duty driver');
    } finally {
      setOnDutyLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setFalseEmergencyChecked(false);
    fetchRequest();
  }, [requestId]));

  // Load on-duty driver when request status is accepted
  useEffect(() => {
    if (request?.status === 'accepted') {
      fetchOnDutyDriver();
    }
  }, [request?.status]);

  const callEndpoint = async (endpoint, body = {}) => {
    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.ambulance}/${requestId}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (response.ok) {
        await fetchRequest();
        return true;
      } else {
        alert(data.message || 'Action failed.');
        return false;
      }
    } catch (error) {
      alert('Network error.');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Accept this ambulance request?')
      : true;
    if (!confirmed) return;
    await callEndpoint('accept');
  };

  const handleAssignAndDispatch = async () => {
    if (!onDutyDriver) {
      alert('No driver is currently on duty. Cannot dispatch.');
      return;
    }
    const assigned = await callEndpoint('assign', { vehicleType });
    if (assigned) {
      await callEndpoint('dispatch');
    }
  };

  // Day 16 (Phase 5, Step 5.6.3) — renamed from handleComplete. This now
  // only confirms arrival back at the Medical Centre, not final closure.
  const handleConfirmArrival = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Confirm patient has been physically received?')
      : true;
    if (!confirmed) return;
    await callEndpoint('arrive');
  };

  // Day 16 (Phase 5, Step 5.6.3) — closes the drop-off leg. Single click,
  // no in-transit tracking of the return trip itself (deliberately not
  // engineered further, per Homi's Day 16 decision).
  // Day 21 (Phase 5.8.3) — carries the false-emergency flag along
  // regardless of which outcome is chosen (Dropped Off, Referred Outside,
  // or Patient Declined) — the flag is about whether the original alarm
  // was genuine, independent of how the trip actually closed out. Backend
  // silently ignores it on non-emergency requests, so this is safe to
  // always include for isEmergency requests without a separate guard here.
  const handleDropOff = async (outcome) => {
    const body = { outcome };
    if (isEmergency && falseEmergencyChecked) {
      body.falseEmergency = true;
    }
    await callEndpoint('dropoff', body);
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      alert('Please enter a reason for cancellation.');
      return;
    }
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to cancel this request?')
      : true;
    if (!confirmed) return;
    const done = await callEndpoint('cancel', { reason: cancelReason.trim() });
    if (done) setShowCancelForm(false);
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
        <Text style={styles.loadingText}>Loading request...</Text>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Request not found.</Text>
      </View>
    );
  }

  const statusStyle = STATUS_LABELS[request.status] || { label: request.status, color: '#4a5568', bg: '#edf2f7' };
  const isActive = !['completed', 'cancelled'].includes(request.status);
  const canAccept = request.status === 'pending';
  const canAssign = request.status === 'accepted';
  const canConfirmArrival = request.status === 'returned';
  // Day 16 (Phase 5, Step 5.6.3)
  const canDropOff = request.status === 'arrived';
  const isEmergency = request.priorityFlag === 'emergency';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Request Detail</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.color }]}>
              {statusStyle.label}
            </Text>
          </View>
        </View>
        {isEmergency && (
          <View style={styles.emergencyBanner}>
            <Text style={styles.emergencyText}>🚨 EMERGENCY REQUEST</Text>
          </View>
        )}
        {request.falseEmergencyFlag === true && (
          <View style={styles.flaggedBanner}>
            <Text style={styles.flaggedText}>⚠️ Flagged as False Emergency at Closure</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Patient Information</Text>
        {renderField('Patient Name', request.patientName)}
        {renderField('Relation', request.patientRelation)}
        {renderField('Condition/Complaint', request.patientCondition)}
        {renderField('Purpose of Visit', PURPOSE_LABELS[request.purposeOfVisit] || '—')}
        {renderField('Priority', request.priorityFlag === 'emergency' ? '🚨 Emergency' : 'Routine')}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trip Details</Text>
        {renderField('Trip Type', request.tripType === 'intra_township' ? 'Within Township' : 'Intercity')}
        {renderField('Pickup Location', request.pickupLocation)}
        {renderField('Drop Location', request.dropLocation)}
        {renderField('Vehicle Type', request.vehicleAssigned === 'BLS' ? '🚑 BLS Ambulance' : '🚐 Mini Ambulance')}
        {request.notes && renderField('Notes', request.notes)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status Information</Text>
        {renderField('Current Status', statusStyle.label)}
        {renderField('Requested By', request.requestedByType === 'employee' ? 'Employee (Self)' : 'Reception')}
        {renderField('Created At', new Date(request.createdAt).toLocaleString())}
        {request.acceptedAt && renderField('Accepted At', new Date(request.acceptedAt).toLocaleString())}
        {request.assignedDriver && renderField('Assigned Driver', request.assignedDriver)}
        {request.dispatchedAt && renderField('Dispatched At', new Date(request.dispatchedAt).toLocaleString())}
        {request.pickedUpAt && renderField('Picked Up At', new Date(request.pickedUpAt).toLocaleString())}
        {request.returnedAt && renderField('Returned At', new Date(request.returnedAt).toLocaleString())}
        {request.arrivedAt && renderField('Arrived At', new Date(request.arrivedAt).toLocaleString())}
        {request.dropOffTriggeredAt && renderField('Drop Off Resolved At', new Date(request.dropOffTriggeredAt).toLocaleString())}
        {request.dropOffOutcome && renderField('Drop Off Outcome', DROP_OFF_LABELS[request.dropOffOutcome] || request.dropOffOutcome)}
        {request.completedAt && renderField('Completed At', new Date(request.completedAt).toLocaleString())}
        {request.falseEmergencyFlaggedAt && renderField('False Emergency Flagged At', new Date(request.falseEmergencyFlaggedAt).toLocaleString())}
      </View>

      {/* Action Buttons Section */}
      {isActive && (
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Actions</Text>

          {/* Accept Button - Only for pending employee requests */}
          {canAccept && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={handleAccept}
              disabled={actionLoading}
            >
              <Text style={styles.actionBtnText}>
                {actionLoading ? 'Processing...' : '✅ Accept Request'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Assign & Dispatch - For accepted requests */}
          {canAssign && (
            <View style={styles.assignForm}>
              {/* Day 16 (Phase 5, Step 5.6.2) — driver picker removed.
                  Whoever is on duty is auto-assigned server-side; this box
                  is now the actual assignment, not just an info aside. */}
              <Text style={styles.formLabel}>Driver (auto-assigned)</Text>
              <View style={styles.onDutyBox}>
                {onDutyLoading ? (
                  <ActivityIndicator size="small" color="#3182ce" />
                ) : onDutyDriver ? (
                  <Text style={styles.onDutyName}>🟢 {onDutyDriver.fullName}</Text>
                ) : (
                  <Text style={styles.onDutyNone}>⚠️ No driver currently on duty</Text>
                )}
              </View>

              <Text style={styles.formLabel}>Vehicle Type</Text>
              <View style={styles.vehicleOptions}>
                {VEHICLE_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.vehicleOption,
                      vehicleType === option.value && styles.vehicleOptionSelected
                    ]}
                    onPress={() => setVehicleType(option.value)}
                    disabled={actionLoading}
                  >
                    <Text style={[
                      styles.vehicleOptionText,
                      vehicleType === option.value && styles.vehicleOptionTextSelected
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.actionBtn, styles.assignBtn, !onDutyDriver && styles.disabledBtn]}
                onPress={handleAssignAndDispatch}
                disabled={actionLoading || !onDutyDriver}
              >
                <Text style={styles.actionBtnText}>
                  {actionLoading ? 'Processing...' : '🚀 Assign & Dispatch'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Confirm Arrival - Only for returned status */}
          {/* Day 16 (Phase 5, Step 5.6.3) — renamed from Complete Request.
              No longer the final step; frees the vehicle but leaves the
              request open until drop-off is resolved below. */}
          {canConfirmArrival && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.completeBtn]}
              onPress={handleConfirmArrival}
              disabled={actionLoading}
            >
              <Text style={styles.actionBtnText}>
                {actionLoading ? 'Processing...' : '🏥 Confirm Arrival'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Day 21 (Phase 5.8.3) — false-emergency checkbox. Rendered once,
              above whichever Drop Off sub-view is showing (the two direct
              buttons, or the "Not Required" reasons list) — so its state
              persists regardless of which path the user takes to close
              the request, and applies to any of the three outcomes.
              Emergency-only: a routine request has nothing to "falsely"
              claim, so this simply doesn't render for one. */}
          {canDropOff && isEmergency && (
            <TouchableOpacity
              style={styles.falseEmergencyRow}
              onPress={() => setFalseEmergencyChecked(prev => !prev)}
              disabled={actionLoading}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, falseEmergencyChecked && styles.checkboxChecked]}>
                {falseEmergencyChecked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.falseEmergencyLabel}>
                This was flagged as an emergency but was not a genuine emergency. Checking this notifies the CMO for administrative review.
              </Text>
            </TouchableOpacity>
          )}

          {/* Drop Off - Only for arrived status */}
          {/* Day 16 (Phase 5, Step 5.6.3) — single click, no in-transit
              tracking of the return trip itself (deliberately kept
              simple). "Not Required" reveals the two fixed reasons,
              mirroring the Cancel form's toggle pattern below. */}
          {canDropOff && !showDropOffReasons && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.completeBtn]}
                onPress={() => handleDropOff('dropped_off')}
                disabled={actionLoading}
              >
                <Text style={styles.actionBtnText}>
                  {actionLoading ? 'Processing...' : '🏠 Drop Off'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={() => setShowDropOffReasons(true)}
                disabled={actionLoading}
              >
                <Text style={styles.cancelBtnText}>Drop Off Not Required</Text>
              </TouchableOpacity>
            </>
          )}
          {canDropOff && showDropOffReasons && (
            <View style={styles.cancelForm}>
              <Text style={styles.formLabel}>Reason</Text>
              {DROP_OFF_OUTCOMES.filter(o => o.value !== 'dropped_off').map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.actionBtn, styles.assignBtn]}
                  onPress={() => handleDropOff(option.value)}
                  disabled={actionLoading}
                >
                  <Text style={styles.actionBtnText}>
                    {actionLoading ? 'Processing...' : option.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#e2e8f0' }]}
                onPress={() => setShowDropOffReasons(false)}
                disabled={actionLoading}
              >
                <Text style={{ color: '#4a5568', fontSize: 16, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Cancel Button */}
          {!showCancelForm ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={() => setShowCancelForm(true)}
              disabled={actionLoading}
            >
              <Text style={styles.cancelBtnText}>❌ Cancel Request</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.cancelForm}>
              <Text style={styles.formLabel}>Cancel Reason</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Enter cancellation reason"
                value={cancelReason}
                onChangeText={setCancelReason}
                multiline
                numberOfLines={3}
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
                  style={[styles.actionBtn, { backgroundColor: '#e2e8f0' }]}
                  onPress={() => setShowCancelForm(false)}
                  disabled={actionLoading}
                >
                  <Text style={{ color: '#4a5568', fontSize: 16, fontWeight: '600' }}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f7fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7fafc' },
  loadingText: { marginTop: 12, color: '#4a5568', fontSize: 16 },
  errorText: { color: '#e53e3e', fontSize: 18, fontWeight: '600' },

  header: { marginBottom: 24, backgroundColor: '#ffffff', borderRadius: 12, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  backBtn: { marginBottom: 12 },
  backText: { color: '#3182ce', fontSize: 16, fontWeight: '600' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2d3748' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 14, fontWeight: '600' },
  emergencyBanner: { marginTop: 12, backgroundColor: '#fed7d7', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#e53e3e' },
  emergencyText: { color: '#c53030', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  flaggedBanner: { marginTop: 12, backgroundColor: '#fffaf0', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#dd6b20' },
  flaggedText: { color: '#9c4221', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },

  section: { marginBottom: 20, backgroundColor: '#ffffff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2d3748', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 8 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#4a5568', marginBottom: 4 },
  fieldValue: { fontSize: 16, color: '#2d3748' },

  actionsSection: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  actionBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  actionBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  acceptBtn: { backgroundColor: '#38a169' },
  assignBtn: { backgroundColor: '#3182ce' },
  completeBtn: { backgroundColor: '#22543d' },
  disabledBtn: { backgroundColor: '#a0aec0' },
  cancelBtn: { backgroundColor: '#e2e8f0', borderWidth: 1, borderColor: '#cbd5e0' },
  cancelBtnText: { color: '#e53e3e', fontSize: 16, fontWeight: '600' },

  assignForm: { marginBottom: 16 },
  formLabel: { fontSize: 14, fontWeight: '600', color: '#4a5568', marginBottom: 8 },

  // Day 16 (Phase 5, Step 5.6.1) — on-duty driver info box
  onDutyBox: {
    backgroundColor: '#f0fff4', borderWidth: 1, borderColor: '#c6f6d5',
    borderRadius: 8, padding: 12, marginBottom: 16,
  },
  onDutyName: { fontSize: 15, fontWeight: '600', color: '#2d3748' },
  onDutyNone: { fontSize: 13, color: '#c53030', fontStyle: 'italic' },

  // Driver picker styles
  // Day 16 (Phase 5, Step 5.6.2) — driver picker styles removed along with
  // the picker itself (driverList, driverOption*, driverEmail*, noDriversText)

  // Vehicle picker
  vehicleOptions: { flexDirection: 'row', marginBottom: 16 },
  vehicleOption: { flex: 1, borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 8, marginRight: 8, alignItems: 'center' },
  vehicleOptionSelected: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  vehicleOptionText: { color: '#4a5568', fontSize: 14, fontWeight: '600' },
  vehicleOptionTextSelected: { color: '#ffffff' },

  // Day 21 (Phase 5.8.3) — false-emergency checkbox
  falseEmergencyRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fffaf0', borderWidth: 1, borderColor: '#feebc8',
    borderRadius: 8, padding: 12, marginBottom: 12,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#dd6b20',
    alignItems: 'center', justifyContent: 'center', marginTop: 1, backgroundColor: '#ffffff',
  },
  checkboxChecked: { backgroundColor: '#dd6b20' },
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  falseEmergencyLabel: { flex: 1, fontSize: 13, color: '#9c4221', lineHeight: 18 },

  input: { borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: '#ffffff', marginBottom: 12 },
  textArea: { height: 80, textAlignVertical: 'top' },
  cancelForm: { marginBottom: 16 },
  cancelActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelConfirmBtn: { backgroundColor: '#e53e3e', flex: 1, marginRight: 8 },
});