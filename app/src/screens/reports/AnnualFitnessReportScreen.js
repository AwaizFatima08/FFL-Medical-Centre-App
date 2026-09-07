// app/src/screens/reports/AnnualFitnessReportScreen.js
// Annual Fitness Report — Phase 10. Backend route (`GET /fitness`) was
// already correct going into this phase; this screen is new. CMO only.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';

const OUTCOME_LABEL = {
  fit: 'Fit',
  unfit: 'Unfit',
  fit_with_restrictions: 'Fit w/ Restriction',
};

export default function AnnualFitnessReportScreen({ navigation }) {
  const [data,        setData]        = useState(null);
  const [year,        setYear]        = useState(null); // null until availableYears loads
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [error,       setError]       = useState('');

  // Filters
  const [search,          setSearch]          = useState(''); // name or employee number
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [unitFilter,       setUnitFilter]       = useState('');
  const [statusFilter,     setStatusFilter]     = useState(''); // '' | fit | unfit | fit_with_restrictions

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async (selectedYear) => {
    setError('');
    try {
      const token = await getToken();
      const query = selectedYear ? `?cycleYear=${selectedYear}` : '';
      const response = await fetch(`${API.reports}/fitness${query}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const json = await response.json();
      if (response.ok) {
        setData(json.data);
        // First load — default to the most recent year with data.
        if (!selectedYear && json.data?.availableYears?.length) {
          setYear(json.data.availableYears[0]);
        }
      } else {
        setError(json.message || 'Failed to load report.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchReport(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const onSelectYear = (y) => {
    setYear(y);
    setLoading(true);
    fetchReport(y);
  };

  const onRefresh = () => { setRefreshing(true); fetchReport(year); };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const query = year ? `?cycleYear=${year}&format=pdf` : '?format=pdf';
      await downloadFile(
        `${API.reports}/fitness${query}`,
        `annual-fitness-report-${year || 'all'}.pdf`
      );
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const rows = (data?.rows || []);

  const departments = [...new Set(rows.map(r => r.department).filter(Boolean))].sort();
  const units       = [...new Set(rows.map(r => r.unit).filter(Boolean))].sort();

  const filtered = rows.filter(r => {
    const term = search.trim().toLowerCase();
    if (term &&
      !r.employeeName?.toLowerCase().includes(term) &&
      !r.employeeNumber?.toLowerCase().includes(term)
    ) return false;
    if (departmentFilter && r.department !== departmentFilter) return false;
    if (unitFilter && r.unit !== unitFilter) return false;
    if (statusFilter && r.fitnessOutcome !== statusFilter) return false;
    return true;
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Annual Fitness Report</Text>
        <Text style={styles.subtitle}>{year ? `${year} Report` : 'Completed fitness exams'}</Text>
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

          {/* Year selector — dynamically populated, newest first */}
          {(data?.availableYears || []).length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Year</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {data.availableYears.map(y => (
                  <TouchableOpacity
                    key={y}
                    style={[styles.chip, year === y && styles.chipSelected]}
                    onPress={() => onSelectYear(y)}
                  >
                    <Text style={[styles.chipText, year === y && styles.chipTextSelected]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {data && (
            <>
              {/* Top summary */}
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{data.summary?.completed || 0}</Text>
                  <Text style={styles.summaryLabel}>Completed</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={[styles.summaryValue, { color: '#276749' }]}>
                    {data.summary?.byFitnessStatus?.fit || 0}
                  </Text>
                  <Text style={styles.summaryLabel}>Fit</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={[styles.summaryValue, { color: '#c53030' }]}>
                    {data.summary?.byFitnessStatus?.unfit || 0}
                  </Text>
                  <Text style={styles.summaryLabel}>Unfit</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={[styles.summaryValue, { color: '#c05621' }]}>
                    {data.summary?.byFitnessStatus?.fit_with_restrictions || 0}
                  </Text>
                  <Text style={styles.summaryLabel}>Fit w/ Restriction</Text>
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

              {/* Filters */}
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search by employee name or number..."
                placeholderTextColor="#a0aec0"
              />

              <Text style={styles.sectionLabel}>Status</Text>
              <View style={styles.chipRow}>
                {['', 'fit', 'unfit', 'fit_with_restrictions'].map(s => (
                  <TouchableOpacity
                    key={s || 'all'}
                    style={[styles.chip, statusFilter === s && styles.chipSelected]}
                    onPress={() => setStatusFilter(s)}
                  >
                    <Text style={[styles.chipText, statusFilter === s && styles.chipTextSelected]}>
                      {s ? OUTCOME_LABEL[s] : 'All'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {departments.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Department</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    <TouchableOpacity
                      style={[styles.chip, !departmentFilter && styles.chipSelected]}
                      onPress={() => setDepartmentFilter('')}
                    >
                      <Text style={[styles.chipText, !departmentFilter && styles.chipTextSelected]}>All</Text>
                    </TouchableOpacity>
                    {departments.map(d => (
                      <TouchableOpacity
                        key={d}
                        style={[styles.chip, departmentFilter === d && styles.chipSelected]}
                        onPress={() => setDepartmentFilter(departmentFilter === d ? '' : d)}
                      >
                        <Text style={[styles.chipText, departmentFilter === d && styles.chipTextSelected]}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {units.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Unit</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    <TouchableOpacity
                      style={[styles.chip, !unitFilter && styles.chipSelected]}
                      onPress={() => setUnitFilter('')}
                    >
                      <Text style={[styles.chipText, !unitFilter && styles.chipTextSelected]}>All</Text>
                    </TouchableOpacity>
                    {units.map(u => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.chip, unitFilter === u && styles.chipSelected]}
                        onPress={() => setUnitFilter(unitFilter === u ? '' : u)}
                      >
                        <Text style={[styles.chipText, unitFilter === u && styles.chipTextSelected]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.resultCount}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </Text>

              {/* Row table */}
              {filtered.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🩺</Text>
                  <Text style={styles.emptyText}>No completed exams match this selection</Text>
                </View>
              ) : (
                filtered.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.empName}>{r.employeeName}</Text>
                        <Text style={styles.empSub}>{r.employeeNumber} · Age: {r.age ?? '—'}</Text>
                      </View>
                      <View style={[
                        styles.statusBadge,
                        r.fitnessOutcome === 'fit' && styles.statusBadgeFit,
                        r.fitnessOutcome === 'unfit' && styles.statusBadgeUnfit,
                        r.fitnessOutcome === 'fit_with_restrictions' && styles.statusBadgeRestricted,
                      ]}>
                        <Text style={styles.statusBadgeText}>
                          {OUTCOME_LABEL[r.fitnessOutcome] || '—'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.cardGrid}>
                      <InfoItem icon="🏢" label="Department" value={r.department} />
                      <InfoItem icon="📍" label="Unit"        value={r.unit} />
                      <InfoItem icon="📅" label="Completed"   value={r.fitnessCompletedOn || '—'} />
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
  scrollContent: { padding: 16, gap: 10 },
  errorBox: {
    backgroundColor: '#fff5f5', borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#fc8181',
  },
  errorText: { fontSize: 13, color: '#c53030' },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#4a5568',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },
  chipScroll: { marginBottom: 4 },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#ffffff', marginRight: 8,
  },
  chipSelected:     { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  chipText:         { fontSize: 13, fontWeight: '600', color: '#4a5568' },
  chipTextSelected: { color: '#ffffff' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    flexGrow: 1, minWidth: '22%', backgroundColor: '#ffffff', borderRadius: 10,
    padding: 12, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#2b6cb0' },
  summaryLabel: { fontSize: 11, color: '#718096', marginTop: 2, textAlign: 'center' },
  pdfBtn: {
    backgroundColor: '#276749', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  pdfBtnText:  { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  searchInput: {
    backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#2d3748',
  },
  resultCount: { fontSize: 12, color: '#a0aec0', fontWeight: '600' },
  card: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  empName:    { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  empSub:     { fontSize: 12, color: '#718096', marginTop: 1 },
  statusBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#edf2f7',
  },
  statusBadgeFit:        { backgroundColor: '#f0fff4' },
  statusBadgeUnfit:      { backgroundColor: '#fff5f5' },
  statusBadgeRestricted: { backgroundColor: '#fffaf0' },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#2d3748' },
  cardGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem:  { flexDirection: 'row', alignItems: 'center', width: '31%', gap: 6 },
  infoIcon:  { fontSize: 14 },
  infoLabel: { fontSize: 10, color: '#a0aec0', fontWeight: '600' },
  infoValue: { fontSize: 12, color: '#2d3748', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 48 },
  emptyText:  { fontSize: 14, color: '#a0aec0' },
});