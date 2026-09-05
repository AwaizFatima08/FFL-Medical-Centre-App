// app/src/screens/trip/TripDetailScreen.js
import { webAlert, webConfirm } from '../../utils/webAlert';
// Flow 4 — Medical Trip
// Reception views and manages a single booking — confirm or cancel

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, TextInput,
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



export default function TripDetailScreen({ navigation, route }) {
  const { bookingId, userRole } = route.params || {};

  const [booking, setBooking]           = useState(null);
  const [seatsConfirmed, setSeatsConfirmed] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Reception cancellation reason — required (Phase 11 review, Day 22).
  // Kept internal: employee sees a fixed generic notification regardless
  // of what's typed here (see performAction/cancel below).
  const [showCancelBox, setShowCancelBox] = useState(false);
  const [cancelReason, setCancelReason]   = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchBooking = async () => {
    try {
      const token = await getToken();
      const bookingRes = await fetch(`${API.trips}/${bookingId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const bookingData = await bookingRes.json();

      if (bookingRes.ok && bookingData.data) {
        const b = bookingData.data;
        setBooking(b);

        // Fetch confirmed seat count for this trip date
        const countRes = await fetch(
          `${API.trips}/confirmedCount?tripDate=${b.tripDate}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const countData = await countRes.json();
        if (countRes.ok) {
          setSeatsConfirmed(countData.count || 0);
        }
      } else {
        webAlert('Error', bookingData.message || 'Failed to load booking.');
        navigation.goBack();
      }
    } catch {
      webAlert('Error', 'Network error. Please try again.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchBooking();
  }, [bookingId]);

  const handleConfirm = () => {
    const seatsLeft = SEAT_CAP - seatsConfirmed;
    if (seatsLeft <= 0) {
      webAlert('No Seats Available', `All ${SEAT_CAP} seats are confirmed for this trip.`);
      return;
    }
    const requestedSeats = booking?.seats || 1;
    if (seatsLeft < requestedSeats) {
      webAlert('Not Enough Seats', `Only ${seatsLeft} seat(s) left but this booking needs ${requestedSeats}.`);
      return;
    }
    webConfirm(
      'Confirm Booking',
      `Confirm ${requestedSeats} seat(s) for ${booking?.employeeName}? ${seatsLeft - requestedSeats} seats will remain.`,
      () => performAction('confirm')
    );
  };

  const handleCancel = () => {
    setCancelReason('');
    setShowCancelBox(true);
  };

  const submitCancel = () => {
    if (!cancelReason.trim()) {
      webAlert('Reason Required', 'Please enter a reason for cancelling this booking.');
      return;
    }
    performAction('cancel', { reason: cancelReason.trim() });
  };

  const performAction = async (action, body) => {
    setActionLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API.trips}/${bookingId}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (response.ok) {
        navigation.goBack();
      } else {
        webAlert('Error', data.message || `Failed to ${action} booking.`);
      }
    } catch {
      webAlert('Error', 'Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-PK', {
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Employee</Text>
          <DetailRow label="Full Name"    value={booking.employeeName} />
          <DetailRow label="Employee No." value={booking.employeeNumber} />
          <DetailRow label="Department"   value={booking.department} />
          <DetailRow label="Contact"      value={booking.phone} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Patient</Text>
          <DetailRow label="Patient Name"   value={booking.patientName} />
          <DetailRow label="Relation"       value={booking.patientRelation} />
          <DetailRow label="Seats Requested" value={String(booking.seats || 1)} />
          <DetailRow label="Referred Doctor" value={booking.doctorName} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          <DetailRow label="Trip Date"    value={formatDate(booking.tripDate)} />
          <DetailRow label="Departure"    value="17:30 from FFL Township" />
          <DetailRow label="Pickup House" value={booking.pickupHouse} />
          <DetailRow label="Return Trip"  value={booking.returnTrip ? 'Yes — 21:00 from RYK' : 'No'} />
          <DetailRow label="Overnight"    value={booking.overnightStay ? 'Yes' : 'No'} />
          <DetailRow
            label="Referral Confirmed"
            value={booking.referralConfirmed ? '✓ Yes' : '✗ No'}
            valueColor={booking.referralConfirmed ? '#276749' : '#c53030'}
          />
        </View>

        {!!booking.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Employee Notes</Text>
            <Text style={styles.notesText}>{booking.notes}</Text>
          </View>
        )}

        <View style={styles.seatBox}>
          <Text style={styles.seatBoxTitle}>Seat Availability — {formatDate(booking.tripDate)}</Text>
          <View style={styles.seatRow}>
            <SeatStat label="Confirmed" value={seatsConfirmed} color="#276749" />
            <SeatStat label="Seats Left" value={seatsLeft} color={seatsLeft <= 3 ? '#c53030' : '#2b6cb0'} />
            <SeatStat label="Capacity"  value={SEAT_CAP}    color="#718096" />
          </View>
        </View>

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
            {(booking.status === 'pending' || booking.status === 'confirmed') && !showCancelBox && (
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
            {(booking.status === 'pending' || booking.status === 'confirmed') && showCancelBox && (
              <View style={styles.cancelReasonBox}>
                <Text style={styles.cancelReasonLabel}>
                  Reason for cancelling — required, shown to reception/CMO only.
                  The employee sees a fixed generic message, not this text.
                </Text>
                <TextInput
                  style={styles.cancelReasonInput}
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  placeholder="e.g. Seat reassigned, duplicate booking..."
                  placeholderTextColor="#a0aec0"
                  multiline
                  numberOfLines={2}
                  autoFocus
                />
                <View style={styles.cancelReasonActions}>
                  <TouchableOpacity
                    style={styles.cancelReasonDismiss}
                    onPress={() => setShowCancelBox(false)}
                    disabled={actionLoading}
                  >
                    <Text style={styles.cancelReasonDismissText}>Never mind</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.cancelBtn,
                      { flex: 1 },
                      (!cancelReason.trim() || actionLoading) && styles.btnDisabled,
                    ]}
                    onPress={submitCancel}
                    disabled={!cancelReason.trim() || actionLoading}
                  >
                    {actionLoading
                      ? <ActivityIndicator color="#c53030" />
                      : <Text style={styles.cancelBtnText}>✕  Confirm Cancellation</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
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
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  backBtn: { marginBottom: 0 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#2d3748', flex: 1, marginLeft: 12 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  section: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#a0aec0',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f7fafc',
  },
  detailLabel: { fontSize: 13, color: '#718096', flex: 1 },
  detailValue: { fontSize: 13, color: '#2d3748', fontWeight: '600', flex: 1.5, textAlign: 'right' },
  notesText: { fontSize: 14, color: '#4a5568', lineHeight: 20 },
  seatBox: {
    backgroundColor: '#ebf8ff', borderRadius: 12, padding: 16,
    marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#3182ce',
  },
  seatBoxTitle: {
    fontSize: 12, fontWeight: '700', color: '#2b6cb0',
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  seatRow: { flexDirection: 'row', justifyContent: 'space-around' },
  seatStat: { alignItems: 'center' },
  seatStatValue: { fontSize: 24, fontWeight: '800' },
  seatStatLabel: { fontSize: 11, color: '#718096', fontWeight: '600', marginTop: 2 },
  actions: { gap: 10, marginBottom: 40 },
  confirmBtn: {
    backgroundColor: '#38a169', borderRadius: 8, paddingVertical: 14, alignItems: 'center',
  },
  confirmBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  cancelBtn: {
    borderWidth: 1, borderColor: '#feb2b2', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center', backgroundColor: '#fff5f5',
  },
  cancelBtnText: { color: '#c53030', fontWeight: '700', fontSize: 16 },
  cancelReasonBox: {
    backgroundColor: '#fff5f5', borderRadius: 8, borderWidth: 1,
    borderColor: '#feb2b2', padding: 12,
  },
  cancelReasonLabel: { fontSize: 12, color: '#742a2a', marginBottom: 8, lineHeight: 17 },
  cancelReasonInput: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#feb2b2',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#2d3748', minHeight: 60, textAlignVertical: 'top',
    marginBottom: 10,
  },
  cancelReasonActions: { flexDirection: 'row', gap: 10 },
  cancelReasonDismiss: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    backgroundColor: '#ffffff', paddingVertical: 14,
  },
  cancelReasonDismissText: { color: '#718096', fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#718096', fontSize: 14 },
});