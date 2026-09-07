// app/src/screens/reports/EmployeeReportScreen.js
// Phase 10 — Employee Report (new). Replaces EmployeeOnlyReportScreen.js
// and PopulationReportScreen.js's township/non-township branches with
// one flat table + filters. CMO only.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';

export default function EmployeeReportScreen({ navigation }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [error,       setError]       = useState('');
  const [search,      setSearch]      = useState('');

  // Filters — all optional, '' means "All"
  const [ageGroup,       setAgeGroup]       = useState('');   // '' | '40+' | 'below40'
  const [department,     setDepartment]     = useState('');
  const [unit,           setUnit]           = useState('');
  const [grade,          setGrade]          = useState('');
  const [townshipFilter, setTownshipFilter] = useState('');   // '' | 'yes' | 'no'
  const [houseType,      setHouseType]      = useState('');
  const [maritalStatus,  setMaritalStatus]  = useState('');
  const [bloodGroup,     setBloodGroup]     = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async () => {
    setError('');
    try {
      const token    = await getToken();
      const response = await fetch(`${API.reports}/employees/report`, {
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
      await downloadFile(`${API.reports}/employees/report?format=pdf`, 'employee-report.pdf');
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const employees = data?.employees || [];
  const opts = data?.filterOptions || {};

  const filtered = employees.filter(e => {
    const term = search.trim().toLowerCase();
    if (term &&
      !e.employeeName?.toLowerCase().includes(term) &&
      !e.employeeNumber?.toLowerCase().includes(term)
    ) return false;
    if (ageGroup === '40+' && !(e.age !== null && e.age >= 40)) return false;
    if (ageGroup === 'below40' && !(e.age !== null && e.age < 40)) return false;
    if (department && e.department !== department) return false;
    if (unit && e.unit !== unit) return false;
    if (grade && e.grade !== grade) return false;
    if (townshipFilter === 'yes' && !e.townshipResident) return false;
    if (townshipFilter === 'no' && e.townshipResident) return false;
    if (houseType && e.houseType !== houseType) return false;
    if (maritalStatus && e.maritalStatus !== maritalStatus) return false;
    if (bloodGroup && e.bloodGroup !== bloodGroup) return false;
    return true;
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Employee Report</Text>
        <Text style={styles.subtitle}>All employees — one row each</Text>
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
                placeholder="Search by name or employee number..."
                placeholderTextColor="#a0aec0"
              />

              {/* Filters */}
              <FilterRow label="Age Group" value={ageGroup} onChange={setAgeGroup}
                options={[{ value: '40+', label: '40+' }, { value: 'below40', label: 'Below 40' }]} />

              <FilterRow label="Township Resident" value={townshipFilter} onChange={setTownshipFilter}
                options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />

              {opts.departments?.length > 0 && (
                <FilterRow label="Department" value={department} onChange={setDepartment}
                  options={opts.departments.map(d => ({ value: d, label: d }))} />
              )}

              {opts.units?.length > 0 && (
                <FilterRow label="Unit" value={unit} onChange={setUnit}
                  options={opts.units.map(u => ({ value: u, label: u }))} />
              )}

              {opts.grades?.length > 0 && (
                <FilterRow label="Grade" value={grade} onChange={setGrade}
                  options={opts.grades.map(g => ({ value: g, label: g }))} />
              )}

              {opts.houseTypes?.length > 0 && (
                <FilterRow label="House Type" value={houseType} onChange={setHouseType}
                  options={opts.houseTypes.map(h => ({ value: h, label: h }))} />
              )}

              {opts.maritalStatuses?.length > 0 && (
                <FilterRow label="Marital Status" value={maritalStatus} onChange={setMaritalStatus}
                  options={opts.maritalStatuses.map(m => ({ value: m, label: m }))} />
              )}

              {opts.bloodGroups?.length > 0 && (
                <FilterRow label="Blood Group" value={bloodGroup} onChange={setBloodGroup}
                  options={opts.bloodGroups.map(b => ({ value: b, label: b }))} />
              )}

              <Text style={styles.resultCount}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </Text>

              {filtered.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>👥</Text>
                  <Text style={styles.emptyText}>No employees match this selection</Text>
                </View>
              ) : (
                filtered.map((e) => (
                  <View key={e.id} style={styles.card}>
                    <View style={styles.cardLeft}>
                      <Text style={styles.empNum}>{e.employeeNumber}</Text>
                    </View>
                    <View style={styles.cardRight}>
                      <Text style={styles.empName}>{e.employeeName}</Text>
                      <Text style={styles.empRow}>
                        {e.department} · {e.grade} · {e.unit}
                      </Text>
                      <Text style={styles.empRow}>
                        DOB: {e.dateOfBirth || '—'}{e.age !== null ? ` (Age ${e.age})` : ''} · CNIC: {e.cnic}
                      </Text>
                      <Text style={styles.empRow}>
                        {e.maritalStatus} · {e.bloodGroup} · {e.townshipResident ? 'Township' : 'Non-Township'}
                      </Text>
                      <Text style={styles.empRow}>
                        {e.houseType !== '—' ? e.houseType + ' · ' : ''}{e.houseNumber} · 📞 {e.phoneNumber}
                      </Text>
                      <Text style={styles.empRowBold}>
                        Family Members: {e.totalNoOfFamilyMembers}
                      </Text>
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

function FilterRow({ label, value, onChange, options }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        <TouchableOpacity
          style={[styles.chip, !value && styles.chipSelected]}
          onPress={() => onChange('')}
        >
          <Text style={[styles.chipText, !value && styles.chipTextSelected]}>All</Text>
        </TouchableOpacity>
        {options.map(o => (
          <TouchableOpacity
            key={o.value}
            style={[styles.chip, value === o.value && styles.chipSelected]}
            onPress={() => onChange(value === o.value ? '' : o.value)}
          >
            <Text style={[styles.chipText, value === o.value && styles.chipTextSelected]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#4a5568',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  chipScroll: { marginBottom: 2 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#ffffff', marginRight: 8,
  },
  chipSelected:     { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  chipText:         { fontSize: 12, fontWeight: '600', color: '#4a5568' },
  chipTextSelected: { color: '#ffffff' },
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
    minWidth: 72, alignSelf: 'flex-start',
  },
  empNum:    { fontSize: 10, fontWeight: '800', color: '#2b6cb0', textAlign: 'center' },
  cardRight: { flex: 1, gap: 1 },
  empName:   { fontSize: 13, fontWeight: '700', color: '#2d3748' },
  empRow:    { fontSize: 11, color: '#718096', marginTop: 2 },
  empRowBold:{ fontSize: 11, color: '#2d3748', fontWeight: '700', marginTop: 4 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 48 },
  emptyText:  { fontSize: 14, color: '#a0aec0' },
});