// app/src/screens/trip/TripBookingScreen.js
// Flow 4 — Medical Trip
// Employee books a seat on the medical trip
// Trips run Mon / Wed / Sat — depart 17:30, return 21:00 from RYK

import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';

// Days the trip runs
const TRIP_DAYS = ['Monday', 'Wednesday', 'Saturday'];

// Returns the next N upcoming trip dates from today
function getUpcomingTripDates(count = 6) {
  const dayMap = { Monday: 1, Wednesday: 3, Saturday: 6 };
  const results = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let cursor = new Date(today);
  let attempts = 0;

  while (results.length < count && attempts < 60) {
    const dayName = cursor.toLocaleDateString('en-US', { weekday: 'long' });
    if (TRIP_DAYS.includes(dayName)) {
      results.push({
        label: cursor.toLocaleDateString('en-PK', {
          weekday: 'short', day: 'numeric', month: 'short',
        }),
        value: cursor.toISOString().split('T')[0], // YYYY-MM-DD
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

  const [selectedDate, setSelectedDate] = useState('');
  const [pickupHouse, setPickupHouse] = useState('');
  const [referralConfirmed, setReferralConfirmed] = useState(false);
  const [overnightStay, setOvernightStay] = useState(false);
  const [returnTrip, setReturnTrip] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const validate = () => {
    if (!selectedDate) { alert('Please select a trip date.'); return false; }
    if (!pickupHouse.trim()) { alert('Please enter your house number for pickup.'); return false; }
    return true;
  };

  const handleBook = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const payload = {
        tripDate: selectedDate,
        pickupHouse: pickupHouse.trim(),
        referralConfirmed,
        overnightStay,
        returnTrip,
        notes: notes.trim(),
      };

      const response = await fetch(`${API.trips}/book`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Book Medical Trip</Text>
        <Text style={styles.subtitle}>Mon · Wed · Sat — Departs 17:30, Returns 21:00</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Trip date selection */}
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

        {/* Pickup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pickup Details</Text>
          <Text style={styles.fieldLabel}>House Number *</Text>
          <TextInput
            style={styles.input}
            value={pickupHouse}
            onChangeText={setPickupHouse}
            placeholder="e.g. 14-B or Street 4, House 7"
            placeholderTextColor="#a0aec0"
          />
        </View>

        {/* Trip options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Options</Text>

          <ToggleRow
            label="Doctor Referral Confirmed"
            hint="I have a written referral from the medical centre"
            value={referralConfirmed}
            onChange={setReferralConfirmed}
          />
          <ToggleRow
            label="Overnight Stay"
            hint="I may need to stay overnight in RYK"
            value={overnightStay}
            onChange={setOvernightStay}
          />
          <ToggleRow
            label="Return Trip Needed"
            hint="I will need the return trip at 21:00"
            value={returnTrip}
            onChange={setReturnTrip}
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any special requirements or information for reception..."
            placeholderTextColor="#a0aec0"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ℹ️  Your booking will be reviewed by reception. You will be notified once your seat is confirmed.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.bookBtn, saving && styles.bookBtnDisabled]}
          onPress={handleBook}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.bookBtnText}>Submit Booking Request</Text>
          }
        </TouchableOpacity>

      </ScrollView>
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
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#e2e8f0', true: '#90cdf4' }}
        thumbColor={value ? '#3182ce' : '#a0aec0'}
      />
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
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#a0aec0',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  dateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dateChip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f7fafc',
    alignItems: 'center',
    minWidth: 80,
  },
  dateChipSelected: {
    backgroundColor: '#3182ce',
    borderColor: '#3182ce',
  },
  dateDay: { fontSize: 11, fontWeight: '800', color: '#a0aec0', letterSpacing: 0.5 },
  dateDaySelected: { color: '#bee3f8' },
  dateLabel: { fontSize: 13, fontWeight: '600', color: '#2d3748', marginTop: 2 },
  dateLabelSelected: { color: '#ffffff' },

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

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f7fafc',
  },
  toggleText: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#2d3748' },
  toggleHint: { fontSize: 12, color: '#a0aec0', marginTop: 2 },

  infoBox: {
    backgroundColor: '#ebf8ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#3182ce',
  },
  infoText: { fontSize: 13, color: '#2b6cb0', lineHeight: 18 },

  bookBtn: {
    backgroundColor: '#3182ce',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 40,
  },
  bookBtnDisabled: { opacity: 0.6 },
  bookBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});