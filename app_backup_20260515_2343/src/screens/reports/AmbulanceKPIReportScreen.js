// app/src/screens/reports/AmbulanceKPIReportScreen.js
// Ambulance KPI report — daily and monthly — CMO only

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

export default function AmbulanceKPIReportScreen({ navigation }) {
  const now  = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const [mode,    setMode]    = useState('daily');   // 'daily' | 'monthly'
  const [date,    setDate]    = useState(todayStr);
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
      const token = await getToken();
      const query = mode === 'daily'
        ? `date=${date}`
        : `month=${month}&year=${year}`;
      const response = await fetch(
        `${API.reports}/ambulance/kpis?${query}`,
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

  const formatMins = (mins) => {
    if (mins === null || mins === undefined) return '—';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ambulance KPI Report</Text>
        <Text style={styles.subtitle}>Response & arrival time analysis</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          {['daily', 'monthly'].map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => { setMode(m); setData(null); }}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'daily' ? 'Daily' : 'Monthly'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date input for daily */}
        {mode === 'daily' && (
          <>
            <Text style={styles.sectionLabel}>Date (YYYY-MM-DD)</Text>
            <View style={styles.dateInputRow}>
              <TouchableOpacity
                style={styles.todayBtn}
                onPress={() => setDate(todayStr)}
              >
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.selectedDate}>{date}</Text>
          </>
        )}

        {/* Month/Year for monthly */}
        {mode === 'monthly' && (
          <>
            <Text style={styles.sectionLabel}>Month</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
              {MONTHS.map((m, i) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.chip, month === i + 1 && styles.chipSelected]}
                  onPress={() => setMonth(i + 1)}
                >
                  <Text style={[styles.chipText, month === i + 1 && styles.chipTextSelected]}>
                    {m.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.yearRow}>
              {[now.getFullYear() - 1, now.getFullYear()].map(y => (
                <TouchableOpacity
                  key={y}
                  style={[styles.chip, year === y && styles.chipSelected]}
                  onPress={() => setYear(y)}
                >
                  <Text style={[styles.chipText, year === y && styles.chipTextSelected]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

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
            {/* KPI Summary */}
            <Text style={styles.sectionLabel}>Average KPIs ({data.completed} completed trips)</Text>
            <View style={styles.kpiGrid}>
              <KPICard label="Response Time"    subtitle="Request → Dispatch" value={formatMins(data.summary?.avgResponseTime)} color="#3182ce" />
              <KPICard label="Arrival Time"     subtitle="Dispatch → Pickup"  value={formatMins(data.summary?.avgArrivalTime)}  color="#276749" />
              <KPICard label="Return Time"      subtitle="Pickup → Complete"  value={formatMins(data.summary?.avgReturnTime)}   color="#6b46c1" />
              <KPICard label="Total Trip Time"  subtitle="Request → Complete" value={formatMins(data.summary?.avgTotalTripTime)} color="#c05621" />
            </View>

            <View style={styles.totalBox}>
              <Text style={styles.totalText}>Total Requests: {data.summary?.totalRequests || 0}</Text>
            </View>

            {/* Per-trip rows */}
            {(data.kpiRows || []).length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Trip Details</Text>
                {data.kpiRows.map((row, i) => (
                  <View key={row.id || i} style={styles.tripRow}>
                    <View style={styles.tripRowHeader}>
                      <Text style={styles.tripPatient}>{row.patientName}</Text>
                      <Text style={styles.tripPriority}>{row.priorityFlag}</Text>
                    </View>
                    <View style={styles.tripKPIs}>
                      <MiniKPI label="Response" value={formatMins(row.responseTime)} />
                      <MiniKPI label="Arrival"  value={formatMins(row.arrivalTime)} />
                      <MiniKPI label="Return"   value={formatMins(row.returnTime)} />
                      <MiniKPI label="Total"    value={formatMins(row.totalTripTime)} />
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}

function KPICard({ label, subtitle, value, color }) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color }]}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiSub}>{subtitle}</Text>
    </View>
  );
}

function MiniKPI({ label, value }) {
  return (
    <View style={styles.miniKPI}>
      <Text style={styles.miniKPIValue}>{value}</Text>
      <Text style={styles.miniKPILabel}>{label}</Text>
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
  modeRow: { flexDirection: 'row', gap: 12 },
  modeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#ffffff', alignItems: 'center',
  },
  modeBtnActive:     { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  modeBtnText:       { fontSize: 14, fontWeight: '600', color: '#4a5568' },
  modeBtnTextActive: { color: '#ffffff' },
  dateInputRow:  { flexDirection: 'row', gap: 10, marginBottom: 4 },
  todayBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#ebf8ff', borderWidth: 1, borderColor: '#90cdf4',
  },
  todayBtnText:  { fontSize: 13, color: '#2b6cb0', fontWeight: '600' },
  selectedDate:  { fontSize: 14, color: '#2d3748', fontWeight: '600', marginBottom: 4 },
  monthScroll:   { marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#ffffff', marginRight: 8,
  },
  chipSelected:     { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  chipText:         { fontSize: 13, fontWeight: '600', color: '#4a5568' },
  chipTextSelected: { color: '#ffffff' },
  yearRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
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
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    width: '47%', backgroundColor: '#ffffff', borderRadius: 10,
    padding: 14, borderLeftWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  kpiValue: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  kpiLabel: { fontSize: 12, fontWeight: '700', color: '#2d3748' },
  kpiSub:   { fontSize: 11, color: '#a0aec0', marginTop: 1 },
  totalBox: {
    backgroundColor: '#f7fafc', borderRadius: 8, padding: 10,
  },
  totalText: { fontSize: 13, color: '#4a5568', fontWeight: '600' },
  tripRow: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 1, gap: 8,
  },
  tripRowHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  tripPatient:   { fontSize: 13, fontWeight: '700', color: '#2d3748' },
  tripPriority:  { fontSize: 11, color: '#718096', fontWeight: '600' },
  tripKPIs:      { flexDirection: 'row', justifyContent: 'space-between' },
  miniKPI:       { alignItems: 'center' },
  miniKPIValue:  { fontSize: 13, fontWeight: '700', color: '#2d3748' },
  miniKPILabel:  { fontSize: 10, color: '#a0aec0' },
});