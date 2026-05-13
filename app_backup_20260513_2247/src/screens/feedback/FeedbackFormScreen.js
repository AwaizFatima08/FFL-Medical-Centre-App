// app/src/screens/feedback/FeedbackFormScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { API } from '../../config/api';

const SERVICES = [
  { key: 'consultation',  label: 'Consultation' },
  { key: 'pharmacy',      label: 'Pharmacy' },
  { key: 'laboratory',    label: 'Laboratory' },
  { key: 'xray',          label: 'X-Ray' },
  { key: 'nursing',       label: 'Nursing' },
  { key: 'dental',        label: 'Dental' },
  { key: 'physiotherapy', label: 'Physiotherapy' },
];

const RELATIONS = ['Self', 'Spouse', 'Child', 'Parent', 'Other'];

// ── Purpose of Visit — matches ambulance request flow exactly
const PURPOSE_OF_VISIT = [
  { key: 'emergency',            label: 'Emergency',             icon: '🚨' },
  { key: 'routine_consultation', label: 'Routine Consultation',  icon: '🏥' },
  { key: 'physiotherapy',        label: 'Physiotherapy Visit',   icon: '🦴' },
  { key: 'dental',               label: 'Dental Treatment Visit',icon: '🦷' },
  { key: 'laboratory',           label: 'Laboratory Sample',     icon: '🧪' },
];

const SERVICE_QUESTIONS = {
  consultation: {
    rating: 'Consultation Quality',
    booleans: [
      { key: 'doctorGaveAmpleTime',       label: 'Doctor gave ample time during consultation?' },
      { key: 'doctorUnderstoodProblem',   label: 'Doctor listened and understood your problem?' },
    ],
  },
  pharmacy: {
    rating: 'Pharmacy Service',
    booleans: [
      { key: 'pharmacyExplainedMedicine', label: 'Pharmacy staff explained medicine usage properly?' },
    ],
  },
  laboratory: {
    rating: 'Laboratory Service',
    booleans: [
      { key: 'labExplainedProcedure',     label: 'Lab staff explained procedure before sampling?' },
      { key: 'labReportsOnTime',          label: 'Lab reports received within given time?' },
    ],
  },
  xray: {
    rating: 'X-Ray Service',
    booleans: [],
  },
  nursing: {
    rating: 'Nursing Service',
    booleans: [
      { key: 'nursingBehaviour',          label: 'Satisfied with professional behaviour of nursing staff?' },
      { key: 'bedLinenClean',             label: 'Was the bed linen clean?' },
    ],
  },
  dental: {
    rating: 'Dental Service',
    booleans: [
      { key: 'dentalTreatmentSatisfied',  label: 'Satisfied with treatment given?' },
      { key: 'dentalRatesSatisfied',      label: 'Satisfied with rates charged?' },
      { key: 'dentalReceiptProvided',     label: 'Receipt provided against charges?' },
    ],
  },
  physiotherapy: {
    rating: 'Physiotherapy Service',
    booleans: [
      { key: 'physioStaffBehaviour',      label: 'Satisfied with behaviour of physiotherapy staff?' },
      { key: 'physioPrivacyMaintained',   label: 'Patient privacy maintained during services?' },
      { key: 'physioRatesSatisfied',      label: 'Satisfied with rates charged?' },
      { key: 'physioReceiptProvided',     label: 'Receipt provided against charges?' },
    ],
  },
};

