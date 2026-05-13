// app/src/screens/reports/TripMonthlyReportScreen.js
// Monthly medical trip consolidation — CMO only

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function TripMonthlyReportScreen({ navigation }) {
  const now = new Date();
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [year,    setYear]    = useState(now.getFullYear());
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const token    = await getToken();
      const response = await fetch(
        `${API.reports}/trips/monthly?month=${month}&year=${year}`,
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

  const years = [now.getFullYear() - 1, now.getFullYear()];

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Monthly Trip Report</Text>
        <Text style={styles.subtitle}>Employees facilitated per month</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Month selector */}
        <Text style={styles.sectionLabel}>Select Month</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
          {MONTHS.map((m, i) => (
            <TouchableOpacity
              key={m}
              style={[styles.monthChip, month === i + 1 && styles.monthChipSelected]}
              onPress={() => setMonth(i + 1)}
            >
              <Text style={[styles.monthChipText, month === i + 1 && styles.monthChipTextSelected]}>
                {m.slice(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Year selector */}
        <Text style={styles.sectionLabel}>Year</Text>
        <View style={styles.yearRow}>
          {years.map(y => (
            <TouchableOpacity
              key={y}
              style={[styles.yearChip, year === y && styles.yearChipSelected]}
              onPress={() => setYear(y)}
            >
              <Text style={[styles.yearChipText, year === y && styles.yearChipTextSelected]}>
                {y}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>{MONTHS[month - 1]} {year}</Text>
              <Text style={styles.summaryCount}>{data.totalFacilitated} employees facilitated</Text>
            </View>

            {(data.rows || []).length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🚌</Text>
                <Text style={styles.emptyText}>No trips recorded for this month</Text>
              </View>
            ) : (
              (data.rows || []).map((row, i) => (
                <View key={i} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardDate}>{row.tripDate}</Text>
                    {row.returnTrip === 'Yes' && (
                      <View style={styles.returnBadge}>
                        <Text style={styles.returnBadgeText}>↩ Return</Text>
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
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#4a5568',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  monthScroll: { marginBottom: 4 },
  monthChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#ffffff', marginRight: 8,
  },
  monthChipSelected:     { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  monthChipText:         { fontSize: 13, fontWeight: '600', color: '#4a5568' },
  monthChipTextSelected: { color: '#ffffff' },
  yearRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  yearChip: {
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#ffffff',
  },
  yearChipSelected:     { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  yearChipText:         { fontSize: 14, fontWeight: '600', color: '#4a5568' },
  yearChipTextSelected: { color: '#ffffff' },
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
  summaryBox: {
    backgroundColor: '#ebf8ff', borderRadius: 10, padding: 16,
    borderLeftWidth: 3, borderLeftColor: '#3182ce',
  },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: '#2b6cb0' },
  summaryCount: { fontSize: 13, color: '#2b6cb0', marginTop: 2 },
  card: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2, gap: 4,
  },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate:     { fontSize: 12, color: '#718096', fontWeight: '600' },
  returnBadge: {
    backgroundColor: '#faf5ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: '#d6bcfa',
  },
  returnBadgeText: { fontSize: 10, color: '#6b46c1', fontWeight: '600' },
  cardName:        { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  cardSub:         { fontSize: 12, color: '#718096' },
  cardDoctorRow:   { flexDirection: 'row', gap: 12, marginTop: 4 },
  cardDoctorLabel: { fontSize: 12, color: '#276749', fontWeight: '600' },
  cardHospital:    { fontSize: 12, color: '#2b6cb0', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyIcon:  { fontSize: 40 },
  emptyText:  { fontSize: 14, color: '#a0aec0' },
});