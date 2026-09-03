// app/src/screens/ambulance/AmbulanceCMOHistoryScreen.js
// Day 20 (Phase 5.8.2) — CMO/Doctor historical view. Deliberately a
// separate screen from reception's AmbulanceHistoryScreen (Phase 5.9),
// not a shared/parameterized component — matches the project's existing
// pattern of one screen per audience rather than a configurable shared
// screen, and keeps reception's screen simple and untouched by CMO/Doctor
// scope. Two differences from reception's history screen:
//   1. No default status restriction — CMO/Doctor can see ALL statuses,
//      not just completed/cancelled (reception's screen is intentionally
//      narrower, per Homi's "reception side only" call for 5.9).
//   2. A KPI summary panel (avg response/arrival/return/total-trip times)
//      from GET /ambulance/kpis, sharing the same date range filter as
//      the request list below it (see reportRoutes.js Day 20 notes for
//      why that wasn't already true).
// Backend: both GET /ambulance and GET /ambulance/kpis already include
// both roles — no role changes needed here, only in reportRoutes.js.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, FlatList,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

const STATUS_FILTERS = [
  { value: null,                                                              label: 'All' },
  { value: 'pending,accepted,dispatched,picked_up,returned,arrived',          label: 'In Progress' },
  { value: 'completed',                                                       label: 'Completed' },
  { value: 'cancelled',                                                       label: 'Cancelled' },
];

const PRIORITY_FILTERS = [
  { value: null,        label: 'All' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'routine',   label: 'Routine' },
];

// Day 21 (Phase 5.8.3) — separate toggle, not folded into the priority
// chips above, since "flagged" is a closure-time judgment about an
// emergency request, not a request category of its own.
const FLAG_FILTERS = [
  { value: false, label: 'All' },
  { value: true,  label: 'Flagged False Emergency' },
];