function StarRating({ value, onChange }) {
  return (
    <View style={star.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} style={star.btn}>
          <Text style={[star.icon, n <= value && star.iconFilled]}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function BooleanQuestion({ label, value, onChange }) {
  return (
    <View style={bool.wrapper}>
      <Text style={bool.label}>{label}</Text>
      <View style={bool.row}>
        <TouchableOpacity
          style={[bool.btn, value === true  && bool.btnYes]}
          onPress={() => onChange(true)}
        >
          <Text style={[bool.text, value === true  && bool.textActive]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[bool.btn, value === false && bool.btnNo]}
          onPress={() => onChange(false)}
        >
          <Text style={[bool.text, value === false && bool.textActive]}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function FeedbackFormScreen({ navigation }) {
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  // Visit details
  const today   = new Date().toISOString().split('T')[0];
  const nowTime = new Date().toTimeString().slice(0, 5);
  const [visitDate,          setVisitDate]          = useState(today);
  const [visitTime,          setVisitTime]          = useState(nowTime);
  const [consultingDoctorId, setConsultingDoctorId] = useState('');
  const [patientName,        setPatientName]        = useState('');
  const [patientRelation,    setPatientRelation]    = useState('Self');
  const [purposeOfVisit,     setPurposeOfVisit]     = useState('');   // ← NEW

  // Mandatory ratings
  const [staffBehaviour, setStaffBehaviour] = useState(0);
  const [waitingTime,    setWaitingTime]    = useState(0);
  const [housekeeping,   setHousekeeping]   = useState(0);

  // Services checklist
  const [servicesUsed, setServicesUsed] = useState([]);

  // Service-specific ratings & booleans
  const [serviceRatings,  setServiceRatings]  = useState({});
  const [serviceBooleans, setServiceBooleans] = useState({});

  // Comments
  const [overallExperience, setOverallExperience] = useState('');
  const [suggestion,        setSuggestion]        = useState('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchDoctors(); }, []);

  const fetchDoctors = async () => {
    try {
      const auth  = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.feedback}/doctors`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setDoctors(data.data || []);
        if (data.data?.length > 0) setConsultingDoctorId(data.data[0].id);
      }
    } catch (error) {
      console.error('Failed to load doctors');
    } finally {
      setLoadingDoctors(false);
    }
  };

  const toggleService = (key) => {
    setServicesUsed(prev => {
      if (prev.includes(key)) {
        const newRatings   = { ...serviceRatings };
        const newBooleans  = { ...serviceBooleans };
        delete newRatings[key];
        SERVICE_QUESTIONS[key].booleans.forEach(b => delete newBooleans[b.key]);
        setServiceRatings(newRatings);
        setServiceBooleans(newBooleans);
        return prev.filter(s => s !== key);
      }
      return [...prev, key];
    });
  };

  const setServiceRating = (service, value) =>
    setServiceRatings(prev => ({ ...prev, [service]: value }));

  const setBoolean = (key, value) =>
    setServiceBooleans(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!visitDate)          { alert('Please select a visit date.');        return; }
    if (!consultingDoctorId) { alert('Please select the consulting doctor.');return; }
    if (!purposeOfVisit)     { alert('Please select a purpose of visit.');  return; } // ← NEW
    if (staffBehaviour === 0){ alert('Please rate staff behaviour.');        return; }
    if (waitingTime === 0)   { alert('Please rate waiting time.');           return; }
    if (housekeeping === 0)  { alert('Please rate housekeeping.');           return; }

    setSubmitting(true);
    try {
      const auth  = getAuth();
      const token = await auth.currentUser.getIdToken();

      const ratings = { staffBehaviour, waitingTime, housekeeping, ...serviceRatings };

      const response = await fetch(`${API.feedback}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          visitDate,
          visitTime,
          consultingDoctorId,
          purposeOfVisit,                          // ← NEW
          patientName:       patientName.trim() || null,
          patientRelation,
          servicesUsed,
          ratings,
          booleans:          serviceBooleans,
          overallExperience: overallExperience.trim() || null,
          suggestion:        suggestion.trim() || null,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        alert('Thank you! Your feedback has been submitted.');
        navigation.goBack();
      } else {
        alert(data.message || 'Submission failed. Please try again.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingDoctors) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3182ce" />
        <Text style={styles.loadingText}>Loading...</Text>
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
          <Text style={styles.title}>Patient Feedback</Text>
          <Text style={styles.subtitle}>Your feedback helps us improve</Text>
        </View>

        {/* Visit Details */}
        <Text style={styles.sectionLabel}>Visit Details</Text>

        <Text style={styles.fieldLabel}>Visit Date</Text>
        <TextInput
          style={styles.input}
          value={visitDate}
          onChangeText={setVisitDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#a0aec0"
        />

        <Text style={styles.fieldLabel}>Visit Time</Text>
        <TextInput
          style={styles.input}
          value={visitTime}
          onChangeText={setVisitTime}
          placeholder="HH:MM"
          placeholderTextColor="#a0aec0"
        />

        <Text style={styles.fieldLabel}>Consulting Doctor</Text>
        <View style={styles.segRow}>
          {doctors.map(doc => (
            <TouchableOpacity
              key={doc.id}
              style={[styles.segBtn, consultingDoctorId === doc.id && styles.segBtnActive]}
              onPress={() => setConsultingDoctorId(doc.id)}
            >
              <Text style={[styles.segLabel, consultingDoctorId === doc.id && styles.segLabelActive]}>
                {doc.fullName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Patient Name (optional)</Text>
        <TextInput
          style={styles.input}
          value={patientName}
          onChangeText={setPatientName}
          placeholder="Leave blank if self"
          placeholderTextColor="#a0aec0"
        />

        <Text style={styles.fieldLabel}>Patient Relation</Text>
        <View style={styles.segRow}>
          {RELATIONS.map(rel => (
            <TouchableOpacity
              key={rel}
              style={[styles.segBtn, patientRelation === rel && styles.segBtnActive]}
              onPress={() => setPatientRelation(rel)}
            >
              <Text style={[styles.segLabel, patientRelation === rel && styles.segLabelActive]}>
                {rel}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── PURPOSE OF VISIT ── */}
        <Text style={styles.sectionLabel}>
          Purpose of Visit <Text style={styles.required}>*</Text>
        </Text>
        {PURPOSE_OF_VISIT.map((item) => {
          const selected = purposeOfVisit === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.purposeRow, selected && styles.purposeRowActive]}
              onPress={() => setPurposeOfVisit(item.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.radioCircle, selected && styles.radioCircleActive]}>
                {selected && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.purposeIcon}>{item.icon}</Text>
              <Text style={[styles.purposeLabel, selected && styles.purposeLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Mandatory Ratings */}
        <Text style={styles.sectionLabel}>General Experience</Text>

        <View style={styles.ratingRow}>
          <Text style={styles.ratingLabel}>Staff Behaviour <Text style={styles.required}>*</Text></Text>
          <StarRating value={staffBehaviour} onChange={setStaffBehaviour} />
        </View>
        <View style={styles.ratingRow}>
          <Text style={styles.ratingLabel}>Waiting Time / Queue <Text style={styles.required}>*</Text></Text>
          <StarRating value={waitingTime} onChange={setWaitingTime} />
        </View>
        <View style={styles.ratingRow}>
          <Text style={styles.ratingLabel}>Housekeeping <Text style={styles.required}>*</Text></Text>
          <StarRating value={housekeeping} onChange={setHousekeeping} />
        </View>

        {/* Services Checklist */}
        <Text style={styles.sectionLabel}>Services Used Today</Text>
        <Text style={styles.hint}>Select all that apply</Text>
        <View style={styles.checkGrid}>
          {SERVICES.map(service => {
            const selected = servicesUsed.includes(service.key);
            return (
              <TouchableOpacity
                key={service.key}
                style={[styles.checkBtn, selected && styles.checkBtnActive]}
                onPress={() => toggleService(service.key)}
              >
                <Text style={[styles.checkLabel, selected && styles.checkLabelActive]}>
                  {selected ? '✓ ' : ''}{service.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Service-specific sections */}
        {servicesUsed.map(serviceKey => {
          const config  = SERVICE_QUESTIONS[serviceKey];
          const service = SERVICES.find(s => s.key === serviceKey);
          return (
            <View key={serviceKey} style={styles.serviceSection}>
              <Text style={styles.serviceSectionTitle}>{service.label}</Text>
              <View style={styles.ratingRow}>
                <Text style={styles.ratingLabel}>{config.rating}</Text>
                <StarRating
                  value={serviceRatings[serviceKey] || 0}
                  onChange={(v) => setServiceRating(serviceKey, v)}
                />
              </View>
              {config.booleans.map(q => (
                <BooleanQuestion
                  key={q.key}
                  label={q.label}
                  value={serviceBooleans[q.key]}
                  onChange={(v) => setBoolean(q.key, v)}
                />
              ))}
            </View>
          );
        })}

        {/* Comments */}
        <Text style={styles.sectionLabel}>Comments</Text>

        <Text style={styles.fieldLabel}>Overall Experience (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={overallExperience}
          onChangeText={setOverallExperience}
          placeholder="Share your overall experience..."
          placeholderTextColor="#a0aec0"
          multiline
          numberOfLines={3}
        />

        <Text style={styles.fieldLabel}>Suggestion for Improvement (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={suggestion}
          onChangeText={setSuggestion}
          placeholder="How can we serve you better?"
          placeholderTextColor="#a0aec0"
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.submitText}>Submit Feedback</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer:        { flex: 1, backgroundColor: '#f0f4f8' },
  scroll:       { flex: 1 },
  container:    { paddingBottom: 40 },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:  { marginTop: 12, color: '#718096' },
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#ffffff', borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0', marginBottom: 8,
  },
  backBtn:      { marginBottom: 8 },
  backText:     { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:        { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle:     { fontSize: 13, color: '#718096', marginTop: 2 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#3182ce',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 20, marginBottom: 8, paddingHorizontal: 20,
  },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 6, paddingHorizontal: 20 },
  required:     { color: '#e53e3e' },
  hint:         { fontSize: 12, color: '#a0aec0', marginTop: -4, marginBottom: 8, paddingHorizontal: 20 },
  input: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#2d3748', marginHorizontal: 20, marginBottom: 14,
  },
  textArea:     { height: 80, textAlignVertical: 'top' },
  segRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 14 },
  segBtn:       { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f7fafc' },
  segBtnActive: { backgroundColor: '#ebf8ff', borderColor: '#3182ce' },
  segLabel:     { fontSize: 13, color: '#718096' },
  segLabelActive:{ color: '#2b6cb0', fontWeight: '600' },

  // ── Purpose of Visit
  purposeRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 8,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: '#ffffff', borderRadius: 10,
    borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  purposeRowActive: { borderColor: '#3182ce', backgroundColor: '#ebf8ff' },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#cbd5e0',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  radioCircleActive: { borderColor: '#3182ce' },
  radioDot:          { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3182ce' },
  purposeIcon:       { fontSize: 18, marginRight: 10 },
  purposeLabel:      { fontSize: 14, color: '#4a5568', fontWeight: '500' },
  purposeLabelActive:{ color: '#2b6cb0', fontWeight: '700' },

  ratingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 14, backgroundColor: '#ffffff',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f4f8',
  },
  ratingLabel:         { fontSize: 14, color: '#2d3748', flex: 1, marginRight: 8 },
  checkGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  checkBtn:            { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f7fafc' },
  checkBtnActive:      { backgroundColor: '#ebf8ff', borderColor: '#3182ce' },
  checkLabel:          { fontSize: 13, color: '#718096' },
  checkLabelActive:    { color: '#2b6cb0', fontWeight: '600' },
  serviceSection: {
    marginTop: 12, marginHorizontal: 20, backgroundColor: '#ffffff',
    borderRadius: 12, padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  serviceSectionTitle: { fontSize: 15, fontWeight: '700', color: '#2d3748', marginBottom: 12 },
  submitBtn:           { marginHorizontal: 20, marginTop: 24, backgroundColor: '#3182ce', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled:   { backgroundColor: '#a0aec0' },
  submitText:          { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});

const star = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 4 },
  btn:        { padding: 2 },
  icon:       { fontSize: 28, color: '#e2e8f0' },
  iconFilled: { color: '#f6ad55' },
});

const bool = StyleSheet.create({
  wrapper:    { marginBottom: 12 },
  label:      { fontSize: 13, color: '#4a5568', marginBottom: 8, lineHeight: 18 },
  row:        { flexDirection: 'row', gap: 8 },
  btn:        { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f7fafc', alignItems: 'center' },
  btnYes:     { backgroundColor: '#f0fff4', borderColor: '#38a169' },
  btnNo:      { backgroundColor: '#fff5f5', borderColor: '#e53e3e' },
  text:       { fontSize: 14, color: '#718096', fontWeight: '500' },
  textActive: { fontWeight: '700', color: '#2d3748' },
});