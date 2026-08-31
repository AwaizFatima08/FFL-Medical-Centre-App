// app/src/screens/family/FamilyMemberListScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import NotificationBell from '../../components/NotificationBell';

// ─── Status badge colours ─────────────────────────────────────────────────────
const STATUS_COLOURS = {
  pending:   { bg: '#fef3c7', text: '#92400e' },
  validated: { bg: '#d1fae5', text: '#065f46' },
  rejected:  { bg: '#fee2e2', text: '#991b1b' },
};

const RELATION_ICONS = {
  spouse:   '👩',
  son:      '👦',
  daughter: '👧',
};

// ─── Helper — calculate age from DOB ─────────────────────────────────────────
function calculateAge(dobTimestamp) {
  if (!dobTimestamp) return null;
  const dob = dobTimestamp.toDate ? dobTimestamp.toDate() : new Date(dobTimestamp);
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  let months = today.getMonth() - dob.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0) return `${months}m`;
  if (years < 2)   return `${years}y ${months}m`;
  return `${years}y`;
}

export default function FamilyMemberListScreen({ navigation }) {
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);

  // Day 14, Step F — admin flag state, read from the employee's own record
  const [familyDataStatus,   setFamilyDataStatus]   = useState(null);
  const [familyDataFlagNote, setFamilyDataFlagNote] = useState(null);

  const db   = getFirestore();
  const auth = getAuth();

  const fetchMembers = useCallback(async () => {
    try {
      setError(null);
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');

      const q = query(
        collection(db, 'familyMembers'),
        where('employeeId', '==', uid),
        where('isActive', '==', true),
        orderBy('createdAt', 'asc'),
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMembers(data);

      // Day 14, Step F — pull the admin flag note, if any, from the
      // employee's own record so it can be shown here.
      const empQ = query(collection(db, 'employees'), where('userId', '==', uid));
      const empSnap = await getDocs(empQ);
      if (!empSnap.empty) {
        const empData = empSnap.docs[0].data();
        setFamilyDataStatus(empData.familyDataStatus || null);
        setFamilyDataFlagNote(empData.familyDataFlagNote || null);
      }
    } catch (err) {
      console.error('FamilyMemberListScreen fetch error:', err);
      setError('Could not load family members. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth, db]);

  useEffect(() => {
    fetchMembers();
    // Refresh list when returning from Add/Edit screen
    const unsubscribe = navigation.addListener('focus', fetchMembers);
    return unsubscribe;
  }, [fetchMembers, navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMembers();
  };

  // Day 14, Step F — show the admin's note whenever the family data is
  // flagged as needing attention (not 'complete', not null/not_applicable).
  const showFlagBanner = familyDataFlagNote &&
    familyDataStatus && familyDataStatus !== 'complete';

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
        <Text style={styles.headerTitle}>My Family</Text>
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

        {/* Day 14, Step F — admin flag note, e.g. "please add your newborn" */}
        {showFlagBanner && (
          <View style={styles.flagBox}>
            <Text style={styles.flagIcon}>📌</Text>
            <Text style={styles.flagText}>{familyDataFlagNote}</Text>
          </View>
        )}

        {/* Info note */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Family members require admin validation before they appear as active on medical records.
            Edits are also subject to review.
          </Text>
        </View>

        {/* Empty state */}
        {members.length === 0 && !error && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>👨‍👩‍👧‍👦</Text>
            <Text style={styles.emptyTitle}>No family members added yet</Text>
            <Text style={styles.emptySubtitle}>
              Add your spouse first, then you can register your children.
            </Text>
          </View>
        )}

        {/* Family member cards */}
        {members.map((member) => {
          const statusColour = STATUS_COLOURS[member.status] || STATUS_COLOURS.pending;
          const hasPendingRevision = !!member.pendingRevision;

          return (
            <TouchableOpacity
              key={member.id}
              style={styles.card}
              onPress={() => navigation.navigate('FamilyMemberEdit', { memberId: member.id })}
              activeOpacity={0.75}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.relationIcon}>
                  {RELATION_ICONS[member.relation] || '👤'}
                </Text>
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberMeta}>
                  {member.relation.charAt(0).toUpperCase() + member.relation.slice(1)}
                  {member.dateOfBirth ? `  ·  Age: ${calculateAge(member.dateOfBirth)}` : ''}
                </Text>
                {member.bloodGroup ? (
                  <Text style={styles.memberBlood}>🩸 {member.bloodGroup}</Text>
                ) : null}
                {hasPendingRevision && (
                  <View style={styles.revisionBadge}>
                    <Text style={styles.revisionText}>Edit pending review</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardRight}>
                <View style={[styles.statusBadge, { backgroundColor: statusColour.bg }]}>
                  <Text style={[styles.statusText, { color: statusColour.text }]}>
                    {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Bottom spacer for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating Add button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('FamilyMemberAdd')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+ Add Family Member</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:        { flex: 1, backgroundColor: '#f0f4f8' },
  centred:        { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 20, backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:         { paddingRight: 8 },
  backText:        { fontSize: 15, color: '#3b82f6', fontWeight: '500' },
  headerTitle:     { fontSize: 18, fontWeight: 'bold', color: '#2d3748' },

  // Content
  container:       { paddingHorizontal: 16, paddingTop: 16 },

  // Day 14, Step F — admin flag note banner
  flagBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fffbeb', borderRadius: 8,
    padding: 12, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#f59e0b',
  },
  flagIcon: { fontSize: 16, marginRight: 8 },
  flagText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18, fontWeight: '500' },

  // Info box
  infoBox: {
    backgroundColor: '#eff6ff', borderRadius: 8,
    padding: 12, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#3b82f6',
  },
  infoText:        { fontSize: 12, color: '#1e40af', lineHeight: 18 },

  // Error
  errorBox: {
    backgroundColor: '#fee2e2', borderRadius: 8,
    padding: 12, marginBottom: 16,
  },
  errorText:       { fontSize: 13, color: '#991b1b' },

  // Empty state
  emptyBox:        { alignItems: 'center', marginTop: 60 },
  emptyIcon:       { fontSize: 56, marginBottom: 16 },
  emptyTitle:      { fontSize: 16, fontWeight: '600', color: '#2d3748', marginBottom: 8 },
  emptySubtitle:   { fontSize: 13, color: '#718096', textAlign: 'center', lineHeight: 20 },

  // Cards
  card: {
    backgroundColor: '#ffffff', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardLeft:        { marginRight: 12 },
  relationIcon:    { fontSize: 32 },
  cardBody:        { flex: 1 },
  memberName:      { fontSize: 15, fontWeight: '600', color: '#2d3748', marginBottom: 2 },
  memberMeta:      { fontSize: 12, color: '#718096', marginBottom: 2 },
  memberBlood:     { fontSize: 12, color: '#718096' },
  cardRight:       { alignItems: 'flex-end', gap: 6 },

  // Status badge
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12,
  },
  statusText:      { fontSize: 11, fontWeight: '600' },

  // Pending revision badge
  revisionBadge: {
    marginTop: 4, backgroundColor: '#fef3c7',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, alignSelf: 'flex-start',
  },
  revisionText:    { fontSize: 10, color: '#92400e', fontWeight: '500' },

  chevron:         { fontSize: 20, color: '#cbd5e0' },

  // FAB
  fab: {
    position: 'absolute', bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 30,
    shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  fabText:         { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});