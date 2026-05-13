// app/src/screens/family/FamilyAdminReviewScreen.js
import { webAlert, webConfirm } from '../../utils/webAlert';

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Modal,
} from 'react-native';
import {
  getFirestore, collection, query, where,
  getDocs, doc, updateDoc, Timestamp, orderBy,
} from 'firebase/firestore';
import NotificationBell from '../../components/NotificationBell';

// ─── Tab options ──────────────────────────────────────────────────────────────
const TABS = [
  { key: 'new',  label: 'New Members' },
  { key: 'edit', label: 'Edits' },
];

// ─── Format timestamp ─────────────────────────────────────────────────────────
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Calculate age ────────────────────────────────────────────────────────────
function calculateAge(dobTimestamp) {
  if (!dobTimestamp) return '—';
  const dob = dobTimestamp.toDate ? dobTimestamp.toDate() : new Date(dobTimestamp);
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  let months = today.getMonth() - dob.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0) return `${months} months`;
  return `${years}y ${months}m`;
}

// ─── Field row for detail view ────────────────────────────────────────────────
function FieldRow({ label, value, highlight }) {
  if (!value && value !== false) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, highlight && styles.fieldValueHighlight]}>
        {value === true ? 'Yes' : value === false ? 'No' : value}
      </Text>
    </View>
  );
}

