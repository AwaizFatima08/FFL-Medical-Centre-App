// app/src/screens/reports/PopulationReportScreen.js
// Reusable population report screen for township + non-township
// Controlled by route param: type = 'township' | 'non-township'
// CMO only

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

export default function PopulationReportScreen({ navigation, route }) {
  const type      = route.params?.type || 'township'; // 'township' | 'non-township'
  const isTownship = type === 'township';

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error,      setError]      = useState('');
  const [expanded,   setExpanded]   = useState({});

  const endpoint = isTownship
    ? `${API.reports}/population/township`
    : `${API.reports}/population/non-township`;

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setError('');
    try {
      const token    = await getToken();
      const response = await fetch(endpoint, {
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
  }, [type]));

  const onRefresh = () => { setRefreshing(true); fetchReport(); };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const token = await getToken();
      await Linking.openURL(`${endpoint}?format=pdf&token=${token}`);
    } catch {
      setError('Failed to open PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const calcAge = (dob) => {
    if (!dob) return '—';
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return String(age);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {isTownship ? 'Township Population' : 'Non-Township Employees'}
        </Text>
        <Text style={styles.subtitle}>
          {isTownship ? 'Residents with family + bachelor' : 'Outstation employees'}
        </Text>
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
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{data.total}</Text>
                  <Text style={styles.summaryLabel}>Employees</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>
                    {(data.employees || []).reduce((sum, e) => sum + (e.familyMembers?.length || 0), 0)}
                  </Text>
                  <Text style={styles.summaryLabel}>Family Members</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.pdfBtn, pdfLoading && styles.btnDisabled]}
                onPress={handleDownloadPDF}
                disabled={pdfLoading}
              >
                {pdfLoading
                  ? <ActivityIndicator size="small" color="#ffffff" />
                  : <Text style={styles.pdfBtnText}>📄 Download PDF Report</Text>
                }
              </TouchableOpacity>

              {(data.employees || []).map((emp) => (
                <View key={emp.id} style={styles.card}>
                  <TouchableOpacity
                    onPress={() => toggleExpand(emp.id)}
                    style={styles.cardHeader}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.empName}>{emp.fullName}</Text>
                      <Text style={styles.empSub}>
                        {emp.officialEmployeeNumber} · {emp.department || '—'} · {emp.designation || '—'}
                      </Text>
                      <Text style={styles.empSub}>
                        {isTownship
                          ? `${emp.residenceType || '—'} · ${emp.houseNumber || emp.roomNumber || '—'}`
                          : `City: ${emp.cityOfResidence || '—'}`
                        } · Age: {calcAge(emp.dateOfBirth)}
                      </Text>
                    </View>
                    <View style={styles.familyCountBadge}>
                      <Text style={styles.familyCountText}>
                        {emp.familyMembers?.length || 0} fam
                      </Text>
                    </View>
                    <Text style={styles.expandIcon}>
                      {expanded[emp.id] ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>

                  {expanded[emp.id] && (
                    <View style={styles.familySection}>
                      {(emp.familyMembers || []).length === 0 ? (
                        <Text style={styles.noFamily}>No family members registered</Text>
                      ) : (
                        emp.familyMembers.map((fm, i) => (
                          <View key={fm.id || i} style={styles.familyRow}>
                            <Text style={styles.familyName}>{fm.fullName}</Text>
                            <Text style={styles.familySub}>
                              {fm.relation || '—'} · {fm.gender || '—'} · Age: {calcAge(fm.dateOfBirth)}
                              {fm.differentlyAbled ? ' · ♿ Differently Abled' : ''}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}
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
    backgroundColor: '#ffffff', borderRadius: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 8,
  },
  empName: { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  empSub:  { fontSize: 12, color: '#718096', marginTop: 1 },
  familyCountBadge: {
    backgroundColor: '#ebf8ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  familyCountText: { fontSize: 11, color: '#2b6cb0', fontWeight: '700' },
  expandIcon:      { fontSize: 12, color: '#a0aec0' },
  familySection: {
    borderTopWidth: 1, borderTopColor: '#f0f4f8',
    paddingHorizontal: 14, paddingBottom: 12,
  },
  noFamily: { fontSize: 12, color: '#a0aec0', fontStyle: 'italic', paddingTop: 8 },
  familyRow: {
    paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f7fafc',
  },
  familyName: { fontSize: 13, fontWeight: '600', color: '#2d3748' },
  familySub:  { fontSize: 11, color: '#718096', marginTop: 1 },
});