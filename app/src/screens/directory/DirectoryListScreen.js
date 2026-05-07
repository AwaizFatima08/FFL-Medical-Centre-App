// app/src/screens/directory/DirectoryListScreen.js
// Flow 5 — Doctor Directory
// Visible to: employee, reception, doctor, cmo
// Admin can add/edit entries (navigates to DirectoryAddEditScreen)

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

export default function DirectoryListScreen({ navigation, route }) {
  const { userRole } = route.params || {};

  const [entries, setEntries] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');

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
        setFiltered(data.data || []);
      } else {
        alert(data.message || 'Failed to load directory.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setSearchText('');
    fetchDirectory();
  }, []));

  const onRefresh = () => {
    setRefreshing(true);
    fetchDirectory();
  };

  const handleSearch = (text) => {
    setSearchText(text);
    const lower = text.toLowerCase();
    if (!lower.trim()) {
      setFiltered(entries);
      return;
    }
    const results = entries.filter(e =>
      e.name?.toLowerCase().includes(lower) ||
      e.speciality?.toLowerCase().includes(lower) ||
      e.hospital?.toLowerCase().includes(lower) ||
      e.city?.toLowerCase().includes(lower)
    );
    setFiltered(results);
  };

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
          onChangeText={handleSearch}
        />
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
                {searchText.trim() ? 'No results found.' : 'No doctors added yet.'}
              </Text>
              <Text style={styles.emptySubtext}>Pull down to refresh</Text>
            </View>
          ) : (
            filtered.map(renderEntry)
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },

  header: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginBottom: 6 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 13, color: '#718096', marginTop: 2 },

  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchInput: {
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#2d3748',
  },

  addBtn: {
    margin: 16,
    marginBottom: 4,
    backgroundColor: '#3182ce',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  addBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

  list: { flex: 1 },
  listContent: { padding: 16, paddingTop: 12 },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  doctorName: { fontSize: 16, fontWeight: '700', color: '#2d3748', flex: 1, marginRight: 8 },
  cityBadge: {
    backgroundColor: '#ebf8ff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
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
});