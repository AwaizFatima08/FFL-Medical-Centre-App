AmbulanceRequestDetailScreen.js
// app/src/screens/ambulance/AmbulanceRequestDetailScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Platform } from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

const STATUS_LABELS = {
  pending: { label: 'Pending Review', color: '#d69e2e', bg: '#fefcbf' },
  accepted: { label: 'Accepted', color: '#2b6cb0', bg: '#ebf8ff' },
  dispatched: { label: 'Dispatched', color: '#6b46c1', bg: '#faf5ff' },
  picked_up: { label: 'Picked Up', color: '#276749', bg: '#f0fff4' },
  returned: { label: 'Returned', color: '#c05621', bg: '#fffaf0' },
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
  const [cancelReason, setCancelReason] = useState('');

  // Driver picker state
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driversLoading, setDriversLoading] = useState(false);

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

  // Fetch available drivers when request is accepted (ready for assignment)
  const fetchDrivers = async () => {
    setDriversLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.ambulance}/drivers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setDrivers(data.data || []);
      }
    } catch (error) {
      console.log('Failed to load drivers');
    } finally {
      setDriversLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchRequest();
  }, [requestId]));

  // Load drivers when request status is accepted
  useEffect(() => {
    if (request?.status === 'accepted') {
      fetchDrivers();
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
    if (!selectedDriver) {
      alert('Please select a driver.');
      return;
    }
    const assigned = await callEndpoint('assign', {
      driverUid: selectedDriver.uid,
      vehicleType
    });
    if (assigned) {
      await callEndpoint('dispatch');
    }
  };

  const handleComplete = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Confirm patient has been physically received?')
      : true;
    if (!confirmed) return;
    await callEndpoint('complete');
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
  const canComplete = request.status === 'returned';
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
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Patient Information</Text>
        {renderField('Patient Name', request.patientName)}
        {renderField('Relation', request.patientRelation)}
        {renderField('Condition/Complaint', request.patientCondition)}
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
        {request.completedAt && renderField('Completed At', new Date(request.completedAt).toLocaleString())}
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
              <Text style={styles.formLabel}>Select Driver</Text>
              {driversLoading ? (
                <ActivityIndicator size="small" color="#3182ce" style={{ marginBottom: 12 }} />
              ) : drivers.length === 0 ? (
                <Text style={styles.noDriversText}>No active drivers available</Text>
              ) : (
                <View style={styles.driverList}>
                  {drivers.map(driver => (
                    <TouchableOpacity
                      key={driver.uid}
                      style={[
                        styles.driverOption,
                        selectedDriver?.uid === driver.uid && styles.driverOptionSelected
                      ]}
                      onPress={() => setSelectedDriver(driver)}
                      disabled={actionLoading}
                    >
                      <Text style={[
                        styles.driverOptionText,
                        selectedDriver?.uid === driver.uid && styles.driverOptionTextSelected
                      ]}>
                        👤 {driver.fullName}
                      </Text>
                      <Text style={[
                        styles.driverEmail,
                        selectedDriver?.uid === driver.uid && styles.driverEmailSelected
                      ]}>
                        {driver.email}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

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
                style={[styles.actionBtn, styles.assignBtn, !selectedDriver && styles.disabledBtn]}
                onPress={handleAssignAndDispatch}
                disabled={actionLoading || !selectedDriver}
              >
                <Text style={styles.actionBtnText}>
                  {actionLoading ? 'Processing...' : '🚀 Assign & Dispatch'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Complete Button - Only for returned status */}
          {canComplete && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.completeBtn]}
              onPress={handleComplete}
              disabled={actionLoading}
            >
              <Text style={styles.actionBtnText}>
                {actionLoading ? 'Processing...' : '✅ Complete Request'}
              </Text>
            </TouchableOpacity>
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

  // Driver picker styles
  driverList: { marginBottom: 16 },
  driverOption: {
    borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  driverOptionSelected: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  driverOptionText: { color: '#2d3748', fontSize: 15, fontWeight: '600' },
  driverOptionTextSelected: { color: '#ffffff' },
  driverEmail: { color: '#718096', fontSize: 12, marginTop: 2 },
  driverEmailSelected: { color: '#ebf8ff' },
  noDriversText: { color: '#e53e3e', fontSize: 14, marginBottom: 12, fontStyle: 'italic' },

  // Vehicle picker
  vehicleOptions: { flexDirection: 'row', marginBottom: 16 },
  vehicleOption: { flex: 1, borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 8, marginRight: 8, alignItems: 'center' },
  vehicleOptionSelected: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  vehicleOptionText: { color: '#4a5568', fontSize: 14, fontWeight: '600' },
  vehicleOptionTextSelected: { color: '#ffffff' },

  input: { borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: '#ffffff', marginBottom: 12 },
  textArea: { height: 80, textAlignVertical: 'top' },
  cancelForm: { marginBottom: 16 },
  cancelActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelConfirmBtn: { backgroundColor: '#e53e3e', flex: 1, marginRight: 8 },
});