// ─── Diff row — shows old vs new for edits ───────────────────────────────────
function DiffRow({ label, oldVal, newVal }) {
  const changed = String(oldVal || '—') !== String(newVal || '—');
  if (!changed) return null;
  return (
    <View style={styles.diffRow}>
      <Text style={styles.diffLabel}>{label}</Text>
      <View style={styles.diffValues}>
        <Text style={styles.diffOld}>{oldVal || '—'}</Text>
        <Text style={styles.diffArrow}>→</Text>
        <Text style={styles.diffNew}>{newVal || '—'}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function FamilyAdminReviewScreen({ navigation }) {
  const [activeTab,    setActiveTab]    = useState('new');
  const [newMembers,   setNewMembers]   = useState([]);
  const [editMembers,  setEditMembers]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [selected,     setSelected]     = useState(null); // selected member for detail
  const [rejectModal,  setRejectModal]  = useState(false);
  const [rejectNote,   setRejectNote]   = useState('');
  const [processing,   setProcessing]   = useState(false);
  const [employeeNames, setEmployeeNames] = useState({}); // uid → name cache

  const db = getFirestore();

  // ─── Fetch employee name ──────────────────────────────────────────────────
  const getEmployeeName = async (uid) => {
    if (employeeNames[uid]) return employeeNames[uid];
    try {
      const q    = query(collection(db, 'users'), where('uid', '==', uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const name = snap.docs[0].data().fullName || 'Unknown';
        setEmployeeNames(prev => ({ ...prev, [uid]: name }));
        return name;
      }
    } catch (err) { console.error('getEmployeeName error:', err); }
    return 'Unknown';
  };

  // ─── Fetch pending records ────────────────────────────────────────────────
  const fetchPending = useCallback(async () => {
    try {
      // New members — status = pending, no pendingRevision
      const newQ = query(
        collection(db, 'familyMembers'),
        where('status', '==', 'pending'),
        where('isActive', '==', true),
        orderBy('createdAt', 'asc'),
      );
      const newSnap = await getDocs(newQ);
      const newData = newSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => !m.pendingRevision);

      // Edits — validated records with a pendingRevision
      const editQ = query(
        collection(db, 'familyMembers'),
        where('status', '==', 'validated'),
        where('isActive', '==', true),
        orderBy('updatedAt', 'desc'),
      );
      const editSnap = await getDocs(editQ);
      const editData = editSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => !!m.pendingRevision);

      // Fetch employee names for all unique employeeIds
      const allUids = [...new Set([
        ...newData.map(m => m.employeeId),
        ...editData.map(m => m.employeeId),
      ])];
      const nameMap = {};
      await Promise.all(allUids.map(async (uid) => {
        nameMap[uid] = await getEmployeeName(uid);
      }));
      setEmployeeNames(nameMap);

      setNewMembers(newData);
      setEditMembers(editData);
    } catch (err) {
      console.error('FamilyAdminReview fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db]);

  useEffect(() => {
    fetchPending();
    const unsubscribe = navigation.addListener('focus', fetchPending);
    return unsubscribe;
  }, [fetchPending, navigation]);

  const onRefresh = () => { setRefreshing(true); fetchPending(); };

  // ─── Approve new member ───────────────────────────────────────────────────
  const handleApproveNew = async (member) => {
    webConfirm(
      'Approve Member',
      `Validate ${member.name} as a family member?`,
      async () => {
        setProcessing(true);
        try {
          await updateDoc(doc(db, 'familyMembers', member.id), {
            status:    'validated',
            updatedAt: Timestamp.now(),
          });
          setSelected(null);
          fetchPending();
        } catch (err) {
          console.error('Approve error:', err);
          webAlert('Error', 'Could not approve. Please try again.');
        } finally {
          setProcessing(false);
        }
      },
      false, 'Approve'
    );
  };

  // ─── Reject new member ────────────────────────────────────────────────────
  const handleRejectNew = async () => {
    if (!rejectNote.trim()) {
      webAlert('Required', 'Please enter a reason for rejection.');
      return;
    }
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'familyMembers', selected.id), {
        status:        'rejected',
        rejectionNote: rejectNote.trim(),
        updatedAt:     Timestamp.now(),
      });
      setRejectModal(false);
      setRejectNote('');
      setSelected(null);
      fetchPending();
    } catch (err) {
      console.error('Reject error:', err);
      webAlert('Error', 'Could not reject. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Approve edit — merge pendingRevision into live record ───────────────
  const handleApproveEdit = async (member) => {
    webConfirm(
      'Approve Edit',
      `Apply the pending changes for ${member.name}?`,
      async () => {
        setProcessing(true);
        try {
          const rev = member.pendingRevision;
          await updateDoc(doc(db, 'familyMembers', member.id), {
            name:             rev.name,
            dateOfBirth:      rev.dateOfBirth,
            cnic:             rev.cnic,
            nadraCardNumber:  rev.nadraCardNumber,
            bloodGroup:       rev.bloodGroup,
            differentlyAbled: rev.differentlyAbled,
            maritalStatus:    rev.maritalStatus,
            employmentStatus: rev.employmentStatus,
            pendingRevision:  null,
            rejectionNote:    null,
            updatedAt:        Timestamp.now(),
          });
          setSelected(null);
          fetchPending();
        } catch (err) {
          console.error('Approve edit error:', err);
          webAlert('Error', 'Could not approve edit. Please try again.');
        } finally {
          setProcessing(false);
        }
      },
      false, 'Approve'
    );
  };

  // ─── Reject edit — clear pendingRevision ─────────────────────────────────
  const handleRejectEdit = async () => {
    if (!rejectNote.trim()) {
      webAlert('Required', 'Please enter a reason for rejection.');
      return;
    }
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'familyMembers', selected.id), {
        pendingRevision: null,
        rejectionNote:   rejectNote.trim(),
        updatedAt:       Timestamp.now(),
      });
      setRejectModal(false);
      setRejectNote('');
      setSelected(null);
      fetchPending();
    } catch (err) {
      console.error('Reject edit error:', err);
      webAlert('Error', 'Could not reject edit. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Render member card ───────────────────────────────────────────────────
  const renderCard = (member, isEdit) => {
    const empName = employeeNames[member.employeeId] || '...';
    return (
      <TouchableOpacity
        key={member.id}
        style={styles.card}
        onPress={() => setSelected({ ...member, isEdit })}
        activeOpacity={0.75}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardName}>{member.name}</Text>
          <Text style={styles.cardRelation}>
            {member.relation.charAt(0).toUpperCase() + member.relation.slice(1)}
          </Text>
        </View>
        <Text style={styles.cardEmployee}>Employee: {empName}</Text>
        <Text style={styles.cardDate}>
          {isEdit
            ? `Edit submitted: ${formatDate(member.pendingRevision?.submittedAt)}`
            : `Added: ${formatDate(member.createdAt)}`}
        </Text>
        <Text style={styles.cardAction}>Tap to review ›</Text>
      </TouchableOpacity>
    );
  };

  // ─── Detail modal ─────────────────────────────────────────────────────────
  const renderDetail = () => {
    if (!selected) return null;
    const isEdit = selected.isEdit;
    const rev    = selected.pendingRevision;
    const empName = employeeNames[selected.employeeId] || '—';

    return (
      <Modal visible animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalWrapper}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelected(null)} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isEdit ? 'Review Edit' : 'Review New Member'}
            </Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.sectionTitle}>Employee</Text>
            <FieldRow label="Name" value={empName} />

            {isEdit ? (
              <>
                <Text style={styles.sectionTitle}>Current Record</Text>
                <FieldRow label="Name"              value={selected.name} />
                <FieldRow label="Relation"          value={selected.relation} />
                <FieldRow label="Date of Birth"     value={formatDate(selected.dateOfBirth)} />
                <FieldRow label="Age"               value={calculateAge(selected.dateOfBirth)} />
                <FieldRow label="CNIC"              value={selected.cnic} />
                <FieldRow label="NADRA Card"        value={selected.nadraCardNumber} />
                <FieldRow label="Blood Group"       value={selected.bloodGroup} />
                <FieldRow label="Differently Abled" value={selected.differentlyAbled} />
                <FieldRow label="Marital Status"    value={selected.maritalStatus} />
                <FieldRow label="Employment Status" value={selected.employmentStatus} />

                <Text style={styles.sectionTitle}>Proposed Changes</Text>
                <DiffRow label="Name"              oldVal={selected.name}             newVal={rev.name} />
                <DiffRow label="Date of Birth"     oldVal={formatDate(selected.dateOfBirth)} newVal={formatDate(rev.dateOfBirth)} />
                <DiffRow label="CNIC"              oldVal={selected.cnic}             newVal={rev.cnic} />
                <DiffRow label="NADRA Card"        oldVal={selected.nadraCardNumber}  newVal={rev.nadraCardNumber} />
                <DiffRow label="Blood Group"       oldVal={selected.bloodGroup}       newVal={rev.bloodGroup} />
                <DiffRow label="Differently Abled" oldVal={String(selected.differentlyAbled)} newVal={String(rev.differentlyAbled)} />
                <DiffRow label="Marital Status"    oldVal={selected.maritalStatus}    newVal={rev.maritalStatus} />
                <DiffRow label="Employment Status" oldVal={selected.employmentStatus} newVal={rev.employmentStatus} />
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Member Details</Text>
                <FieldRow label="Name"              value={selected.name} />
                <FieldRow label="Relation"          value={selected.relation} />
                <FieldRow label="Date of Birth"     value={formatDate(selected.dateOfBirth)} />
                <FieldRow label="Age"               value={calculateAge(selected.dateOfBirth)} />
                <FieldRow label="CNIC"              value={selected.cnic} />
                <FieldRow label="NADRA Card"        value={selected.nadraCardNumber} />
                <FieldRow label="Blood Group"       value={selected.bloodGroup} />
                <FieldRow label="Differently Abled" value={selected.differentlyAbled} />
                <FieldRow label="Marital Status"    value={selected.maritalStatus} />
                <FieldRow label="Employment Status" value={selected.employmentStatus} />
              </>
            )}

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.approveBtn, processing && styles.btnDisabled]}
                onPress={() => isEdit ? handleApproveEdit(selected) : handleApproveNew(selected)}
                disabled={processing}
                activeOpacity={0.8}
              >
                {processing
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.approveBtnText}>✓  Approve</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectBtn, processing && styles.btnDisabled]}
                onPress={() => { setRejectNote(''); setRejectModal(true); }}
                disabled={processing}
                activeOpacity={0.8}
              >
                <Text style={styles.rejectBtnText}>✕  Reject</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Reject note modal */}
        <Modal visible={rejectModal} transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={styles.rejectBox}>
              <Text style={styles.rejectBoxTitle}>Reason for Rejection</Text>
              <TextInput
                style={styles.rejectInput}
                placeholder="Enter reason (required)"
                placeholderTextColor="#a0aec0"
                value={rejectNote}
                onChangeText={setRejectNote}
                multiline
                numberOfLines={3}
                autoFocus
              />
              <View style={styles.rejectActions}>
                <TouchableOpacity
                  style={styles.rejectCancelBtn}
                  onPress={() => setRejectModal(false)}
                >
                  <Text style={styles.rejectCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rejectConfirmBtn, processing && styles.btnDisabled]}
                  onPress={() => isEdit ? handleRejectEdit() : handleRejectNew()}
                  disabled={processing}
                >
                  {processing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.rejectConfirmText}>Confirm Rejection</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </Modal>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const displayList = activeTab === 'new' ? newMembers : editMembers;

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Family Records</Text>
        <NotificationBell navigation={navigation} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
              {tab.key === 'new'  && newMembers.length  > 0 ? ` (${newMembers.length})`  : ''}
              {tab.key === 'edit' && editMembers.length > 0 ? ` (${editMembers.length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {displayList.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>{activeTab === 'new' ? '✅' : '📝'}</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'new'
                ? 'No new family members pending approval.'
                : 'No edits pending review.'}
            </Text>
          </View>
        ) : (
          displayList.map(m => renderCard(m, activeTab === 'edit'))
        )}
      </ScrollView>

      {renderDetail()}
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

  tabRow: {
    flexDirection: 'row', backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: '#3b82f6' },
  tabText:       { fontSize: 13, color: '#718096', fontWeight: '500' },
  tabTextActive: { color: '#3b82f6', fontWeight: '700' },

  container: { padding: 16 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 12,
    padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardName:     { fontSize: 15, fontWeight: '600', color: '#2d3748' },
  cardRelation: { fontSize: 13, color: '#718096' },
  cardEmployee: { fontSize: 12, color: '#4a5568', marginBottom: 2 },
  cardDate:     { fontSize: 11, color: '#a0aec0', marginBottom: 4 },
  cardAction:   { fontSize: 12, color: '#3b82f6', fontWeight: '500' },

  emptyBox:  { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#718096', textAlign: 'center' },

  // Modal
  modalWrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 20, backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  modalTitle:   { fontSize: 17, fontWeight: 'bold', color: '#2d3748' },
  modalContent: { padding: 20 },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#718096',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 16, marginBottom: 8,
  },

  fieldRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f4f8',
  },
  fieldLabel:          { fontSize: 13, color: '#718096' },
  fieldValue:          { fontSize: 13, color: '#2d3748', fontWeight: '500' },
  fieldValueHighlight: { color: '#3b82f6' },

  diffRow: {
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f0f4f8',
  },
  diffLabel:  { fontSize: 12, color: '#718096', marginBottom: 4 },
  diffValues: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diffOld:    { fontSize: 13, color: '#e53e3e', textDecorationLine: 'line-through' },
  diffArrow:  { fontSize: 13, color: '#718096' },
  diffNew:    { fontSize: 13, color: '#065f46', fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 28, marginBottom: 16 },
  approveBtn: {
    flex: 1, backgroundColor: '#10b981',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  approveBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  rejectBtn: {
    flex: 1, backgroundColor: '#ef4444',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  rejectBtnText:  { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  btnDisabled:    { opacity: 0.5 },

  // Reject note overlay
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', padding: 24,
  },
  rejectBox: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 24,
  },
  rejectBoxTitle:    { fontSize: 16, fontWeight: '700', color: '#2d3748', marginBottom: 12 },
  rejectInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    padding: 12, fontSize: 14, color: '#2d3748',
    minHeight: 80, textAlignVertical: 'top', marginBottom: 16,
  },
  rejectActions:     { flexDirection: 'row', gap: 12 },
  rejectCancelBtn:   { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  rejectCancelText:  { fontSize: 14, color: '#718096', fontWeight: '500' },
  rejectConfirmBtn:  { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#ef4444' },
  rejectConfirmText: { fontSize: 14, color: '#ffffff', fontWeight: '600' },
});