// app/src/screens/trip/TripBookingScreen.js
// Flow 4 — Medical Trip
// Employee books a seat on the medical trip
// Trips run Mon / Wed / Sat — depart 17:30, return 21:00 from RYK

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
  Modal, FlatList,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';

const TRIP_DAYS = ['Monday', 'Wednesday', 'Saturday'];
const MAX_SEATS = 4;
const RELATIONS = ['Self', 'Wife', 'Son', 'Daughter', 'Father', 'Mother', 'Other'];
const ALL = 'All';

function getUpcomingTripDates(count = 6) {
  const results = [];
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let cursor = new Date(todayLocal);
  let attempts = 0;
  while (results.length < count && attempts < 60) {
    const dayName = cursor.toLocaleDateString('en-US', { weekday: 'long' });
    if (TRIP_DAYS.includes(dayName)) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      results.push({
        label: cursor.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' }),
        value: `${y}-${m}-${d}`,
        dayName,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
    attempts++;
  }
  return results;
}

export default function TripBookingScreen({ navigation, route }) {
  const { userRole } = route.params || {};
  const upcomingDates = getUpcomingTripDates(6);

  const [selectedDate, setSelectedDate]                   = useState('');
  const [pickupHouse, setPickupHouse]                     = useState('');
  const [loadingProfile, setLoadingProfile]               = useState(true);
  const [seats, setSeats]                                 = useState(1);
  const [patientName, setPatientName]                     = useState('');
  const [patientRelation, setPatientRelation]             = useState('Self');

  // Doctor state
  const [doctors, setDoctors]                             = useState([]);
  const [loadingDoctors, setLoadingDoctors]               = useState(true);
  const [selectedDoctorId, setSelectedDoctorId]           = useState('');
  const [selectedDoctorName, setSelectedDoctorName]       = useState('');
  const [selectedDoctorSpec, setSelectedDoctorSpec]       = useState('');
  const [selectedDoctorHospital, setSelectedDoctorHospital] = useState(''); // ← NEW
  const [doctorFreeText, setDoctorFreeText]               = useState('');

  // Modal state
  const [showSpecModal, setShowSpecModal]                 = useState(false);
  const [showDoctorModal, setShowDoctorModal]             = useState(false);
  const [specModalSearch, setSpecModalSearch]             = useState('');
  const [doctorModalSearch, setDoctorModalSearch]         = useState('');
  const [specialityFilter, setSpecialityFilter]           = useState(ALL);

  const [referralConfirmed, setReferralConfirmed]         = useState(false);
  const [overnightStay, setOvernightStay]                 = useState(false);
  const [returnTrip, setReturnTrip]                       = useState(true);
  const [notes, setNotes]                                 = useState('');
  const [saving, setSaving]                               = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${API.employees}/profile`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok && data.data?.houseNumber) {
          setPickupHouse(data.data.houseNumber);
        }
      } catch {}
      finally { setLoadingProfile(false); }
    };
    loadProfile();
  }, []);

  useEffect(() => {
    const loadDoctors = async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${API.directory}/list`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok) setDoctors(data.data || []);
      } catch {}
      finally { setLoadingDoctors(false); }
    };
    loadDoctors();
  }, []);

  // Unique specialities from loaded doctors
  const specialityOptions = [
    ALL,
    ...Array.from(new Set(doctors.map(d => d.speciality).filter(Boolean))).sort(),
  ];

  // Doctors filtered by selected speciality + modal search
  const filteredDoctors = doctors
    .filter(d => specialityFilter === ALL || d.speciality === specialityFilter)
    .filter(d => !doctorModalSearch.trim() ||
      d.name?.toLowerCase().includes(doctorModalSearch.toLowerCase()) ||
      d.hospital?.toLowerCase().includes(doctorModalSearch.toLowerCase())
    );

  const filteredSpecialities = specialityOptions.filter(s =>
    s.toLowerCase().includes(specModalSearch.toLowerCase())
  );

  const handleSelectSpeciality = (spec) => {
    setSpecialityFilter(spec);
    setShowSpecModal(false);
    if (selectedDoctorId && spec !== ALL) {
      const doc = doctors.find(d => d.id === selectedDoctorId);
      if (doc && doc.speciality !== spec) clearDoctor();
    }
  };

  const handleSelectDoctor = (doctor) => {
    setSelectedDoctorId(doctor.id);
    setSelectedDoctorName(doctor.name);
    setSelectedDoctorSpec(doctor.speciality);
    setSelectedDoctorHospital(doctor.hospital || ''); // ← NEW
    setDoctorFreeText('');
    setShowDoctorModal(false);
  };

  const clearDoctor = () => {
    setSelectedDoctorId('');
    setSelectedDoctorName('');
    setSelectedDoctorSpec('');
    setSelectedDoctorHospital(''); // ← NEW
    setDoctorFreeText('');
  };

  const getFinalDoctorName = () => {
    if (selectedDoctorId) return selectedDoctorName;
    if (doctorFreeText.trim()) return doctorFreeText.trim();
    return null;
  };

  const validate = () => {
    if (!selectedDate)       { alert('Please select a trip date.');      return false; }
    if (!pickupHouse.trim()) { alert('Please enter your house number.'); return false; }
    if (!patientName.trim()) { alert('Please enter the patient name.');  return false; }
    if (seats < 1 || seats > MAX_SEATS) {
      alert(`Seats must be between 1 and ${MAX_SEATS}.`); return false;
    }
    return true;
  };

  const handleBook = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const payload = {
        tripDate:          selectedDate,
        pickupHouse:       pickupHouse.trim(),
        seats,
        patientName:       patientName.trim(),
        patientRelation,
        doctorId:          selectedDoctorId || null,
        doctorName:        getFinalDoctorName(),
        hospital:          selectedDoctorHospital || null, // ← NEW
        referralConfirmed,
        overnightStay,
        returnTrip,
        notes:             notes.trim(),
      };
      const response = await fetch(`${API.trips}/book`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) {
        alert('Booking submitted! Reception will confirm your seat.');
        navigation.goBack();
      } else {
        alert(data.message || 'Booking failed. Please try again.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Book Medical Trip</Text>
        <Text style={styles.subtitle}>Mon · Wed · Sat — Departs 17:30, Returns 21:00</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Trip date */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Trip Date *</Text>
          <View style={styles.dateGrid}>
            {upcomingDates.map(d => (
              <TouchableOpacity
                key={d.value}
                style={[styles.dateChip, selectedDate === d.value && styles.dateChipSelected]}
                onPress={() => setSelectedDate(d.value)}
              >
                <Text style={[styles.dateDay, selectedDate === d.value && styles.dateDaySelected]}>
                  {d.dayName.slice(0, 3).toUpperCase()}
                </Text>
                <Text style={[styles.dateLabel, selectedDate === d.value && styles.dateLabelSelected]}>
                  {d.label.replace(/\w+,\s/, '')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Patient details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Patient Details</Text>
          <Text style={styles.fieldLabel}>Patient Name *</Text>
          <TextInput
            style={styles.input} value={patientName} onChangeText={setPatientName}
            placeholder="Full name of patient" placeholderTextColor="#a0aec0"
          />
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Relation *</Text>
          <View style={styles.chipRow}>
            {RELATIONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, patientRelation === r && styles.chipSelected]}
                onPress={() => setPatientRelation(r)}
              >
                <Text style={[styles.chipText, patientRelation === r && styles.chipTextSelected]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Number of Seats *</Text>
          <View style={styles.seatsRow}>
            <TouchableOpacity style={styles.seatBtn} onPress={() => setSeats(s => Math.max(1, s - 1))}>
              <Text style={styles.seatBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.seatsValue}>{seats}</Text>
            <TouchableOpacity style={styles.seatBtn} onPress={() => setSeats(s => Math.min(MAX_SEATS, s + 1))}>
              <Text style={styles.seatBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.seatsHint}>max {MAX_SEATS} per booking</Text>
          </View>
        </View>

        {/* Doctor */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Referred Doctor</Text>

          {selectedDoctorId ? (
            <View style={styles.selectedDoctor}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedDoctorName}>{selectedDoctorName}</Text>
                <Text style={styles.selectedDoctorSub}>
                  {selectedDoctorSpec}{selectedDoctorHospital ? ` · ${selectedDoctorHospital}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={clearDoctor}>
                <Text style={styles.clearDoctor}>✕ Clear</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {!loadingDoctors && doctors.length > 0 && (
                <View style={styles.doctorFilterRow}>
                  <TouchableOpacity
                    style={[styles.filterDropBtn, specialityFilter !== ALL && styles.filterDropBtnActive]}
                    onPress={() => { setSpecModalSearch(''); setShowSpecModal(true); }}
                  >
                    <Text
                      style={[styles.filterDropText, specialityFilter !== ALL && styles.filterDropTextActive]}
                      numberOfLines={1}
                    >
                      {specialityFilter === ALL ? '🩺 Speciality' : specialityFilter}
                    </Text>
                    <Text style={styles.filterDropArrow}>▾</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.filterDropBtn, styles.doctorDropBtn]}
                    onPress={() => { setDoctorModalSearch(''); setShowDoctorModal(true); }}
                  >
                    <Text style={styles.filterDropText} numberOfLines={1}>
                      👨‍⚕️ Select Doctor
                    </Text>
                    <Text style={styles.filterDropArrow}>▾</Text>
                  </TouchableOpacity>
                </View>
              )}

              {loadingDoctors && (
                <ActivityIndicator size="small" color="#3182ce" style={{ marginBottom: 10 }} />
              )}

              <Text style={styles.orDivider}>— or enter manually —</Text>
              <TextInput
                style={styles.input}
                value={doctorFreeText}
                onChangeText={setDoctorFreeText}
                placeholder="Doctor name if not in directory"
                placeholderTextColor="#a0aec0"
              />
            </>
          )}
        </View>

        {/* Pickup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pickup Details</Text>
          <Text style={styles.fieldLabel}>House Number *</Text>
          {loadingProfile
            ? <ActivityIndicator size="small" color="#3182ce" style={{ marginTop: 8 }} />
            : <TextInput
                style={styles.input} value={pickupHouse} onChangeText={setPickupHouse}
                placeholder="e.g. 14-B" placeholderTextColor="#a0aec0"
              />
          }
          <Text style={styles.fieldHint}>Auto-filled from your profile. Edit if needed.</Text>
        </View>

        {/* Trip options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Options</Text>
          <ToggleRow label="Doctor Referral Confirmed" hint="I have a written referral from the medical centre" value={referralConfirmed} onChange={setReferralConfirmed} />
          <ToggleRow label="Overnight Stay" hint="I may need to stay overnight in RYK" value={overnightStay} onChange={setOvernightStay} />
          <ToggleRow label="Return Trip Needed" hint="I will need the return trip at 21:00" value={returnTrip} onChange={setReturnTrip} />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes}
            placeholder="Any special requirements for reception..."
            placeholderTextColor="#a0aec0" multiline numberOfLines={3}
          />
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ℹ️  Your booking will be reviewed by reception. You will be notified once your seat is confirmed.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.bookBtn, saving && styles.bookBtnDisabled]}
          onPress={handleBook} disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.bookBtnText}>Submit Booking Request</Text>
          }
        </TouchableOpacity>

      </ScrollView>

      {/* Speciality modal */}
      <Modal visible={showSpecModal} animationType="slide" transparent onRequestClose={() => setShowSpecModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Speciality</Text>
              <TouchableOpacity onPress={() => setShowSpecModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              value={specModalSearch}
              onChangeText={setSpecModalSearch}
              placeholder="Search speciality..."
              placeholderTextColor="#a0aec0"
              autoFocus
            />
            <FlatList
              data={filteredSpecialities}
              keyExtractor={item => item}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, specialityFilter === item && styles.modalItemSelected]}
                  onPress={() => handleSelectSpeciality(item)}
                >
                  <Text style={[styles.modalItemText, specialityFilter === item && styles.modalItemTextSelected]}>
                    {item}
                  </Text>
                  {specialityFilter === item && <Text style={styles.modalItemCheck}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Doctor modal */}
      <Modal visible={showDoctorModal} animationType="slide" transparent onRequestClose={() => setShowDoctorModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Doctor</Text>
                {specialityFilter !== ALL && (
                  <Text style={styles.modalSubtitle}>{specialityFilter}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowDoctorModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              value={doctorModalSearch}
              onChangeText={setDoctorModalSearch}
              placeholder="Search by name or hospital..."
              placeholderTextColor="#a0aec0"
              autoFocus
            />
            <FlatList
              data={filteredDoctors}
              keyExtractor={item => item.id}
              style={styles.modalList}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>
                  {doctors.length === 0
                    ? 'No doctors in directory yet'
                    : 'No doctors match your filter'
                  }
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => handleSelectDoctor(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalItemText}>{item.name}</Text>
                    <Text style={styles.modalItemSub}>{item.speciality} · {item.city}</Text>
                    {item.hospital && (
                      <Text style={styles.modalItemSub}>🏥 {item.hospital}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

function ToggleRow({ label, hint, value, onChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint && <Text style={styles.toggleHint}>{hint}</Text>}
      </View>
      <Switch
        value={value} onValueChange={onChange}
        trackColor={{ false: '#e2e8f0', true: '#90cdf4' }}
        thumbColor={value ? '#3182ce' : '#a0aec0'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginBottom: 6 },
  backText: { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 13, color: '#718096', marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  section: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#a0aec0',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  dateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateChip: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f7fafc',
    alignItems: 'center', minWidth: 80,
  },
  dateChipSelected: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  dateDay: { fontSize: 11, fontWeight: '800', color: '#a0aec0', letterSpacing: 0.5 },
  dateDaySelected: { color: '#bee3f8' },
  dateLabel: { fontSize: 13, fontWeight: '600', color: '#2d3748', marginTop: 2 },
  dateLabelSelected: { color: '#ffffff' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#4a5568', marginBottom: 6 },
  fieldHint: { fontSize: 11, color: '#a0aec0', marginTop: 4 },
  input: {
    backgroundColor: '#f7fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#2d3748',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f7fafc',
  },
  chipSelected: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  chipText: { fontSize: 13, color: '#4a5568', fontWeight: '600' },
  chipTextSelected: { color: '#ffffff' },
  seatsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seatBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#ebf8ff',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#90cdf4',
  },
  seatBtnText: { fontSize: 20, color: '#2b6cb0', fontWeight: '700', lineHeight: 24 },
  seatsValue: { fontSize: 22, fontWeight: '800', color: '#2d3748', minWidth: 28, textAlign: 'center' },
  seatsHint: { fontSize: 12, color: '#a0aec0' },
  doctorFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterDropBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f7fafc',
  },
  filterDropBtnActive: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  doctorDropBtn: { flex: 1.2 },
  filterDropText: { fontSize: 13, color: '#4a5568', fontWeight: '600', flex: 1 },
  filterDropTextActive: { color: '#ffffff' },
  filterDropArrow: { fontSize: 12, color: '#718096', marginLeft: 4 },
  selectedDoctor: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f0fff4', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#9ae6b4',
  },
  selectedDoctorName: { fontSize: 14, fontWeight: '700', color: '#276749' },
  selectedDoctorSub: { fontSize: 12, color: '#48bb78', marginTop: 2 },
  clearDoctor: { fontSize: 13, color: '#c53030', fontWeight: '600' },
  orDivider: { textAlign: 'center', color: '#a0aec0', fontSize: 12, marginVertical: 10 },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f7fafc',
  },
  toggleText: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#2d3748' },
  toggleHint: { fontSize: 12, color: '#a0aec0', marginTop: 2 },
  infoBox: {
    backgroundColor: '#ebf8ff', borderRadius: 10, padding: 12,
    marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#3182ce',
  },
  infoText: { fontSize: 13, color: '#2b6cb0', lineHeight: 18 },
  bookBtn: {
    backgroundColor: '#3182ce', borderRadius: 8, paddingVertical: 14,
    alignItems: 'center', marginBottom: 40,
  },
  bookBtnDisabled: { opacity: 0.6 },
  bookBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '75%', paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#2d3748' },
  modalSubtitle: { fontSize: 12, color: '#3182ce', fontWeight: '600', marginTop: 2 },
  modalClose: { fontSize: 18, color: '#718096', fontWeight: '600' },
  modalSearch: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: '#f7fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: '#2d3748',
  },
  modalList: { marginTop: 4 },
  modalItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#f7fafc',
  },
  modalItemSelected: { backgroundColor: '#ebf8ff' },
  modalItemText: { fontSize: 14, color: '#2d3748', fontWeight: '600' },
  modalItemTextSelected: { color: '#2b6cb0', fontWeight: '700' },
  modalItemSub: { fontSize: 12, color: '#718096', marginTop: 2 },
  modalItemCheck: { fontSize: 14, color: '#2b6cb0', fontWeight: '700' },
  modalEmpty: { padding: 20, color: '#a0aec0', fontSize: 13, textAlign: 'center' },
});