// app/src/screens/directory/DirectoryListScreen.js
// Flow 5 — Doctor Directory
// Visible to: employee, reception, doctor, cmo, admin_incharge
// Admin can add/edit entries

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, Modal, FlatList,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

const ALL = 'All';

const CITY_FILTERS = [
  ALL, 'Rahimyarkhan', 'Sadiqabad', 'Bahawalpur',
  'Lahore', 'Islamabad', 'Multan', 'Karachi', 'Other',
];

const SPECIALITY_FILTERS = [
  ALL,
  'General Physician', 'Consultant Physician', 'General Surgeon',
  'Pediatrician', 'Gynecologist', 'Urologist', 'Nephrologist',
  'Cardiologist', 'Cardiac Surgeon', 'Dentist', 'Physiotherapist',
  'Pulmonologist', 'Immunologist', 'Gastroenterologist', 'Rheumatologist',
  'Psychologist', 'Psychiatrist', 'Neurologist', 'Neurosurgeon',
  'Dermatologist', 'Ophthalmologist', 'ENT Consultant', 'Pathologist',
  'Clinical Hematologist', 'Radiologist', 'Oncologist',
  'Pediatric Surgeon', 'Pediatric Nephrologist', 'Pediatric Cardiologist', 'Other',
];

export default function DirectoryListScreen({ navigation, route }) {
  const { userRole } = route.params || {};

  const [entries, setEntries]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [searchText, setSearchText]         = useState('');
  const [cityFilter, setCityFilter]         = useState(ALL);
  const [specFilter, setSpecFilter]         = useState(ALL);
  const [showSpecModal, setShowSpecModal]   = useState(false);
  const [specSearch, setSpecSearch]         = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchDirectory = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.directory}/list`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setEntries(data.data || []);
      } else {
        alert(data.message || 'Failed to load directory.');
      }
    } catch {
      alert('Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setSearchText('');
    setCityFilter(ALL);
    setSpecFilter(ALL);
    fetchDirectory();
  }, []));

  const onRefresh = () => {
    setRefreshing(true);
    fetchDirectory();
  };

  const filtered = entries.filter(e => {
    const lower = searchText.toLowerCase();
    const matchesSearch = !lower.trim() || (
      e.name?.toLowerCase().includes(lower) ||
      e.speciality?.toLowerCase().includes(lower) ||
      e.hospital?.toLowerCase().includes(lower) ||
      e.city?.toLowerCase().includes(lower)
    );
    const matchesCity = cityFilter === ALL || e.city === cityFilter;
    const matchesSpec = specFilter === ALL || e.speciality === specFilter;
    return matchesSearch && matchesCity && matchesSpec;
  });

  const activeFilterCount = (cityFilter !== ALL ? 1 : 0) + (specFilter !== ALL ? 1 : 0);

  const filteredSpecialities = SPECIALITY_FILTERS.filter(s =>
    s.toLowerCase().includes(specSearch.toLowerCase())
  );

  const renderEntry = (item) => (
    <TouchableOpacity
      key={item.id}
      style={styles.card}
      onPress={() => navigation.navigate('DirectoryDetail', { entryId: item.id, userRole })}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.doctorName}>{item.name}</Text>
        <View style={styles.cityBadge}>
          <Text style={styles.cityText}>{item.city || '—'}</Text>
        </View>
      </View>
      <Text style={styles.speciality}>{item.speciality || 'General'}</Text>
      <Text style={styles.hospital} numberOfLines={1}>🏥 {item.hospital || '—'}</Text>
      <Text style={styles.phone}>📞 {item.phone || '—'}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Doctors Directory</Text>
        <Text style={styles.subtitle}>RYK · Sadiqabad · Other Cities</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, speciality, hospital or city..."
          placeholderTextColor="#a0aec0"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {/* Filter row — city chips + speciality dropdown */}
      <View style={styles.filterBar}>
        {/* City chips — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cityRow}
          style={styles.cityScroll}
        >
          {CITY_FILTERS.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.cityChip, cityFilter === c && styles.cityChipSelected]}
              onPress={() => setCityFilter(c)}
            >
              <Text style={[styles.cityChipText, cityFilter === c && styles.cityChipTextSelected]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Speciality dropdown button */}
        <TouchableOpacity
          style={[styles.specDropdownBtn, specFilter !== ALL && styles.specDropdownBtnActive]}
          onPress={() => { setSpecSearch(''); setShowSpecModal(true); }}
        >
          <Text
            style={[styles.specDropdownText, specFilter !== ALL && styles.specDropdownTextActive]}
            numberOfLines={1}
          >
            {specFilter === ALL ? '🩺 Speciality' : specFilter}
          </Text>
          <Text style={styles.specDropdownArrow}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* Results count + clear */}
      <View style={styles.resultsBar}>
        <Text style={styles.resultsCount}>
          {filtered.length} {filtered.length === 1 ? 'doctor' : 'doctors'}
          {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active` : ''}
        </Text>
        {activeFilterCount > 0 && (
          <TouchableOpacity onPress={() => { setCityFilter(ALL); setSpecFilter(ALL); }}>
            <Text style={styles.clearFilters}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Add button — admin only */}
      {userRole === 'admin_incharge' && (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('DirectoryAddEdit', { entryId: null, userRole })}
        >
          <Text style={styles.addBtnText}>+ Add Doctor</Text>
        </TouchableOpacity>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading directory...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>
                {entries.length === 0 ? 'No doctors added yet.' : 'No results match your filters.'}
              </Text>
              <Text style={styles.emptySubtext}>Pull down to refresh</Text>
            </View>
          ) : (
            filtered.map(renderEntry)
          )}
        </ScrollView>
      )}

      {/* Speciality picker modal */}
      <Modal
        visible={showSpecModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSpecModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Speciality</Text>
              <TouchableOpacity onPress={() => setShowSpecModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              value={specSearch}
              onChangeText={setSpecSearch}
              placeholder="Search speciality..."
              placeholderTextColor="#a0aec0"
              autoFocus
            />
            <FlatList
              data={filteredSpecialities}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, specFilter === item && styles.modalItemSelected]}
                  onPress={() => { setSpecFilter(item); setShowSpecModal(false); }}
                >
                  <Text style={[styles.modalItemText, specFilter === item && styles.modalItemTextSelected]}>
                    {item}
                  </Text>
                  {specFilter === item && <Text style={styles.modalItemCheck}>✓</Text>}
                </TouchableOpacity>
              )}
              style={styles.modalList}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginBottom: 6 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 13, color: '#718096', marginTop: 2 },

  searchRow: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  searchInput: {
    backgroundColor: '#f7fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 14, color: '#2d3748',
  },

  filterBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
  },
  cityScroll: { flex: 1 },
  cityRow: { paddingHorizontal: 12, gap: 6 },
  cityChip: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16,
    paddingHorizontal: 11, paddingVertical: 5, backgroundColor: '#f7fafc',
  },
  cityChipSelected: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  cityChipText: { fontSize: 12, color: '#4a5568', fontWeight: '600' },
  cityChipTextSelected: { color: '#ffffff' },

  specDropdownBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16,
    paddingHorizontal: 11, paddingVertical: 5,
    backgroundColor: '#f7fafc', marginRight: 12,
    maxWidth: 140,
  },
  specDropdownBtnActive: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  specDropdownText: { fontSize: 12, color: '#4a5568', fontWeight: '600', flex: 1 },
  specDropdownTextActive: { color: '#ffffff' },
  specDropdownArrow: { fontSize: 11, color: '#718096', marginLeft: 4 },

  resultsBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 7,
    backgroundColor: '#f7fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  resultsCount: { fontSize: 12, color: '#718096', fontWeight: '600' },
  clearFilters: { fontSize: 12, color: '#3182ce', fontWeight: '700' },

  addBtn: {
    margin: 12, marginBottom: 4, backgroundColor: '#3182ce',
    borderRadius: 8, paddingVertical: 11, alignItems: 'center',
  },
  addBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

  list: { flex: 1 },
  listContent: { padding: 12 },
  card: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 4,
  },
  doctorName: { fontSize: 16, fontWeight: '700', color: '#2d3748', flex: 1, marginRight: 8 },
  cityBadge: { backgroundColor: '#ebf8ff', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  cityText: { fontSize: 12, color: '#2b6cb0', fontWeight: '600' },
  speciality: { fontSize: 13, color: '#3182ce', fontWeight: '600', marginBottom: 6 },
  hospital: { fontSize: 13, color: '#4a5568', marginBottom: 3 },
  phone: { fontSize: 13, color: '#4a5568' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  loadingText: { marginTop: 10, color: '#718096', fontSize: 14 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#4a5568', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#a0aec0', marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '75%', paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#2d3748' },
  modalClose: { fontSize: 18, color: '#718096', fontWeight: '600' },
  modalSearch: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: '#f7fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: '#2d3748',
  },
  modalList: { marginTop: 4 },
  modalItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#f7fafc',
  },
  modalItemSelected: { backgroundColor: '#ebf8ff' },
  modalItemText: { fontSize: 14, color: '#2d3748' },
  modalItemTextSelected: { color: '#2b6cb0', fontWeight: '700' },
  modalItemCheck: { fontSize: 14, color: '#2b6cb0', fontWeight: '700' },
});