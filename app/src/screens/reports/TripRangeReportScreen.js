// app/src/screens/reports/TripRangeReportScreen.js
// Phase 10 — Trip Range Report. Full replacement of the old
// TripMonthlyReportScreen.js (month+year picker) — a genuinely different
// query shape, not a variant. From/to date range, past dates only,
// unlimited span. No summary strip, no within-range filters, table only.
// CMO only.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';
import DatePickerField from '../../components/DatePickerField';

const toDateStr = (d) => (d instanceof Date ? d.toISOString().split('T')[0] : d);

export default function TripRangeReportScreen({ navigation }) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const [fromDate, setFromDate] = useState(monthAgo);
  const [toDate,   setToDate]   = useState(today);
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error,    setError]    = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const token = await getToken();
      const from  = toDateStr(fromDate);
      const to    = toDateStr(toDate);
      const response = await fetch(
        `${API.reports}/trips/range?fromDate=${from}&toDate=${to}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const json = await response.json();
      if (response.ok) setData(json.data);
      else setError(json.message || 'Failed to load report.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const from = toDateStr(fromDate);
      const to   = toDateStr(toDate);
      await downloadFile(
        `${API.reports}/trips/range?fromDate=${from}&toDate=${to}&format=pdf`,
        `trip-range-report-${from}-to-${to}.pdf`
      );
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const rows = data?.rows || [];

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trip Range Report</Text>
        <Text style={styles.subtitle}>Historical booking review</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Past dates only — no future range for a historical review report */}
        <DatePickerField
          label="From"
          value={fromDate}
          onChange={setFromDate}
          maximumDate={new Date()}
        />
        <DatePickerField
          label="To"
          value={toDate}
          onChange={setToDate}
          maximumDate={new Date()}
        />

        <TouchableOpacity
          style={[styles.fetchBtn, loading && styles.btnDisabled]}
          onPress={fetchReport}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#ffffff" />
            : <Text style={styles.fetchBtnText}>Generate Report</Text>
          }
        </TouchableOpacity>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {data && (
          <>
            <View style={styles.totalBox}>
              <Text style={styles.totalText}>
                {data.fromDate || 'earliest'} to {data.toDate} · {rows.length} booking{rows.length !== 1 ? 's' : ''}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.pdfBtn, pdfLoading && styles.btnDisabled]}
              onPress={handleDownloadPDF}
              disabled={pdfLoading}
            >
              {pdfLoading
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <Text style={styles.pdfBtnText}>📄 Download PDF</Text>
              }
            </TouchableOpacity>

            {rows.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🚌</Text>
                <Text style={styles.emptyText}>No confirmed bookings for this range</Text>
              </View>
            ) : (
              rows.map((row, i) => (
                <View key={row.id || i} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardDate}>{row.tripDate}</Text>
                    {row.returnTrip && (
                      <View style={styles.returnBadge}>
                        <Text style={styles.returnBadgeText}>↩ Return</Text>
                      </View>
                    )}
                    {row.referralConfirmed && (
                      <View style={styles.referralBadge}>
                        <Text style={styles.referralBadgeText}>Referral</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardName}>{row.patientName}</Text>
                  <Text style={styles.cardSub}>
                    {row.patientRelation} · {row.employeeName} [{row.employeeNumber}]
                  </Text>
                  <View style={styles.cardDoctorRow}>
                    <Text style={styles.cardDoctorLabel}>🩺 {row.doctorName}</Text>
                    <Text style={styles.cardHospital}>🏥 {row.hospital}</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:   { marginBottom: 6 },
  backText:  { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:     { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle:  { fontSize: 13, color: '#718096', marginTop: 2 },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  fetchBtn: {
    backgroundColor: '#3182ce', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  fetchBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  btnDisabled:  { opacity: 0.5 },
  errorBox: {
    backgroundColor: '#fff5f5', borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#fc8181',
  },
  errorText: { fontSize: 13, color: '#c53030' },
  totalBox: {
    backgroundColor: '#ebf8ff', borderRadius: 10, padding: 14,
    borderLeftWidth: 3, borderLeftColor: '#3182ce',
  },
  totalText: { fontSize: 13, color: '#2b6cb0', fontWeight: '700' },
  pdfBtn: {
    backgroundColor: '#276749', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  pdfBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2, gap: 4,
  },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardDate:     { fontSize: 12, color: '#718096', fontWeight: '600', flex: 1 },
  returnBadge: {
    backgroundColor: '#faf5ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: '#d6bcfa',
  },
  returnBadgeText: { fontSize: 10, color: '#6b46c1', fontWeight: '600' },
  referralBadge: {
    backgroundColor: '#ebf8ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: '#90cdf4',
  },
  referralBadgeText: { fontSize: 10, color: '#2b6cb0', fontWeight: '600' },
  cardName:        { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  cardSub:         { fontSize: 12, color: '#718096' },
  cardDoctorRow:   { flexDirection: 'row', gap: 12, marginTop: 4 },
  cardDoctorLabel: { fontSize: 12, color: '#276749', fontWeight: '600' },
  cardHospital:    { fontSize: 12, color: '#2b6cb0', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyIcon:  { fontSize: 40 },
  emptyText:  { fontSize: 14, color: '#a0aec0' },
});