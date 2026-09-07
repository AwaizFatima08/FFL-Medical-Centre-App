// app/src/screens/reports/FamilyReportScreen.js
// Phase 10 — Family Report (new). One row per employee, default-capped
// spouse (1) and children (5) groups, tap-to-expand for anyone exceeding
// that. CMO only.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';

const DEFAULT_SPOUSE_CAP = 1;
const DEFAULT_CHILD_CAP  = 5;

export default function FamilyReportScreen({ navigation }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [error,       setError]       = useState('');
  const [expanded,    setExpanded]    = useState({}); // { [employeeId]: true }

  const [search,          setSearch]          = useState(''); // name or employee number
  const [townshipFilter,  setTownshipFilter]  = useState(''); // '' | 'yes' | 'no'

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setError('');
    try {
      const token    = await getToken();
      const response = await fetch(`${API.reports}/family-report`, {
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
      // PDF always renders every spouse/child, no cap — handled server-side.
      await downloadFile(`${API.reports}/family-report?format=pdf`, 'family-report.pdf');
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const employees = data?.employees || [];

  const filtered = employees.filter(e => {
    const term = search.trim().toLowerCase();
    if (term &&
      !e.employeeName?.toLowerCase().includes(term) &&
      !e.employeeNumber?.toLowerCase().includes(term)
    ) return false;
    if (townshipFilter === 'yes' && !e.townshipResident) return false;
    if (townshipFilter === 'no' && e.townshipResident) return false;
    return true;
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Family Report</Text>
        <Text style={styles.subtitle}>Employee households</Text>
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
              <View style={styles.topRow}>
                <View style={styles.totalBadge}>
                  <Text style={styles.totalText}>{data.total} employees</Text>
                </View>
                <TouchableOpacity
                  style={[styles.pdfBtn, pdfLoading && styles.btnDisabled]}
                  onPress={handleDownloadPDF}
                  disabled={pdfLoading}
                >
                  {pdfLoading
                    ? <ActivityIndicator size="small" color="#ffffff" />
                    : <Text style={styles.pdfBtnText}>📄 PDF (full)</Text>
                  }
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search by employee name or number..."
                placeholderTextColor="#a0aec0"
              />

              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !townshipFilter && styles.chipSelected]}
                  onPress={() => setTownshipFilter('')}
                >
                  <Text style={[styles.chipText, !townshipFilter && styles.chipTextSelected]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, townshipFilter === 'yes' && styles.chipSelected]}
                  onPress={() => setTownshipFilter('yes')}
                >
                  <Text style={[styles.chipText, townshipFilter === 'yes' && styles.chipTextSelected]}>Township</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, townshipFilter === 'no' && styles.chipSelected]}
                  onPress={() => setTownshipFilter('no')}
                >
                  <Text style={[styles.chipText, townshipFilter === 'no' && styles.chipTextSelected]}>Non-Township</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.resultCount}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </Text>

              {filtered.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>👨‍👩‍👧‍👦</Text>
                  <Text style={styles.emptyText}>No employees match this selection</Text>
                </View>
              ) : (
                filtered.map((e) => {
                  const isExpanded = !!expanded[e.id];
                  const spouseOverflow  = e.spouses.length > DEFAULT_SPOUSE_CAP;
                  const childOverflow   = e.children.length > DEFAULT_CHILD_CAP;
                  const hasOverflow     = spouseOverflow || childOverflow;
                  const shownSpouses = isExpanded ? e.spouses : e.spouses.slice(0, DEFAULT_SPOUSE_CAP);
                  const shownChildren = isExpanded ? e.children : e.children.slice(0, DEFAULT_CHILD_CAP);

                  return (
                    <View key={e.id} style={styles.card}>
                      <TouchableOpacity
                        onPress={() => hasOverflow && toggleExpand(e.id)}
                        activeOpacity={hasOverflow ? 0.7 : 1}
                      >
                        <View style={styles.cardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.empName}>{e.employeeName}</Text>
                            <Text style={styles.empSub}>
                              {e.employeeNumber} · {e.townshipResident ? 'Township' : 'Non-Township'} ·{' '}
                              {e.houseType !== '—' ? e.houseType + ' · ' : ''}{e.houseNumber}
                            </Text>
                          </View>
                          {hasOverflow && (
                            <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                          )}
                        </View>
                      </TouchableOpacity>

                      {e.spouses.length === 0 && e.children.length === 0 ? (
                        <Text style={styles.noFamily}>No family members on file</Text>
                      ) : (
                        <View style={styles.familySection}>
                          {shownSpouses.map((sp, i) => (
                            <FamilyRow key={`sp-${i}`} label={e.spouses.length > 1 ? `Spouse ${i + 1}` : 'Spouse'} member={sp} />
                          ))}
                          {shownChildren.map((c, i) => (
                            <FamilyRow key={`ch-${i}`} label={`Child ${i + 1}`} member={c} />
                          ))}
                          {!isExpanded && hasOverflow && (
                            <TouchableOpacity onPress={() => toggleExpand(e.id)}>
                              <Text style={styles.moreText}>
                                + {(e.spouses.length - shownSpouses.length) + (e.children.length - shownChildren.length)} more — tap to expand
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function FamilyRow({ label, member }) {
  return (
    <View style={styles.familyRow}>
      <Text style={styles.familyLabel}>{label}</Text>
      <Text style={styles.familyDetail}>
        {member.name} · Age {member.age ?? '—'} · {member.bloodGroup}
      </Text>
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalBadge: {
    backgroundColor: '#ebf8ff', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  totalText:   { fontSize: 13, color: '#2b6cb0', fontWeight: '700' },
  pdfBtn: {
    backgroundColor: '#276749', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  pdfBtnText:  { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  searchInput: {
    backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#2d3748',
  },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#ffffff',
  },
  chipSelected:     { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  chipText:         { fontSize: 13, fontWeight: '600', color: '#4a5568' },
  chipTextSelected: { color: '#ffffff' },
  resultCount: { fontSize: 12, color: '#a0aec0', fontWeight: '600' },
  card: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empName:    { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  empSub:     { fontSize: 12, color: '#718096', marginTop: 1 },
  expandIcon: { fontSize: 12, color: '#a0aec0' },
  noFamily: { fontSize: 12, color: '#a0aec0', fontStyle: 'italic', paddingTop: 8 },
  familySection: {
    marginTop: 10, borderTopWidth: 1, borderTopColor: '#f0f4f8', paddingTop: 8, gap: 6,
  },
  familyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  familyLabel:  { fontSize: 11, fontWeight: '700', color: '#4a5568', width: 70 },
  familyDetail: { fontSize: 12, color: '#2d3748', flex: 1 },
  moreText: { fontSize: 12, color: '#3182ce', fontWeight: '600', marginTop: 4 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 48 },
  emptyText:  { fontSize: 14, color: '#a0aec0' },
});