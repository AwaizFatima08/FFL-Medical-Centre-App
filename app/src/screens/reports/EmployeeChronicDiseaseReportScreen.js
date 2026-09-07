// app/src/screens/reports/EmployeeChronicDiseaseReportScreen.js
// Phase 10 — Employee Chronic Disease Report (new). CMO only.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';

const CONDITIONS = [
  { key: 'diabetes',             label: 'Diabetes' },
  { key: 'hypertension',         label: 'Hypertension' },
  { key: 'ischemicHeartDisease', label: 'Ischemic Heart Disease' },
  { key: 'derangedLipidProfile', label: 'Deranged Lipid Profile' },
];

export default function EmployeeChronicDiseaseReportScreen({ navigation }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error,      setError]      = useState('');

  const [search, setSearch] = useState(''); // name or employee number
  // Each condition filter: '' | 'yes' | 'no'
  const [conditionFilters, setConditionFilters] = useState({
    diabetes: '', hypertension: '', ischemicHeartDisease: '', derangedLipidProfile: '', isSmoker: '',
  });

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setError('');
    try {
      const token = await getToken();
      const response = await fetch(`${API.reports}/chronic-disease`, {
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
        `${API.reports}/chronic-disease?format=pdf`,
        'employee-chronic-disease-report.pdf'
      );
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const toggleCondition = (key) => {
    setConditionFilters(prev => {
      const next = prev[key] === '' ? 'yes' : prev[key] === 'yes' ? 'no' : '';
      return { ...prev, [key]: next };
    });
  };

  const rows = data?.rows || [];

  const filtered = rows.filter(r => {
    const term = search.trim().toLowerCase();
    if (term &&
      !r.employeeName?.toLowerCase().includes(term) &&
      !r.employeeNumber?.toLowerCase().includes(term)
    ) return false;
    for (const key of ['diabetes', 'hypertension', 'ischemicHeartDisease', 'derangedLipidProfile', 'isSmoker']) {
      const f = conditionFilters[key];
      if (f === 'yes' && !r[key]) return false;
      if (f === 'no' && r[key]) return false;
    }
    return true;
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Employee Chronic Disease Report</Text>
        <Text style={styles.subtitle}>Chronic conditions & smoker status</Text>
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
              {/* Top summary */}
              <View style={styles.summaryGrid}>
                <SummaryCard label="Smokers" value={data.summary?.smokers || 0} color="#c05621" />
                <SummaryCard label="Diabetic" value={data.summary?.diabetic || 0} color="#c53030" />
                <SummaryCard label="Hypertensive" value={data.summary?.hypertensive || 0} color="#805ad5" />
                <SummaryCard label="Ischemic Heart Disease" value={data.summary?.ischemicHeartDisease || 0} color="#dd6b20" />
                <SummaryCard label="Deranged Lipid Profile" value={data.summary?.derangedLipidProfile || 0} color="#2b6cb0" />
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

              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search by employee name or number..."
                placeholderTextColor="#a0aec0"
              />

              {/* Condition filters — tap cycles All → Yes → No → All */}
              <Text style={styles.sectionLabel}>Filters (tap to cycle: All → Yes → No)</Text>
              <View style={styles.chipRow}>
                {CONDITIONS.map(c => (
                  <TouchableOpacity
                    key={c.key}
                    style={[
                      styles.chip,
                      conditionFilters[c.key] === 'yes' && styles.chipYes,
                      conditionFilters[c.key] === 'no' && styles.chipNo,
                    ]}
                    onPress={() => toggleCondition(c.key)}
                  >
                    <Text style={[
                      styles.chipText,
                      (conditionFilters[c.key] === 'yes' || conditionFilters[c.key] === 'no') && styles.chipTextSelected,
                    ]}>
                      {c.label}{conditionFilters[c.key] ? ` · ${conditionFilters[c.key] === 'yes' ? 'Yes' : 'No'}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.chip,
                    conditionFilters.isSmoker === 'yes' && styles.chipYes,
                    conditionFilters.isSmoker === 'no' && styles.chipNo,
                  ]}
                  onPress={() => toggleCondition('isSmoker')}
                >
                  <Text style={[
                    styles.chipText,
                    (conditionFilters.isSmoker === 'yes' || conditionFilters.isSmoker === 'no') && styles.chipTextSelected,
                  ]}>
                    Smoker{conditionFilters.isSmoker ? ` · ${conditionFilters.isSmoker === 'yes' ? 'Yes' : 'No'}` : ''}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.resultCount}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </Text>

              {filtered.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🩺</Text>
                  <Text style={styles.emptyText}>No employees match this selection</Text>
                </View>
              ) : (
                filtered.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.empName}>{r.employeeName}</Text>
                      <Text style={styles.empSub}>{r.employeeNumber} · Age: {r.age ?? '—'}</Text>
                    </View>
                    <View style={styles.tagRow}>
                      {r.diabetes && <Tag label="Diabetes" color="#c53030" />}
                      {r.hypertension && <Tag label="Hypertension" color="#805ad5" />}
                      {r.ischemicHeartDisease && <Tag label="IHD" color="#dd6b20" />}
                      {r.derangedLipidProfile && <Tag label="Deranged Lipid" color="#2b6cb0" />}
                      {r.isSmoker && <Tag label="Smoker" color="#c05621" />}
                      {!r.diabetes && !r.hypertension && !r.ischemicHeartDisease && !r.derangedLipidProfile && !r.isSmoker && (
                        <Text style={styles.noConditions}>No conditions on file</Text>
                      )}
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

function SummaryCard({ label, value, color }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Tag({ label, color }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
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
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    flexGrow: 1, minWidth: '30%', backgroundColor: '#ffffff', borderRadius: 10,
    padding: 12, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  summaryValue: { fontSize: 22, fontWeight: '800' },
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
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#4a5568',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#ffffff',
  },
  chipYes: { backgroundColor: '#f0fff4', borderColor: '#48bb78' },
  chipNo:  { backgroundColor: '#fff5f5', borderColor: '#fc8181' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#4a5568' },
  chipTextSelected: { color: '#2d3748' },
  resultCount: { fontSize: 12, color: '#a0aec0', fontWeight: '600' },
  card: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2, gap: 8,
  },
  cardHeader: {},
  empName:    { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  empSub:     { fontSize: 12, color: '#718096', marginTop: 1 },
  tagRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  tagText: { fontSize: 11, fontWeight: '700' },
  noConditions: { fontSize: 12, color: '#a0aec0', fontStyle: 'italic' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 48 },
  emptyText:  { fontSize: 14, color: '#a0aec0' },
});