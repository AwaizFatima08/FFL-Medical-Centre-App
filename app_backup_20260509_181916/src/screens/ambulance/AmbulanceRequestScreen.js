// app/src/screens/ambulance/AmbulanceRequestScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { API } from '../../config/api';

const PRIORITY_FLAGS = [
  { label: 'Routine',   value: 'routine' },
  { label: 'Emergency', value: 'emergency' },
];
const DROP_LOCATION = 'FFL Medical Centre';

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
  const [priorityFlag, setPriorityFlag]         = useState('routine');
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
        console.error('Failed to load profile:', error);
      } finally {
        setProfileLoading(false);
      }
    };
    loadProfile();
  }, []);

  const handleSubmit = async () => {
    if (!patientName.trim())      { alert('Patient name is required.'); return; }
    if (!patientCondition.trim()) { alert('Please describe the condition.'); return; }
    setSubmitting(true);
    try {
      const auth  = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.ambulance}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          patientName:      patientName.trim(),
          patientRelation:  patientRelation.trim() || null,
          patientCondition: patientCondition.trim(),
          vehicleType:      'mini',
          priorityFlag,
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Request Ambulance</Text>
        </View>

        <Text style={styles.sectionLabel}>Your Information</Text>
        <ReadOnlyField label="Name"            value={employeeName} />
        <ReadOnlyField label="Employee Number" value={employeeNumber} />
        <ReadOnlyField label="House Number"    value={houseNumber} />

        <Text style={styles.sectionLabel}>Patient Information</Text>
        <Text style={styles.fieldLabel}>Patient Name *</Text>
        <TextInput style={styles.input} placeholder="Full name of patient" value={patientName} onChangeText={setPatientName} />
        <Text style={styles.fieldLabel}>Relation to You</Text>
        <TextInput style={styles.input} placeholder="e.g. Self, Spouse, Child, Parent" value={patientRelation} onChangeText={setPatientRelation} />
        <Text style={styles.fieldLabel}>Condition / Complaint *</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder="Briefly describe the condition" value={patientCondition} onChangeText={setPatientCondition} multiline numberOfLines={3} />

        <Text style={styles.sectionLabel}>Priority</Text>
        <SegmentedControl options={PRIORITY_FLAGS} selected={priorityFlag} onSelect={setPriorityFlag} />
        {priorityFlag === 'emergency' && (
          <Text style={styles.emergencyWarning}>⚠️ Only select Emergency for life-threatening conditions.</Text>
        )}

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

        <View style={styles.dropInfo}>
          <Text style={styles.dropInfoText}>🏥 Ambulance will bring patient to FFL Medical Centre</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit} disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>Submit Request</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer:  { flex: 1, backgroundColor: '#f0f4f8' },
  scroll: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8', gap: 12 },
  loadingText: { fontSize: 14, color: '#718096' },
  container: { padding: 20, paddingBottom: 48 },
  header: { marginTop: 32, marginBottom: 24 },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2d3748' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 10 },
  fieldLabel: { fontSize: 13, color: '#4a5568', marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#2d3748' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  readOnlyWrapper: { marginTop: 12 },
  readOnlyBox: { backgroundColor: '#edf2f7', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  readOnlyText: { fontSize: 14, color: '#4a5568' },
  emergencyWarning: { fontSize: 12, color: '#c53030', backgroundColor: '#fff5f5', borderRadius: 6, padding: 10, marginTop: 8 },
  hintText: { fontSize: 11, color: '#a0aec0', marginTop: 4, marginLeft: 2 },
  dropInfo: { backgroundColor: '#ebf8ff', borderRadius: 8, padding: 12, marginTop: 16 },
  dropInfoText: { fontSize: 13, color: '#2b6cb0', fontWeight: '500' },
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
