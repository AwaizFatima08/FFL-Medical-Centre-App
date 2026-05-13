// app/src/screens/ambulance/AmbulanceRequestReceptionScreen.js
// Used by Reception to raise an ambulance request on behalf of an employee.

import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

const VEHICLE_TYPES  = [{ label: 'Mini Ambulance', value: 'mini' }, { label: 'BLS Ambulance', value: 'BLS' }];
const PURPOSE_OPTIONS = [
  { label: '🚨 Emergency',              value: 'emergency' },
  { label: '🩺 Routine Consultation',   value: 'routine_consultation' },
  { label: '🦿 Physiotherapy Visit',    value: 'physiotherapy' },
  { label: '🦷 Dental Treatment Visit', value: 'dental' },
  { label: '🧪 Laboratory Sample',      value: 'lab_sample' },
];
const TRIP_TYPES = [{ label: 'Within Township', value: 'intra_township' }, { label: 'Intercity', value: 'intercity' }];

const BASE_URL = 'https://asia-south1-ffl-medical-centre-app.cloudfunctions.net/api';

function SegmentedControl({ options, selected, onSelect }) {
  return (
    <View style={seg.row}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[seg.btn, selected === opt.value && seg.btnActive]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={[seg.label, selected === opt.value && seg.labelActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

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

export default function AmbulanceRequestReceptionScreen({ navigation }) {
  const [empNumber, setEmpNumber]     = useState('');
  const [searching, setSearching]     = useState(false);
  const [employeeDoc, setEmployeeDoc] = useState(null);
  const [searchError, setSearchError] = useState('');

  const [patientName, setPatientName]           = useState('');
  const [patientRelation, setPatientRelation]   = useState('Self');
  const [patientCondition, setPatientCondition] = useState('');
  const [vehicleType, setVehicleType]           = useState('mini');
  const [purposeOfVisit, setPurposeOfVisit]     = useState('routine_consultation');
  const [tripType, setTripType]                 = useState('intra_township');
  const [pickupLocation, setPickupLocation]     = useState('');
  const [dropLocation, setDropLocation]         = useState('');
  const [notes, setNotes]                       = useState('');
  const [submitting, setSubmitting]             = useState(false);

  const handleSearch = async () => {
    const trimmed = empNumber.trim();
    if (!trimmed) { setSearchError('Please enter an employee number.'); return; }
    setSearching(true); setSearchError(''); setEmployeeDoc(null); setPatientName('');
    try {
      const db = getFirestore();
      const q  = query(collection(db, 'employees'), where('officialEmployeeNumber', '==', trimmed));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setSearchError(`No employee found with number "${trimmed}".`);
      } else {
        const data = snapshot.docs[0].data();
        setEmployeeDoc(data);
        setPatientName(data.fullName || '');
        setPickupLocation('');
      }
    } catch (error) {
      setSearchError('Search failed. Please check your connection.');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!employeeDoc) { alert('Please search for an employee first.'); return; }
    if (!patientName.trim()) { alert('Patient name is required.'); return; }
    if (!patientCondition.trim()) { alert('Condition / Complaint is required.'); return; }
    setSubmitting(true);
    try {
      const auth  = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${BASE_URL}/ambulance/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          patientName:      patientName.trim(),
          patientRelation:  patientRelation.trim() || null,
          patientCondition: patientCondition.trim(),
          vehicleType,
          purposeOfVisit,
          priorityFlag:     purposeOfVisit === 'emergency' ? 'emergency' : 'routine',
          tripType,
          pickupLocation:   pickupLocation.trim() || employeeDoc.houseNumber || null,
          dropLocation:     dropLocation.trim() || null,
          notes:            notes.trim() || null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        alert('Ambulance request submitted successfully.');
        navigation.goBack();
      } else {
        alert(data.message || 'Request failed. Please try again.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.outer}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Request Ambulance</Text>
          <Text style={styles.subtitle}>On behalf of employee</Text>
        </View>

        <Text style={styles.sectionLabel}>Step 1 — Find Employee</Text>
        <Text style={styles.fieldLabel}>Employee Number</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, styles.searchInput]}
            placeholder="Enter official employee number"
            value={empNumber}
            onChangeText={(v) => { setEmpNumber(v); setSearchError(''); }}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[styles.searchBtn, searching && styles.searchBtnDisabled]}
            onPress={handleSearch} disabled={searching}
          >
            {searching
              ? <ActivityIndicator color="#ffffff" size="small" />
              : <Text style={styles.searchBtnText}>Search</Text>
            }
          </TouchableOpacity>
        </View>
        {searchError !== '' && <Text style={styles.errorText}>{searchError}</Text>}

        {employeeDoc && (
          <View style={styles.employeeCard}>
            <Text style={styles.employeeCardTitle}>✅ Employee Found</Text>
            <ReadOnlyField label="Full Name"    value={employeeDoc.fullName} />
            <ReadOnlyField label="House Number" value={employeeDoc.houseNumber} />
            <ReadOnlyField label="Phone Number" value={employeeDoc.phoneNumber} />
            <ReadOnlyField label="Department"   value={employeeDoc.department} />
          </View>
        )}

        {employeeDoc && (
          <>
            <Text style={styles.sectionLabel}>Step 2 — Patient Information</Text>
            <Text style={styles.fieldLabel}>Patient Name *</Text>
            <TextInput style={styles.input} placeholder="Full name of patient" value={patientName} onChangeText={setPatientName} />
            <Text style={styles.fieldLabel}>Relation to Employee</Text>
            <TextInput style={styles.input} placeholder="e.g. Self, Spouse, Child" value={patientRelation} onChangeText={setPatientRelation} />
            <Text style={styles.fieldLabel}>Condition / Complaint *</Text>
            <TextInput style={[styles.input, styles.multiline]} placeholder="Briefly describe the condition" value={patientCondition} onChangeText={setPatientCondition} multiline numberOfLines={3} />

            <Text style={styles.sectionLabel}>Vehicle Type</Text>
            <SegmentedControl options={VEHICLE_TYPES} selected={vehicleType} onSelect={setVehicleType} />

            <Text style={styles.sectionLabel}>Purpose of Visit</Text>
            <RadioGroup
              options={PURPOSE_OPTIONS}
              selected={purposeOfVisit}
              onSelect={setPurposeOfVisit}
            />
            {purposeOfVisit === 'emergency' && (
              <Text style={styles.emergencyWarning}>⚠️ Emergency requests take immediate priority over all routine requests.</Text>
            )}

            <Text style={styles.sectionLabel}>Trip Type</Text>
            <SegmentedControl options={TRIP_TYPES} selected={tripType} onSelect={setTripType} />

            <Text style={styles.sectionLabel}>Locations</Text>
            <Text style={styles.fieldLabel}>Pickup Location</Text>
            <TextInput
              style={styles.input}
              placeholder={employeeDoc.houseNumber ? `Default: House ${employeeDoc.houseNumber}` : 'e.g. House 42, Block C'}
              value={pickupLocation} onChangeText={setPickupLocation}
            />
            {employeeDoc.houseNumber && !pickupLocation && (
              <Text style={styles.hintText}>Leave blank to use employee's registered house number.</Text>
            )}
            <Text style={styles.fieldLabel}>Drop Location</Text>
            <TextInput style={styles.input} placeholder="e.g. DHQ Hospital, RYK" value={dropLocation} onChangeText={setDropLocation} />

            <Text style={styles.sectionLabel}>Additional Notes</Text>
            <TextInput style={[styles.input, styles.multiline]} placeholder="Any other information" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>Submit Request</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer:  { flex: 1, backgroundColor: '#f0f4f8' },
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 48 },
  header: { marginTop: 32, marginBottom: 24 },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 13, color: '#718096', marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 10 },
  fieldLabel: { fontSize: 13, color: '#4a5568', marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#2d3748' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchInput: { flex: 1 },
  searchBtn: { backgroundColor: '#3182ce', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 11 },
  searchBtnDisabled: { backgroundColor: '#90cdf4' },
  searchBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  errorText: { color: '#c53030', fontSize: 13, marginTop: 8, backgroundColor: '#fff5f5', padding: 10, borderRadius: 6 },
  employeeCard: { backgroundColor: '#f0fff4', borderWidth: 1, borderColor: '#c6f6d5', borderRadius: 10, padding: 14, marginTop: 16 },
  employeeCardTitle: { fontSize: 13, fontWeight: '700', color: '#276749', marginBottom: 4 },
  readOnlyWrapper: { marginTop: 10 },
  readOnlyBox: { backgroundColor: '#edf2f7', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  readOnlyText: { fontSize: 14, color: '#4a5568' },
  emergencyWarning: { fontSize: 12, color: '#c53030', backgroundColor: '#fff5f5', borderRadius: 6, padding: 10, marginTop: 8 },
  hintText: { fontSize: 11, color: '#a0aec0', marginTop: 4, marginLeft: 2 },
  submitBtn: { backgroundColor: '#3182ce', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 32 },
  submitBtnDisabled: { backgroundColor: '#90cdf4' },
  submitText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});

const seg = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 8, padding: 3 },
  btn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  btnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  label: { fontSize: 13, color: '#718096', fontWeight: '500' },
  labelActive: { color: '#2d3748', fontWeight: '700' },
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