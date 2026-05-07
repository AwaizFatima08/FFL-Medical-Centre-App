// app/src/screens/trip/TripDetailScreen.js
// Flow 4 — Medical Trip
// Reception views and manages a single booking — confirm or cancel

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   bg: '#fffbeb', text: '#b7791f', border: '#fbd38d' },
  confirmed: { label: 'Confirmed', bg: '#f0fff4', text: '#276749', border: '#9ae6b4' },
  cancelled: { label: 'Cancelled', bg: '#fff5f5', text: '#c53030', border: '#feb2b2' },
  completed: { label: 'Completed', bg: '#f7fafc', text: '#718096', border: '#e2e8f0' },
};

const SEAT_CAP = 24;

export default function TripDetailScreen({ navigation, route }) {
  const { bookingId, userRole } = route.params || {};

  const [booking, setBooking] = useState(null);
  const [seatsConfirmed, setSeatsConfirmed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchBooking = async () => {
    try {
      const token = await getToken();

      // Fetch booking detail and confirmed seat count in parallel
      const [bookingRes, countRes] = await Promise.all([
        fetch(`${API.trips}/${bookingId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API.trips}/confirmedCount?tripDate=_pending_`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      const bookingData = await bookingRes.json();
      if (bookingRes.ok && bookingData.data) {
        const b = bookingData.data;
        setBooking(b);

        // Now fetch confirmed count for this booking's trip date
        const countRes2 = await fetch(
          `${API.trips}/confirmedCount?tripDate=${b.tripDate}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const countData = await countRes2.json();
        if (countRes2.ok) {
          setSeatsConfirmed(countData.count || 0);
        }
      } else {
        alert(bookingData.message || 'Failed to load booking.');
        navigation.goBack();
      }
    } catch {
      alert('Network error. Please try again.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchBooking();
  }, [bookingId]));

  const handleConfirm = () => {
    const seatsLeft = SEAT_CAP - seatsConfirmed;
    if (seatsLeft <= 0) {
      Alert.alert(
        'No Seats Available',
        `All ${SEAT_CAP} seats are confirmed for this trip. You cannot confirm this booking.`,
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Confirm Booking',
      `Confirm seat for ${booking?.employeeName}?\n\n${seatsLeft - 1} seats will remain after this.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Seat', style: 'default',
          onPress: () => performAction('confirm'),
        },
      ]
    );
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Booking',
      `Cancel ${booking?.employeeName}'s trip booking? They will be notified.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel', style: 'destructive',
          onPress: () => performAction('cancel'),
        },
      ]
    );
  };

  const performAction = async (action) => {
    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.trips}/${bookingId}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        navigation.goBack();
      } else {
        alert(data.message || `Failed to ${action} booking.`);
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-PK', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts._seconds ? ts._seconds * 1000 : ts);
    return d.toLocaleString('en-PK', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3182ce" />
        <Text style={styles.loadingText}>Loading booking...</Text>
      </View>
    );
  }

  if (!booking) return null;

  const config = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
  const seatsLeft = SEAT_CAP - seatsConfirmed;

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Booking Detail</Text>
        <View style={[styles.statusBadge, { backgroundColor: config.bg, borderColor: config.border }]}>
          <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Employee info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Employee</Text>
          <DetailRow label="Full Name" value={booking.employeeName} />
          <DetailRow label="Employee No." value={booking.employeeNumber} />
          <DetailRow label="Department" value={booking.department} />
          <DetailRow label="Contact" value={booking.phone} />
        </View>

        {/* Trip info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          <DetailRow label="Trip Date" value={formatDate(booking.tripDate)} />
          <DetailRow label="Departure" value="17:30 from FFL Township" />
          <DetailRow label="Pickup House" value={booking.pickupHouse} />
          <DetailRow label="Return Trip" value={booking.returnTrip ? 'Yes — 21:00 from RYK' : 'No'} />
          <DetailRow label="Overnight Stay" value={booking.overnightStay ? 'Yes' : 'No'} />
          <DetailRow
            label="Referral Confirmed"
            value={booking.referralConfirmed ? '✓ Yes' : '✗ No'}
            valueColor={booking.referralConfirmed ? '#276749' : '#c53030'}
          />
        </View>

        {/* Notes */}
        {!!booking.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Employee Notes</Text>
            <Text style={styles.notesText}>{booking.notes}</Text>
          </View>
        )}

        {/* Seat availability */}
        <View style={styles.seatBox}>
          <Text style={styles.seatBoxTitle}>Seat Availability — {formatDate(booking.tripDate)}</Text>
          <View style={styles.seatRow}>
            <SeatStat label="Confirmed" value={seatsConfirmed} color="#276749" />
            <SeatStat
              label="Seats Left"
              value={seatsLeft}
              color={seatsLeft <= 3 ? '#c53030' : '#2b6cb0'}
            />
            <SeatStat label="Capacity" value={SEAT_CAP} color="#718096" />
          </View>
        </View>

        {/* Booking metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Info</Text>
          <DetailRow label="Submitted" value={formatTimestamp(booking.createdAt)} />
          {booking.confirmedAt && (
            <DetailRow label="Confirmed At" value={formatTimestamp(booking.confirmedAt)} />
          )}
          {booking.confirmedBy && (
            <DetailRow label="Confirmed By" value={booking.confirmedBy} />
          )}
        </View>

        {/* Action buttons — only for reception on actionable statuses */}
        {userRole === 'reception' && (
          <View style={styles.actions}>
            {booking.status === 'pending' && (
              <TouchableOpacity
                style={[styles.confirmBtn, actionLoading && styles.btnDisabled]}
                onPress={handleConfirm}
                disabled={actionLoading}
              >
                {actionLoading
                  ? <ActivityIndicator color="#ffffff" />
                  : <Text style={styles.confirmBtnText}>✓  Confirm Seat</Text>
                }
              </TouchableOpacity>
            )}

            {(booking.status === 'pending' || booking.status === 'confirmed') && (
              <TouchableOpacity
                style={[styles.cancelBtn, actionLoading && styles.btnDisabled]}
                onPress={handleCancel}
                disabled={actionLoading}
              >
                {actionLoading
                  ? <ActivityIndicator color="#c53030" />
                  : <Text style={styles.cancelBtnText}>✕  Cancel Booking</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, valueColor }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor && { color: valueColor }]}>
        {value || '—'}
      </Text>
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

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },

  header: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  backBtn: { marginBottom: 0 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#2d3748', flex: 1, marginLeft: 12 },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#a0aec0',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f7fafc',
  },
  detailLabel: { fontSize: 13, color: '#718096', flex: 1 },
  detailValue: { fontSize: 13, color: '#2d3748', fontWeight: '600', flex: 1.5, textAlign: 'right' },

  notesText: { fontSize: 14, color: '#4a5568', lineHeight: 20 },

  seatBox: {
    backgroundColor: '#ebf8ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#3182ce',
  },
  seatBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2b6cb0',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  seatRow: { flexDirection: 'row', justifyContent: 'space-around' },
  seatStat: { alignItems: 'center' },
  seatStatValue: { fontSize: 24, fontWeight: '800' },
  seatStatLabel: { fontSize: 11, color: '#718096', fontWeight: '600', marginTop: 2 },

  actions: { gap: 10, marginBottom: 40 },
  confirmBtn: {
    backgroundColor: '#38a169',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#feb2b2',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff5f5',
  },
  cancelBtnText: { color: '#c53030', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#718096', fontSize: 14 },
});