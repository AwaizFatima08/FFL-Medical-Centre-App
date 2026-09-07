// app/src/screens/reports/PopulationStatsReportScreen.js
// Phase 10 — Population Report (new). Grouped summary tiles, not a row
// table — a statistics dashboard shape, genuinely different from every
// other report in this batch. CMO only.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';

const BUCKET_LABEL = { management: 'Management', non_management: 'Non-Management', ESB: 'ESB' };
const BRACKET_LABEL = { under2: '< 2', '2to12': '2–12', '13to17': '13–17', '18plus': '18+' };

export default function PopulationStatsReportScreen({ navigation }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error,      setError]      = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setError('');
    try {
      const token    = await getToken();
      const response = await fetch(`${API.reports}/population/report`, {
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
      await downloadFile(`${API.reports}/population/report?format=pdf`, 'population-report.pdf');
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const s = data?.summary;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Population Report</Text>
        <Text style={styles.subtitle}>Company-wide statistics</Text>
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

          {s && (
            <>
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

              {/* Figures 1-4 — Employees */}
              <SectionTitle>Employees</SectionTitle>
              <View style={styles.tileRow}>
                <Tile label="Total Employees" value={s.totalEmployees} color="#2b6cb0" />
                <Tile label="Management" value={s.managementCount} color="#276749" />
                <Tile label="Non-Management" value={s.nonManagementCount} color="#805ad5" />
                <Tile label="ESB" value={s.esbCount} color="#c05621" />
              </View>

              {/* Figure 5 — Township Population Total */}
              <SectionTitle>Township Population</SectionTitle>
              <View style={styles.tileRow}>
                <Tile label="Total (Employees + Family)" value={s.townshipPopulationTotal} color="#2b6cb0" wide />
              </View>

              {/* Figure 6 — House-type breakdown */}
              <Text style={styles.subLabel}>By House Type</Text>
              <View style={styles.tileRow}>
                {Object.entries(s.houseTypeBreakdown || {}).map(([type, count]) => (
                  <Tile key={type} label={type} value={count} color="#3182ce" />
                ))}
              </View>

              {/* Figure 7 — Age brackets */}
              <Text style={styles.subLabel}>Age Brackets</Text>
              {['management', 'non_management', 'ESB'].map(bucket => (
                <View key={bucket} style={styles.groupCard}>
                  <Text style={styles.groupTitle}>{BUCKET_LABEL[bucket]}</Text>
                  <View style={styles.bracketRow}>
                    {Object.entries(s.ageBrackets?.[bucket] || {}).map(([bracket, count]) => (
                      <View key={bracket} style={styles.bracketItem}>
                        <Text style={styles.bracketValue}>{count}</Text>
                        <Text style={styles.bracketLabel}>{BRACKET_LABEL[bracket]}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              {/* Figure 8 — Gender breakdown */}
              <Text style={styles.subLabel}>Gender</Text>
              {['management', 'non_management', 'ESB'].map(bucket => {
                const g = s.genderBreakdown?.[bucket] || {};
                return (
                  <View key={bucket} style={styles.groupCard}>
                    <Text style={styles.groupTitle}>{BUCKET_LABEL[bucket]}</Text>
                    <View style={styles.bracketRow}>
                      <View style={styles.bracketItem}>
                        <Text style={styles.bracketValue}>{g.male || 0}</Text>
                        <Text style={styles.bracketLabel}>Male</Text>
                      </View>
                      <View style={styles.bracketItem}>
                        <Text style={styles.bracketValue}>{g.female || 0}</Text>
                        <Text style={styles.bracketLabel}>Female</Text>
                      </View>
                      {g.unspecified > 0 && (
                        <View style={styles.bracketItem}>
                          <Text style={styles.bracketValue}>{g.unspecified}</Text>
                          <Text style={styles.bracketLabel}>Unspecified</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Figure 9 — Marital status (company-wide) */}
              <SectionTitle>Marital Status (All Employees)</SectionTitle>
              <View style={styles.tileRow}>
                {Object.entries(s.maritalStatusBreakdown || {}).map(([status, count]) => (
                  <Tile key={status} label={status} value={count} color="#805ad5" />
                ))}
              </View>

              {/* Figures 10-12 — Residency */}
              <SectionTitle>Residency</SectionTitle>
              <View style={styles.tileRow}>
                <Tile label="Township Resident" value={s.residencySplit?.township} color="#276749" />
                <Tile label="Outside Employees" value={s.residencySplit?.outside} color="#c05621" />
              </View>
              <View style={styles.tileRow}>
                <Tile label="Total Population Living Outside" value={s.outsidePopulationTotal} color="#2b6cb0" wide />
              </View>
              <Text style={styles.subLabel}>Bachelor-Housed + Married (family lives elsewhere)</Text>
              <View style={styles.tileRow}>
                <Tile label="Employees" value={s.bachelorMarriedEmployeeCount} color="#c53030" />
                <Tile label="Their Family Members" value={s.bachelorMarriedFamilyCount} color="#c53030" />
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Tile({ label, value, color, wide }) {
  return (
    <View style={[styles.tile, wide && styles.tileWide]}>
      <Text style={[styles.tileValue, { color }]}>{value ?? 0}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
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
  scrollContent: { padding: 16, gap: 8 },
  errorBox: {
    backgroundColor: '#fff5f5', borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#fc8181',
  },
  errorText: { fontSize: 13, color: '#c53030' },
  pdfBtn: {
    backgroundColor: '#276749', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  pdfBtnText:  { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  sectionTitle: {
    fontSize: 14, fontWeight: '800', color: '#2d3748', marginTop: 8,
  },
  subLabel: {
    fontSize: 11, fontWeight: '700', color: '#718096',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1, minWidth: '30%', backgroundColor: '#ffffff', borderRadius: 10,
    padding: 12, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  tileWide: { minWidth: '100%' },
  tileValue: { fontSize: 20, fontWeight: '800' },
  tileLabel: { fontSize: 11, color: '#718096', marginTop: 2, textAlign: 'center' },
  groupCard: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  groupTitle: { fontSize: 12, fontWeight: '700', color: '#2d3748', marginBottom: 8 },
  bracketRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  bracketItem: { alignItems: 'center', minWidth: 50 },
  bracketValue: { fontSize: 16, fontWeight: '800', color: '#3182ce' },
  bracketLabel: { fontSize: 10, color: '#a0aec0', marginTop: 2 },
});