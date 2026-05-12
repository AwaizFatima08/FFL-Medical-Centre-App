// app/src/screens/trip/TripMyBookingScreen.js
import { webAlert, webConfirm } from '../../utils/webAlert';
// Flow 4 — Medical Trip
// Employee views their own bookings and can cancel pending ones

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   bg: '#fffbeb', text: '#b7791f', border: '#fbd38d' },
  confirmed: { label: 'Confirmed', bg: '#f0fff4', text: '#276749', border: '#9ae6b4' },
  cancelled: { label: 'Cancelled', bg: '#fff5f5', text: '#c53030', border: '#feb2b2' },
  completed: { label: 'Completed', bg: '#f7fafc', text: '#718096', border: '#e2e8f0' },
};


export default function TripMyBookingScreen({ navigation, route }) {
  const { userRole } = route.params || {};

  const [bookings, setBookings]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [cancellingId, setCancellingId]   = useState(null);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchBookings = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.trips}/my`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setBookings(data.data || []);
      } else {
        webAlert('Error', data.message || 'Failed to load bookings.');
      }
    } catch {
      webAlert('Error', 'Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchBookings();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  const handleCancel = (booking) => {
    webConfirm(
      'Cancel Booking',
      `Cancel your trip on ${formatDate(booking.tripDate)}?`,
      async () => {
        setCancellingId(booking.id);
        try {
          const token = await getToken();
          const response = await fetch(`${API.trips}/${booking.id}/cancel`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await response.json();
          if (response.ok) {
            fetchBookings();
          } else {
            webAlert('Error', data.message || 'Cancellation failed.');
          }
        } catch {
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setCancellingId(null);
        }
      }
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-PK', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  };

  const renderBooking = (item) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const canCancel = item.status === 'pending' || item.status === 'confirmed';
    const [y, m, d] = item.tripDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);

    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.dateBlock}>
            <Text style={styles.dateDayName}>
              {dateObj.toLocaleDateString('en-US', { weekday: 'long' })}
            </Text>
            <Text style={styles.dateValue}>
              {dateObj.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: config.bg, borderColor: config.border }]}>
            <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <InfoItem icon="🏠" label="Pickup"      value={item.pickupHouse || '—'} />
          <InfoItem icon="👤" label="Patient"     value={item.patientName || '—'} />
          <InfoItem icon="🔗" label="Relation"    value={item.patientRelation || '—'} />
          <InfoItem icon="💺" label="Seats"       value={String(item.seats || 1)} />
          <InfoItem icon="🩺" label="Doctor"      value={item.doctorName || '—'} />
          <InfoItem icon="🕔" label="Departs"     value="17:30" />
          <InfoItem icon="↩️" label="Return Trip" value={item.returnTrip ? 'Yes — 21:00' : 'No'} />
          <InfoItem icon="📋" label="Referral"    value={item.referralConfirmed ? 'Confirmed' : 'Not confirmed'} />
        </View>

        {!!item.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        )}

        {canCancel && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancel(item)}
            disabled={cancellingId === item.id}
          >
            {cancellingId === item.id
              ? <ActivityIndicator size="small" color="#c53030" />
              : <Text style={styles.cancelBtnText}>Cancel Booking</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const upcoming = bookings.filter(b => b.tripDate >= todayStr && b.status !== 'cancelled');
  const past     = bookings.filter(b => b.tripDate <  todayStr || b.status === 'cancelled');

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Trip Bookings</Text>
        <Text style={styles.subtitle}>View and manage your medical trip requests</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading your bookings...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <TouchableOpacity
            style={styles.newBookingBtn}
            onPress={() => navigation.navigate('TripBooking', { userRole })}
          >
            <Text style={styles.newBookingBtnText}>+ Book a New Trip</Text>
          </TouchableOpacity>

          {upcoming.length > 0 && (
            <>
              <Text style={styles.groupLabel}>UPCOMING</Text>
              {upcoming.map(renderBooking)}
            </>
          )}

          {past.length > 0 && (
            <>
              <Text style={styles.groupLabel}>PAST & CANCELLED</Text>
              {past.map(renderBooking)}
            </>
          )}

          {bookings.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🚌</Text>
              <Text style={styles.emptyText}>No bookings yet</Text>
              <Text style={styles.emptySubtext}>Tap the button above to book a trip</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function InfoItem({ icon, label, value }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginBottom: 6 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 13, color: '#718096', marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  newBookingBtn: {
    backgroundColor: '#3182ce', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', marginBottom: 20,
  },
  newBookingBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  groupLabel: {
    fontSize: 11, fontWeight: '800', color: '#a0aec0',
    letterSpacing: 1, marginBottom: 8, marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  dateBlock: {},
  dateDayName: { fontSize: 15, fontWeight: '700', color: '#2d3748' },
  dateValue: { fontSize: 13, color: '#718096', marginTop: 1 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: '700' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  infoItem: { flexDirection: 'row', alignItems: 'center', width: '45%', gap: 6 },
  infoIcon: { fontSize: 16 },
  infoLabel: { fontSize: 11, color: '#a0aec0', fontWeight: '600' },
  infoValue: { fontSize: 13, color: '#2d3748', fontWeight: '600' },
  notesBox: { backgroundColor: '#f7fafc', borderRadius: 8, padding: 10, marginBottom: 10 },
  notesLabel: { fontSize: 11, color: '#a0aec0', fontWeight: '700', marginBottom: 3 },
  notesText: { fontSize: 13, color: '#4a5568' },
  cancelBtn: {
    borderWidth: 1, borderColor: '#feb2b2', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff5f5',
  },
  cancelBtnText: { color: '#c53030', fontWeight: '700', fontSize: 14 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  loadingText: { marginTop: 10, color: '#718096', fontSize: 14 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#4a5568', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#a0aec0', marginTop: 4 },
});