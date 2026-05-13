// app/src/screens/vaccination/VaccinationChildListScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import {
  getFirestore, collection, query, where,
  getDocs, orderBy,
} from 'firebase/firestore';
import NotificationBell from '../../components/NotificationBell';

// ─── Helper — calculate age string ───────────────────────────────────────────
function calculateAge(dobTimestamp) {
  if (!dobTimestamp) return '—';
  const dob   = dobTimestamp.toDate ? dobTimestamp.toDate() : new Date(dobTimestamp);
  const today = new Date();
  let years   = today.getFullYear() - dob.getFullYear();
  let months  = today.getMonth()    - dob.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0) return `${months}m`;
  if (years < 2)   return `${years}y ${months}m`;
  return `${years}y`;
}

// ─── Helper — format date ─────────────────────────────────────────────────────
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Status summary chip ──────────────────────────────────────────────────────
function StatusChip({ overdue, dueSoon, completed }) {
  if (completed) {
    return (
      <View style={[styles.chip, styles.chipCompleted]}>
        <Text style={styles.chipTextCompleted}>✓ Complete</Text>
      </View>
    );
  }
  if (overdue > 0) {
    return (
      <View style={[styles.chip, styles.chipOverdue]}>
        <Text style={styles.chipTextOverdue}>{overdue} Overdue</Text>
      </View>
    );
  }
  if (dueSoon > 0) {
    return (
      <View style={[styles.chip, styles.chipDue]}>
        <Text style={styles.chipTextDue}>{dueSoon} Due Soon</Text>
      </View>
    );
  }
  return (
    <View style={[styles.chip, styles.chipOnTrack]}>
      <Text style={styles.chipTextOnTrack}>On Track</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function VaccinationChildListScreen({ navigation }) {
  const [children,    setChildren]    = useState([]);
  const [filtered,    setFiltered]    = useState([]);
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState(null);

  const db = getFirestore();

  // ─── Fetch all validated children with their vaccination summaries ─────────
  const fetchChildren = useCallback(async () => {
    try {
      setError(null);

      // Step 1 — fetch all validated son/daughter records
      const childQ = query(
        collection(db, 'familyMembers'),
        where('relation', 'in', ['son', 'daughter']),
        where('status',   '==', 'validated'),
        where('isActive', '==', true),
        orderBy('dateOfBirth', 'asc'),
      );
      const childSnap = await getDocs(childQ);
      const childList = childSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (childList.length === 0) {
        setChildren([]);
        setFiltered([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Step 2 — fetch vaccination records for all children
      const childIds = childList.map(c => c.id);

      // Firestore 'in' query supports max 30 items — batch if needed
      const batchSize = 30;
      let allRecords  = [];
      for (let i = 0; i < childIds.length; i += batchSize) {
        const batch = childIds.slice(i, i + batchSize);
        const recQ  = query(
          collection(db, 'vaccinationRecords'),
          where('familyMemberId', 'in', batch),
        );
        const recSnap = await getDocs(recQ);
        allRecords = [...allRecords, ...recSnap.docs.map(d => ({ id: d.id, ...d.data() }))];
      }

      // Step 3 — fetch employee names for display
      const empIds   = [...new Set(childList.map(c => c.employeeId))];
      const empNames = {};
      await Promise.all(empIds.map(async (uid) => {
        try {
          const empQ    = query(collection(db, 'users'), where('uid', '==', uid));
          const empSnap = await getDocs(empQ);
          if (!empSnap.empty) {
            empNames[uid] = empSnap.docs[0].data().fullName || 'Unknown';
          }
        } catch { empNames[uid] = 'Unknown'; }
      }));

      // Step 4 — compute summary per child
      const today = new Date();
      const soon  = new Date();
      soon.setDate(soon.getDate() + 14); // due within 14 days = "due soon"

      const enriched = childList.map(child => {
        const records = allRecords.filter(r => r.familyMemberId === child.id);
        const scheduled    = records.filter(r => r.status === 'scheduled');
        const administered = records.filter(r => r.status === 'administered');
        const missed       = records.filter(r => r.status === 'missed');

        const overdue  = scheduled.filter(r => {
          const pd = r.plannedDate?.toDate ? r.plannedDate.toDate() : new Date(r.plannedDate);
          return pd < today;
        });
        const dueSoon  = scheduled.filter(r => {
          const pd = r.plannedDate?.toDate ? r.plannedDate.toDate() : new Date(r.plannedDate);
          return pd >= today && pd <= soon;
        });

        // Next due date
        const upcomingDates = scheduled
          .map(r => r.plannedDate?.toDate ? r.plannedDate.toDate() : new Date(r.plannedDate))
          .filter(d => d >= today)
          .sort((a, b) => a - b);
        const nextDue = upcomingDates.length > 0 ? upcomingDates[0] : null;

        const completed =
          scheduled.length === 0 &&
          missed.length    === 0 &&
          administered.length > 0;

        return {
          ...child,
          employeeName:       empNames[child.employeeId] || 'Unknown',
          totalDoses:         records.filter(r => r.status !== 'na').length,
          administeredCount:  administered.length,
          overdueCount:       overdue.length,
          dueSoonCount:       dueSoon.length,
          missedCount:        missed.length,
          completed,
          nextDue,
        };
      });

      // Sort — overdue first, then due soon, then on track, then complete
      enriched.sort((a, b) => {
        if (a.overdueCount  > 0 && b.overdueCount  === 0) return -1;
        if (b.overdueCount  > 0 && a.overdueCount  === 0) return 1;
        if (a.dueSoonCount  > 0 && b.dueSoonCount  === 0) return -1;
        if (b.dueSoonCount  > 0 && a.dueSoonCount  === 0) return 1;
        if (a.completed && !b.completed) return 1;
        if (b.completed && !a.completed) return -1;
        return 0;
      });

      setChildren(enriched);
      setFiltered(enriched);
    } catch (err) {
      console.error('VaccinationChildList fetch error:', err);
      setError('Could not load children. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db]);

  useEffect(() => {
    fetchChildren();
    const unsubscribe = navigation.addListener('focus', fetchChildren);
    return unsubscribe;
  }, [fetchChildren, navigation]);

  // ─── Search filter ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(children);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(children.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.employeeName.toLowerCase().includes(q),
    ));
  }, [search, children]);

  const onRefresh = () => { setRefreshing(true); fetchChildren(); };

  // ─── Render ───────────────────────────────────────────────────────────────
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
        <Text style={styles.headerTitle}>Vaccination</Text>
        <NotificationBell navigation={navigation} />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by child or employee name…"
          placeholderTextColor="#a0aec0"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Summary bar */}
      {children.length > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            {children.length} registered  ·  
            {children.filter(c => c.overdueCount > 0).length} overdue  ·  
            {children.filter(c => c.completed).length} complete
          </Text>
        </View>
      )}

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

        {/* Empty state */}
        {children.length === 0 && !error && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>💉</Text>
            <Text style={styles.emptyTitle}>No children registered yet</Text>
            <Text style={styles.emptySubtitle}>
              Children are registered through the Family module after an employee adds them.
            </Text>
          </View>
        )}

        {/* No search results */}
        {children.length > 0 && filtered.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No results for "{search}"</Text>
          </View>
        )}

        {/* Child cards */}
        {filtered.map((child) => (
          <TouchableOpacity
            key={child.id}
            style={[
              styles.card,
              child.overdueCount > 0 && styles.cardOverdue,
            ]}
            onPress={() => navigation.navigate('VaccinationChildDetail', {
              childId:   child.id,
              childName: child.name,
            })}
            activeOpacity={0.75}
          >
            {/* Top row */}
            <View style={styles.cardTop}>
              <View style={styles.cardTopLeft}>
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.childMeta}>
                  {child.relation === 'son' ? '👦' : '👧'}  
                  Age {calculateAge(child.dateOfBirth)}  ·  {child.employeeName}
                </Text>
              </View>
              <StatusChip
                overdue={child.overdueCount}
                dueSoon={child.dueSoonCount}
                completed={child.completed}
              />
            </View>

            {/* Progress row */}
            <View style={styles.progressRow}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: child.totalDoses > 0
                        ? `${Math.round((child.administeredCount / child.totalDoses) * 100)}%`
                        : '0%',
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {child.administeredCount}/{child.totalDoses} doses
              </Text>
            </View>

            {/* Bottom row */}
            <View style={styles.cardBottom}>
              {child.missedCount > 0 && (
                <Text style={styles.missedText}>⚠️ {child.missedCount} missed</Text>
              )}
              {child.nextDue && !child.completed && (
                <Text style={styles.nextDueText}>
                  Next: {formatDate({ toDate: () => child.nextDue })}
                </Text>
              )}
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 32 }} />
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
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#2d3748' },

  searchRow: {
    backgroundColor: '#ffffff', paddingHorizontal: 16,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  searchInput: {
    backgroundColor: '#f0f4f8', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 14, color: '#2d3748',
  },

  summaryBar: {
    backgroundColor: '#eff6ff', paddingHorizontal: 20,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  summaryText: { fontSize: 12, color: '#1e40af', fontWeight: '500' },

  container: { padding: 16 },

  errorBox: {
    backgroundColor: '#fee2e2', borderRadius: 8,
    padding: 12, marginBottom: 16,
  },
  errorText: { fontSize: 13, color: '#991b1b' },

  emptyBox:     { alignItems: 'center', marginTop: 60 },
  emptyIcon:    { fontSize: 56, marginBottom: 16 },
  emptyTitle:   { fontSize: 16, fontWeight: '600', color: '#2d3748', marginBottom: 8 },
  emptySubtitle:{ fontSize: 13, color: '#718096', textAlign: 'center', lineHeight: 20 },

  // Cards
  card: {
    backgroundColor: '#ffffff', borderRadius: 12,
    padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  cardOverdue: { borderLeftColor: '#ef4444' },

  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTopLeft: { flex: 1, marginRight: 8 },
  childName:   { fontSize: 15, fontWeight: '600', color: '#2d3748', marginBottom: 3 },
  childMeta:   { fontSize: 12, color: '#718096' },

  // Progress
  progressRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  progressBar: {
    flex: 1, height: 6, backgroundColor: '#e2e8f0',
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#10b981', borderRadius: 3 },
  progressText: { fontSize: 12, color: '#718096', minWidth: 60 },

  cardBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  missedText:  { fontSize: 12, color: '#e53e3e', fontWeight: '500' },
  nextDueText: { fontSize: 12, color: '#718096' },
  chevron:     { fontSize: 20, color: '#cbd5e0', marginLeft: 'auto' },

  // Status chips
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  chipCompleted:      { backgroundColor: '#d1fae5' },
  chipTextCompleted:  { fontSize: 11, color: '#065f46', fontWeight: '600' },
  chipOverdue:        { backgroundColor: '#fee2e2' },
  chipTextOverdue:    { fontSize: 11, color: '#991b1b', fontWeight: '600' },
  chipDue:            { backgroundColor: '#fef3c7' },
  chipTextDue:        { fontSize: 11, color: '#92400e', fontWeight: '600' },
  chipOnTrack:        { backgroundColor: '#eff6ff' },
  chipTextOnTrack:    { fontSize: 11, color: '#1e40af', fontWeight: '600' },
});