// app/src/screens/ambulance/AmbulanceReceptionHubScreen.js
// Reception's ambulance management screen.
// Shows all active requests + button to raise new request on behalf of employee.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';

const STATUS_LABELS = {
  pending:    { label: 'Pending',    color: '#d69e2e', bg: '#fefcbf' },
  accepted:   { label: 'Accepted',   color: '#2b6cb0', bg: '#ebf8ff' },
  dispatched: { label: 'Dispatched', color: '#6b46c1', bg: '#faf5ff' },
  picked_up:  { label: 'Picked Up',  color: '#276749', bg: '#f0fff4' },
  returned:   { label: 'Returned',   color: '#c05621', bg: '#fffaf0' },
  completed:  { label: 'Completed',  color: '#22543d', bg: '#c6f6d5' },
  cancelled:  { label: 'Cancelled',  color: '#742a2a', bg: '#fff5f5' },
};

const PRIORITY_COLORS = {
  emergency: { color: '#c53030', bg: '#fff5f5' },
  routine:   { color: '#4a5568', bg: '#edf2f7' },
};

export default function AmbulanceReceptionHubScreen({ navigation }) {
  const [requests, setRequests]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequests = async () => {
    try {
      const auth  = getAuth();
      const token = await auth.currentUser.getIdToken();

      const response = await fetch(
        'https://asia-south1-ffl-medical-centre-app.cloudfunctions.net/api/ambulance/active',
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      const data = await response.json();
      if (response.ok) {
        setRequests(data.data || []);
      } else {
        alert(data.message || 'Failed to load requests.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh list every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchRequests();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const renderRequest = (item) => {
    const statusStyle   = STATUS_LABELS[item.status]   || { label: item.status,   color: '#4a5568', bg: '#edf2f7' };
    const priorityStyle = PRIORITY_COLORS[item.priorityFlag] || PRIORITY_COLORS.routine;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        onPress={() => navigation.navigate('AmbulanceRequestDetail', { requestId: item.id })}
        activeOpacity={0.8}
      >
        {/* Top row — patient name + priority badge */}
        <View style={styles.cardHeader}>
          <Text style={styles.patientName}>{item.patientName}</Text>
          <View style={[styles.badge, { backgroundColor: priorityStyle.bg }]}>
            <Text style={[styles.badgeText, { color: priorityStyle.color }]}>
              {item.priorityFlag === 'emergency' ? '🚨 Emergency' : 'Routine'}
            </Text>
          </View>
        </View>

        {/* Condition */}
        <Text style={styles.condition} numberOfLines={2}>{item.patientCondition}</Text>

        {/* Bottom row — status + vehicle */}
        <View style={styles.cardFooter}>
          <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.badgeText, { color: statusStyle.color }]}>
              {statusStyle.label}
            </Text>
          </View>
          <Text style={styles.vehicleText}>
            {item.vehicleAssigned === 'BLS' ? '🚑 BLS' : '🚐 Mini'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ambulance Dispatch</Text>
      </View>

      {/* Raise new request button */}
      <TouchableOpacity
        style={styles.newRequestBtn}
        onPress={() => navigation.navigate('AmbulanceRequestReception')}
      >
        <Text style={styles.newRequestText}>+ Raise New Request</Text>
      </TouchableOpacity>

      {/* Active requests list */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {requests.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyText}>No active requests</Text>
              <Text style={styles.emptySubtext}>Pull down to refresh</Text>
            </View>
          ) : (
            requests.map(renderRequest)
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginBottom: 6 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  newRequestBtn: {
    margin: 16,
    backgroundColor: '#3182ce',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  newRequestText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2d3748',
    flex: 1,
    marginRight: 8,
  },
  condition: {
    fontSize: 13,
    color: '#718096',
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  vehicleText: {
    fontSize: 12,
    color: '#718096',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#718096',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
    gap: 8,
  },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#4a5568' },
  emptySubtext: { fontSize: 13, color: '#a0aec0' },
});
