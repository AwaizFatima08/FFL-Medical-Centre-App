// app/src/screens/directory/DirectoryDetailScreen.js
import { webAlert, webConfirm } from '../../utils/webAlert';
// Flow 5 — Doctor Directory
// View full details of a single doctor entry
// Visible to: employee, reception, doctor, cmo
// Admin can also edit/delete from this screen

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

export default function DirectoryDetailScreen({ navigation, route }) {
  const { entryId, userRole } = route.params || {};

  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchEntry = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.directory}/${entryId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setEntry(data.data);
      } else {
        webAlert('Error', data.message || 'Failed to load doctor details.');
        navigation.goBack();
      }
    } catch (error) {
      webAlert('Error', 'Network error. Please check your connection.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchEntry();
  }, [entryId]));

  const handleDelete = () => {
    webConfirm(
      'Delete Doctor',
      `Are you sure you want to remove ${entry?.name} from the directory?`,
      async () => {
        setDeleting(true);
        try {
          const token = await getToken();
          const response = await fetch(`${API.directory}/${entryId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await response.json();
          if (response.ok) {
            navigation.goBack();
          } else {
            webAlert('Error', data.message || 'Failed to delete entry.');
          }
        } catch (error) {
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setDeleting(false);
        }
      },
      true, 'Delete'
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3182ce" />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  if (!entry) return null;

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Doctor Details</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Name card */}
        <View style={styles.nameCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {entry.name?.charAt(0)?.toUpperCase() || 'D'}
            </Text>
          </View>
          <Text style={styles.doctorName}>{entry.name}</Text>
          <Text style={styles.speciality}>{entry.speciality || 'General Physician'}</Text>
          {entry.city && (
            <View style={styles.cityBadge}>
              <Text style={styles.cityText}>{entry.city}</Text>
            </View>
          )}
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact & Location</Text>

          <DetailRow icon="🏥" label="Hospital" value={entry.hospital} />
          <DetailRow icon="📍" label="Address" value={entry.address} />
          <DetailRow icon="📞" label="Phone" value={entry.phone} />
        </View>

        {/* Admin actions */}
        {userRole === 'admin_incharge' && (
          <View style={styles.adminActions}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('DirectoryAddEdit', { entryId, userRole })}
            >
              <Text style={styles.editBtnText}>✏️  Edit Doctor</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              disabled={deleting}
            >
              <Text style={styles.deleteBtnText}>
                {deleting ? 'Deleting...' : '🗑️  Delete Doctor'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// Reusable detail row
function DetailRow({ icon, label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailIcon}>{icon}</Text>
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value || '—'}</Text>
      </View>
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

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  nameCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ebf8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: 'bold', color: '#2b6cb0' },
  doctorName: { fontSize: 20, fontWeight: 'bold', color: '#2d3748', textAlign: 'center' },
  speciality: { fontSize: 14, color: '#3182ce', fontWeight: '600', marginTop: 4 },
  cityBadge: {
    backgroundColor: '#ebf8ff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 8,
  },
  cityText: { fontSize: 13, color: '#2b6cb0', fontWeight: '600' },

  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#a0aec0',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f7fafc',
  },
  detailIcon: { fontSize: 18, marginRight: 12, marginTop: 2 },
  detailText: { flex: 1 },
  detailLabel: { fontSize: 12, color: '#a0aec0', fontWeight: '600', marginBottom: 2 },
  detailValue: { fontSize: 15, color: '#2d3748' },

  adminActions: { gap: 10, marginBottom: 30 },
  editBtn: {
    backgroundColor: '#3182ce',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  editBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  deleteBtn: {
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#feb2b2',
  },
  deleteBtnText: { color: '#c53030', fontWeight: '700', fontSize: 15 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#718096', fontSize: 14 },
});