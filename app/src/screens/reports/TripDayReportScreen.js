// app/src/screens/reports/TripDayReportScreen.js
// Trip day report — today's confirmed bookings
// Reception: view + PDF download
// CMO/Doctor: view only

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';

export default function TripDayReportScreen({ navigation, route }) {
  const userRole = route.params?.userRole || '';

  const today = new Date().toISOString().split('T')[0];
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error,      setError]      = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setError('');
    try {
      const token    = await getToken();
      const response = await fetch(`${API.reports}/trip-day?date=${today}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const json = await response.json();
      if (response.ok) setData(json.data);
      else setError(json.message || 'Failed to load report.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchReport();
  }, []));

  const onRefresh = () => { setRefreshing(true); fetchReport(); };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      await downloadFile(
        `${API.reports}/trip-day?date=${today}&format=pdf`,
        `trip-report-${today}.pdf`
      );
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trip Day Report</Text>
        <Text style={styles.subtitle}>{today} · Departure 17:30</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading report...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          {data && (
            <>
              {/* Summary */}
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{data.bookedSeats || 0}</Text>
                  <Text style={styles.summaryLabel}>Confirmed</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{data.totalSeats || 24}</Text>
                  <Text style={styles.summaryLabel}>Total Seats</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>
                    {(data.totalSeats || 24) - (data.bookedSeats || 0)}
                  </Text>
                  <Text style={styles.summaryLabel}>Available</Text>
                </View>
              </View>

              {/* PDF download — reception only */}
              {userRole === 'reception' && (
                <TouchableOpacity
                  style={[styles.pdfBtn, pdfLoading && styles.btnDisabled]}
                  onPress={handleDownloadPDF}
                  disabled={pdfLoading}
                >
                  {pdfLoading
                    ? <ActivityIndicator size="small" color="#ffffff" />
                    : <Text style={styles.pdfBtnText}>📄 Download PDF for Driver</Text>
                  }
                </TouchableOpacity>
              )}

              {/* Booking list */}
              {(data.bookings || []).length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🚌</Text>
                  <Text style={styles.emptyText}>No confirmed bookings for today</Text>
                </View>
              ) : (
                (data.bookings || []).map((b, i) => (
                  <View key={b.id || i} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardNumber}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardName}>{b.patientName || '—'}</Text>
                        <Text style={styles.cardSub}>
                          {b.patientRelation || '—'} · {b.employeeName || '—'}
                        </Text>
                      </View>
                      {b.returnTrip && (
                        <View style={styles.returnBadge}>
                          <Text style={styles.returnBadgeText}>↩ Return</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.cardGrid}>
                      <InfoItem icon="🏠" label="Pickup"   value={b.pickupHouse || '—'} />
                      <InfoItem icon="📞" label="Phone"    value={b.employeePhoneNumber || b.phoneNumber || '—'} />
                      <InfoItem icon="🩺" label="Doctor"   value={b.doctorName || '—'} />
                      <InfoItem icon="🏥" label="Hospital" value={b.hospital || '—'} />
                    </View>
                  </View>
                ))
              )}
            </>
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
  backBtn:     { marginBottom: 6 },
  backText:    { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:       { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle:    { fontSize: 13, color: '#718096', marginTop: 2 },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 80 },
  loadingText: { fontSize: 14, color: '#718096' },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  errorBox: {
    backgroundColor: '#fff5f5', borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#fc8181',
  },
  errorText: { fontSize: 13, color: '#c53030' },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: {
    flex: 1, backgroundColor: '#ffffff', borderRadius: 10,
    padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  summaryValue: { fontSize: 24, fontWeight: '800', color: '#2b6cb0' },
  summaryLabel: { fontSize: 12, color: '#718096', marginTop: 2 },
  pdfBtn: {
    backgroundColor: '#276749', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  pdfBtnText:  { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  card: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardNumber: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#ebf8ff', alignItems: 'center',
    justifyContent: 'center',
  },
  cardName:    { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  cardSub:     { fontSize: 12, color: '#718096', marginTop: 1 },
  returnBadge: {
    backgroundColor: '#faf5ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#d6bcfa',
  },
  returnBadgeText: { fontSize: 11, color: '#6b46c1', fontWeight: '600' },
  cardGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem:  { flexDirection: 'row', alignItems: 'center', width: '47%', gap: 6 },
  infoIcon:  { fontSize: 14 },
  infoLabel: { fontSize: 10, color: '#a0aec0', fontWeight: '600' },
  infoValue: { fontSize: 12, color: '#2d3748', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 48 },
  emptyText:  { fontSize: 14, color: '#a0aec0' },
});