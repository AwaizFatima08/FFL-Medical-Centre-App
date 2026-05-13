// app/src/screens/ambulance/AmbulanceRequestScreen.js
// Simplified employee form:
// - Read-only: Employee Name, Number, House Number (auto-populated)
// - Editable: Patient Name (defaults to employee), Relation, Condition
// - Pickup Location (optional override — defaults to house number)
// - Purpose of Visit (replaces old Priority toggle)
// - Drop location is always FFL Medical Centre (hardcoded, not shown)
// - Trip type is always intra_township for employee (no intercity option)

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

const PURPOSE_OPTIONS = [
  { label: '🚨 Emergency',              value: 'emergency' },
  { label: '🩺 Routine Consultation',   value: 'routine_consultation' },
  { label: '🦿 Physiotherapy Visit',    value: 'physiotherapy' },
  { label: '🦷 Dental Treatment Visit', value: 'dental' },
  { label: '🧪 Laboratory Sample',      value: 'lab_sample' },
];

const BASE_URL = 'https://asia-south1-ffl-medical-centre-app.cloudfunctions.net/api';
const DROP_LOCATION = 'FFL Medical Centre';

function RadioGroup({ options, selected, onSelect }) {
  return (
    <View style={radio.wrapper}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[radio.row, selected === opt.value && radio.rowActive]}
          onPress={() => onSelect(opt.value)}
        >
          <View style={[radio.circle, selected === opt.value && radio.circleActive]}>
            {selected === opt.value && <View style={radio.dot} />}
          </View>
          <Text style={[radio.label, selected === opt.value && radio.labelActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <View style={styles.readOnlyWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.readOnlyBox}>
        <Text style={styles.readOnlyText}>{value || '—'}</Text>
      </View>
    </View>
  );
}

export default function AmbulanceRequestScreen({ navigation }) {
  const [profileLoading, setProfileLoading] = useState(true);
  const [employeeName, setEmployeeName]     = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [houseNumber, setHouseNumber]       = useState('');

  const [patientName, setPatientName]           = useState('');
  const [patientRelation, setPatientRelation]   = useState('Self');
  const [patientCondition, setPatientCondition] = useState('');
  const [purposeOfVisit, setPurposeOfVisit]     = useState('routine_consultation');
  const [pickupLocation, setPickupLocation]     = useState('');
  const [submitting, setSubmitting]             = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const auth = getAuth();
        const uid  = auth.currentUser?.uid;
        if (!uid) return;
        const db       = getFirestore();
        const empQuery = query(collection(db, 'employees'), where('userId', '==', uid));
        const snapshot = await getDocs(empQuery);
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          setEmployeeName(data.fullName || '');
          setEmployeeNumber(data.officialEmployeeNumber || '');
          setHouseNumber(data.houseNumber || '');
          setPatientName(data.fullName || '');
        }
      } catch (error) {
        console.error('Failed to load employee profile:', error);
      } finally {
        setProfileLoading(false);
      }
    };
    loadProfile();
  }, []);

  const handleSubmit = async () => {
    if (!patientName.trim()) { alert('Patient name is required.'); return; }
    if (!patientCondition.trim()) { alert('Please describe the condition.'); return; }

    setSubmitting(true);
    try {
      const auth  = getAuth();
      const token = await auth.currentUser.getIdToken();

      const response = await fetch(`${BASE_URL}/ambulance/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientName:      patientName.trim(),
          patientRelation:  patientRelation.trim() || null,
          patientCondition: patientCondition.trim(),
          vehicleType:      'mini',          // reception will reassign if needed
          purposeOfVisit,
          priorityFlag:     purposeOfVisit === 'emergency' ? 'emergency' : 'routine',
          tripType:         'intra_township',
          pickupLocation:   pickupLocation.trim() || houseNumber || null,
          dropLocation:     DROP_LOCATION,
          notes:            null,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        alert('Request submitted. Reception has been notified.');
        navigation.goBack();
      } else {
        alert(data.message || 'Request failed. Please try again.');
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3182ce" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Request Ambulance</Text>
        </View>

        {/* Requester Info — read only */}
        <Text style={styles.sectionLabel}>Your Information</Text>
        <ReadOnlyField label="Name"            value={employeeName} />
        <ReadOnlyField label="Employee Number" value={employeeNumber} />
        <ReadOnlyField label="House Number"    value={houseNumber} />

        {/* Patient Info */}
        <Text style={styles.sectionLabel}>Patient Information</Text>

        <Text style={styles.fieldLabel}>Patient Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="Full name of patient"
          value={patientName}
          onChangeText={setPatientName}
        />

        <Text style={styles.fieldLabel}>Relation to You</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Self, Spouse, Child, Parent"
          value={patientRelation}
          onChangeText={setPatientRelation}
        />

        <Text style={styles.fieldLabel}>Condition / Complaint *</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Briefly describe the condition"
          value={patientCondition}
          onChangeText={setPatientCondition}
          multiline
          numberOfLines={3}
        />

        {/* Purpose of Visit */}
        <Text style={styles.sectionLabel}>Purpose of Visit</Text>
        <RadioGroup
          options={PURPOSE_OPTIONS}
          selected={purposeOfVisit}
          onSelect={setPurposeOfVisit}
        />
        {purposeOfVisit === 'emergency' && (
          <Text style={styles.emergencyWarning}>
            ⚠️ Only select Emergency for life-threatening conditions.
          </Text>
        )}

        {/* Pickup Location */}
        <Text style={styles.sectionLabel}>Pickup Location</Text>
        <TextInput
          style={styles.input}
          placeholder={houseNumber ? `Default: House ${houseNumber}` : 'e.g. House 42, Block C'}
          value={pickupLocation}
          onChangeText={setPickupLocation}
        />
        {houseNumber && !pickupLocation && (
          <Text style={styles.hintText}>Leave blank to use your registered house number.</Text>
        )}

        {/* Drop location info — not editable */}
        <View style={styles.dropInfo}>
          <Text style={styles.dropInfoText}>🏥 Ambulance will bring patient to FFL Medical Centre</Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.submitText}>Submit Request</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer:  { flex: 1, backgroundColor: '#f0f4f8' },
  scroll: { flex: 1 },
  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f0f4f8', gap: 12,
  },
  loadingText: { fontSize: 14, color: '#718096' },
  container: { padding: 20, paddingBottom: 48 },
  header: { marginTop: 32, marginBottom: 24 },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2d3748' },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#4a5568',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 24, marginBottom: 10,
  },
  fieldLabel: { fontSize: 13, color: '#4a5568', marginBottom: 4, marginTop: 12 },
  input: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#2d3748',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  readOnlyWrapper: { marginTop: 12 },
  readOnlyBox: {
    backgroundColor: '#edf2f7', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  readOnlyText: { fontSize: 14, color: '#4a5568' },
  emergencyWarning: {
    fontSize: 12, color: '#c53030', backgroundColor: '#fff5f5',
    borderRadius: 6, padding: 10, marginTop: 8,
  },
  hintText: { fontSize: 11, color: '#a0aec0', marginTop: 4, marginLeft: 2 },
  dropInfo: {
    backgroundColor: '#ebf8ff', borderRadius: 8,
    padding: 12, marginTop: 16,
  },
  dropInfoText: { fontSize: 13, color: '#2b6cb0', fontWeight: '500' },
  submitBtn: {
    backgroundColor: '#3182ce', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center', marginTop: 32,
  },
  submitBtnDisabled: { backgroundColor: '#90cdf4' },
  submitText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});

const radio = StyleSheet.create({
  wrapper: { gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  rowActive: {
    borderColor: '#3182ce', backgroundColor: '#ebf8ff',
  },
  circle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#cbd5e0',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  circleActive: { borderColor: '#3182ce' },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#3182ce',
  },
  label: { fontSize: 14, color: '#4a5568', fontWeight: '500' },
  labelActive: { color: '#2b6cb0', fontWeight: '700' },
});