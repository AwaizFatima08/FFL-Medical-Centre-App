// app/src/screens/home/AdminHome.js

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import LogoutButton     from '../../components/LogoutButton';
import NotificationBell from '../../components/NotificationBell';
import { API } from '../../config/api';

const TILES = [
  { id: 'approvals',    label: 'User Approvals',      icon: '👤', screen: 'UserApproval',           active: true, badge: true },
  { id: 'availability', label: 'Doctor Availability',  icon: '🩺', screen: 'DoctorAvailabilityManage', active: true },
  { id: 'feedback',     label: 'Patient Feedback',     icon: '📋', screen: 'FeedbackList',            active: true },
  { id: 'directory',    label: 'Doctors Directory',    icon: '🏥', screen: 'DirectoryList',           active: true },
  { id: 'circulars',    label: 'Circulars & Notices',  icon: '📢', screen: 'Circulars',               active: true },
  { id: 'fitness',      label: 'Annual Fitness',       icon: '🏃', screen: 'FitnessAdmin',            active: true },
  { id: 'family',       label: 'Family Records',       icon: '👨‍👩‍👧‍👦', screen: 'FamilyAdminReview',      active: true },
  { id: 'donors',       label: 'Blood Donors',         icon: '🩸', screen: 'BloodDonorDirectory',     active: true },
];

export default function AdminHome({ navigation }) {
  const [pendingCount, setPendingCount] = useState(0);

  useFocusEffect(useCallback(() => {
    const fetchPendingCount = async () => {
      try {
        const auth = getAuth();
        const token = await auth.currentUser.getIdToken();
        const res = await fetch(`${API.auth}/pending-users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setPendingCount((data.data || []).length);
      } catch { /* silent fail */ }
    };
    fetchPendingCount();
  }, []));

  const handleTilePress = (tile) => {
    if (!tile.active) return;
    navigation.navigate(tile.screen, { userRole: 'admin_incharge' });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.heading}>FFL Medical Centre</Text>
          <Text style={styles.subheading}>Admin Dashboard</Text>
        </View>
        <View style={styles.headerRight}>
          <NotificationBell navigation={navigation} />
          <LogoutButton />
        </View>
      </View>

      <View style={styles.grid}>
        {TILES.map((tile) => (
          <TouchableOpacity
            key={tile.id}
            style={[styles.tile, !tile.active && styles.tileDisabled]}
            onPress={() => handleTilePress(tile)}
            activeOpacity={tile.active ? 0.7 : 1}
          >
            {tile.badge && pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCount}</Text>
              </View>
            )}
            <Text style={styles.tileIcon}>{tile.icon}</Text>
            <Text style={[styles.tileLabel, !tile.active && styles.tileLabelDisabled]}>
              {tile.label}
            </Text>
            {!tile.active && <Text style={styles.comingSoon}>Available Soon</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, backgroundColor: '#f0f4f8',
    paddingTop: 56, paddingBottom: 40, paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', width: '100%', marginBottom: 32,
  },
  headerLeft:  { flex: 1 },
  heading:     { fontSize: 22, fontWeight: 'bold', color: '#2d3748' },
  subheading:  { fontSize: 14, color: '#718096', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 28,
    width: '100%', maxWidth: 500, alignSelf: 'center',
  },
  tile: {
    width: 140, height: 140, backgroundColor: '#ffffff',
    borderRadius: 12, justifyContent: 'center',
    alignItems: 'center', padding: 12, position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  tileDisabled:      { backgroundColor: '#edf2f7', shadowOpacity: 0, elevation: 0 },
  tileIcon:          { fontSize: 36, marginBottom: 8 },
  tileLabel:         { fontSize: 13, fontWeight: '600', color: '#2d3748', textAlign: 'center' },
  tileLabelDisabled: { color: '#a0aec0' },
  comingSoon:        { fontSize: 10, color: '#a0aec0', marginTop: 4, fontStyle: 'italic' },
  badge: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: '#e53e3e', borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
});