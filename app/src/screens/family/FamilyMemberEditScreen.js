// app/src/screens/family/FamilyMemberEditScreen.js
//
// Phase 10 fix: Gender field added below. Routed through pendingRevision
// like name/dateOfBirth/cnic/bloodGroup — identity data requiring admin
// review, NOT a direct write like bloodDonorConsent's toggle below.
import { webAlert, webConfirm } from '../../utils/webAlert';

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Switch,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, doc, getDoc, updateDoc, setDoc, deleteDoc,
  collection, query, where, getDocs, Timestamp,
} from 'firebase/firestore';
import {
  BLOOD_GROUPS, GENDERS, MARITAL_STATUSES, EMPLOYMENT_STATUSES,
} from '../../constants';
import DatePickerField from '../../components/DatePickerField';

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

export default function FamilyMemberEditScreen({ route, navigation }) {
  const { memberId } = route.params;

  const [loading,          setLoading]          = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [liveRecord,       setLiveRecord]       = useState(null);

  const [name,             setName]             = useState('');
  const [dob,              setDob]              = useState(null);
  const [gender,           setGender]           = useState(''); // Phase 10 fix
  const [cnic,             setCnic]             = useState('');
  const [nadraCard,        setNadraCard]        = useState('');
  const [bloodGroup,       setBloodGroup]       = useState('');
  const [differentlyAbled, setDifferentlyAbled] = useState(false);
  const [maritalStatus,    setMaritalStatus]    = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('');

  // Day 14 fix #3 — family member blood donor consent
  const [bloodDonorConsent, setBloodDonorConsent] = useState(false);

  const db  = getFirestore();
  const auth = getAuth();

  const dobDate   = dob instanceof Date ? dob : null;
  const age       = ageInYears(dobDate);
  const isAdult   = dobDate ? age >= 25 : false;
  const needsCnic = dobDate ? age >= 18 : false;

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

        if (data.employeeId !== auth.currentUser?.uid) {
          webAlert('Error', 'Unauthorised access.');
          navigation.goBack();
          return;
        }

        setLiveRecord({ id: snap.id, ...data });

        const source = data.pendingRevision || data;
        setName(source.name || '');
        setDob(source.dateOfBirth
          ? (source.dateOfBirth.toDate ? source.dateOfBirth.toDate() : new Date(source.dateOfBirth))
          : null);
        setGender(source.gender || ''); // Phase 10 fix
        setCnic(source.cnic || '');
        setNadraCard(source.nadraCardNumber || '');
        setBloodGroup(source.bloodGroup || '');
        setDifferentlyAbled(source.differentlyAbled || false);
        setMaritalStatus(source.maritalStatus || '');
        setEmploymentStatus(source.employmentStatus || '');
        // Day 14 fix #3 — always from the live record, not pendingRevision
        // (consent is a direct, admin-review-free field like the employee's
        // own — see handleToggleConsent below).
        setBloodDonorConsent(!!data.bloodDonorConsent);
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

  const validate = () => {
    if (!name.trim()) { webAlert('Required', 'Full name cannot be empty.'); return false; }
    if (!dob)         { webAlert('Required', 'Date of birth is required.'); return false; }
    if (dobDate > new Date()) {
      webAlert('Invalid Date', 'Date of birth cannot be in the future.');
      return false;
    }
    // Phase 10 fix
    if (!gender) { webAlert('Required', 'Please select gender.'); return false; }
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

  const handleSubmit = async () => {
    if (!validate()) return;

    const live = liveRecord;
    const liveDobDate = live.dateOfBirth
      ? (live.dateOfBirth.toDate ? live.dateOfBirth.toDate() : new Date(live.dateOfBirth))
      : null;
    const noChange =
      name.trim()        === (live.name || '') &&
      dob?.getTime()     === liveDobDate?.getTime() &&
      gender             === (live.gender || '') &&
      cnic.trim()        === (live.cnic || '') &&
      nadraCard.trim()   === (live.nadraCardNumber || '') &&
      bloodGroup         === (live.bloodGroup || '') &&
      differentlyAbled   === (live.differentlyAbled || false) &&
      maritalStatus      === (live.maritalStatus || '') &&
      employmentStatus   === (live.employmentStatus || '');

    if (noChange) {
      webAlert('No Changes', 'You have not made any changes to this record.');
      return;
    }

    setSaving(true);
    try {
      const revision = {
        name:             name.trim(),
        dateOfBirth:      dobDate ? Timestamp.fromDate(dobDate) : liveRecord.dateOfBirth,
        gender,           // ← Phase 10 fix
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

  // Day 14 fix #3 — blood donor consent is a direct write, NOT routed
  // through pendingRevision/admin review. Mirrors the employee-level
  // consent's treatment (Phase 4 design: consent is always self-service).
  //
  // Day 14 fix: this previously only updated the flag on the family
  // member's own record and never touched bloodDonorRegistry — the
  // collection the Directory screen actually reads from. Consent looked
  // like it worked but never surfaced anywhere. Fixed to mirror exactly
  // what the employee's own consent flow does (see employeeRoutes.js
  // PUT /:employeeId), keyed `family_{memberId}` so it can never collide
  // with an employee-keyed entry.
  const handleToggleConsent = async (value) => {
    setBloodDonorConsent(value);
    try {
      await updateDoc(doc(db, 'familyMembers', memberId), {
        bloodDonorConsent: value,
        updatedAt:         Timestamp.now(),
      });
      setLiveRecord(prev => ({ ...prev, bloodDonorConsent: value }));

      const registryRef = doc(db, 'bloodDonorRegistry', `family_${memberId}`);
      if (value && bloodGroup) {
        const empQ = query(collection(db, 'employees'), where('userId', '==', auth.currentUser?.uid));
        const empSnap = await getDocs(empQ);
        const empData = empSnap.empty ? {} : empSnap.docs[0].data();
        await setDoc(registryRef, {
          familyMemberId:         memberId,
          employeeId:             auth.currentUser?.uid,
          fullName:               name.trim(),
          relation:               liveRecord?.relation || null,
          officialEmployeeNumber: empData.officialEmployeeNumber || null,
          bloodGroup,
          phoneNumber:            empData.phoneNumber || null,
          consentGiven:           true,
          consentUpdatedAt:       Timestamp.now(),
        });
      } else {
        await deleteDoc(registryRef).catch(() => {}); // fine if it never existed
      }
    } catch (err) {
      console.error('Update family member consent error:', err);
      webAlert('Error', 'Could not update consent. Please try again.');
      setBloodDonorConsent(!value);
    }
  };

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Family Member</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Relation</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyText}>
              {relation.charAt(0).toUpperCase() + relation.slice(1)}
            </Text>
            <Text style={styles.readOnlyHint}>Cannot be changed</Text>
          </View>
        </View>

        {liveRecord?.pendingRevision && (
          <View style={styles.revisionNotice}>
            <Text style={styles.revisionNoticeText}>
              ⏳  You have an edit pending admin review. Submitting again will replace the pending edit.
            </Text>
          </View>
        )}

        {liveRecord?.status === 'rejected' && liveRecord?.rejectionNote && (
          <View style={styles.rejectionNotice}>
            <Text style={styles.rejectionTitle}>❌  Previous submission rejected</Text>
            <Text style={styles.rejectionNote}>{liveRecord.rejectionNote}</Text>
          </View>
        )}

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

        <DatePickerField
          label="Date of Birth *"
          value={dob}
          onChange={setDob}
          maximumDate={new Date()}
        />

        {dobDate && (
          <Text style={styles.ageHint}>
            Age: {age} year{age !== 1 ? 's' : ''}
            {isAdult ? '  ·  Marital & employment status required' : ''}
          </Text>
        )}

        {/* Phase 10 fix — Gender */}
        <DropdownField
          label="Gender"
          value={gender}
          options={GENDERS}
          onSelect={setGender}
          required
        />

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

        <DropdownField
          label="Blood Group"
          value={bloodGroup}
          options={BLOOD_GROUPS}
          onSelect={setBloodGroup}
        />

        {/* Day 14 fix #3 — Blood Donor Consent, direct write, no review.
            Disabled (not hidden) for minors — consent isn't meaningful
            under 18. */}
        {bloodGroup ? (
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Consent to Blood Donor Directory ({bloodGroup})</Text>
              {!needsCnic && <Text style={styles.consentDisabledHint}>Not applicable under 18</Text>}
            </View>
            <Switch
              value={needsCnic ? bloodDonorConsent : false}
              onValueChange={handleToggleConsent}
              disabled={!needsCnic}
              trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
              thumbColor={(needsCnic && bloodDonorConsent) ? '#3b82f6' : '#cbd5e0'}
            />
          </View>
        ) : null}

        <View style={styles.switchRow}>
          <Text style={styles.label}>Differently Abled</Text>
          <Switch
            value={differentlyAbled}
            onValueChange={setDifferentlyAbled}
            trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
            thumbColor={differentlyAbled ? '#3b82f6' : '#cbd5e0'}
          />
        </View>

        {showSpouseFields && (
          <DropdownField
            label="Marital Status"
            value={maritalStatus}
            options={MARITAL_STATUSES}
            onSelect={setMaritalStatus}
            required={isAdult}
          />
        )}

        {showSpouseFields && (
          <DropdownField
            label="Employment Status"
            value={employmentStatus}
            options={EMPLOYMENT_STATUSES}
            onSelect={setEmploymentStatus}
            required={isAdult}
          />
        )}

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
  consentDisabledHint: { fontSize: 11, color: '#a0aec0', marginTop: 2 },

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