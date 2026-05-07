// app/src/screens/directory/DirectoryAddEditScreen.js
// Flow 5 — Doctor Directory
// Add a new doctor or edit an existing one
// Accessible to: admin_incharge only

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';

const CITIES = ['Rahimyarkhan', 'Sadiqabad', 'Bahawalpur', 'Other'];

export default function DirectoryAddEditScreen({ navigation, route }) {
  const { entryId, userRole } = route.params || {};
  const isEditing = !!entryId;

  const [name, setName] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [hospital, setHospital] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');

  const [loadingEntry, setLoadingEntry] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  // If editing, load existing data
  useEffect(() => {
    if (!isEditing) return;
    const load = async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${API.directory}/${entryId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok && data.data) {
          const e = data.data;
          setName(e.name || '');
          setSpeciality(e.speciality || '');
          setHospital(e.hospital || '');
          setAddress(e.address || '');
          setPhone(e.phone || '');
          setCity(e.city || '');
        } else {
          alert(data.message || 'Failed to load entry.');
          navigation.goBack();
        }
      } catch {
        alert('Network error. Please try again.');
        navigation.goBack();
      } finally {
        setLoadingEntry(false);
      }
    };
    load();
  }, [entryId]);

  const validate = () => {
    if (!name.trim()) { alert('Doctor name is required.'); return false; }
    if (!speciality.trim()) { alert('Speciality is required.'); return false; }
    if (!hospital.trim()) { alert('Hospital name is required.'); return false; }
    if (!phone.trim()) { alert('Phone number is required.'); return false; }
    if (!city) { alert('Please select a city.'); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const payload = {
        name: name.trim(),
        speciality: speciality.trim(),
        hospital: hospital.trim(),
        address: address.trim(),
        phone: phone.trim(),
        city,
      };

      const url = isEditing ? `${API.directory}/${entryId}` : `${API.directory}/add`;
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (response.ok) {
        navigation.goBack();
      } else {
        alert(data.message || 'Failed to save. Please try again.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingEntry) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3182ce" />
        <Text style={styles.loadingText}>Loading entry...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isEditing ? 'Edit Doctor' : 'Add Doctor'}</Text>
        <Text style={styles.subtitle}>
          {isEditing ? 'Update the details below' : 'Fill in the details below'}
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        <View style={styles.section}>

          <Field label="Full Name *" placeholder="e.g. Dr. Ahmed Raza">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Dr. Ahmed Raza"
              placeholderTextColor="#a0aec0"
            />
          </Field>

          <Field label="Speciality *" placeholder="e.g. Cardiologist">
            <TextInput
              style={styles.input}
              value={speciality}
              onChangeText={setSpeciality}
              placeholder="e.g. Cardiologist"
              placeholderTextColor="#a0aec0"
            />
          </Field>

          <Field label="Hospital / Clinic *" placeholder="e.g. Sheikh Zayed Hospital">
            <TextInput
              style={styles.input}
              value={hospital}
              onChangeText={setHospital}
              placeholder="e.g. Sheikh Zayed Hospital"
              placeholderTextColor="#a0aec0"
            />
          </Field>

          <Field label="Address" placeholder="Street, area or landmark">
            <TextInput
              style={[styles.input, styles.multiline]}
              value={address}
              onChangeText={setAddress}
              placeholder="Street, area or landmark"
              placeholderTextColor="#a0aec0"
              multiline
              numberOfLines={3}
            />
          </Field>

          <Field label="Phone Number *" placeholder="e.g. 0300-1234567">
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. 0300-1234567"
              placeholderTextColor="#a0aec0"
              keyboardType="phone-pad"
            />
          </Field>

          <Field label="City *">
            <View style={styles.cityRow}>
              {CITIES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.cityChip, city === c && styles.cityChipSelected]}
                  onPress={() => setCity(c)}
                >
                  <Text style={[styles.cityChipText, city === c && styles.cityChipTextSelected]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Add Doctor'}</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Reusable field wrapper
function Field({ label, children }) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },

  header: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginBottom: 6 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 13, color: '#718096', marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  fieldWrapper: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4a5568',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#2d3748',
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },

  cityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cityChip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#f7fafc',
  },
  cityChipSelected: {
    backgroundColor: '#3182ce',
    borderColor: '#3182ce',
  },
  cityChipText: { fontSize: 13, color: '#4a5568', fontWeight: '600' },
  cityChipTextSelected: { color: '#ffffff' },

  saveBtn: {
    backgroundColor: '#3182ce',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 40,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#718096', fontSize: 14 },
});