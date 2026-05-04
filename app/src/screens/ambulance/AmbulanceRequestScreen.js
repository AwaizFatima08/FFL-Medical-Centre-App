// app/src/screens/ambulance/AmbulanceRequestScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const VEHICLE_TYPES  = [{ label: 'Mini Ambulance', value: 'mini' }, { label: 'BLS Ambulance', value: 'BLS' }];
const PRIORITY_FLAGS = [{ label: 'Routine', value: 'routine' }, { label: 'Emergency', value: 'emergency' }];
const TRIP_TYPES     = [{ label: 'Within Township', value: 'intra_township' }, { label: 'Intercity', value: 'intercity' }];

function SegmentedControl({ options, selected, onSelect }) {
  return (
    <View style={seg.row}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[seg.btn, selected === opt.value && seg.btnActive]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={[seg.label, selected === opt.value && seg.labelActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AmbulanceRequestScreen({ navigation }) {
  const [patientName, setPatientName]           = useState('');
  const [patientRelation, setPatientRelation]   = useState('');
  const [patientCondition, setPatientCondition] = useState('');
  const [vehicleType, setVehicleType]           = useState('mini');
  const [priorityFlag, setPriorityFlag]         = useState('routine');
  const [tripType, setTripType]                 = useState('intra_township');
  const [pickupLocation, setPickupLocation]     = useState('');
  const [dropLocation, setDropLocation]         = useState('');
  const [notes, setNotes]                       = useState('');
  const [loading, setLoading]                   = useState(false);

  const handleSubmit = async () => {
    if (!patientName.trim()) {
      alert('Patient name is required.');
      return;
    }
    if (!patientCondition.trim()) {
      alert('Patient condition is required.');
      return;
    }

    setLoading(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();

      const response = await fetch(
        'https://asia-south1-ffl-medical-centre-app.cloudfunctions.net/api/ambulance/request',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            patientName:      patientName.trim(),
            patientRelation:  patientRelation.trim() || null,
            patientCondition: patientCondition.trim(),
            vehicleType,
            priorityFlag,
            tripType,
            pickupLocation:   pickupLocation.trim() || null,
            dropLocation:     dropLocation.trim() || null,
            notes:            notes.trim() || null,
          }),
        }
      );

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
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Request Ambulance</Text>
      </View>

      {/* Patient Info */}
      <Text style={styles.sectionLabel}>Patient Information</Text>

      <Text style={styles.fieldLabel}>Patient Name *</Text>
      <TextInput
        style={styles.input}
        placeholder="Full name of patient"
        value={patientName}
        onChangeText={setPatientName}
      />

      <Text style={styles.fieldLabel}>Relation to Patient</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Self, Spouse, Child"
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

      {/* Vehicle Type */}
      <Text style={styles.sectionLabel}>Vehicle Type</Text>
      <SegmentedControl
        options={VEHICLE_TYPES}
        selected={vehicleType}
        onSelect={setVehicleType}
      />

      {/* Priority */}
      <Text style={styles.sectionLabel}>Priority</Text>
      <SegmentedControl
        options={PRIORITY_FLAGS}
        selected={priorityFlag}
        onSelect={setPriorityFlag}
      />
      {priorityFlag === 'emergency' && (
        <Text style={styles.emergencyWarning}>
          ⚠️ Emergency requests take immediate priority over all routine requests.
        </Text>
      )}

      {/* Trip Type */}
      <Text style={styles.sectionLabel}>Trip Type</Text>
      <SegmentedControl
        options={TRIP_TYPES}
        selected={tripType}
        onSelect={setTripType}
      />

      {/* Locations */}
      <Text style={styles.sectionLabel}>Locations (Optional)</Text>

      <Text style={styles.fieldLabel}>Pickup Location</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. House 42, Block C"
        value={pickupLocation}
        onChangeText={setPickupLocation}
      />

      <Text style={styles.fieldLabel}>Drop Location</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. DHQ Hospital, RYK"
        value={dropLocation}
        onChangeText={setDropLocation}
      />

      {/* Notes */}
      <Text style={styles.sectionLabel}>Additional Notes</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Any other information for the driver or medical staff"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
      />

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#ffffff" />
          : <Text style={styles.submitText}>Submit Request</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f0f4f8',
    padding: 20,
    paddingBottom: 48,
  },
  header: {
    marginTop: 32,
    marginBottom: 24,
  },
  backBtn: {
    marginBottom: 8,
  },
  backText: {
    fontSize: 14,
    color: '#3182ce',
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4a5568',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#4a5568',
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#2d3748',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  emergencyWarning: {
    fontSize: 12,
    color: '#c53030',
    backgroundColor: '#fff5f5',
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  submitBtn: {
    backgroundColor: '#3182ce',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 32,
  },
  submitBtnDisabled: {
    backgroundColor: '#90cdf4',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

const seg = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    padding: 3,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  btnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
  },
  labelActive: {
    color: '#2d3748',
    fontWeight: '700',
  },
});
