// app/src/screens/reports/BloodGroupReportScreen.js
// Blood group repository — CSV download — admin + CMO

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function BloodGroupReportScreen({ navigation }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [csvLoading,  setCsvLoading]  = useState(false);
  const [filterGroup, setFilterGroup] = useState('');
  const [error,       setError]       = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setError('');
    try {
      const token    = await getToken();
      const response = await fetch(
        `${API.reports}/employees?validated=true`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const json = await response.json();
      if (response.ok) setData(json.data);
      else setError(json.message || 'Failed to load data.');
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

  const handleDownloadCSV = async () => {
    setCsvLoading(true);
    try {
      await downloadFile(
        `${API.reports}/blood-groups/csv`,
        'blood-group-repository.csv'
      );
    } catch {
      setError('Failed to download CSV.');
    } finally {
      setCsvLoading(false);
    }
  };

  const bloodGroupStats = BLOOD_GROUPS.map(bg => ({
    group:  bg,
    count:  (data?.employees || []).filter(e => e.bloodGroup === bg).length,
    donors: (data?.employees || []).filter(e => e.bloodGroup === bg && e.bloodDonorConsent).length,
  }));

  const filteredEmployees = (data?.employees || [])
    .filter(e => e.bloodGroup)
    .filter(e => !filterGroup || e.bloodGroup === filterGroup)
    .sort((a, b) => (a.bloodGroup || '').localeCompare(b.bloodGroup || ''));

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Blood Group Repository</Text>
        <Text style={styles.subtitle}>Employee blood group records</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#e53e3e" />
          <Text style={styles.loadingText}>Loading data...</Text>
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
              {/* CSV Download */}
              <TouchableOpacity
                style={[styles.csvBtn, csvLoading && styles.btnDisabled]}
                onPress={handleDownloadCSV}
                disabled={csvLoading}
              >
                {csvLoading
                  ? <ActivityIndicator size="small" color="#ffffff" />
                  : <Text style={styles.csvBtnText}>⬇️ Download CSV</Text>
                }
              </TouchableOpacity>

              {/* Blood group summary grid */}
              <Text style={styles.sectionLabel}>Blood Group Distribution</Text>
              <View style={styles.bgGrid}>
                {bloodGroupStats.map(bg => (
                  <TouchableOpacity
                    key={bg.group}
                    style={[
                      styles.bgCard,
                      filterGroup === bg.group && styles.bgCardSelected,
                      bg.count === 0 && styles.bgCardEmpty,
                    ]}
                    onPress={() => setFilterGroup(filterGroup === bg.group ? '' : bg.group)}
                  >
                    <Text style={[styles.bgGroup, filterGroup === bg.group && styles.bgGroupSelected]}>
                      {bg.group}
                    </Text>
                    <Text style={[styles.bgCount, filterGroup === bg.group && styles.bgCountSelected]}>
                      {bg.count}
                    </Text>
                    {bg.donors > 0 && (
                      <Text style={styles.bgDonors}>🩸 {bg.donors}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {filterGroup && (
                <TouchableOpacity
                  onPress={() => setFilterGroup('')}
                  style={styles.clearFilter}
                >
                  <Text style={styles.clearFilterText}>✕ Clear filter</Text>
                </TouchableOpacity>
              )}

              {/* Employee list */}
              <Text style={styles.sectionLabel}>
                {filterGroup
                  ? `${filterGroup} Employees (${filteredEmployees.length})`
                  : `All Employees with Blood Group (${filteredEmployees.length})`
                }
              </Text>

              {filteredEmployees.map((emp, i) => (
                <View key={emp.id || i} style={styles.empRow}>
                  <View style={[styles.bgBadge, emp.bloodDonorConsent && styles.bgBadgeDonor]}>
                    <Text style={styles.bgBadgeText}>{emp.bloodGroup}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.empName}>{emp.fullName}</Text>
                    <Text style={styles.empSub}>
                      {emp.officialEmployeeNumber} · {emp.department || '—'}
                      {emp.bloodDonorConsent ? ' · 🩸 Donor' : ''}
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
  scrollContent: { padding: 16, gap: 12 },
  errorBox: {
    backgroundColor: '#fff5f5', borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#fc8181',
  },
  errorText: { fontSize: 13, color: '#c53030' },
  csvBtn: {
    backgroundColor: '#276749', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  csvBtnText:  { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#4a5568',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  bgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bgCard: {
    width: '22%', backgroundColor: '#ffffff', borderRadius: 10,
    padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  bgCardSelected: { backgroundColor: '#e53e3e', borderColor: '#e53e3e' },
  bgCardEmpty:    { opacity: 0.4 },
  bgGroup:        { fontSize: 14, fontWeight: '800', color: '#2d3748' },
  bgGroupSelected:{ color: '#ffffff' },
  bgCount:        { fontSize: 18, fontWeight: '800', color: '#e53e3e', marginTop: 2 },
  bgCountSelected:{ color: '#ffffff' },
  bgDonors:       { fontSize: 10, marginTop: 2 },
  clearFilter:     { alignSelf: 'flex-start' },
  clearFilterText: { fontSize: 12, color: '#3182ce', fontWeight: '600' },
  empRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#ffffff', borderRadius: 10, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  bgBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff5f5', borderWidth: 2, borderColor: '#feb2b2',
    alignItems: 'center', justifyContent: 'center',
  },
  bgBadgeDonor:  { borderColor: '#e53e3e', backgroundColor: '#fff5f5' },
  bgBadgeText:   { fontSize: 11, fontWeight: '800', color: '#c53030' },
  empName:       { fontSize: 13, fontWeight: '700', color: '#2d3748' },
  empSub:        { fontSize: 11, color: '#718096', marginTop: 2 },
});