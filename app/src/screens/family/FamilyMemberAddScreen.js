// app/src/screens/family/FamilyMemberAddScreen.js

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, collection, query, where,
  getDocs, addDoc, Timestamp,
} from 'firebase/firestore';
import {
  FAMILY_RELATIONS, BLOOD_GROUPS,
  MARITAL_STATUSES, EMPLOYMENT_STATUSES,
} from '../../constants';

// ─── Simple dropdown component ────────────────────────────────────────────────
function DropdownField({ label, value, options, onSelect, required, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>
        {label}{required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={[styles.dropdown, disabled && styles.inputDisabled]}
        onPress={() => !disabled && setOpen(!open)}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <Text style={value ? styles.dropdownValue : styles.dropdownPlaceholder}>
          {value
            ? options.find(o => (o.value || o) === value)?.label ||
              value.charAt(0).toUpperCase() + value.slice(1)
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

// ─── Date input ───────────────────────────────────────────────────────────────
function DateField({ label, value, onChange, required }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>
        {label}{required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="DD/MM/YYYY"
        placeholderTextColor="#a0aec0"
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        maxLength={10}
      />
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function FamilyMemberAddScreen({ navigation }) {
  const [relation,         setRelation]         = useState('');
  const [name,             setName]             = useState('');
  const [dob,              setDob]              = useState('');
  const [cnic,             setCnic]             = useState('');
  const [nadraCard,        setNadraCard]        = useState('');
  const [bloodGroup,       setBloodGroup]       = useState('');
  const [differentlyAbled, setDifferentlyAbled] = useState(false);
  const [maritalStatus,    setMaritalStatus]    = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('');
  const [motherId,         setMotherId]         = useState('');
  const [spouses,          setSpouses]          = useState([]);
  const [saving,           setSaving]           = useState(false);

  const db  = getFirestore();
  const auth = getAuth();
  const uid  = auth.currentUser?.uid;

  const dobDate   = parseDate(dob);
  const age       = ageInYears(dobDate);
  const isAdult   = dobDate ? age >= 25 : false;
  const needsCnic = dobDate ? age >= 18 : false;
  const isChild   = relation === 'son' || relation === 'daughter';

  // ─── Load existing spouse records for optional mother linking ───────────────
  useEffect(() => {
    if (!isChild || !uid) return;
    const fetchSpouses = async () => {
      try {
        const q    = query(
          collection(db, 'familyMembers'),
          where('employeeId', '==', uid),
          where('relation',   '==', 'spouse'),
          where('isActive',   '==', true),
        );
        const snap = await getDocs(q);
        setSpouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Spouse fetch error:', err);
      }
    };
    fetchSpouses();
  }, [isChild, uid, db]);

  // ─── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    if (!relation)    { Alert.alert('Required', 'Please select a relation.'); return false; }
    if (!name.trim()) { Alert.alert('Required', 'Please enter the full name.'); return false; }
    if (!dob)         { Alert.alert('Required', 'Please enter date of birth.'); return false; }
    if (!dobDate)     { Alert.alert('Invalid Date', 'Please enter date as DD/MM/YYYY.'); return false; }
    if (dobDate > new Date()) {
      Alert.alert('Invalid Date', 'Date of birth cannot be in the future.');
      return false;
    }
    if (needsCnic && !cnic.trim()) {
      Alert.alert('Required', 'CNIC is mandatory for family members aged 18 and above.');
      return false;
    }
    if (isAdult && !maritalStatus) {
      Alert.alert('Required', 'Marital status is mandatory for members aged 25 and above.');
      return false;
    }
    if (isAdult && !employmentStatus) {
      Alert.alert('Required', 'Employment status is mandatory for members aged 25 and above.');
      return false;
    }
    return true;
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Resolve motherId — auto-select if only one spouse, use selection if multiple
      let resolvedMotherId = null;
      if (isChild) {
        if (spouses.length === 1)              resolvedMotherId = spouses[0].id;
        else if (spouses.length > 1 && motherId) resolvedMotherId = motherId;
        // No spouse records — motherId stays null, shows as Not provided on report
      }

      await addDoc(collection(db, 'familyMembers'), {
        employeeId:       uid,
        name:             name.trim(),
        relation,
        dateOfBirth:      Timestamp.fromDate(dobDate),
        cnic:             needsCnic ? cnic.trim() : null,
        nadraCardNumber:  (!needsCnic && nadraCard.trim()) ? nadraCard.trim() : null,
        bloodGroup:       bloodGroup || null,
        differentlyAbled,
        maritalStatus:    isAdult ? maritalStatus : null,
        employmentStatus: isAdult ? employmentStatus : null,
        motherId:         resolvedMotherId,
        status:           'pending',
        isActive:         true,
        pendingRevision:  null,
        rejectionNote:    null,
        createdAt:        Timestamp.now(),
        updatedAt:        Timestamp.now(),
      });

      Alert.alert(
        'Submitted',
        'Family member added successfully. Admin will review and validate the record.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      console.error('FamilyMemberAdd save error:', err);
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  const showSpouseFields = relation === 'spouse' || isAdult;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Family Member</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Relation */}
        <DropdownField
          label="Relation"
          value={relation}
          options={FAMILY_RELATIONS}
          onSelect={setRelation}
          required
        />

        {/* Mother selection — only if child and multiple spouses exist */}
        {isChild && spouses.length > 1 && (
          <DropdownField
            label="Mother (optional)"
            value={motherId}
            options={spouses.map(s => ({ label: s.name, value: s.id }))}
            onSelect={setMotherId}
          />
        )}

        {/* Soft advisory — child with no spouse records at all */}
        {isChild && spouses.length === 0 && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              ℹ  Adding a spouse record will link this child to their mother on
              vaccination records. This is optional — you can proceed without it.
            </Text>
          </View>
        )}

        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="Enter full name"
            placeholderTextColor="#a0aec0"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </View>

        {/* Date of Birth */}
        <DateField label="Date of Birth" value={dob} onChange={setDob} required />

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

        {/* NADRA Smart Card — under 18 only */}
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

        {/* Marital & Employment Status */}
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

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.submitText}>Submit for Validation</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:      { flex: 1, backgroundColor: '#f0f4f8' },
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
  inputDisabled: { backgroundColor: '#f7fafc', opacity: 0.6 },
  ageHint:      { fontSize: 12, color: '#3b82f6', marginTop: -12, marginBottom: 16 },
  infoBox: {
    backgroundColor: '#eff6ff', borderRadius: 8,
    padding: 12, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#3b82f6',
  },
  infoText:     { fontSize: 12, color: '#1e40af', lineHeight: 18 },
  dropdown: {
    backgroundColor: '#ffffff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 11,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dropdownValue:            { fontSize: 14, color: '#2d3748' },
  dropdownPlaceholder:      { fontSize: 14, color: '#a0aec0' },
  dropdownChevron:          { fontSize: 12, color: '#718096' },
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
  submitBtn: {
    backgroundColor: '#3b82f6', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText:        { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});