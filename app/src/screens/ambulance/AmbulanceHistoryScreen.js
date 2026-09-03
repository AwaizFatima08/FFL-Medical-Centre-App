// app/src/screens/ambulance/AmbulanceHistoryScreen.js
// Day 19 (Phase 5.9) — reception-only browse/search screen for completed
// and cancelled ambulance requests. Deliberately standalone rather than
// folded into the CMO/Doctor dashboard (Phase 5.8, separate) — per Homi's
// call, this is reception's day-to-day operational history, not a CMO
// report. Employee-side history was deliberately NOT built here — the
// employee already has their own notifications covering this ground.
//
// Backend: extends the existing reportRoutes.js GET /ambulance route
// (already covered date range + priority filter + role gating including
// reception) rather than a new endpoint — see that file's Day 19 notes.
// In-app only; no PDF/CSV export for this screen.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, TextInput, FlatList,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

// NOTE: assumes a `reports` base path exists in app/src/config/api.js
// (e.g. API.reports === `${BASE_URL}/reports`), matching the pattern
// already used for API.ambulance and API.auth elsewhere in this app.
// Please confirm the actual key name in config/api.js before wiring this
// in — if it's named differently, only this one reference needs updating.

const STATUS_FILTERS = [
  { value: null,        label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_FILTERS = [
  { value: null,        label: 'All' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'routine',   label: 'Routine' },
];

const STATUS_BADGE = {
  completed: { label: 'Completed', color: '#22543d', bg: '#c6f6d5' },
  cancelled: { label: 'Cancelled', color: '#742a2a', bg: '#fff5f5' },
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

export default function AmbulanceHistoryScreen({ navigation }) {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests]     = useState([]);

  const [search, setSearch]     = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const [statusFilter, setStatusFilter]     = useState(null); // null = both completed + cancelled
  const [priorityFilter, setPriorityFilter] = useState(null);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchHistory = async () => {
    try {
      const token = await getToken();

      // Default scope for this screen is completed + cancelled only.
      // If the user narrows to one via the chips, send just that value.
      const statusParam = statusFilter || 'completed,cancelled';

      const params = new URLSearchParams();
      params.set('status', statusParam);
      if (fromDate.trim())       params.set('fromDate', fromDate.trim());
      if (toDate.trim())         params.set('toDate', toDate.trim());
      if (search.trim())         params.set('employeeSearch', search.trim());
      if (priorityFilter)        params.set('priorityFlag', priorityFilter);

      const response = await fetch(`${API.reports}/ambulance?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setRequests(data.data?.requests || []);
      } else {
        alert(data.message || 'Failed to load ambulance history.');
      }
    } catch (error) {
      alert('Network error.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchHistory();
  }, []));

  const handleApplyFilters = () => {
    setLoading(true);
    fetchHistory();
  };

  const handleClearFilters = () => {
    setSearch('');
    setFromDate('');
    setToDate('');
    setStatusFilter(null);
    setPriorityFilter(null);
    setLoading(true);
    // fetchHistory reads current state, so clear first then fetch on next tick
    setTimeout(fetchHistory, 0);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
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
        <Text style={styles.rowDetail}>Employee #: {item.employeeNumber || '—'}</Text>
        <Text style={styles.rowDetail}>Initiated: {formatDateTime(item.createdAt)}</Text>
        <Text style={styles.rowDetail}>Accepted by: {item.acceptedByName || '—'}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.outer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ambulance History</Text>
      </View>

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

        <View style={styles.filterActions}>
          <TouchableOpacity style={styles.applyBtn} onPress={handleApplyFilters}>
            <Text style={styles.applyBtnText}>Apply Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearFilters}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.id}
          renderItem={renderRow}
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

  listContent: { padding: 16, paddingTop: 8, gap: 10 },
  row: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1, marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  patientName: { fontSize: 15, fontWeight: '700', color: '#2d3748' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  emergencyTag: { fontSize: 12, color: '#c53030', fontWeight: '700', marginBottom: 4 },
  rowDetail: { fontSize: 12, color: '#718096', marginTop: 1 },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#a0aec0' },
});