// app/src/screens/donors/BloodDonorDirectoryScreen.js
// Read-only blood donor directory — visible to all roles
// Searchable by blood group using existing /employees/blood-donors/:bloodGroup endpoint

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function BloodDonorDirectoryScreen({ navigation }) {
  const [selectedGroup, setSelectedGroup] = useState('');
  const [donors,        setDonors]        = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [searched,      setSearched]      = useState(false);
  const [error,         setError]         = useState('');

  const handleSearch = async (group) => {
    setSelectedGroup(group);
    setLoading(true);
    setError('');
    setDonors([]);
    setSearched(false);
    try {
      const auth  = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(
        `${API.employees}/blood-donors/${encodeURIComponent(group)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const data = await response.json();
      if (response.ok) {
        setDonors(data.data || []);
      } else {
        setError(data.message || 'Failed to fetch donors.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🩸 Blood Donor Directory</Text>
        <Text style={styles.subtitle}>Select a blood group to find donors</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Blood group selector */}
        <Text style={styles.sectionLabel}>Select Blood Group</Text>
        <View style={styles.groupGrid}>
          {BLOOD_GROUPS.map((group) => (
            <TouchableOpacity
              key={group}
              style={[styles.groupChip, selectedGroup === group && styles.groupChipSelected]}
              onPress={() => handleSearch(group)}
            >
              <Text style={[styles.groupChipText, selectedGroup === group && styles.groupChipTextSelected]}>
                {group}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#e53e3e" />
            <Text style={styles.loadingText}>Searching donors...</Text>
          </View>
        )}

        {/* Error */}
        {!!error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* Results */}
        {!loading && searched && !error && (
          <>
            <Text style={styles.resultsHeader}>
              {donors.length > 0
                ? `${donors.length} donor${donors.length > 1 ? 's' : ''} found for ${selectedGroup}`
                : `No donors registered for ${selectedGroup}`
              }
            </Text>
            {donors.map((donor) => (
              <View key={donor.id} style={styles.donorCard}>
                <View style={styles.bloodBadge}>
                  <Text style={styles.bloodBadgeText}>{donor.bloodGroup}</Text>
                </View>
                <View style={styles.donorInfo}>
                  <Text style={styles.donorName}>{donor.fullName}</Text>
                  <Text style={styles.donorPhone}>📞 {donor.phoneNumber || '—'}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Initial state */}
        {!loading && !searched && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🩸</Text>
            <Text style={styles.emptyText}>Select a blood group above to search for donors</Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:  { marginBottom: 8 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:    { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 13, color: '#718096', marginTop: 2 },

  scroll:        { flex: 1 },
  scrollContent: { padding: 20 },

  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#4a5568',
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  groupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  groupChip: {
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#ffffff', minWidth: 70, alignItems: 'center',
  },
  groupChipSelected:     { backgroundColor: '#e53e3e', borderColor: '#e53e3e' },
  groupChipText:         { fontSize: 15, fontWeight: '700', color: '#4a5568' },
  groupChipTextSelected: { color: '#ffffff' },

  centered:    { alignItems: 'center', paddingVertical: 32, gap: 12 },
  loadingText: { fontSize: 14, color: '#718096' },

  errorBox: {
    backgroundColor: '#fff5f5', borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#fc8181', marginBottom: 16,
  },
  errorText: { fontSize: 13, color: '#c53030' },

  resultsHeader: { fontSize: 13, color: '#718096', fontWeight: '600', marginBottom: 12 },

  donorCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    marginBottom: 10, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  bloodBadge: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#fff5f5', borderWidth: 2, borderColor: '#feb2b2',
    alignItems: 'center', justifyContent: 'center',
  },
  bloodBadgeText: { fontSize: 13, fontWeight: '800', color: '#c53030' },
  donorInfo:      { flex: 1 },
  donorName:      { fontSize: 15, fontWeight: '700', color: '#2d3748' },
  donorPhone:     { fontSize: 13, color: '#718096', marginTop: 3 },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon:  { fontSize: 48 },
  emptyText:  { fontSize: 14, color: '#a0aec0', textAlign: 'center', paddingHorizontal: 32 },
});