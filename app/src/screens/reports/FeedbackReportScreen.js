// app/src/screens/reports/FeedbackReportScreen.js
// Phase 10 — Feedback Report. Tiled shape (not a row table) — top
// summary tiles plus a trend chart. CMO only.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PARAMS = [
  { key: 'overall',       label: 'Overall Satisfaction' },
  { key: 'housekeeping',  label: 'Housekeeping' },
  { key: 'staffBehaviour',label: 'Staff Behaviour' },
  { key: 'waitingTime',   label: 'Waiting Time' },
  { key: 'consultation',  label: 'Consultation' },
  { key: 'dental',        label: 'Dental' },
  { key: 'laboratory',    label: 'Laboratory' },
  { key: 'nursing',       label: 'Nursing' },
  { key: 'pharmacy',      label: 'Pharmacy' },
  { key: 'physiotherapy', label: 'Physiotherapy' },
  { key: 'xray',          label: 'X-Ray' },
];

const CHART_COLORS = ['#3182ce', '#276749', '#c05621', '#805ad5', '#c53030'];

export default function FeedbackReportScreen({ navigation }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [error,       setError]       = useState('');
  const [selectedParam, setSelectedParam] = useState('overall');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setError('');
    try {
      const token    = await getToken();
      const response = await fetch(`${API.reports}/feedback`, {
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
      await downloadFile(`${API.reports}/feedback?format=pdf`, 'feedback-report.pdf');
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const years = data?.trend?.years || [];
  const byParam = data?.trend?.byParameter?.[selectedParam] || {};

  // Plain-View bar chart — no charting library in this project, so this
  // renders 12 month columns, one small bar per year, height proportional
  // to rating (0-5). Months with no data get no bar at all (not a bar at
  // height 0), so a sparse post-launch period reads as genuinely empty
  // rather than looking like a real 0 rating.
  const BAR_MAX_HEIGHT = 90;
  const monthColumns = MONTH_LABELS.map((label, monthIdx) => ({
    label,
    bars: years.slice(0, CHART_COLORS.length).map((year, yearIdx) => {
      const val = (byParam[year] || [])[monthIdx];
      return {
        year,
        color: CHART_COLORS[yearIdx % CHART_COLORS.length],
        value: val,
        heightPx: val !== null && val !== undefined ? Math.max(4, (val / 5) * BAR_MAX_HEIGHT) : 0,
      };
    }),
  }));

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Feedback Report</Text>
        <Text style={styles.subtitle}>Patient experience & satisfaction</Text>
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
              {/* Top tiles */}
              <View style={styles.tileRow}>
                <View style={styles.tile}>
                  <Text style={styles.tileValue}>{data.summary?.totalFeedbacks || 0}</Text>
                  <Text style={styles.tileLabel}>Total Feedbacks</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={[styles.tileValue, { color: '#276749' }]}>
                    {data.summary?.overallSatisfaction ?? '—'}
                    {data.summary?.overallSatisfaction !== null && data.summary?.overallSatisfaction !== undefined ? '/5' : ''}
                  </Text>
                  <Text style={styles.tileLabel}>Overall Satisfaction</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={[styles.tileValue, { color: '#805ad5' }]}>
                    {data.summary?.totalSuggestions || 0}
                  </Text>
                  <Text style={styles.tileLabel}>Suggestions Received</Text>
                </View>
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

              {/* Per-parameter cumulative ratings — all 10 */}
              <Text style={styles.sectionLabel}>Per-Parameter Cumulative Ratings</Text>
              <View style={styles.paramGrid}>
                {PARAMS.filter(p => p.key !== 'overall').map(p => {
                  const val = data.summary?.perParameter?.[p.key];
                  return (
                    <View key={p.key} style={styles.paramCard}>
                      <Text style={styles.paramValue}>{val !== null && val !== undefined ? val : '—'}</Text>
                      <Text style={styles.paramLabel}>{p.label}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Trend chart */}
              {years.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>Monthly Trend</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {PARAMS.map(p => (
                      <TouchableOpacity
                        key={p.key}
                        style={[styles.chip, selectedParam === p.key && styles.chipSelected]}
                        onPress={() => setSelectedParam(p.key)}
                      >
                        <Text style={[styles.chipText, selectedParam === p.key && styles.chipTextSelected]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <LegendRow years={years} />

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScroll}>
                    <View style={styles.chartArea}>
                      {monthColumns.map(col => (
                        <View key={col.label} style={styles.monthColumn}>
                          <View style={styles.barGroup}>
                            {col.bars.map(bar => (
                              <View
                                key={bar.year}
                                style={[
                                  styles.bar,
                                  { height: bar.heightPx, backgroundColor: bar.color },
                                ]}
                              />
                            ))}
                          </View>
                          <Text style={styles.monthLabel}>{col.label}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  <Text style={styles.chartNote}>
                    Bar height = average rating out of 5. Months with no submissions show no bar at all — not a real 0 rating.
                  </Text>
                </>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📊</Text>
                  <Text style={styles.emptyText}>
                    Not enough data yet for a trend chart — this is expected shortly after go-live.
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function LegendRow({ years }) {
  return (
    <View style={styles.legendRow}>
      {years.slice(0, CHART_COLORS.length).map((y, i) => (
        <View key={y} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
          <Text style={styles.legendText}>{y}</Text>
        </View>
      ))}
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
  tileRow: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1, backgroundColor: '#ffffff', borderRadius: 10,
    padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  tileValue: { fontSize: 22, fontWeight: '800', color: '#2b6cb0' },
  tileLabel: { fontSize: 11, color: '#718096', marginTop: 2, textAlign: 'center' },
  pdfBtn: {
    backgroundColor: '#276749', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  pdfBtnText:  { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#4a5568',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },
  paramGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paramCard: {
    flexGrow: 1, minWidth: '30%', backgroundColor: '#ffffff', borderRadius: 10,
    padding: 10, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  paramValue: { fontSize: 16, fontWeight: '800', color: '#2d3748' },
  paramLabel: { fontSize: 10, color: '#718096', marginTop: 2, textAlign: 'center' },
  chipScroll: { marginBottom: 2 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#ffffff', marginRight: 8,
  },
  chipSelected:     { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  chipText:         { fontSize: 13, fontWeight: '600', color: '#4a5568' },
  chipTextSelected: { color: '#ffffff' },
  legendRow: { flexDirection: 'row', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#718096', fontWeight: '600' },
  chartScroll: { marginTop: 4 },
  chartArea: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#ffffff', borderRadius: 10,
    padding: 12, gap: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  monthColumn: { alignItems: 'center', width: 34 },
  barGroup: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 2,
    height: 90,
  },
  bar: { width: 5, borderRadius: 2, minHeight: 0 },
  monthLabel: { fontSize: 10, color: '#a0aec0', marginTop: 4, fontWeight: '600' },
  chartNote:  { fontSize: 11, color: '#a0aec0', fontStyle: 'italic' },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyIcon:  { fontSize: 40 },
  emptyText:  { fontSize: 13, color: '#a0aec0', textAlign: 'center', paddingHorizontal: 20 },
});