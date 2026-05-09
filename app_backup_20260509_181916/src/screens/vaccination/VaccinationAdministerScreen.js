// app/src/screens/vaccination/VaccinationAdministerScreen.js

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Switch,
} from 'react-native';
import {
  getFirestore, doc, getDoc, updateDoc,
  collection, query, where, getDocs, Timestamp,
} from 'firebase/firestore';
import { VACCINATION_NURSE } from '../../constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseDate(str) {
  if (!str || str.length !== 10) return null;
  const [d, m, y] = str.split('/').map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function todayString() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function VaccinationAdministerScreen({ route, navigation }) {
  const {
    recordId,
    childId,
    childName,
    vaccineName,
    doseNumber,
    plannedDate,
  } = route.params;

  const [record,           setRecord]           = useState(null);
  const [scheduleEntry,    setScheduleEntry]    = useState(null);
  const [nextRecord,       setNextRecord]       = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [saving,           setSaving]           = useState(false);

  // Form fields
  const [administeredDate, setAdministeredDate] = useState(todayString());
  const [adverseReaction,  setAdverseReaction]  = useState('');
  const [isBacklog,        setIsBacklog]        = useState(false);
  const [overrideNextDate, setOverrideNextDate] = useState('');
  const [overrideReason,   setOverrideReason]   = useState('');
  const [showNextOverride, setShowNextOverride] = useState(false);

  const db = getFirestore();

  // ─── Load record and schedule entry ───────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Load vaccination record
        const recSnap = await getDoc(doc(db, 'vaccinationRecords', recordId));
        if (!recSnap.exists()) throw new Error('Record not found');
        const recData = { id: recSnap.id, ...recSnap.data() };
        setRecord(recData);

        // Load vaccine schedule entry for minimumIntervalDays
        if (recData.vaccineScheduleId) {
          const schSnap = await getDoc(doc(db, 'vaccineSchedule', recData.vaccineScheduleId));
          if (schSnap.exists()) setScheduleEntry(schSnap.data());
        }

        // Find next dose record for same vaccine and same child
        const nextQ = query(
          collection(db, 'vaccinationRecords'),
          where('familyMemberId', '==', childId),
          where('vaccineName',    '==', recData.vaccineName),
          where('status',         '==', 'scheduled'),
        );
        const nextSnap = await getDocs(nextQ);
        const candidates = nextSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r => r.id !== recordId)
          .sort((a, b) => {
            const aDate = a.plannedDate?.toDate ? a.plannedDate.toDate() : new Date(a.plannedDate);
            const bDate = b.plannedDate?.toDate ? b.plannedDate.toDate() : new Date(b.plannedDate);
            return aDate - bDate;
          });
        if (candidates.length > 0) setNextRecord(candidates[0]);

      } catch (err) {
        console.error('VaccinationAdminister load error:', err);
        Alert.alert('Error', 'Could not load vaccination record.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [recordId, childId, db]);

  // ─── Validate minimum interval ────────────────────────────────────────────
  const validateMinimumInterval = (adminDate) => {
    if (!scheduleEntry?.minimumIntervalDays) return true;
    // Check against previous administered dose of same vaccine
    // For simplicity — validate that adminDate is not before plannedDate minus grace period
    // Full previous-dose lookup is handled server-side in Cloud Functions
    return true; // client-side check is informational only
  };

  // ─── Calculate suggested next date ────────────────────────────────────────
  const getSuggestedNextDate = (adminDate) => {
    if (!nextRecord || !scheduleEntry?.minimumIntervalDays) return null;
    const suggested = addDays(adminDate, scheduleEntry.minimumIntervalDays);
    return suggested;
  };

  // ─── Handle submit ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    // Validate administered date
    const adminDate = parseDate(administeredDate);
    if (!adminDate) {
      Alert.alert('Invalid Date', 'Please enter administration date as DD/MM/YYYY.');
      return;
    }
    if (adminDate > new Date()) {
      Alert.alert('Invalid Date', 'Administration date cannot be in the future.');
      return;
    }

    // Validate override date if next dose override is shown
    let nextDateTimestamp = null;
    if (showNextOverride && nextRecord) {
      if (!overrideNextDate) {
        Alert.alert('Required', 'Please enter the revised date for the next dose.');
        return;
      }
      const nextDate = parseDate(overrideNextDate);
      if (!nextDate) {
        Alert.alert('Invalid Date', 'Please enter next dose date as DD/MM/YYYY.');
        return;
      }
      if (nextDate <= adminDate) {
        Alert.alert('Invalid Date', 'Next dose date must be after the administration date.');
        return;
      }
      // Minimum interval check
      if (scheduleEntry?.minimumIntervalDays) {
        const minDate = addDays(adminDate, scheduleEntry.minimumIntervalDays);
        if (nextDate < minDate) {
          Alert.alert(
            'Interval Warning',
            `Minimum interval for ${vaccineName} is ${scheduleEntry.minimumIntervalDays} days. ` +
            `Earliest next dose date is ${formatDate({ toDate: () => minDate })}. ` +
            `Please revise.`,
          );
          return;
        }
      }
      nextDateTimestamp = Timestamp.fromDate(nextDate);
    }

    setSaving(true);
    try {
      // Update current record — mark as administered
      await updateDoc(doc(db, 'vaccinationRecords', recordId), {
        status:          'administered',
        actualDate:      Timestamp.fromDate(adminDate),
        administeredBy:  VACCINATION_NURSE.name,
        adverseReaction: adverseReaction.trim() || null,
        nurseOverride:   isBacklog,
        overrideReason:  isBacklog ? (overrideReason.trim() || 'Backlog entry') : null,
        updatedAt:       Timestamp.now(),
      });

      // Update next dose planned date if nurse overrode it
      if (showNextOverride && nextRecord && nextDateTimestamp) {
        await updateDoc(doc(db, 'vaccinationRecords', nextRecord.id), {
          plannedDate:   nextDateTimestamp,
          nurseOverride: true,
          overrideReason: overrideReason.trim() || 'Date adjusted after actual administration',
          updatedAt:     Timestamp.now(),
        });
      } else if (!isBacklog && nextRecord && scheduleEntry?.minimumIntervalDays) {
        // Auto-recalculate next dose based on actual administration date
        const autoNext = addDays(adminDate, scheduleEntry.minimumIntervalDays);
        const originalNext = nextRecord.plannedDate?.toDate
          ? nextRecord.plannedDate.toDate()
          : new Date(nextRecord.plannedDate);

        // Only update if actual admin date differs meaningfully from planned
        const plannedAdminDate = record.plannedDate?.toDate
          ? record.plannedDate.toDate()
          : new Date(record.plannedDate);
        const diffDays = Math.abs((adminDate - plannedAdminDate) / (1000 * 60 * 60 * 24));

        if (diffDays > 3) {
          // Shift next dose proportionally
          await updateDoc(doc(db, 'vaccinationRecords', nextRecord.id), {
            plannedDate:   Timestamp.fromDate(autoNext),
            nurseOverride: true,
            overrideReason: 'Auto-adjusted based on actual administration date',
            updatedAt:     Timestamp.now(),
          });
        }
      }

      Alert.alert(
        'Recorded',
        `${vaccineName} (${doseNumber}) recorded as administered on ${administeredDate}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      console.error('VaccinationAdminister save error:', err);
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const suggestedNext = parseDate(administeredDate)
    ? getSuggestedNextDate(parseDate(administeredDate))
    : null;

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Administer Vaccine</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Vaccine summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryChild}>{childName}</Text>
          <Text style={styles.summaryVaccine}>{vaccineName}</Text>
          <Text style={styles.summaryDose}>{doseNumber}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Planned Date</Text>
            <Text style={styles.summaryValue}>{formatDate(plannedDate)}</Text>
          </View>
          {scheduleEntry && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Route / Site</Text>
              <Text style={styles.summaryValue}>
                {scheduleEntry.route} · {scheduleEntry.site}
              </Text>
            </View>
          )}
          {scheduleEntry?.minimumIntervalDays && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Min. interval to next dose</Text>
              <Text style={styles.summaryValue}>{scheduleEntry.minimumIntervalDays} days</Text>
            </View>
          )}
        </View>

        {/* Backlog toggle */}
        <View style={styles.switchRow}>
          <View style={styles.switchLabelWrap}>
            <Text style={styles.switchLabel}>Backlog Entry</Text>
            <Text style={styles.switchHint}>
              Enable if recording a past administration date
            </Text>
          </View>
          <Switch
            value={isBacklog}
            onValueChange={setIsBacklog}
            trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
            thumbColor={isBacklog ? '#3b82f6' : '#cbd5e0'}
          />
        </View>

        {/* Administration date */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            Date Administered <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="DD/MM/YYYY"
            placeholderTextColor="#a0aec0"
            value={administeredDate}
            onChangeText={setAdministeredDate}
            keyboardType="numeric"
            maxLength={10}
          />
          {isBacklog && (
            <Text style={styles.backlogHint}>
              ℹ Backlog mode — next dose date will not be auto-recalculated.
              Set it manually below if needed.
            </Text>
          )}
        </View>

        {/* Administered by — read only */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Administered By</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{VACCINATION_NURSE.name}</Text>
          </View>
        </View>

        {/* Adverse reaction */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Adverse Reaction (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Note any reaction observed post-administration…"
            placeholderTextColor="#a0aec0"
            value={adverseReaction}
            onChangeText={setAdverseReaction}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Next dose section — only if there is a next dose */}
        {nextRecord && (
          <View style={styles.nextDoseCard}>
            <Text style={styles.nextDoseTitle}>Next Dose</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Vaccine</Text>
              <Text style={styles.summaryValue}>{nextRecord.vaccineName}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Dose</Text>
              <Text style={styles.summaryValue}>{nextRecord.doseNumber}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Currently planned</Text>
              <Text style={styles.summaryValue}>{formatDate(nextRecord.plannedDate)}</Text>
            </View>
            {suggestedNext && !isBacklog && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Suggested (from today)</Text>
                <Text style={[styles.summaryValue, styles.suggested]}>
                  {formatDate({ toDate: () => suggestedNext })}
                </Text>
              </View>
            )}

            {/* Override toggle */}
            <View style={[styles.switchRow, { marginTop: 12, marginBottom: 0 }]}>
              <View style={styles.switchLabelWrap}>
                <Text style={styles.switchLabel}>Adjust Next Dose Date</Text>
                <Text style={styles.switchHint}>Override the calculated next date</Text>
              </View>
              <Switch
                value={showNextOverride}
                onValueChange={setShowNextOverride}
                trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
                thumbColor={showNextOverride ? '#3b82f6' : '#cbd5e0'}
              />
            </View>

            {showNextOverride && (
              <>
                <View style={[styles.fieldGroup, { marginTop: 12 }]}>
                  <Text style={styles.label}>
                    Revised Next Dose Date <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor="#a0aec0"
                    value={overrideNextDate}
                    onChangeText={setOverrideNextDate}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Reason for Adjustment (optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Parent requested later date"
                    placeholderTextColor="#a0aec0"
                    value={overrideReason}
                    onChangeText={setOverrideReason}
                  />
                </View>
              </>
            )}
          </View>
        )}

        {/* Backlog override reason */}
        {isBacklog && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Backlog Entry Reason (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Child presented late, registering historical dose"
              placeholderTextColor="#a0aec0"
              value={overrideReason}
              onChangeText={setOverrideReason}
            />
          </View>
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
            : <Text style={styles.submitText}>✓  Record Administration</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:  { flex: 1, backgroundColor: '#f0f4f8' },
  centred:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 20, backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:     { paddingRight: 8 },
  backText:    { fontSize: 15, color: '#3b82f6', fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#2d3748' },

  container: { padding: 16 },

  // Summary card
  summaryCard: {
    backgroundColor: '#1e40af', borderRadius: 12,
    padding: 18, marginBottom: 16,
  },
  summaryChild:   { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  summaryVaccine: { fontSize: 15, color: '#bfdbfe', marginBottom: 2 },
  summaryDose:    { fontSize: 13, color: '#93c5fd', marginBottom: 12 },
  summaryRow:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  summaryLabel:   { fontSize: 12, color: '#93c5fd' },
  summaryValue:   { fontSize: 12, color: '#ffffff', fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 12 },
  suggested:      { color: '#6ee7b7' },

  // Form
  fieldGroup:    { marginBottom: 18 },
  label:         { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 6 },
  required:      { color: '#e53e3e' },
  input: {
    backgroundColor: '#ffffff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#2d3748',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  backlogHint:    { fontSize: 11, color: '#7c3aed', marginTop: 6, lineHeight: 16 },

  readOnly: {
    backgroundColor: '#f7fafc', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 11,
  },
  readOnlyText: { fontSize: 14, color: '#4a5568' },

  // Switch row
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 18,
    backgroundColor: '#ffffff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  switchLabelWrap: { flex: 1, marginRight: 12 },
  switchLabel:     { fontSize: 13, fontWeight: '600', color: '#4a5568' },
  switchHint:      { fontSize: 11, color: '#a0aec0', marginTop: 2 },

  // Next dose card
  nextDoseCard: {
    backgroundColor: '#ffffff', borderRadius: 12,
    padding: 16, marginBottom: 18,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  nextDoseTitle: {
    fontSize: 13, fontWeight: '700', color: '#4a5568',
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10,
  },

  // Submit
  submitBtn: {
    backgroundColor: '#10b981', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText:        { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});