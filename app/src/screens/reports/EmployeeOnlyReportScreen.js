// app/src/screens/reports/EmployeeOnlyReportScreen.js
// Employee-only report — no family details — CMO only

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';

export default function EmployeeOnlyReportScreen({ navigation }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [search,     setSearch]     = useState('');
  const [error,      setError]      = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setError('');
    try {
      const token    = await getToken();
      const response = await fetch(
        `${API.reports}/population/employees-only`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
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
        `${API.reports}/population/employees-only?format=pdf`,
        'employee-report.pdf'
      );
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const filtered = (data?.employees || []).filter(e =>
    !search.trim() ||
    e.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    e.officialEmployeeNumber?.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Employee Report</Text>
        <Text style={styles.subtitle}>All employees — no family details</Text>
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
                    : <Text style={styles.pdfBtnText}>📄 PDF</Text>
                  }
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, employee no., department..."
                placeholderTextColor="#a0aec0"
              />

              <Text style={styles.resultCount}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </Text>

              {filtered.map((emp, i) => (
                <View key={emp.id || i} style={styles.card}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.empNum}>{emp.officialEmployeeNumber}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.empName}>{emp.fullName}</Text>
                    <Text style={styles.empRow}>
                      {emp.department} · {emp.designation}
                    </Text>
                    <Text style={styles.empRow}>
                      {emp.residenceType !== '—' ? emp.residenceType + ' · ' : ''}
                      {emp.houseNumber} · Age: {emp.age} · Family: {emp.familyMemberCount}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
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
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 80 },
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
  resultCount: { fontSize: 12, color: '#a0aec0', fontWeight: '600' },
  card: {
    flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 10,
    padding: 12, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  cardLeft: {
    backgroundColor: '#ebf8ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    justifyContent: 'center', alignItems: 'center',
    minWidth: 72,
  },
  empNum:    { fontSize: 10, fontWeight: '800', color: '#2b6cb0', textAlign: 'center' },
  cardRight: { flex: 1 },
  empName:   { fontSize: 13, fontWeight: '700', color: '#2d3748' },
  empRow:    { fontSize: 11, color: '#718096', marginTop: 2 },
});