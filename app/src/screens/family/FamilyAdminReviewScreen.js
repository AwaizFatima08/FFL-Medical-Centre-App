// app/src/screens/family/FamilyAdminReviewScreen.js
import { webAlert, webConfirm } from '../../utils/webAlert';

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Modal,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, collection, query, where,
  getDocs, doc, updateDoc, Timestamp, orderBy,
} from 'firebase/firestore';
import NotificationBell from '../../components/NotificationBell';

// ─── Tab options ──────────────────────────────────────────────────────────────
// Day 14, Step F — added 'status' tab: admin's family-data-completeness
// controls (mark complete / manually re-flag with a note). This is a
// SEPARATE, coarser-grained concept from the per-member pending/validated
// status the 'new'/'edit' tabs already handle — see PHASE4_DESIGN.md §7.
const TABS = [
  { key: 'new',    label: 'New Members' },
  { key: 'edit',   label: 'Edits' },
  { key: 'status', label: 'Family Status' },
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

  // Day 14, Step F — Family Status tab state
  const [flaggedEmployees,  setFlaggedEmployees]  = useState([]);
  const [statusProcessing,  setStatusProcessing]  = useState(null); // employeeId currently being acted on
  const [searchNumber,      setSearchNumber]      = useState('');
  const [searchResult,      setSearchResult]      = useState(null); // { id, ...data } or 'not_found'
  const [searching,         setSearching]         = useState(false);
  const [flagNoteInput,     setFlagNoteInput]     = useState('');

  // Day 14, Step G — disable-member state (found employee's family list)
  const [searchResultMembers, setSearchResultMembers] = useState([]);
  const [loadingMembers,      setLoadingMembers]      = useState(false);
  const [disablingMemberId,   setDisablingMemberId]   = useState(null); // spouse reason-picker open for this member
  const [disableProcessing,   setDisableProcessing]   = useState(null); // memberId currently being disabled

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

      // Day 14, Step F — flagged employees for the Family Status tab
      const statusQ = query(
        collection(db, 'employees'),
        where('familyDataStatus', 'in', ['needs_update', 'pending_admin_review']),
      );
      const statusSnap = await getDocs(statusQ);
      const statusData = statusSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFlaggedEmployees(statusData);
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

  // ─── Day 14, Step F — mark an employee's family data complete ───────────
  const handleMarkComplete = async (employeeId, name) => {
    webConfirm(
      'Mark Complete',
      `Mark family data as complete for ${name}? This clears the alert on their Family tab.`,
      async () => {
        setStatusProcessing(employeeId);
        try {
          await updateDoc(doc(db, 'employees', employeeId), {
            familyDataStatus:   'complete',
            familyDataFlagNote: null,
            updatedAt:          Timestamp.now(),
          });
          fetchPending();
        } catch (err) {
          console.error('Mark complete error:', err);
          webAlert('Error', 'Could not update. Please try again.');
        } finally {
          setStatusProcessing(null);
        }
      },
      false, 'Mark Complete'
    );
  };

  // ─── Day 14, Step F/G — search an employee by number ────────────────────
  const handleSearchEmployee = async () => {
    if (!searchNumber.trim()) {
      webAlert('Required', 'Enter an employee number to search.');
      return;
    }
    setSearching(true);
    setSearchResult(null);
    setSearchResultMembers([]);
    try {
      const q = query(
        collection(db, 'employees'),
        where('officialEmployeeNumber', '==', searchNumber.trim().toUpperCase()),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setSearchResult('not_found');
      } else {
        const emp = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setSearchResult(emp);
        // Day 14, Step G — fetch this employee's active family members.
        // Note: familyMembers.employeeId is the person's Auth UID
        // (emp.userId), NOT the employees collection's own doc id.
        if (emp.userId) {
          setLoadingMembers(true);
          try {
            const memberQ = query(
              collection(db, 'familyMembers'),
              where('employeeId', '==', emp.userId),
              where('isActive', '==', true),
            );
            const memberSnap = await getDocs(memberQ);
            setSearchResultMembers(memberSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          } catch (memberErr) {
            console.error('Fetch family members error:', memberErr);
          } finally {
            setLoadingMembers(false);
          }
        }
      }
    } catch (err) {
      console.error('Search employee error:', err);
      webAlert('Error', 'Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  // ─── Day 14, Step F — flag the found employee, with optional note ───────
  const handleFlagEmployee = async () => {
    if (!searchResult || searchResult === 'not_found') return;
    setStatusProcessing(searchResult.id);
    try {
      await updateDoc(doc(db, 'employees', searchResult.id), {
        familyDataStatus:   'needs_update',
        familyDataFlagNote: flagNoteInput.trim() || null,
        updatedAt:          Timestamp.now(),
      });
      webAlert('Flagged', `${searchResult.fullName}'s Family tab will now show an alert.`);
      setSearchNumber('');
      setSearchResult(null);
      setFlagNoteInput('');
      fetchPending();
    } catch (err) {
      console.error('Flag employee error:', err);
      webAlert('Error', 'Could not flag employee. Please try again.');
    } finally {
      setStatusProcessing(null);
    }
  };

  // ─── Day 14, Step G — disable a family member ────────────────────────────
  // Core write, shared by both paths below. Spouse disabling also updates
  // the employee's own maritalStatus — done as a second direct Firestore
  // write here (admin has unrestricted employees-collection write access
  // per firestore.rules, so this doesn't need to go through the backend).
  // No grief-related messaging shown anywhere — this happens quietly.
  const disableMember = async (member, reason) => {
    setDisableProcessing(member.id);
    try {
      const adminUid = getAuth().currentUser?.uid;

      await updateDoc(doc(db, 'familyMembers', member.id), {
        isActive:       false,
        disabledReason: reason, // 'deceased' | 'divorced'
        disabledAt:     Timestamp.now(),
        disabledBy:     adminUid,
        updatedAt:      Timestamp.now(),
      });

      if (member.relation === 'spouse' && searchResult && searchResult !== 'not_found') {
        const newMaritalStatus = reason === 'deceased' ? 'widowed' : 'divorced';
        await updateDoc(doc(db, 'employees', searchResult.id), {
          maritalStatus: newMaritalStatus,
          updatedAt:     Timestamp.now(),
        });
        setSearchResult(prev => ({ ...prev, maritalStatus: newMaritalStatus }));
      }

      setSearchResultMembers(prev => prev.filter(m => m.id !== member.id));
      setDisablingMemberId(null);
      fetchPending(); // refresh the flagged-employees list too, in case this affects it
    } catch (err) {
      console.error('Disable member error:', err);
      webAlert('Error', 'Could not disable this family member. Please try again.');
    } finally {
      setDisableProcessing(null);
    }
  };

  // Child (son/daughter) — only "deceased" is a meaningful reason, so this
  // skips the reason picker entirely and goes straight to a plain confirm.
  const handleDisableChild = (member) => {
    webConfirm(
      'Disable Family Member',
      `Disable ${member.name}? This is typically used to record a death.`,
      () => disableMember(member, 'deceased'),
      true, 'Disable'
    );
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

  // ─── Day 14, Step F — render a flagged-employee card ─────────────────────
  const renderStatusCard = (emp) => {
    const isProcessing = statusProcessing === emp.id;
    return (
      <View key={emp.id} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardName}>{emp.fullName}</Text>
          <Text style={styles.cardRelation}>{emp.officialEmployeeNumber}</Text>
        </View>
        <Text style={styles.cardEmployee}>
          Marital status: {emp.maritalStatus || '—'}
        </Text>
        {emp.familyDataFlagNote && (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>📌 {emp.familyDataFlagNote}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.completeBtn, isProcessing && styles.btnDisabled]}
          disabled={isProcessing}
          onPress={() => handleMarkComplete(emp.id, emp.fullName)}
        >
          {isProcessing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.completeBtnText}>✓ Mark Complete</Text>
          }
        </TouchableOpacity>
      </View>
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
              {tab.key === 'new'    && newMembers.length       > 0 ? ` (${newMembers.length})`       : ''}
              {tab.key === 'edit'   && editMembers.length      > 0 ? ` (${editMembers.length})`      : ''}
              {tab.key === 'status' && flaggedEmployees.length > 0 ? ` (${flaggedEmployees.length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'status' ? (
          <>
            {/* Day 14, Step F — Family Status tab */}
            <View style={styles.infoBoxStatus}>
              <Text style={styles.infoBoxStatusText}>
                Employees below are married with family data flagged as needing attention —
                either they haven't added family members yet, or you've manually flagged them.
                Mark complete once their Family tab data is up to date.
              </Text>
            </View>

            {flaggedEmployees.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>✅</Text>
                <Text style={styles.emptyText}>No employees currently flagged.</Text>
              </View>
            ) : (
              flaggedEmployees.map(renderStatusCard)
            )}

            {/* Manual flag search */}
            <View style={styles.searchSection}>
              <Text style={styles.sectionTitleOutside}>Flag an Employee</Text>
              <Text style={styles.searchHint}>
                e.g. HR reported a marriage or new child the employee hasn't logged yet.
              </Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Employee number (e.g. FFL-00100)"
                  placeholderTextColor="#a0aec0"
                  value={searchNumber}
                  onChangeText={setSearchNumber}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.searchBtn}
                  onPress={handleSearchEmployee}
                  disabled={searching}
                >
                  {searching
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.searchBtnText}>Search</Text>
                  }
                </TouchableOpacity>
              </View>

              {searchResult === 'not_found' && (
                <Text style={styles.notFoundText}>No employee found with that number.</Text>
              )}

              {searchResult && searchResult !== 'not_found' && (
                <View style={styles.searchResultBox}>
                  <Text style={styles.searchResultName}>{searchResult.fullName}</Text>
                  <Text style={styles.searchResultMeta}>
                    {searchResult.officialEmployeeNumber} · {searchResult.maritalStatus || 'marital status not set'}
                  </Text>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Optional note, e.g. 'please add your newborn'"
                    placeholderTextColor="#a0aec0"
                    value={flagNoteInput}
                    onChangeText={setFlagNoteInput}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.flagBtn, statusProcessing === searchResult.id && styles.btnDisabled]}
                    disabled={statusProcessing === searchResult.id}
                    onPress={handleFlagEmployee}
                  >
                    {statusProcessing === searchResult.id
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.flagBtnText}>📌 Flag for Update</Text>
                    }
                  </TouchableOpacity>

                  {/* Day 14, Step G — manage this employee's family members */}
                  <View style={styles.membersDivider} />
                  <Text style={styles.membersTitle}>Family Members</Text>

                  {loadingMembers ? (
                    <ActivityIndicator color="#3b82f6" style={{ marginVertical: 8 }} />
                  ) : searchResultMembers.length === 0 ? (
                    <Text style={styles.noMembersText}>No active family members on record.</Text>
                  ) : (
                    searchResultMembers.map(member => {
                      const isSpouse = member.relation === 'spouse';
                      const isDisabling = disableProcessing === member.id;
                      const showReasonPicker = disablingMemberId === member.id;

                      return (
                        <View key={member.id} style={styles.memberRow}>
                          <View style={styles.memberRowInfo}>
                            <Text style={styles.memberRowName}>{member.name}</Text>
                            <Text style={styles.memberRowRelation}>
                              {member.relation.charAt(0).toUpperCase() + member.relation.slice(1)}
                            </Text>
                          </View>

                          {!showReasonPicker ? (
                            <TouchableOpacity
                              style={[styles.disableBtn, isDisabling && styles.btnDisabled]}
                              disabled={isDisabling}
                              onPress={() => isSpouse
                                ? setDisablingMemberId(member.id)
                                : handleDisableChild(member)
                              }
                            >
                              {isDisabling
                                ? <ActivityIndicator color="#c53030" size="small" />
                                : <Text style={styles.disableBtnText}>Disable</Text>
                              }
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.reasonPickerRow}>
                              <TouchableOpacity
                                style={styles.reasonBtn}
                                disabled={isDisabling}
                                onPress={() => disableMember(member, 'deceased')}
                              >
                                <Text style={styles.reasonBtnText}>Deceased</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.reasonBtn}
                                disabled={isDisabling}
                                onPress={() => disableMember(member, 'divorced')}
                              >
                                <Text style={styles.reasonBtnText}>Divorced</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.reasonCancelBtn}
                                disabled={isDisabling}
                                onPress={() => setDisablingMemberId(null)}
                              >
                                <Text style={styles.reasonCancelText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          </>
        ) : displayList.length === 0 ? (
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
  tabText:       { fontSize: 12, color: '#718096', fontWeight: '500' },
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

  // Day 14, Step F — Family Status tab styles
  infoBoxStatus: {
    backgroundColor: '#eff6ff', borderRadius: 8, padding: 12,
    marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#3b82f6',
  },
  infoBoxStatusText: { fontSize: 12, color: '#1e40af', lineHeight: 18 },
  noteBox: {
    backgroundColor: '#fffbeb', borderRadius: 6, padding: 8,
    marginTop: 6, marginBottom: 10,
  },
  noteText: { fontSize: 12, color: '#92400e' },
  completeBtn: {
    backgroundColor: '#10b981', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  completeBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },

  searchSection: { marginTop: 8 },
  sectionTitleOutside: { fontSize: 14, fontWeight: '700', color: '#2d3748', marginBottom: 4 },
  searchHint: { fontSize: 12, color: '#718096', marginBottom: 12, lineHeight: 17 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1, backgroundColor: '#ffffff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#2d3748',
  },
  searchBtn: {
    backgroundColor: '#2563eb', borderRadius: 8,
    paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center',
  },
  searchBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  notFoundText: { fontSize: 12, color: '#991b1b', marginBottom: 12 },
  searchResultBox: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  searchResultName: { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  searchResultMeta: { fontSize: 12, color: '#718096', marginBottom: 10 },
  noteInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#2d3748',
    minHeight: 50, textAlignVertical: 'top', marginBottom: 10, backgroundColor: '#f7fafc',
  },
  flagBtn: {
    backgroundColor: '#f59e0b', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  flagBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },

  // Day 14, Step G — family member management styles
  membersDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 14 },
  membersTitle:   { fontSize: 13, fontWeight: '700', color: '#4a5568', marginBottom: 8 },
  noMembersText:  { fontSize: 12, color: '#a0aec0' },
  memberRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f4f8',
  },
  memberRowInfo:     { flex: 1 },
  memberRowName:     { fontSize: 13, fontWeight: '600', color: '#2d3748' },
  memberRowRelation: { fontSize: 11, color: '#718096' },
  disableBtn: {
    borderWidth: 1.5, borderColor: '#fc8181', backgroundColor: '#fff5f5',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  disableBtnText: { fontSize: 12, color: '#c53030', fontWeight: '600' },
  reasonPickerRow: { flexDirection: 'row', gap: 6 },
  reasonBtn: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fc8181',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  reasonBtnText: { fontSize: 11, color: '#c53030', fontWeight: '600' },
  reasonCancelBtn: { paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' },
  reasonCancelText: { fontSize: 11, color: '#718096' },

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