const STATUS_BADGE = {
  pending:    { label: 'Pending',    color: '#d69e2e', bg: '#fefcbf' },
  accepted:   { label: 'Accepted',   color: '#2b6cb0', bg: '#ebf8ff' },
  dispatched: { label: 'Dispatched', color: '#6b46c1', bg: '#faf5ff' },
  picked_up:  { label: 'Picked Up',  color: '#276749', bg: '#f0fff4' },
  returned:   { label: 'Returned',   color: '#c05621', bg: '#fffaf0' },
  arrived:    { label: 'Arrived',    color: '#c05621', bg: '#fffaf0' },
  completed:  { label: 'Completed',  color: '#22543d', bg: '#c6f6d5' },
  cancelled:  { label: 'Cancelled',  color: '#742a2a', bg: '#fff5f5' },
};

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-PK', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function FilterChips({ options, selected, onSelect }) {
  return (
    <View style={styles.chipRow}>
      {options.map(opt => (
        <TouchableOpacity
          key={String(opt.value)}
          style={[styles.chip, selected === opt.value && styles.chipActive]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={[styles.chipText, selected === opt.value && styles.chipTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function KpiTile({ label, value, unit }) {
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiValue}>{value === null || value === undefined ? '—' : value}{value !== null && unit ? unit : ''}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function AmbulanceCMOHistoryScreen({ navigation }) {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests]     = useState([]);
  const [kpis, setKpis]             = useState(null);

  const [search, setSearch]     = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const [statusFilter, setStatusFilter]     = useState(null);
  const [priorityFilter, setPriorityFilter] = useState(null);
  const [flagFilter, setFlagFilter]         = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchData = async () => {
    try {
      const token = await getToken();

      // Request list — GET /ambulance, no default status restriction.
      const listParams = new URLSearchParams();
      if (statusFilter)     listParams.set('status', statusFilter);
      if (fromDate.trim())  listParams.set('fromDate', fromDate.trim());
      if (toDate.trim())    listParams.set('toDate', toDate.trim());
      if (search.trim())    listParams.set('employeeSearch', search.trim());
      if (priorityFilter)   listParams.set('priorityFlag', priorityFilter);
      if (flagFilter)       listParams.set('falseEmergencyOnly', 'true');

      // KPI summary — GET /ambulance/kpis, sharing the same date range
      // (Day 20 addition to that route — see reportRoutes.js).
      const kpiParams = new URLSearchParams();
      if (fromDate.trim()) kpiParams.set('fromDate', fromDate.trim());
      if (toDate.trim())   kpiParams.set('toDate', toDate.trim());

      const [listRes, kpiRes] = await Promise.all([
        fetch(`${API.reports}/ambulance?${listParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API.reports}/ambulance/kpis?${kpiParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      const listData = await listRes.json();
      const kpiData  = await kpiRes.json();

      if (listRes.ok) setRequests(listData.data?.requests || []);
      else alert(listData.message || 'Failed to load ambulance history.');

      if (kpiRes.ok) setKpis(kpiData.data?.summary || null);
      // KPI failure isn't fatal to the screen — just leave the panel blank
      // rather than blocking the list below it.

    } catch (error) {
      alert('Network error.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchData();
  }, []));

  const handleApplyFilters = () => {
    setLoading(true);
    fetchData();
  };

  const handleClearFilters = () => {
    setSearch('');
    setFromDate('');
    setToDate('');
    setStatusFilter(null);
    setPriorityFilter(null);
    setFlagFilter(false);
    setLoading(true);
    setTimeout(fetchData, 0);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const renderRow = ({ item }) => {
    const badge = STATUS_BADGE[item.status] || { label: item.status, color: '#4a5568', bg: '#edf2f7' };
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('AmbulanceRequestDetail', { requestId: item.id })}
      >
        <View style={styles.rowTop}>
          <Text style={styles.patientName}>{item.patientName || '—'}</Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>
        {item.priorityFlag === 'emergency' && (
          <Text style={styles.emergencyTag}>🚨 Emergency</Text>
        )}
        {item.falseEmergencyFlag === true && (
          <Text style={styles.flaggedTag}>⚠️ Flagged: False Emergency</Text>
        )}
        <Text style={styles.rowDetail}>Employee #: {item.employeeNumber || '—'}</Text>
        <Text style={styles.rowDetail}>Initiated: {formatDateTime(item.createdAt)}</Text>
        <Text style={styles.rowDetail}>Accepted by: {item.acceptedByName || '—'}</Text>
      </TouchableOpacity>
    );
  };

  const listHeader = (
    <>
      <View style={styles.filtersCard}>
        <Text style={styles.filterLabel}>Search (name or employee number)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Sami Shaikh or FFL-00004"
          value={search}
          onChangeText={setSearch}
        />

        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.filterLabel}>From</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={fromDate}
              onChangeText={setFromDate}
            />
          </View>
          <View style={styles.dateField}>
            <Text style={styles.filterLabel}>To</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={toDate}
              onChangeText={setToDate}
            />
          </View>
        </View>

        <Text style={styles.filterLabel}>Status</Text>
        <FilterChips options={STATUS_FILTERS} selected={statusFilter} onSelect={setStatusFilter} />

        <Text style={styles.filterLabel}>Priority</Text>
        <FilterChips options={PRIORITY_FILTERS} selected={priorityFilter} onSelect={setPriorityFilter} />

        <Text style={styles.filterLabel}>False Emergency Flags</Text>
        <FilterChips options={FLAG_FILTERS} selected={flagFilter} onSelect={setFlagFilter} />

        <View style={styles.filterActions}>
          <TouchableOpacity style={styles.applyBtn} onPress={handleApplyFilters}>
            <Text style={styles.applyBtnText}>Apply Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearFilters}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {kpis && (
        <View style={styles.kpiCard}>
          <Text style={styles.kpiCardTitle}>Response Time KPIs (selected date range)</Text>
          <View style={styles.kpiGrid}>
            <KpiTile label="Total Requests" value={kpis.total ?? kpis.totalRequests ?? 0} />
            <KpiTile label="Completed" value={kpis.byStatus?.completed ?? 0} />
            <KpiTile label="Avg Response" value={kpis.avgResponseTime} unit=" min" />
            <KpiTile label="Avg Arrival" value={kpis.avgArrivalTime} unit=" min" />
            <KpiTile label="Avg Return" value={kpis.avgReturnTime} unit=" min" />
            <KpiTile label="Avg Total Trip" value={kpis.avgTotalTripTime} unit=" min" />
          </View>
        </View>
      )}

      <Text style={styles.listSectionTitle}>Requests</Text>
    </>
  );

  return (
    <View style={styles.outer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ambulance History</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.id}
          renderItem={renderRow}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No matching requests found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#f0f4f8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 60 },
  loadingText: { fontSize: 14, color: '#718096' },

  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },

  filtersCard: {
    backgroundColor: '#ffffff', margin: 16, marginBottom: 8,
    borderRadius: 12, padding: 16, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  filterLabel: { fontSize: 12, color: '#718096', marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: '#f7fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#2d3748',
  },
  dateRow: { flexDirection: 'row', gap: 12 },
  dateField: { flex: 1 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f7fafc',
  },
  chipActive: { backgroundColor: '#ebf8ff', borderColor: '#3182ce' },
  chipText: { fontSize: 12, color: '#4a5568', fontWeight: '600' },
  chipTextActive: { color: '#2b6cb0' },

  filterActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  applyBtn: {
    flex: 1, backgroundColor: '#3182ce', borderRadius: 8,
    paddingVertical: 11, alignItems: 'center',
  },
  applyBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  clearBtn: {
    flex: 1, backgroundColor: '#edf2f7', borderRadius: 8,
    paddingVertical: 11, alignItems: 'center',
  },
  clearBtnText: { color: '#4a5568', fontSize: 14, fontWeight: '600' },

  kpiCard: {
    backgroundColor: '#ffffff', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  kpiCardTitle: { fontSize: 13, fontWeight: '700', color: '#4a5568', marginBottom: 12 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiTile: {
    width: '30%', backgroundColor: '#f7fafc', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  kpiValue: { fontSize: 18, fontWeight: '800', color: '#2b6cb0' },
  kpiLabel: { fontSize: 10, color: '#718096', marginTop: 4, textAlign: 'center' },

  listSectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#4a5568',
    marginHorizontal: 16, marginTop: 4, marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  listContent: { paddingBottom: 24 },
  row: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
    marginHorizontal: 16, marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  patientName: { fontSize: 15, fontWeight: '700', color: '#2d3748' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  emergencyTag: { fontSize: 12, color: '#c53030', fontWeight: '700', marginBottom: 4 },
  flaggedTag: { fontSize: 12, color: '#9c4221', fontWeight: '700', marginBottom: 4 },
  rowDetail: { fontSize: 12, color: '#718096', marginTop: 1 },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#a0aec0' },
});