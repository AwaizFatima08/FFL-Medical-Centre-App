// app/src/screens/trip/TripReceptionHubScreen.js
// Flow 4 — Medical Trip
// Reception views all bookings, filters by date, confirms seats, generates report
// Seat cap: 24 per trip date

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   bg: '#fffbeb', text: '#b7791f', border: '#fbd38d' },
  confirmed: { label: 'Confirmed', bg: '#f0fff4', text: '#276749', border: '#9ae6b4' },
  cancelled: { label: 'Cancelled', bg: '#fff5f5', text: '#c53030', border: '#feb2b2' },
  completed: { label: 'Completed', bg: '#f7fafc', text: '#718096', border: '#e2e8f0' },
};

const SEAT_CAP = 24;

// Returns upcoming trip dates — local date parts only, no UTC shift
function getTripDates(count = 8) {
  const TRIP_DAYS = ['Monday', 'Wednesday', 'Saturday'];
  const results = [];
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let cursor = new Date(todayLocal);
  let attempts = 0;

  while (results.length < count && attempts < 60) {
    const dayName = cursor.toLocaleDateString('en-US', { weekday: 'long' });
    if (TRIP_DAYS.includes(dayName)) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      results.push({
        label: cursor.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' }),
        value: `${y}-${m}-${d}`,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
    attempts++;
  }
  return results;
}

export default function TripReceptionHubScreen({ navigation, route }) {
  const { userRole } = route.params || {};

  const tripDates = getTripDates(8);
  const [selectedDate, setSelectedDate] = useState(tripDates[0]?.value || '');
  const [bookings, setBookings]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchBookings = async (date) => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.trips}/all?tripDate=${date}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setBookings(data.data || []);
      } else {
        alert(data.message || 'Failed to load bookings.');
      }
    } catch {
      alert('Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchBookings(selectedDate);
  }, [selectedDate]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings(selectedDate);
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  // Count seats (not bookings) — each booking may hold multiple seats
  const confirmedSeats = bookings
    .filter(b => b.status === 'confirmed')
    .reduce((sum, b) => sum + (b.seats || 1), 0);
  const pendingSeats = bookings
    .filter(b => b.status === 'pending')
    .reduce((sum, b) => sum + (b.seats || 1), 0);
  const seatsLeft = SEAT_CAP - confirmedSeats;

  const canGenerateReport = () => new Date().getHours() >= 16;

  const handleGenerateReport = () => {
    if (!canGenerateReport()) {
      Alert.alert('Too Early', 'The trip report is available after 16:00.', [{ text: 'OK' }]);
      return;
    }
    navigation.navigate('TripReport', { tripDate: selectedDate, userRole });
  };

  const renderBooking = (item) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        onPress={() => navigation.navigate('TripDetail', { bookingId: item.id, userRole })}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.employeeInfo}>
            <Text style={styles.employeeName}>{item.employeeName || 'Unknown'}</Text>
            <Text style={styles.employeeId}>
              {item.employeeNumber || '—'}
              {item.seats > 1 ? `  ·  ${item.seats} seats` : ''}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: config.bg, borderColor: config.border }]}>
            <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <MetaItem icon="👤" value={`${item.patientName || '—'} (${item.patientRelation || '—'})`} />
          <MetaItem icon="🏠" value={`Pickup: ${item.pickupHouse || '—'}`} />
          <MetaItem icon="🩺" value={item.doctorName || 'No doctor'} />
          <MetaItem icon="📋" value={item.referralConfirmed ? 'Referral ✓' : 'No referral'} />
          <MetaItem icon="↩️" value={item.returnTrip ? 'Return: 21:00' : 'No return'} />
          <MetaItem icon="🌙" value={item.overnightStay ? 'Overnight' : 'Day trip'} />
        </View>

        {item.status === 'pending' && (
          <View style={styles.actionHint}>
            <Text style={styles.actionHintText}>Tap to review and confirm →</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const pending   = bookings.filter(b => b.status === 'pending');
  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const cancelled = bookings.filter(b => b.status === 'cancelled');

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Medical Trip — Reception</Text>
        <Text style={styles.subtitle}>Mon · Wed · Sat — Departs 17:30</Text>
      </View>

      <View style={styles.dateTabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateTabs}>
          {tripDates.map(d => (
            <TouchableOpacity
              key={d.value}
              style={[styles.dateTab, selectedDate === d.value && styles.dateTabSelected]}
              onPress={() => handleDateChange(d.value)}
            >
              <Text style={[styles.dateTabText, selectedDate === d.value && styles.dateTabTextSelected]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading bookings...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.seatSummary}>
            <SeatStat label="Confirmed" value={confirmedSeats} color="#276749" />
            <SeatStat label="Pending"   value={pendingSeats}   color="#b7791f" />
            <SeatStat label="Seats Left" value={seatsLeft} color={seatsLeft <= 3 ? '#c53030' : '#2b6cb0'} />
            <SeatStat label="Capacity"  value={SEAT_CAP}       color="#718096" />
          </View>

          <TouchableOpacity
            style={[styles.reportBtn, !canGenerateReport() && styles.reportBtnDimmed]}
            onPress={handleGenerateReport}
          >
            <Text style={styles.reportBtnText}>
              📄  {canGenerateReport() ? 'Generate Trip Report' : 'Report available after 16:00'}
            </Text>
          </TouchableOpacity>

          {pending.length > 0 && (
            <>
              <Text style={styles.groupLabel}>PENDING REVIEW ({pending.length})</Text>
              {pending.map(renderBooking)}
            </>
          )}

          {confirmed.length > 0 && (
            <>
              <Text style={styles.groupLabel}>CONFIRMED ({confirmed.length})</Text>
              {confirmed.map(renderBooking)}
            </>
          )}

          {cancelled.length > 0 && (
            <>
              <Text style={styles.groupLabel}>CANCELLED ({cancelled.length})</Text>
              {cancelled.map(renderBooking)}
            </>
          )}

          {bookings.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🚌</Text>
              <Text style={styles.emptyText}>No bookings for this date</Text>
              <Text style={styles.emptySubtext}>Pull down to refresh</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function SeatStat({ label, value, color }) {
  return (
    <View style={styles.seatStat}>
      <Text style={[styles.seatStatValue, { color }]}>{value}</Text>
      <Text style={styles.seatStatLabel}>{label}</Text>
    </View>
  );
}

function MetaItem({ icon, value }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaIcon}>{icon}</Text>
      <Text style={styles.metaValue}>{value}</Text>
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
  dateTabsWrapper: { backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  dateTabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  dateTab: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#f7fafc',
  },
  dateTabSelected: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  dateTabText: { fontSize: 13, color: '#4a5568', fontWeight: '600' },
  dateTabTextSelected: { color: '#ffffff' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  seatSummary: {
    flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 12,
    padding: 16, marginBottom: 12, justifyContent: 'space-between',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  seatStat: { alignItems: 'center' },
  seatStatValue: { fontSize: 22, fontWeight: '800' },
  seatStatLabel: { fontSize: 11, color: '#a0aec0', fontWeight: '600', marginTop: 2 },
  reportBtn: {
    backgroundColor: '#2d3748', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', marginBottom: 16,
  },
  reportBtnDimmed: { backgroundColor: '#a0aec0' },
  reportBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  groupLabel: {
    fontSize: 11, fontWeight: '800', color: '#a0aec0',
    letterSpacing: 1, marginBottom: 8, marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 10,
  },
  employeeInfo: { flex: 1, marginRight: 8 },
  employeeName: { fontSize: 15, fontWeight: '700', color: '#2d3748' },
  employeeId: { fontSize: 12, color: '#718096', marginTop: 1 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '45%' },
  metaIcon: { fontSize: 13 },
  metaValue: { fontSize: 12, color: '#4a5568' },
  actionHint: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f7fafc' },
  actionHintText: { fontSize: 12, color: '#3182ce', fontWeight: '600', textAlign: 'right' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  loadingText: { marginTop: 10, color: '#718096', fontSize: 14 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#4a5568', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#a0aec0', marginTop: 4 },
});