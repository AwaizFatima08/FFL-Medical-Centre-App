// app/src/screens/trip/TripReportScreen.js
// Flow 4 — Medical Trip
// Landscape-style trip report for reception — available after 16:00
// Shows all confirmed bookings for a selected trip date
// Share button exports plain text report via device share sheet

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Share,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';

export default function TripReportScreen({ navigation, route }) {
  const { tripDate, userRole } = route.params || {};

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-PK', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  const fetchConfirmed = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.trips}/all?tripDate=${tripDate}&status=confirmed`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setBookings(data.data || []);
      } else {
        alert(data.message || 'Failed to load report data.');
        navigation.goBack();
      }
    } catch {
      alert('Network error. Please try again.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfirmed();
  }, [tripDate]);

  const buildReportText = () => {
    const header = [
      '═══════════════════════════════════════════',
      '      FFL MEDICAL CENTRE — TRIP REPORT',
      '═══════════════════════════════════════════',
      `Date     : ${formatDate(tripDate)}`,
      `Departure: 17:30 from FFL Township`,
      `Return   : 21:00 from Rahimyarkhan`,
      `Confirmed: ${bookings.length} / 24 seats`,
      '───────────────────────────────────────────',
      '',
    ];

    const rows = bookings.map((b, i) => {
      const seat = String(i + 1).padStart(2, '0');
      const name = (b.employeeName || 'Unknown').padEnd(22);
      const empNo = (b.employeeNumber || '—').padEnd(10);
      const pickup = (b.pickupHouse || '—').padEnd(12);
      const ret = b.returnTrip ? 'Yes' : 'No ';
      const overnight = b.overnightStay ? 'Yes' : 'No ';
      return `${seat}  ${name} ${empNo} ${pickup} Ret:${ret}  Night:${overnight}`;
    });

    const footer = [
      '',
      '───────────────────────────────────────────',
      `Generated: ${new Date().toLocaleString('en-PK')}`,
      'FFL Medical Centre App',
    ];

    return [...header, ...rows, ...footer].join('\n');
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const text = buildReportText();
      await Share.share({
        message: text,
        title: `Trip Report — ${formatDate(tripDate)}`,
      });
    } catch (error) {
      alert('Could not open share sheet. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3182ce" />
        <Text style={styles.loadingText}>Building report...</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Trip Report</Text>
          <Text style={styles.subtitle}>{formatDate(tripDate)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.shareBtn, sharing && styles.shareBtnDisabled]}
          onPress={handleShare}
          disabled={sharing}
        >
          {sharing
            ? <ActivityIndicator size="small" color="#ffffff" />
            : <Text style={styles.shareBtnText}>Share</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <SummaryItem label="Date" value={new Date(tripDate).toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' })} />
        <SummaryItem label="Confirmed" value={`${bookings.length} / 24`} highlight />
        <SummaryItem label="Departure" value="17:30" />
        <SummaryItem label="Return" value="21:00" />
      </View>

      {bookings.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No confirmed bookings for this date</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

          {/* Table header */}
          <View style={styles.tableWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                {/* Column headers */}
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <Text style={[styles.cell, styles.cellSeat, styles.headerCell]}>#</Text>
                  <Text style={[styles.cell, styles.cellName, styles.headerCell]}>Employee Name</Text>
                  <Text style={[styles.cell, styles.cellEmpNo, styles.headerCell]}>Emp No.</Text>
                  <Text style={[styles.cell, styles.cellPickup, styles.headerCell]}>Pickup</Text>
                  <Text style={[styles.cell, styles.cellBool, styles.headerCell]}>Return</Text>
                  <Text style={[styles.cell, styles.cellBool, styles.headerCell]}>Overnight</Text>
                  <Text style={[styles.cell, styles.cellBool, styles.headerCell]}>Referral</Text>
                </View>

                {/* Data rows */}
                {bookings.map((b, i) => (
                  <View
                    key={b.id}
                    style={[styles.tableRow, i % 2 === 0 ? styles.rowEven : styles.rowOdd]}
                  >
                    <Text style={[styles.cell, styles.cellSeat, styles.seatNumber]}>
                      {String(i + 1).padStart(2, '0')}
                    </Text>
                    <Text style={[styles.cell, styles.cellName, styles.employeeName]}>
                      {b.employeeName || '—'}
                    </Text>
                    <Text style={[styles.cell, styles.cellEmpNo]}>
                      {b.employeeNumber || '—'}
                    </Text>
                    <Text style={[styles.cell, styles.cellPickup]}>
                      {b.pickupHouse || '—'}
                    </Text>
                    <BoolCell value={b.returnTrip} style={styles.cellBool} />
                    <BoolCell value={b.overnightStay} style={styles.cellBool} />
                    <BoolCell value={b.referralConfirmed} style={styles.cellBool} />
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Notes section — only employees who added notes */}
          {bookings.some(b => !!b.notes) && (
            <View style={styles.notesSection}>
              <Text style={styles.notesSectionTitle}>PASSENGER NOTES</Text>
              {bookings
                .filter(b => !!b.notes)
                .map((b, i) => (
                  <View key={b.id} style={styles.noteRow}>
                    <Text style={styles.noteEmployee}>{b.employeeName}:</Text>
                    <Text style={styles.noteText}>{b.notes}</Text>
                  </View>
                ))}
            </View>
          )}

          {/* Footer */}
          <View style={styles.reportFooter}>
            <Text style={styles.footerText}>
              Generated at {new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
              {' · '}FFL Medical Centre App
            </Text>
          </View>

        </ScrollView>
      )}
    </View>
  );
}

function SummaryItem({ label, value, highlight }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, highlight && styles.summaryValueHighlight]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function BoolCell({ value, style }) {
  return (
    <View style={[styles.cell, style, styles.boolCell]}>
      <Text style={value ? styles.boolYes : styles.boolNo}>
        {value ? '✓' : '✕'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },

  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  backBtn: {},
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 12, color: '#718096', marginTop: 1 },
  shareBtn: {
    backgroundColor: '#3182ce',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  shareBtnDisabled: { opacity: 0.6 },
  shareBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#2d3748',
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 15, fontWeight: '800', color: '#ffffff' },
  summaryValueHighlight: { color: '#68d391' },
  summaryLabel: { fontSize: 10, color: '#a0aec0', fontWeight: '600', marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  tableWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tableHeaderRow: { backgroundColor: '#edf2f7', borderBottomWidth: 2, borderBottomColor: '#e2e8f0' },
  rowEven: { backgroundColor: '#ffffff' },
  rowOdd: { backgroundColor: '#f7fafc' },

  cell: { paddingHorizontal: 6, fontSize: 13, color: '#2d3748' },
  headerCell: { fontSize: 11, fontWeight: '800', color: '#718096', textTransform: 'uppercase' },

  cellSeat: { width: 32, textAlign: 'center' },
  cellName: { width: 160 },
  cellEmpNo: { width: 90 },
  cellPickup: { width: 100 },
  cellBool: { width: 72, alignItems: 'center' },

  seatNumber: { fontWeight: '800', color: '#a0aec0', textAlign: 'center' },
  employeeName: { fontWeight: '600' },

  boolCell: { justifyContent: 'center' },
  boolYes: { fontSize: 15, color: '#38a169', fontWeight: '800', textAlign: 'center' },
  boolNo: { fontSize: 15, color: '#e53e3e', fontWeight: '800', textAlign: 'center' },

  notesSection: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  notesSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#a0aec0',
    letterSpacing: 1,
    marginBottom: 10,
  },
  noteRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f7fafc',
  },
  noteEmployee: { fontSize: 13, fontWeight: '700', color: '#2d3748', marginBottom: 2 },
  noteText: { fontSize: 13, color: '#4a5568' },

  reportFooter: { alignItems: 'center', paddingVertical: 12, marginBottom: 20 },
  footerText: { fontSize: 12, color: '#a0aec0' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  loadingText: { marginTop: 10, color: '#718096', fontSize: 14 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#4a5568', fontWeight: '600' },
});