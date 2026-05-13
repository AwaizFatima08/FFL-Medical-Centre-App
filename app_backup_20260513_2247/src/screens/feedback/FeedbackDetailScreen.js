// app/src/screens/feedback/FeedbackDetailScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

const BOOLEAN_LABELS = {
  doctorGaveAmpleTime:        'Doctor gave ample time during consultation',
  doctorUnderstoodProblem:    'Doctor listened and understood the problem',
  pharmacyExplainedMedicine:  'Pharmacy staff explained medicine usage properly',
  labExplainedProcedure:      'Lab staff explained procedure before sampling',
  labReportsOnTime:           'Lab reports received within given time',
  nursingBehaviour:           'Satisfied with professional behaviour of nursing staff',
  bedLinenClean:              'Bed linen was clean',
  dentalTreatmentSatisfied:   'Satisfied with dental treatment given',
  dentalRatesSatisfied:       'Satisfied with dental rates charged',
  dentalReceiptProvided:      'Receipt provided for dental charges',
  physioStaffBehaviour:       'Satisfied with physiotherapy staff behaviour',
  physioPrivacyMaintained:    'Patient privacy maintained during physiotherapy',
  physioRatesSatisfied:       'Satisfied with physiotherapy rates charged',
  physioReceiptProvided:      'Receipt provided for physiotherapy charges',
};

const RATING_LABELS = {
  staffBehaviour: 'Staff Behaviour',
  waitingTime:    'Waiting Time / Queue',
  housekeeping:   'Housekeeping',
  consultation:   'Consultation Quality',
  pharmacy:       'Pharmacy Service',
  laboratory:     'Laboratory Service',
  xray:           'X-Ray Service',
  nursing:        'Nursing Service',
  dental:         'Dental Service',
  physiotherapy:  'Physiotherapy Service',
};

function StarDisplay({ value }) {
  return (
    <View style={star.row}>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={[star.icon, n <= value && star.iconFilled]}>★</Text>
      ))}
    </View>
  );
}

function BooleanDisplay({ label, value }) {
  return (
    <View style={bd.row}>
      <Text style={bd.label}>{label}</Text>
      <View style={[bd.badge, value ? bd.badgeYes : bd.badgeNo]}>
        <Text style={[bd.text, value ? bd.textYes : bd.textNo]}>
          {value ? 'Yes' : 'No'}
        </Text>
      </View>
    </View>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function FeedbackDetailScreen({ route, navigation }) {
  const { feedbackId } = route.params;
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchFeedback = async () => {
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.feedback}/${feedbackId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setFeedback(data.data);
      } else {
        alert(data.message || 'Failed to load feedback.');
      }
    } catch (error) {
      alert('Network error.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchFeedback();
  }, [feedbackId]));

  const handleDelete = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Delete this feedback entry? This cannot be undone.')
      : true;
    if (!confirmed) return;

    setDeleting(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.feedback}/${feedbackId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        navigation.goBack();
      } else {
        alert(data.message || 'Failed to delete feedback.');
      }
    } catch (error) {
      alert('Network error.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3182ce" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!feedback) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Feedback not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Feedback Detail</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>

        {/* Visit Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visit Details</Text>
          <Field label="Visit Date" value={feedback.visitDate} />
          <Field label="Visit Time" value={feedback.visitTime} />
          <Field label="Consulting Doctor" value={feedback.consultingDoctor} />
          <Field label="Patient Name" value={feedback.patientName} />
          <Field label="Patient Relation" value={feedback.patientRelation} />
          {feedback.submittedByName && (
            <Field label="Submitted By" value={feedback.submittedByName} />
          )}
          <Field
            label="Submitted At"
            value={feedback.submittedAt
              ? new Date(feedback.submittedAt).toLocaleString('en-GB')
              : null}
          />
        </View>

        {/* Services Used */}
        {feedback.servicesUsed?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Services Used</Text>
            <View style={styles.tagsRow}>
              {feedback.servicesUsed.map(s => (
                <View key={s} style={styles.tag}>
                  <Text style={styles.tagText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Ratings */}
        {feedback.ratings && Object.keys(feedback.ratings).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ratings</Text>
            {Object.entries(feedback.ratings).map(([key, value]) => (
              <View key={key} style={styles.ratingRow}>
                <Text style={styles.ratingLabel}>
                  {RATING_LABELS[key] || key}
                </Text>
                <StarDisplay value={value} />
              </View>
            ))}
          </View>
        )}

        {/* Boolean Questions */}
        {feedback.booleans && Object.keys(feedback.booleans).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detailed Responses</Text>
            {Object.entries(feedback.booleans).map(([key, value]) => (
              <BooleanDisplay
                key={key}
                label={BOOLEAN_LABELS[key] || key}
                value={value}
              />
            ))}
          </View>
        )}

        {/* Comments */}
        {(feedback.overallExperience || feedback.suggestion) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comments</Text>
            {feedback.overallExperience && (
              <View style={styles.commentBox}>
                <Text style={styles.commentLabel}>Overall Experience</Text>
                <Text style={styles.commentText}>{feedback.overallExperience}</Text>
              </View>
            )}
            {feedback.suggestion && (
              <View style={styles.commentBox}>
                <Text style={styles.commentLabel}>Suggestion for Improvement</Text>
                <Text style={styles.commentText}>{feedback.suggestion}</Text>
              </View>
            )}
          </View>
        )}

        {/* Delete — CMO only, handled gracefully if button appears for admin */}
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={handleDelete}
          disabled={deleting}
        >
          {deleting
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.deleteText}>Delete This Feedback</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:        { flex: 1, backgroundColor: '#f0f4f8' },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:    { marginTop: 12, color: '#718096' },
  errorText:      { color: '#718096', fontSize: 15 },
  header:         { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn:        { marginBottom: 8 },
  backText:       { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:          { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  container:      { padding: 16, gap: 12 },
  section:        { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  sectionTitle:   { fontSize: 13, fontWeight: '700', color: '#3182ce', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  field:          { marginBottom: 10 },
  fieldLabel:     { fontSize: 12, color: '#a0aec0', marginBottom: 2 },
  fieldValue:     { fontSize: 14, color: '#2d3748', fontWeight: '500' },
  tagsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:            { backgroundColor: '#f0f4f8', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4 },
  tagText:        { fontSize: 13, color: '#4a5568', textTransform: 'capitalize' },
  ratingRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  ratingLabel:    { fontSize: 14, color: '#2d3748', flex: 1, marginRight: 8 },
  commentBox:     { marginBottom: 12 },
  commentLabel:   { fontSize: 12, color: '#a0aec0', marginBottom: 4 },
  commentText:    { fontSize: 14, color: '#2d3748', lineHeight: 20 },
  deleteBtn:      { marginTop: 8, backgroundColor: '#e53e3e', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  deleteBtnDisabled: { backgroundColor: '#a0aec0' },
  deleteText:     { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});

const star = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 2 },
  icon:       { fontSize: 20, color: '#e2e8f0' },
  iconFilled: { color: '#f6ad55' },
});

const bd = StyleSheet.create({
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f4f8' },
  label:    { fontSize: 13, color: '#4a5568', flex: 1, marginRight: 12, lineHeight: 18 },
  badge:    { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeYes: { backgroundColor: '#f0fff4' },
  badgeNo:  { backgroundColor: '#fff5f5' },
  text:     { fontSize: 13, fontWeight: '600' },
  textYes:  { color: '#276749' },
  textNo:   { color: '#742a2a' },
});