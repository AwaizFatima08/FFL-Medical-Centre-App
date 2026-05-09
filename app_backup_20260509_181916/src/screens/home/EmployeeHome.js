// app/src/screens/home/EmployeeHome.js

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import LogoutButton      from '../../components/LogoutButton';
import NotificationBell  from '../../components/NotificationBell';

const TILES = [
  {
    id: 'ambulance',
    label: 'Request Ambulance',
    icon: '🚑',
    screen: 'AmbulanceRequest',
    active: true,
  },
  {
    id: 'trip',
    label: 'Medical Trip',
    icon: '🚌',
    screen: 'TripMyBooking',
    active: true,
  },
  {
    id: 'directory',
    label: 'Doctors Directory',
    icon: '🏥',
    screen: 'DirectoryList',
    active: true,
  },
  {
    id: 'feedback',
    label: 'Feedback',
    icon: '📋',
    screen: 'Feedback',
    active: true,
  },
  {
    id: 'availability',
    label: 'Doctor Availability',
    icon: '👨‍⚕️',
    screen: 'DoctorAvailability',
    active: true,
  },
  {
    id: 'family',
    label: 'My Family',
    icon: '👨‍👩‍👧‍👦',
    screen: 'FamilyMemberList',
    active: true,
  },
  {
    id: 'vaccination',
    label: 'Vaccination',
    icon: '💉',
    screen: 'VaccinationChildList',
    active: true,
  },
  {
    id: 'circulars',
    label: 'Circulars & Notices',
    icon: '📢',
    screen: 'Circulars',
    active: true,
  },
  {
    id: 'fitness',
    label: 'Annual Fitness',
    icon: '🏃',
    screen: 'FitnessEmployee',
    active: true,
  },
];

export default function EmployeeHome({ navigation }) {
  const handleTilePress = (tile) => {
    if (!tile.active) {
      alert('Coming Soon');
      return;
    }
    navigation.navigate(tile.screen, { userRole: 'employee' });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header row: logout left, bell right */}
      <View style={styles.headerRow}>
        <LogoutButton />
        <NotificationBell navigation={navigation} />
      </View>

      <Text style={styles.heading}>FFL Medical Centre</Text>
      <Text style={styles.subheading}>Employee Portal</Text>

      <View style={styles.grid}>
        {TILES.map((tile) => (
          <TouchableOpacity
            key={tile.id}
            style={[styles.tile, !tile.active && styles.tileDisabled]}
            onPress={() => handleTilePress(tile)}
            activeOpacity={tile.active ? 0.7 : 1}
          >
            <Text style={styles.tileIcon}>{tile.icon}</Text>
            <Text style={[styles.tileLabel, !tile.active && styles.tileLabelDisabled]}>
              {tile.label}
            </Text>
            {!tile.active && <Text style={styles.comingSoon}>Coming Soon</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, backgroundColor: '#f0f4f8',
    alignItems: 'center', paddingTop: 56,
    paddingBottom: 40, paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  heading:    { fontSize: 22, fontWeight: 'bold', color: '#2d3748', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#718096', marginBottom: 36 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 16,
    width: '100%', maxWidth: 500,
  },
  tile: {
    width: 140, height: 140, backgroundColor: '#ffffff',
    borderRadius: 12, justifyContent: 'center',
    alignItems: 'center', padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  tileDisabled:      { backgroundColor: '#edf2f7', shadowOpacity: 0, elevation: 0 },
  tileIcon:          { fontSize: 36, marginBottom: 8 },
  tileLabel:         { fontSize: 13, fontWeight: '600', color: '#2d3748', textAlign: 'center' },
  tileLabelDisabled: { color: '#a0aec0' },
  comingSoon:        { fontSize: 10, color: '#a0aec0', marginTop: 4 },
});