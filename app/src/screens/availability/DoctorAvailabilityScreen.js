// app/src/screens/availability/DoctorAvailabilityScreen.js
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

const STATUS_CONFIG = {
  available:     { label: 'Available',     color: '#276749', bg: '#c6f6d5', icon: '🟢' },
  not_available: { label: 'Not Available', color: '#742a2a', bg: '#fff5f5', icon: '🔴' },
  on_leave:      { label: 'On Leave',      color: '#744210', bg: '#fefcbf', icon: '🟡' },
};

// Phase 6 (follow-up) — expectedBackAt is stored as a plain "HH:mm"
// 24-hour string, always meaning "today". Converts it to a display
// string like "3:30 PM".
const formatTimeOfDay = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Phase 6 (follow-up) — local-date 'YYYY-MM-DD', same convention used
// throughout this project's availability screens (see Manage screen).
const toDateString = (date) => {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatLeaveDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

// Only trust scheduledLeave's dates as "the reason" a doctor shows On
// Leave if today genuinely falls inside that window. Guards against a
// stale scheduledLeave field (from a past, uncancelled leave) being
// shown alongside an unrelated, manually-set On Leave status.
const isLeaveActiveToday = (leave) => {
  if (!leave) return false;
  const today = toDateString(new Date());
  return today >= leave.startDate && today <= leave.endDate;
};

export default function DoctorAvailabilityScreen({ navigation }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Doctor Availability</Text>
        <Text style={styles.subtitle}>Live status — updated by reception</Text>
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
          {doctors.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No doctors found.</Text>
            </View>
          ) : (
            doctors.map((doctor) => {
              const config = STATUS_CONFIG[doctor.status] || STATUS_CONFIG.not_available;
              const showLeaveDate = doctor.status === 'on_leave' &&
                isLeaveActiveToday(doctor.scheduledLeave);
              return (
                <View key={doctor.id} style={styles.card}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.doctorName}>{doctor.fullName}</Text>
                    {doctor.status === 'not_available' && doctor.expectedBackAt && (
                      <Text style={styles.noteText}>
                        ⏰ Expected back around {formatTimeOfDay(doctor.expectedBackAt)}
                      </Text>
                    )}
                    {showLeaveDate && (
                      <Text style={styles.noteText}>
                        📅 Back on {formatLeaveDate(doctor.scheduledLeave.endDate)}
                      </Text>
                    )}
                    <Text style={styles.updatedAt}>
                      Last updated: {doctor.updatedAt
                        ? new Date(doctor.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
                    <Text style={styles.statusIcon}>{config.icon}</Text>
                    <Text style={[styles.statusLabel, { color: config.color }]}>
                      {config.label}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
          <Text style={styles.hint}>Pull down to refresh</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:      { flex: 1, backgroundColor: '#f0f4f8' },
  header:       { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn:      { marginBottom: 8 },
  backText:     { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:        { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle:     { fontSize: 13, color: '#718096', marginTop: 2 },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  loadingText:  { marginTop: 12, color: '#718096' },
  emptyText:    { color: '#718096', fontSize: 15 },
  list:         { padding: 20, gap: 12 },
  card:         { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
  cardLeft:     { flex: 1, marginRight: 12 },
  doctorName:   { fontSize: 16, fontWeight: '600', color: '#2d3748' },
  noteText:     { fontSize: 12, color: '#c05621', marginTop: 2 },
  updatedAt:    { fontSize: 12, color: '#a0aec0', marginTop: 4 },
  statusBadge:  { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  statusIcon:   { fontSize: 18, marginBottom: 2 },
  statusLabel:  { fontSize: 12, fontWeight: '600' },
  hint:         { textAlign: 'center', color: '#a0aec0', fontSize: 12, marginTop: 16 },
});