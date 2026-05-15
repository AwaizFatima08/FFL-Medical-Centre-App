// app/src/screens/reports/ReportsHubScreen.js
// Reports hub — entry point for all reports
// Tiles shown based on role

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

const ALL_REPORTS = [
  {
    id: 'trip-day',
    label: 'Trip Day Report',
    icon: '🚌',
    subtitle: 'Today\'s confirmed bookings',
    screen: 'TripDayReport',
    roles: ['reception', 'cmo', 'doctor'],
  },
  {
    id: 'trip-monthly',
    label: 'Monthly Trip Report',
    icon: '📅',
    subtitle: 'Monthly employee facilitation',
    screen: 'TripMonthlyReport',
    roles: ['cmo'],
  },
  {
    id: 'ambulance-kpi',
    label: 'Ambulance KPIs',
    icon: '🚑',
    subtitle: 'Response & arrival times',
    screen: 'AmbulanceKPIReport',
    roles: ['cmo'],
  },
  {
    id: 'township',
    label: 'Township Population',
    icon: '🏘️',
    subtitle: 'Residents with family details',
    screen: 'TownshipReport',
    roles: ['cmo'],
  },
  {
    id: 'non-township',
    label: 'Non-Township Employees',
    icon: '🏙️',
    subtitle: 'Outstation employees',
    screen: 'NonTownshipReport',
    roles: ['cmo'],
  },
  {
    id: 'employees',
    label: 'Employee Report',
    icon: '👥',
    subtitle: 'All employees, no family details',
    screen: 'EmployeeOnlyReport',
    roles: ['cmo'],
  },
  {
    id: 'blood-groups',
    label: 'Blood Group Repository',
    icon: '🩸',
    subtitle: 'CSV download by blood group',
    screen: 'BloodGroupReport',
    roles: ['admin_incharge', 'cmo'],
  },
];

export default function ReportsHubScreen({ navigation, route }) {
  const userRole = route.params?.userRole || '';

  const visibleReports = ALL_REPORTS.filter(r => r.roles.includes(userRole));

  const handlePress = (report) => {
    const params = { userRole };
    if (report.id === 'township')     params.type = 'township';
    if (report.id === 'non-township') params.type = 'non-township';
    navigation.navigate(report.screen, params);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>Select a report to view</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {visibleReports.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>No reports available for your role</Text>
          </View>
        ) : (
          visibleReports.map(report => (
            <TouchableOpacity
              key={report.id}
              style={styles.card}
              onPress={() => handlePress(report)}
              activeOpacity={0.7}
            >
              <Text style={styles.cardIcon}>{report.icon}</Text>
              <View style={styles.cardText}>
                <Text style={styles.cardLabel}>{report.label}</Text>
                <Text style={styles.cardSubtitle}>{report.subtitle}</Text>
              </View>
              <Text style={styles.cardArrow}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:   { marginBottom: 6 },
  backText:  { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:     { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle:  { fontSize: 13, color: '#718096', marginTop: 2 },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16, gap: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  cardIcon:     { fontSize: 28 },
  cardText:     { flex: 1 },
  cardLabel:    { fontSize: 15, fontWeight: '700', color: '#2d3748' },
  cardSubtitle: { fontSize: 12, color: '#718096', marginTop: 2 },
  cardArrow:    { fontSize: 20, color: '#a0aec0', fontWeight: '300' },
  emptyState:   { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon:    { fontSize: 48 },
  emptyText:    { fontSize: 14, color: '#a0aec0' },
});