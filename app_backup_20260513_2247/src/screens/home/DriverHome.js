// app/src/screens/home/DriverHome.js

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { getAuth, signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import NotificationBell from '../../components/NotificationBell';
import { webAlert, webConfirm } from '../../utils/webAlert';

const STATUS_CONFIG = {
  pending:    { label: 'Waiting',   icon: '⏳', color: '#d69e2e', bg: '#fefcbf' },
  accepted:   { label: 'Ready',     icon: '✅', color: '#2b6cb0', bg: '#ebf8ff' },
  dispatched: { label: 'En Route',  icon: '🚐', color: '#6b46c1', bg: '#faf5ff' },
  picked_up:  { label: 'Returning', icon: '🏥', color: '#276749', bg: '#f0fff4' },
  returned:   { label: 'Returned',  icon: '🏁', color: '#c05621', bg: '#fffaf0' },
  completed:  { label: 'Done',      icon: '✅', color: '#22543d', bg: '#c6f6d5' },
  cancelled:  { label: 'Cancelled', icon: '❌', color: '#742a2a', bg: '#fff5f5' },
};

export default function DriverHome({ navigation }) {
  const [trip, setTrip]                   = useState(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchActiveTrip = async () => {
    try {
      const token    = await getToken();
      const response = await fetch(`${API.ambulance}/driver/active`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) setTrip(data.data || null);
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { setLoading(true); fetchActiveTrip(); }, []));
  const onRefresh = () => { setRefreshing(true); fetchActiveTrip(); };

  const handleLogout = () => {
    webConfirm(
      'Logout',
      'Are you sure you want to logout?',
      async () => {
        try { await signOut(auth); }
        catch { webAlert('Error', 'Failed to logout. Please try again.'); }
      },
      true, 'Logout'
    );
  };

  const callEndpoint = async (endpoint, body = {}) => {
    setActionLoading(true);
    try {
      const token    = await getToken();
      const response = await fetch(`${API.ambulance}/${trip.id}/${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const data = await response.json();
      if (response.ok) await fetchActiveTrip();
      else webAlert('Error', data.message || 'Action failed.');
    } catch { webAlert('Error', 'Network error.'); }
    finally { setActionLoading(false); }
  };

  const handlePickedUp = () => callEndpoint('pickup');
  const handleReturned = () => callEndpoint('return');
  const handleCancel   = () => {
    webConfirm(
      'Cancel Trip',
      'Cancel this trip? This cannot be undone.',
      () => callEndpoint('cancel', { reason: 'Cancelled by driver' }),
      true, 'Cancel Trip'
    );
  };

  const renderNoTrip = () => (
    <View style={styles.noTripContainer}>
      <Text style={styles.noTripIcon}>🚐</Text>
      <Text style={styles.noTripTitle}>No Active Trip</Text>
      <Text style={styles.noTripSubtitle}>You will be notified when a trip is assigned</Text>
      <Text style={styles.pullHint}>Pull down to refresh</Text>
    </View>
  );

  const renderTrip = () => {
    const status       = STATUS_CONFIG[trip.status] || STATUS_CONFIG.pending;
    const isDispatched = trip.status === 'dispatched';
    const isPickedUp   = trip.status === 'picked_up';
    const canCancel    = ['dispatched', 'picked_up'].includes(trip.status);

    return (
      <View style={styles.tripContainer}>
        <View style={[styles.statusBanner, { backgroundColor: status.bg }]}>
          <Text style={styles.statusIcon}>{status.icon}</Text>
          <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
        </View>

        {trip.priorityFlag === 'emergency' && (
          <View style={styles.emergencyBanner}>
            <Text style={styles.emergencyText}>🚨 EMERGENCY</Text>
          </View>
        )}

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>👤</Text>
            <View>
              <Text style={styles.detailCaption}>Patient</Text>
              <Text style={styles.detailValue}>{trip.patientName}</Text>
              {trip.patientRelation && <Text style={styles.detailSub}>{trip.patientRelation}</Text>}
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>🏠</Text>
            <View>
              <Text style={styles.detailCaption}>Pickup</Text>
              <Text style={styles.detailValue}>{trip.pickupLocation || 'Not specified'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📍</Text>
            <View>
              <Text style={styles.detailCaption}>Destination</Text>
              <Text style={styles.detailValue}>{trip.dropLocation || 'Not specified'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>🚐</Text>
            <View>
              <Text style={styles.detailCaption}>Vehicle</Text>
              <Text style={styles.detailValue}>
                {trip.vehicleAssigned === 'BLS' ? 'BLS Ambulance' : 'Mini Ambulance'}
              </Text>
            </View>
          </View>
          {trip.notes && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailIcon}>📝</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailCaption}>Notes</Text>
                  <Text style={styles.detailValue}>{trip.notes}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {actionLoading ? (
          <View style={styles.actionLoading}>
            <ActivityIndicator size="large" color="#3182ce" />
            <Text style={styles.actionLoadingText}>Updating...</Text>
          </View>
        ) : (
          <>
            {isDispatched && (
              <TouchableOpacity style={styles.arrivedBtn} onPress={handlePickedUp}>
                <Text style={styles.arrivedBtnIcon}>📍</Text>
                <Text style={styles.arrivedBtnText}>Arrived at Destination</Text>
              </TouchableOpacity>
            )}
            {isPickedUp && (
              <TouchableOpacity style={styles.returnedBtn} onPress={handleReturned}>
                <Text style={styles.returnedBtnIcon}>🏥</Text>
                <Text style={styles.returnedBtnText}>Back at Medical Centre</Text>
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelBtnText}>✕  Cancel Trip</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Blue header bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>🚐 Driver Dashboard</Text>
            <Text style={styles.headerSub}>FFL Medical Centre</Text>
          </View>
          {/* Bell + logout grouped on the right */}
          <View style={styles.headerRight}>
            <NotificationBell navigation={navigation} />
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>⏻ Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading
          ? <View style={styles.centered}>
              <ActivityIndicator size="large" color="#3182ce" />
              <Text style={styles.loadingText}>Loading trip...</Text>
            </View>
          : trip ? renderTrip() : renderNoTrip()
        }
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },

  headerBar: {
    backgroundColor: '#2b6cb0',
    paddingTop: 48, paddingBottom: 16, paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  headerSub:   { fontSize: 13, color: '#bee3f8', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoutBtn: {
    backgroundColor: '#e53e3e',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
  },
  logoutText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },

  scroll:        { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 16 },

  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 80 },
  loadingText: { fontSize: 14, color: '#718096' },

  noTripContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  noTripIcon:      { fontSize: 64 },
  noTripTitle:     { fontSize: 20, fontWeight: '700', color: '#2d3748' },
  noTripSubtitle:  { fontSize: 14, color: '#718096', textAlign: 'center', paddingHorizontal: 32 },
  pullHint:        { fontSize: 12, color: '#a0aec0', marginTop: 8 },

  tripContainer: { gap: 14 },
  statusBanner: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    borderRadius: 10, paddingVertical: 14,
  },
  statusIcon:  { fontSize: 28 },
  statusLabel: { fontSize: 20, fontWeight: '800' },
  emergencyBanner: {
    backgroundColor: '#c53030', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  emergencyText: { color: '#ffffff', fontWeight: '800', fontSize: 16, letterSpacing: 2 },
  detailsCard: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 3,
  },
  detailRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 10 },
  detailIcon:    { fontSize: 22, marginTop: 2 },
  detailCaption: { fontSize: 11, color: '#a0aec0', textTransform: 'uppercase', marginBottom: 2 },
  detailValue:   { fontSize: 15, fontWeight: '600', color: '#2d3748' },
  detailSub:     { fontSize: 13, color: '#718096' },
  divider:       { height: 1, backgroundColor: '#f7fafc' },

  arrivedBtn: {
    backgroundColor: '#276749', borderRadius: 12,
    paddingVertical: 18, alignItems: 'center', gap: 6,
  },
  arrivedBtnIcon: { fontSize: 32 },
  arrivedBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  returnedBtn: {
    backgroundColor: '#2b6cb0', borderRadius: 12,
    paddingVertical: 18, alignItems: 'center', gap: 6,
  },
  returnedBtnIcon: { fontSize: 32 },
  returnedBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    borderWidth: 1.5, borderColor: '#fc8181',
    borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  cancelBtnText:     { color: '#c53030', fontSize: 14, fontWeight: '600' },
  actionLoading:     { alignItems: 'center', gap: 12, paddingVertical: 24 },
  actionLoadingText: { fontSize: 14, color: '#718096' },
});