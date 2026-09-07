// app/src/screens/reports/BloodDonorReportScreen.js
// Phase 10 redesign — Blood Donor Report. The Blood Group Distribution
// grid below is UNCHANGED from the old BloodGroupReportScreen.js
// (employee-only census, same /employees?validated=true source) — per
// PHASE10_DESIGN.md's explicit "stays exactly as-is" instruction. The
// donor list below it is new: reads bloodDonorRegistry via
// /blood-donors/report, live-status filtered. Both CSV and PDF export
// (Homi's explicit call — deviates from the "PDF only" rule used
// elsewhere in this batch). Access: admin_incharge, reception, doctor, CMO.

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

export default function BloodDonorReportScreen({ navigation }) {
  const [gridData,     setGridData]     = useState(null);
  const [reportData,   setReportData]   = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [csvLoading,   setCsvLoading]   = useState(false);
  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [filterGroup,  setFilterGroup]  = useState('');
  const [error,        setError]        = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchAll = async () => {
    setError('');
    try {
      const token = await getToken();
      const [gridRes, reportRes] = await Promise.all([
        fetch(`${API.reports}/employees?validated=true`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API.reports}/blood-donors/report`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);
      const gridJson = await gridRes.json();
      const reportJson = await reportRes.json();

      if (gridRes.ok) setGridData(gridJson.data);
      if (reportRes.ok) setReportData(reportJson.data);
      if (!gridRes.ok && !reportRes.ok) {
        setError(gridJson.message || reportJson.message || 'Failed to load report.');
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
    fetchAll();
  }, []));

  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  const handleDownloadCSV = async () => {
    setCsvLoading(true);
    try {
      await downloadFile(`${API.reports}/blood-donors/report?format=csv`, 'blood-donor-report.csv');
    } catch {
      setError('Failed to download CSV.');
    } finally {
      setCsvLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      await downloadFile(`${API.reports}/blood-donors/report?format=pdf`, 'blood-donor-report.pdf');
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  // Grid — unchanged employee-only census
  const bloodGroupStats = BLOOD_GROUPS.map(bg => ({
    group:  bg,
    count:  (gridData?.employees || []).filter(e => e.bloodGroup === bg).length,
    donors: (gridData?.employees || []).filter(e => e.bloodGroup === bg && e.bloodDonorConsent).length,
  }));

  // Donor list — new, live-status filtered
  const donorRows = reportData?.rows || [];
  const filteredDonors = donorRows.filter(r => !filterGroup || r.bloodGroup === filterGroup);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Blood Donor Report</Text>
        <Text style={styles.subtitle}>Distribution & active donor list</Text>
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

          {/* Blood Group Distribution — unchanged grid */}
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
            <TouchableOpacity onPress={() => setFilterGroup('')} style={styles.clearFilter}>
              <Text style={styles.clearFilterText}>✕ Clear filter</Text>
            </TouchableOpacity>
          )}

          {/* Export — both CSV and PDF, per Homi's explicit call */}
          <View style={styles.exportRow}>
            <TouchableOpacity
              style={[styles.csvBtn, csvLoading && styles.btnDisabled]}
              onPress={handleDownloadCSV}
              disabled={csvLoading}
            >
              {csvLoading
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <Text style={styles.csvBtnText}>⬇️ CSV</Text>
              }
            </TouchableOpacity>
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

          {/* Active donor list — new */}
          <Text style={styles.sectionLabel}>
            {filterGroup
              ? `${filterGroup} Active Donors (${filteredDonors.length})`
              : `All Active Donors (${filteredDonors.length})`}
          </Text>
          <Text style={styles.donorNote}>
            Only currently active employees and family members — resigned or disabled records are excluded automatically.
          </Text>

          {filteredDonors.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🩸</Text>
              <Text style={styles.emptyText}>No active donors match this selection</Text>
            </View>
          ) : (
            filteredDonors.map((r) => (
              <View key={r.id} style={styles.donorRow}>
                <View style={[styles.bgBadge, r.relation === 'Self' && styles.bgBadgeSelf]}>
                  <Text style={styles.bgBadgeText}>{r.bloodGroup}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.donorName}>{r.bloodDonorName}</Text>
                  <Text style={styles.donorSub}>
                    {r.employeeNumber} · {r.relation} · Age {r.age ?? '—'}
                  </Text>
                  <Text style={styles.donorSub}>
                    📞 {r.phoneNumber} · {r.residentialStatus}
                  </Text>
                </View>
              </View>
            ))
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
  exportRow: { flexDirection: 'row', gap: 10 },
  csvBtn: {
    flex: 1, backgroundColor: '#276749', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  csvBtnText:  { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  pdfBtn: {
    flex: 1, backgroundColor: '#2b6cb0', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  pdfBtnText:  { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  donorNote: { fontSize: 11, color: '#a0aec0', fontStyle: 'italic' },
  donorRow: {
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
  bgBadgeSelf: { borderColor: '#e53e3e' },
  bgBadgeText: { fontSize: 11, fontWeight: '800', color: '#c53030' },
  donorName:   { fontSize: 13, fontWeight: '700', color: '#2d3748' },
  donorSub:    { fontSize: 11, color: '#718096', marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyIcon:  { fontSize: 40 },
  emptyText:  { fontSize: 14, color: '#a0aec0' },
});