// app/src/screens/vaccination/VaccinationChildDetailScreen.js
import { webAlert, webConfirm } from '../../utils/webAlert';

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import {
  getFirestore, collection, query, where,
  getDocs, doc, getDoc, orderBy,
} from 'firebase/firestore';
import NotificationBell from '../../components/NotificationBell';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calculateAge(dobTimestamp) {
  if (!dobTimestamp) return '—';
  const dob   = dobTimestamp.toDate ? dobTimestamp.toDate() : new Date(dobTimestamp);
  const today = new Date();
  let years   = today.getFullYear() - dob.getFullYear();
  let months  = today.getMonth()    - dob.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0) return `${months} months`;
  if (years < 2)   return `${years}y ${months}m`;
  return `${years} years`;
}

function isOverdue(plannedTimestamp) {
  if (!plannedTimestamp) return false;
  const pd = plannedTimestamp.toDate ? plannedTimestamp.toDate() : new Date(plannedTimestamp);
  return pd < new Date();
}

function isDueSoon(plannedTimestamp) {
  if (!plannedTimestamp) return false;
  const pd   = plannedTimestamp.toDate ? plannedTimestamp.toDate() : new Date(plannedTimestamp);
  const soon = new Date();
  soon.setDate(soon.getDate() + 14);
  return pd >= new Date() && pd <= soon;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, plannedDate }) {
  let bg, color, label;
  switch (status) {
    case 'administered':
      bg = '#d1fae5'; color = '#065f46'; label = '✓ Given'; break;
    case 'missed':
      bg = '#fee2e2'; color = '#991b1b'; label = '✕ Missed'; break;
    case 'na':
      bg = '#f3f4f6'; color = '#6b7280'; label = 'N/A'; break;
    default: // scheduled
      if (isOverdue(plannedDate)) {
        bg = '#fee2e2'; color = '#991b1b'; label = 'Overdue';
      } else if (isDueSoon(plannedDate)) {
        bg = '#fef3c7'; color = '#92400e'; label = 'Due Soon';
      } else {
        bg = '#eff6ff'; color = '#1e40af'; label = 'Scheduled';
      }
  }
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function VaccinationChildDetailScreen({ route, navigation }) {
  const { childId, childName } = route.params;

  const [child,      setChild]      = useState(null);
  const [mother,     setMother]     = useState(null);
  const [employee,   setEmployee]   = useState(null);
  const [records,    setRecords]    = useState([]);
  const [grouped,    setGrouped]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);

  const db = getFirestore();

  // ─── Fetch all data ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setError(null);

      // Child record
      const childSnap = await getDoc(doc(db, 'familyMembers', childId));
      if (!childSnap.exists()) throw new Error('Child record not found');
      const childData = { id: childSnap.id, ...childSnap.data() };
      setChild(childData);

      // Mother record
      if (childData.motherId) {
        const motherSnap = await getDoc(doc(db, 'familyMembers', childData.motherId));
        if (motherSnap.exists()) setMother(motherSnap.data());
      }

      // Employee record
      if (childData.employeeId) {
        const empQ    = query(collection(db, 'users'), where('uid', '==', childData.employeeId));
        const empSnap = await getDocs(empQ);
        if (!empSnap.empty) setEmployee(empSnap.docs[0].data());
      }

      // Vaccination records — ordered by plannedDate
      const recQ = query(
        collection(db, 'vaccinationRecords'),
        where('familyMemberId', '==', childId),
        orderBy('plannedDate', 'asc'),
      );
      const recSnap = await getDocs(recQ);
      const recData = recSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecords(recData);

      // Group by vaccine name
      const groups = {};
      recData.forEach(r => {
        if (!groups[r.vaccineName]) groups[r.vaccineName] = [];
        groups[r.vaccineName].push(r);
      });
      setGrouped(Object.entries(groups));

    } catch (err) {
      console.error('VaccinationChildDetail fetch error:', err);
      setError('Could not load vaccination record. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [childId, db]);

  useEffect(() => {
    fetchData();
    const unsubscribe = navigation.addListener('focus', fetchData);
    return unsubscribe;
  }, [fetchData, navigation]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // ─── Summary counts ────────────────────────────────────────────────────────
  const totalDoses       = records.filter(r => r.status !== 'na').length;
  const administered     = records.filter(r => r.status === 'administered').length;
  const overdueCount     = records.filter(r => r.status === 'scheduled' && isOverdue(r.plannedDate)).length;
  const missedCount      = records.filter(r => r.status === 'missed').length;
  const isComplete       = totalDoses > 0 && administered === totalDoses;
  const progressPercent  = totalDoses > 0 ? Math.round((administered / totalDoses) * 100) : 0;

  // ─── Navigate to administer screen ────────────────────────────────────────
  const handleAdminister = (record) => {
    if (record.status === 'administered') {
      webAlert('Already Given', 'This dose has already been administered.');
      return;
    }
    if (record.status === 'na') {
      webAlert('Not Applicable', `This dose is marked N/A. Reason: ${record.naReason || '—'}`);
      return;
    }
    navigation.navigate('VaccinationAdminister', {
      recordId:   record.id,
      childId,
      childName:  child?.name || childName,
      vaccineName: record.vaccineName,
      doseNumber:  record.doseNumber,
      plannedDate: record.plannedDate,
    });
  };

  // ─── Navigate to report ────────────────────────────────────────────────────
  const handleViewReport = () => {
    navigation.navigate('VaccinationReport', {
      childId,
      childName: child?.name || childName,
    });
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{child?.name || childName}</Text>
        <NotificationBell navigation={navigation} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Child info card */}
        {child && (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Child</Text>
              <Text style={styles.infoValue}>{child.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date of Birth</Text>
              <Text style={styles.infoValue}>{formatDate(child.dateOfBirth)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Age</Text>
              <Text style={styles.infoValue}>{calculateAge(child.dateOfBirth)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Father</Text>
              <Text style={styles.infoValue}>{employee?.fullName || '—'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Mother</Text>
              <Text style={styles.infoValue}>{mother?.name || '—'}</Text>
            </View>
            {child.bloodGroup && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Blood Group</Text>
                <Text style={styles.infoValue}>🩸 {child.bloodGroup}</Text>
              </View>
            )}
            {child.differentlyAbled && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Differently Abled</Text>
                <Text style={[styles.infoValue, { color: '#f59e0b' }]}>Yes</Text>
              </View>
            )}
          </View>
        )}

        {/* Progress summary */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Vaccination Progress</Text>
            {isComplete && (
              <View style={styles.completeBadge}>
                <Text style={styles.completeText}>✓ Complete</Text>
              </View>
            )}
          </View>
          <View style={styles.progressBarWrap}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{progressPercent}%</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{administered}</Text>
              <Text style={styles.statLabel}>Given</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, overdueCount > 0 && styles.statRed]}>{overdueCount}</Text>
              <Text style={styles.statLabel}>Overdue</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, missedCount > 0 && styles.statRed]}>{missedCount}</Text>
              <Text style={styles.statLabel}>Missed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{totalDoses}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>
        </View>

        {/* Report button */}
        <TouchableOpacity style={styles.reportBtn} onPress={handleViewReport} activeOpacity={0.8}>
          <Text style={styles.reportBtnText}>📄  View / Print Vaccination Record</Text>
        </TouchableOpacity>

        {/* Vaccine groups */}
        {grouped.map(([vaccineName, doses]) => (
          <View key={vaccineName} style={styles.vaccineGroup}>
            <Text style={styles.vaccineName}>{vaccineName}</Text>
            {doses.map((record) => (
              <TouchableOpacity
                key={record.id}
                style={[
                  styles.doseRow,
                  record.status === 'administered' && styles.doseRowGiven,
                  record.status === 'missed'       && styles.doseRowMissed,
                  record.status === 'na'           && styles.doseRowNA,
                  record.status === 'scheduled' && isOverdue(record.plannedDate) && styles.doseRowOverdue,
                ]}
                onPress={() => handleAdminister(record)}
                activeOpacity={record.status === 'scheduled' ? 0.75 : 1}
              >
                <View style={styles.doseLeft}>
                  <Text style={styles.doseNumber}>{record.doseNumber}</Text>
                  <Text style={styles.dosePlanned}>
                    {record.status === 'administered'
                      ? `Given: ${formatDate(record.actualDate)}`
                      : record.status === 'na'
                      ? record.naReason || 'Not applicable'
                      : `Planned: ${formatDate(record.plannedDate)}`}
                  </Text>
                  {record.nurseOverride && (
                    <Text style={styles.overrideFlag}>⚙ Schedule adjusted</Text>
                  )}
                  {record.adverseReaction && (
                    <Text style={styles.reactionFlag}>⚠ {record.adverseReaction}</Text>
                  )}
                </View>
                <View style={styles.doseRight}>
                  <StatusBadge status={record.status} plannedDate={record.plannedDate} />
                  {record.status === 'scheduled' && (
                    <Text style={styles.tapHint}>Tap to administer</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:  { flex: 1, backgroundColor: '#f0f4f8' },
  centred:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 20, backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:     { paddingRight: 8 },
  backText:    { fontSize: 15, color: '#3b82f6', fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#2d3748', flex: 1, textAlign: 'center' },

  container: { padding: 16 },

  errorBox: {
    backgroundColor: '#fee2e2', borderRadius: 8,
    padding: 12, marginBottom: 16,
  },
  errorText: { fontSize: 13, color: '#991b1b' },

  // Info card
  infoCard: {
    backgroundColor: '#ffffff', borderRadius: 12,
    padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f7fafc',
  },
  infoLabel: { fontSize: 13, color: '#718096' },
  infoValue: { fontSize: 13, color: '#2d3748', fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 16 },

  // Progress card
  progressCard: {
    backgroundColor: '#ffffff', borderRadius: 12,
    padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  progressHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressTitle:   { fontSize: 14, fontWeight: '600', color: '#2d3748' },
  completeBadge:   { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  completeText:    { fontSize: 11, color: '#065f46', fontWeight: '600' },
  progressBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  progressBar:     { flex: 1, height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: '#10b981', borderRadius: 4 },
  progressLabel:   { fontSize: 13, color: '#718096', minWidth: 36 },
  statsRow:        { flexDirection: 'row', justifyContent: 'space-around' },
  statItem:        { alignItems: 'center' },
  statNum:         { fontSize: 20, fontWeight: '700', color: '#2d3748' },
  statRed:         { color: '#ef4444' },
  statLabel:       { fontSize: 11, color: '#718096', marginTop: 2 },

  // Report button
  reportBtn: {
    backgroundColor: '#eff6ff', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: '#bfdbfe',
  },
  reportBtnText: { fontSize: 14, color: '#1e40af', fontWeight: '600' },

  // Vaccine groups
  vaccineGroup:  { marginBottom: 16 },
  vaccineName:   {
    fontSize: 13, fontWeight: '700', color: '#4a5568',
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginBottom: 6, paddingHorizontal: 4,
  },

  // Dose rows
  doseRow: {
    backgroundColor: '#ffffff', borderRadius: 10,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 12, marginBottom: 6,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  doseRowGiven:   { borderLeftColor: '#10b981', backgroundColor: '#f0fdf4' },
  doseRowMissed:  { borderLeftColor: '#ef4444', backgroundColor: '#fff5f5' },
  doseRowNA:      { borderLeftColor: '#d1d5db', backgroundColor: '#f9fafb' },
  doseRowOverdue: { borderLeftColor: '#ef4444' },

  doseLeft:    { flex: 1 },
  doseNumber:  { fontSize: 13, fontWeight: '600', color: '#2d3748', marginBottom: 2 },
  dosePlanned: { fontSize: 12, color: '#718096' },
  overrideFlag:{ fontSize: 11, color: '#7c3aed', marginTop: 2 },
  reactionFlag:{ fontSize: 11, color: '#d97706', marginTop: 2 },

  doseRight:  { alignItems: 'flex-end', gap: 4 },
  tapHint:    { fontSize: 10, color: '#3b82f6' },

  // Badge
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600' },
});