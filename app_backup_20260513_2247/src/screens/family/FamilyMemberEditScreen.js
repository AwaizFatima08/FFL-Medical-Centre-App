// app/src/screens/family/FamilyMemberEditScreen.js
import { webAlert, webConfirm } from '../../utils/webAlert';

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Switch,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, doc, getDoc, updateDoc, Timestamp,
} from 'firebase/firestore';
import {
  BLOOD_GROUPS, MARITAL_STATUSES, EMPLOYMENT_STATUSES,
} from '../../constants';

// ─── Reusable dropdown ────────────────────────────────────────────────────────
function DropdownField({ label, value, options, onSelect, required }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>
        {label}{required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={value ? styles.dropdownValue : styles.dropdownPlaceholder}>
          {value
            ? (options.find(o => (o.value || o) === value)?.label ||
               value.charAt(0).toUpperCase() + value.slice(1))
            : `Select ${label}`}
        </Text>
        <Text style={styles.dropdownChevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdownList}>
          {options.map((opt) => {
            const val = opt.value || opt;
            const lbl = opt.label || (opt.charAt(0).toUpperCase() + opt.slice(1));
            return (
              <TouchableOpacity
                key={val}
                style={[styles.dropdownItem, value === val && styles.dropdownItemSelected]}
                onPress={() => { onSelect(val); setOpen(false); }}
              >
                <Text style={[
                  styles.dropdownItemText,
                  value === val && styles.dropdownItemTextSelected,
                ]}>
                  {lbl}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Format Firestore timestamp to DD/MM/YYYY ────────────────────────────────
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

// ─── Parse DD/MM/YYYY to Date ────────────────────────────────────────────────
function parseDate(str) {
  if (!str || str.length !== 10) return null;
  const [d, m, y] = str.split('/').map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function ageInYears(date) {
  if (!date) return 0;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())
  ) age--;
  return age;
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function FamilyMemberEditScreen({ route, navigation }) {
  const { memberId } = route.params;

  const [loading,          setLoading]          = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [liveRecord,       setLiveRecord]       = useState(null);

  // Editable fields
  const [name,             setName]             = useState('');
  const [dob,              setDob]              = useState('');
  const [cnic,             setCnic]             = useState('');
  const [nadraCard,        setNadraCard]        = useState('');
  const [bloodGroup,       setBloodGroup]       = useState('');
  const [differentlyAbled, setDifferentlyAbled] = useState(false);
  const [maritalStatus,    setMaritalStatus]    = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('');

  const db  = getFirestore();
  const auth = getAuth();

  // ─── Derived ────────────────────────────────────────────────────────────────
  const dobDate  = parseDate(dob);
  const age      = ageInYears(dobDate);
  const isAdult  = dobDate ? age >= 25 : false;
  const needsCnic = dobDate ? age >= 18 : false;

  // ─── Load existing record ───────────────────────────────────────────────────
  useEffect(() => {
    const fetchMember = async () => {
      try {
        const ref  = doc(db, 'familyMembers', memberId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          webAlert('Error', 'Record not found.');
          navigation.goBack();
          return;
        }
        const data = snap.data();

        // Security — ensure this record belongs to the logged-in employee
        if (data.employeeId !== auth.currentUser?.uid) {
          webAlert('Error', 'Unauthorised access.');
          navigation.goBack();
          return;
        }

        setLiveRecord({ id: snap.id, ...data });

        // Pre-fill fields from live record
        // If there is a pending revision, show that instead so employee
        // can see what is currently under review
        const source = data.pendingRevision || data;
        setName(source.name || '');
        setDob(source.dateOfBirth ? formatDate(source.dateOfBirth) : '');
        setCnic(source.cnic || '');
        setNadraCard(source.nadraCardNumber || '');
        setBloodGroup(source.bloodGroup || '');
        setDifferentlyAbled(source.differentlyAbled || false);
        setMaritalStatus(source.maritalStatus || '');
        setEmploymentStatus(source.employmentStatus || '');
      } catch (err) {
        console.error('FamilyMemberEdit load error:', err);
        webAlert('Error', 'Could not load record.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };
    fetchMember();
  }, [memberId]);

  // ─── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    if (!name.trim()) { webAlert('Required', 'Full name cannot be empty.'); return false; }
    if (!dob)         { webAlert('Required', 'Date of birth is required.'); return false; }
    if (!dobDate)     { webAlert('Invalid Date', 'Use format DD/MM/YYYY.'); return false; }
    if (dobDate > new Date()) {
      webAlert('Invalid Date', 'Date of birth cannot be in the future.');
      return false;
    }
    if (needsCnic && !cnic.trim()) {
      webAlert('Required', 'CNIC is mandatory for members aged 18 and above.');
      return false;
    }
    if (isAdult && !maritalStatus) {
      webAlert('Required', 'Marital status is mandatory for members aged 25 and above.');
      return false;
    }
    if (isAdult && !employmentStatus) {
      webAlert('Required', 'Employment status is mandatory for members aged 25 and above.');
      return false;
    }
    return true;
  };

  // ─── Submit edit as pendingRevision ─────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;

    // Check if anything actually changed
    const live = liveRecord;
    const liveDob = live.dateOfBirth ? formatDate(live.dateOfBirth) : '';
    const noChange =
      name.trim()       === (live.name || '') &&
      dob               === liveDob &&
      cnic.trim()       === (live.cnic || '') &&
      nadraCard.trim()  === (live.nadraCardNumber || '') &&
      bloodGroup        === (live.bloodGroup || '') &&
      differentlyAbled  === (live.differentlyAbled || false) &&
      maritalStatus     === (live.maritalStatus || '') &&
      employmentStatus  === (live.employmentStatus || '');

    if (noChange) {
      webAlert('No Changes', 'You have not made any changes to this record.');
      return;
    }

    setSaving(true);
    try {
      const revision = {
        name:             name.trim(),
        dateOfBirth:      dobDate ? Timestamp.fromDate(dobDate) : liveRecord.dateOfBirth,
        cnic:             needsCnic ? cnic.trim() : null,
        nadraCardNumber:  (!needsCnic && nadraCard.trim()) ? nadraCard.trim() : null,
        bloodGroup:       bloodGroup || null,
        differentlyAbled,
        maritalStatus:    isAdult ? maritalStatus : null,
        employmentStatus: isAdult ? employmentStatus : null,
        submittedAt:      Timestamp.now(),
      };

      await updateDoc(doc(db, 'familyMembers', memberId), {
        pendingRevision: revision,
        updatedAt:       Timestamp.now(),
      });

      webAlert('Edit Submitted', 'Your changes have been submitted for admin review. The current record remains active until approved.');
      navigation.goBack();
    } catch (err) {
      console.error('FamilyMemberEdit save error:', err);
      webAlert('Error', 'Could not submit edit. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const relation = liveRecord?.relation || '';
  const showSpouseFields = relation === 'spouse' || isAdult;

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Family Member</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Relation — read only, cannot be changed */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Relation</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyText}>
              {relation.charAt(0).toUpperCase() + relation.slice(1)}
            </Text>
            <Text style={styles.readOnlyHint}>Cannot be changed</Text>
          </View>
        </View>

        {/* Pending revision notice */}
        {liveRecord?.pendingRevision && (
          <View style={styles.revisionNotice}>
            <Text style={styles.revisionNoticeText}>
              ⏳  You have an edit pending admin review. Submitting again will replace the pending edit.
            </Text>
          </View>
        )}

        {/* Rejected notice */}
        {liveRecord?.status === 'rejected' && liveRecord?.rejectionNote && (
          <View style={styles.rejectionNotice}>
            <Text style={styles.rejectionTitle}>❌  Previous submission rejected</Text>
            <Text style={styles.rejectionNote}>{liveRecord.rejectionNote}</Text>
          </View>
        )}

        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Full name"
            placeholderTextColor="#a0aec0"
          />
        </View>

        {/* Date of Birth */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Date of Birth <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="DD/MM/YYYY"
            placeholderTextColor="#a0aec0"
            value={dob}
            onChangeText={setDob}
            keyboardType="numeric"
            maxLength={10}
          />
        </View>

        {/* Age indicator */}
        {dobDate && (
          <Text style={styles.ageHint}>
            Age: {age} year{age !== 1 ? 's' : ''}
            {isAdult ? '  ·  Marital & employment status required' : ''}
          </Text>
        )}

        {/* CNIC */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            CNIC{needsCnic ? <Text style={styles.required}> *</Text> : ' (optional)'}
          </Text>
          <TextInput
            style={[styles.input, !needsCnic && styles.inputOptional]}
            placeholder={needsCnic ? 'XXXXX-XXXXXXX-X' : 'Not required under 18'}
            placeholderTextColor="#a0aec0"
            value={cnic}
            onChangeText={setCnic}
            keyboardType="numeric"
            maxLength={15}
          />
        </View>

        {/* NADRA Card — under 18 only */}
        {!needsCnic && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>NADRA Smart Card No. (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputOptional]}
              placeholder="Form-B number if available"
              placeholderTextColor="#a0aec0"
              value={nadraCard}
              onChangeText={setNadraCard}
            />
          </View>
        )}

        {/* Blood Group */}
        <DropdownField
          label="Blood Group"
          value={bloodGroup}
          options={BLOOD_GROUPS}
          onSelect={setBloodGroup}
        />

        {/* Differently Abled */}
        <View style={styles.switchRow}>
          <Text style={styles.label}>Differently Abled</Text>
          <Switch
            value={differentlyAbled}
            onValueChange={setDifferentlyAbled}
            trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
            thumbColor={differentlyAbled ? '#3b82f6' : '#cbd5e0'}
          />
        </View>

        {/* Marital Status */}
        {showSpouseFields && (
          <DropdownField
            label="Marital Status"
            value={maritalStatus}
            options={MARITAL_STATUSES}
            onSelect={setMaritalStatus}
            required={isAdult}
          />
        )}

        {/* Employment Status */}
        {showSpouseFields && (
          <DropdownField
            label="Employment Status"
            value={employmentStatus}
            options={EMPLOYMENT_STATUSES}
            onSelect={setEmploymentStatus}
            required={isAdult}
          />
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.submitText}>Submit Edit for Review</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:      { flex: 1, backgroundColor: '#f0f4f8' },
  centred:      { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 20, backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:      { paddingRight: 8 },
  backText:     { fontSize: 15, color: '#3b82f6', fontWeight: '500' },
  headerTitle:  { fontSize: 18, fontWeight: 'bold', color: '#2d3748' },

  container:    { paddingHorizontal: 20, paddingTop: 20 },
  fieldGroup:   { marginBottom: 18 },
  label:        { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 6 },
  required:     { color: '#e53e3e' },

  input: {
    backgroundColor: '#ffffff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#2d3748',
  },
  inputOptional: { backgroundColor: '#f7fafc' },
  ageHint:      { fontSize: 12, color: '#3b82f6', marginTop: -12, marginBottom: 16 },

  readOnlyField: {
    backgroundColor: '#f7fafc', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 11,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  readOnlyText:  { fontSize: 14, color: '#4a5568' },
  readOnlyHint:  { fontSize: 11, color: '#a0aec0' },

  dropdown: {
    backgroundColor: '#ffffff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 11,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dropdownValue:       { fontSize: 14, color: '#2d3748' },
  dropdownPlaceholder: { fontSize: 14, color: '#a0aec0' },
  dropdownChevron:     { fontSize: 12, color: '#718096' },
  dropdownList: {
    backgroundColor: '#ffffff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    marginTop: 4, overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#f7fafc',
  },
  dropdownItemSelected:     { backgroundColor: '#eff6ff' },
  dropdownItemText:         { fontSize: 14, color: '#2d3748' },
  dropdownItemTextSelected: { color: '#3b82f6', fontWeight: '600' },

  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 18,
    backgroundColor: '#ffffff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 10,
  },

  revisionNotice: {
    backgroundColor: '#fef3c7', borderRadius: 8,
    padding: 12, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#f59e0b',
  },
  revisionNoticeText: { fontSize: 12, color: '#92400e', lineHeight: 18 },

  rejectionNotice: {
    backgroundColor: '#fee2e2', borderRadius: 8,
    padding: 12, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#e53e3e',
  },
  rejectionTitle:  { fontSize: 12, fontWeight: '700', color: '#991b1b', marginBottom: 4 },
  rejectionNote:   { fontSize: 12, color: '#991b1b', lineHeight: 18 },

  submitBtn: {
    backgroundColor: '#3b82f6', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText:        { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});