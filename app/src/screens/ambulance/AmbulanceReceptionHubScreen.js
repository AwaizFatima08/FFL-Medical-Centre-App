// app/src/screens/ambulance/AmbulanceReceptionHubScreen.js
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { PURPOSE_OF_VISIT_OPTIONS } from '../../constants';

// Day 16 (Phase 5, Step 5.2 fix) — display-label lookup for purposeOfVisit
const PURPOSE_LABELS = Object.fromEntries(
  PURPOSE_OF_VISIT_OPTIONS.map(opt => [opt.value, opt.label])
);

const STATUS_LABELS = {
  pending: { label: 'Pending Review', color: '#d69e2e', bg: '#fefcbf', icon: '⏳' },
  accepted: { label: 'Accepted', color: '#2b6cb0', bg: '#ebf8ff', icon: '✅' },
  dispatched: { label: 'Dispatched', color: '#6b46c1', bg: '#faf5ff', icon: '🚀' },
  picked_up: { label: 'Picked Up', color: '#276749', bg: '#f0fff4', icon: '🏥' },
  returned: { label: 'Returned', color: '#c05621', bg: '#fffaf0', icon: '🔄' },
  completed: { label: 'Completed', color: '#22543d', bg: '#c6f6d5', icon: '✅' },
  cancelled: { label: 'Cancelled', color: '#742a2a', bg: '#fff5f5', icon: '❌' },
};

export default function AmbulanceReceptionHubScreen({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequests = async () => {
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.ambulance}/active`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
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

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchRequests();
  }, []));

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const getRequestTypeInfo = (request) => {
    const isEmergency = request.priorityFlag === 'emergency';
    const requestedBy = request.requestedByType === 'employee' ? 'Employee (Self)' : 'Reception';
    
    return {
      isEmergency,
      requestedBy,
      timeAgo: getTimeAgo(request.createdAt)
    };
  };

  const getTimeAgo = (dateString) => {
    const now = new Date();
    const created = new Date(dateString);
    const diffInMinutes = Math.floor((now - created) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const getActionNeeded = (status) => {
    switch (status) {
      case 'pending': return 'Needs Review';
      case 'accepted': return 'Ready to Assign';
      case 'dispatched': return 'En Route';
      case 'picked_up': return 'Patient Onboard';
      case 'returned': return 'Ready to Complete';
      default: return '';
    }
  };

  const renderRequest = (item) => {
    const statusStyle = STATUS_LABELS[item.status] || { label: item.status, color: '#4a5568', bg: '#edf2f7', icon: '📋' };
    const { isEmergency, requestedBy, timeAgo } = getRequestTypeInfo(item);
    const actionNeeded = getActionNeeded(item.status);

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, isEmergency && styles.cardEmergency]}
        onPress={() => navigation.navigate('AmbulanceRequestDetail', { requestId: item.id })}
        activeOpacity={0.8}
      >
        {isEmergency && (
          <View style={styles.emergencyStripe}>
            <Text style={styles.emergencyLabel}>🚨 EMERGENCY</Text>
          </View>
        )}
        
        <View style={styles.cardHeader}>
          <View style={styles.patientInfo}>
            <Text style={styles.patientName}>{item.patientName}</Text>
            <Text style={styles.patientRelation}>
              {item.patientRelation} • {requestedBy}
            </Text>
          </View>
          {item.queuePosition && (
            <View style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>
                {item.queuePosition === 1 ? 'Now' : `#${item.queuePosition}`}
              </Text>
            </View>
          )}
          <Text style={styles.timeStamp}>{timeAgo}</Text>
        </View>

        <Text style={styles.condition} numberOfLines={2}>
          {item.patientCondition}
        </Text>
        {item.purposeOfVisit && PURPOSE_LABELS[item.purposeOfVisit] && (
          <Text style={styles.purposeText}>
            {PURPOSE_LABELS[item.purposeOfVisit]}
          </Text>
        )}

        <View style={styles.locationInfo}>
          <Text style={styles.locationText} numberOfLines={1}>
            📍 {item.pickupLocation || 'Location TBD'}
          </Text>
          {item.tripType === 'intercity' && (
            <Text style={styles.intercityBadge}>Intercity</Text>
          )}
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.color }]}>
                {statusStyle.icon} {statusStyle.label}
              </Text>
            </View>
            <Text style={styles.vehicleText}>
              {item.vehicleAssigned === 'BLS' ? '🚑 BLS' : '🚐 Mini'}
            </Text>
          </View>
          
          {actionNeeded && (
            <View style={styles.actionNeeded}>
              <Text style={styles.actionText}>{actionNeeded}</Text>
            </View>
          )}
        </View>

        {item.assignedDriver && (
          <View style={styles.driverInfo}>
            <Text style={styles.driverText}>
              👤 Driver: {item.assignedDriver.substring(0, 8)}...
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const acceptedCount = requests.filter(r => r.status === 'accepted').length;
  const activeCount = requests.filter(r => ['dispatched', 'picked_up'].includes(r.status)).length;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ambulance Dispatch</Text>
        
        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{acceptedCount}</Text>
            <Text style={styles.statLabel}>Ready</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{activeCount}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.newRequestBtn}
        onPress={() => navigation.navigate('AmbulanceRequestReception')}
      >
        <Text style={styles.newRequestText}>+ Raise New Request</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2d3748', marginBottom: 16 },
  
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#3182ce' },
  statLabel: { fontSize: 12, color: '#4a5568', marginTop: 2 },
  
  newRequestBtn: {
    margin: 16, backgroundColor: '#3182ce', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  newRequestText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#4a5568', fontSize: 16 },
  
  list: { flex: 1 },
  listContent: { padding: 16, paddingTop: 0 },
  
  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    borderLeftWidth: 4, borderLeftColor: '#e2e8f0',
  },
  cardEmergency: {
    borderLeftColor: '#e53e3e',
    borderWidth: 1, borderColor: '#fed7d7',
  },
  
  emergencyStripe: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: '#fed7d7', paddingVertical: 4, borderTopLeftRadius: 12, borderTopRightRadius: 12,
  },
  emergencyLabel: {
    color: '#c53030', fontSize: 12, fontWeight: 'bold', textAlign: 'center',
  },
  
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 8, marginTop: 4,
  },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 18, fontWeight: 'bold', color: '#2d3748' },
  patientRelation: { fontSize: 14, color: '#4a5568', marginTop: 2 },
  timeStamp: { fontSize: 12, color: '#718096', marginLeft: 12 },
  queueBadge: {
    backgroundColor: '#edf2f7', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8,
  },
  queueBadgeText: { fontSize: 12, fontWeight: '700', color: '#4a5568' },
  
  condition: {
    fontSize: 14, color: '#4a5568', marginBottom: 12,
    fontStyle: 'italic', lineHeight: 20,
  },
  purposeText: {
    fontSize: 12, color: '#718096', marginTop: -8, marginBottom: 12,
  },
  
  locationInfo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  locationText: { fontSize: 14, color: '#2d3748', flex: 1 },
  intercityBadge: {
    backgroundColor: '#fefcbf', color: '#d69e2e', paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 4, fontSize: 12, fontWeight: '600',
  },
  
  cardFooter: { marginTop: 8 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  vehicleText: { fontSize: 12, color: '#4a5568', fontWeight: '600' },
  
  actionNeeded: { marginTop: 8, alignSelf: 'flex-start' },
  actionText: {
    fontSize: 12, color: '#3182ce', fontWeight: '600',
    backgroundColor: '#ebf8ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  
  driverInfo: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  driverText: { fontSize: 12, color: '#4a5568' },
  
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#4a5568', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#718096' },
});