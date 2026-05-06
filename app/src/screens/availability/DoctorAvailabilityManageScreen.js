// app/src/screens/availability/DoctorAvailabilityManageScreen.js
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

const STATUS_CONFIG = {
  available:     { label: 'Available',     color: '#276749', bg: '#c6f6d5', icon: '🟢' },
  not_available: { label: 'Not Available', color: '#742a2a', bg: '#fff5f5', icon: '🔴' },
  on_leave:      { label: 'On Leave',      color: '#744210', bg: '#fefcbf', icon: '🟡' },
};

const STATUS_OPTIONS = [
  { value: 'available',     label: 'Available',     icon: '🟢' },
  { value: 'not_available', label: 'Not Available', icon: '🔴' },
  { value: 'on_leave',      label: 'On Leave',      icon: '🟡' },
];

export default function DoctorAvailabilityManageScreen({ navigation }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(null); // doctorId being updated

  const fetchAvailability = async () => {
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.availability}/all`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setDoctors(data.data || []);
      } else {
        alert(data.message || 'Failed to load availability.');
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
    fetchAvailability();
  }, []));

  const onRefresh = () => {
    setRefreshing(true);
    fetchAvailability();
  };

  const handleStatusChange = async (doctorId, doctorName, newStatus) => {
    const config = STATUS_CONFIG[newStatus];
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Set ${doctorName} to "${config.label}"?`)
      : true;
    if (!confirmed) return;

    setUpdating(doctorId);
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.availability}/${doctorId}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();
      if (response.ok) {
        // Update local state immediately — no need to refetch
        setDoctors(prev => prev.map(d =>
          d.id === doctorId
            ? { ...d, status: newStatus, updatedAt: new Date().toISOString() }
            : d
        ));
      } else {
        alert(data.message || 'Failed to update status.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Manage Availability</Text>
        <Text style={styles.subtitle}>Tap a status to update</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {doctors.map((doctor) => {
            const currentConfig = STATUS_CONFIG[doctor.status] || STATUS_CONFIG.not_available;
            const isUpdating = updating === doctor.id;
            return (
              <View key={doctor.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.doctorName}>{doctor.fullName}</Text>
                  <View style={[styles.currentBadge, { backgroundColor: currentConfig.bg }]}>
                    <Text style={[styles.currentLabel, { color: currentConfig.color }]}>
                      {currentConfig.icon} {currentConfig.label}
                    </Text>
                  </View>
                </View>

                {isUpdating ? (
                  <View style={styles.updatingRow}>
                    <ActivityIndicator size="small" color="#3182ce" />
                    <Text style={styles.updatingText}>Updating...</Text>
                  </View>
                ) : (
                  <View style={styles.optionsRow}>
                    {STATUS_OPTIONS.map((opt) => {
                      const isActive = doctor.status === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.optionBtn,
                            isActive && styles.optionBtnActive,
                          ]}
                          onPress={() => !isActive && handleStatusChange(doctor.id, doctor.fullName, opt.value)}
                          activeOpacity={isActive ? 1 : 0.7}
                        >
                          <Text style={styles.optionIcon}>{opt.icon}</Text>
                          <Text style={[
                            styles.optionLabel,
                            isActive && styles.optionLabelActive,
                          ]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <Text style={styles.updatedAt}>
                  Last updated: {doctor.updatedAt
                    ? new Date(doctor.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:          { flex: 1, backgroundColor: '#f0f4f8' },
  header:           { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn:          { marginBottom: 8 },
  backText:         { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:            { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle:         { fontSize: 13, color: '#718096', marginTop: 2 },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  loadingText:      { marginTop: 12, color: '#718096' },
  list:             { padding: 20, gap: 16 },
  card:             { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
  cardHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  doctorName:       { fontSize: 16, fontWeight: '600', color: '#2d3748', flex: 1, marginRight: 8 },
  currentBadge:     { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  currentLabel:     { fontSize: 12, fontWeight: '600' },
  optionsRow:       { flexDirection: 'row', gap: 8, marginBottom: 10 },
  optionBtn:        { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f7fafc' },
  optionBtnActive:  { backgroundColor: '#ebf8ff', borderColor: '#3182ce' },
  optionIcon:       { fontSize: 16, marginBottom: 2 },
  optionLabel:      { fontSize: 11, color: '#718096', fontWeight: '500', textAlign: 'center' },
  optionLabelActive:{ color: '#2b6cb0', fontWeight: '700' },
  updatingRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, marginBottom: 10 },
  updatingText:     { color: '#718096', fontSize: 14 },
  updatedAt:        { fontSize: 11, color: '#a0aec0' },
});