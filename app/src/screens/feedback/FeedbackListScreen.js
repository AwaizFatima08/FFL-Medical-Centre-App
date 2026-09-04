// app/src/screens/feedback/FeedbackListScreen.js
//
// Phase 9 update: added a second tab — Suggestions — alongside the
// existing feedback list. Same CMO-only access as feedback itself (see
// feedbackRoutes.js). Styled with a distinct amber accent matching the
// suggestion box on the submission side, so it reads as the same feature
// rather than a smaller version of the feedback list.
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

const RELATION_LABELS = {
  Self: 'Self', Spouse: 'Spouse', Child: 'Child',
  Parent: 'Parent', Other: 'Other',
};

const TABS = [
  { key: 'feedback',    label: '📋 Feedback' },
  { key: 'suggestions', label: '💡 Suggestions' },
];

function RatingDots({ value }) {
  return (
    <View style={rd.row}>
      {[1, 2, 3, 4, 5].map(n => (
        <View key={n} style={[rd.dot, n <= value && rd.dotFilled]} />
      ))}
    </View>
  );
}

export default function FeedbackListScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('feedback');

  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Phase 9 — suggestions state, kept separate from feedback state so the
  // two tabs never interfere with each other's loading/refresh status.
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [deletingSuggestionId, setDeletingSuggestionId] = useState(null);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchFeedbacks = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.feedback}/all`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setFeedbacks(data.data || []);
      } else {
        alert(data.message || 'Failed to load feedback.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Phase 9 — mirrors fetchFeedbacks above, separate endpoint.
  const fetchSuggestions = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.feedback}/suggestions/all`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setSuggestions(data.data || []);
      } else {
        alert(data.message || 'Failed to load suggestions.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setLoadingSuggestions(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setLoadingSuggestions(true);
    fetchFeedbacks();
    fetchSuggestions();
  }, []));

  const onRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'feedback') fetchFeedbacks();
    else fetchSuggestions();
  };

  // Phase 9 — delete a suggestion. No confirmation dialog to keep this
  // screen simple, matching the lightweight nature of the feature itself;
  // FeedbackDetailScreen.js's delete (a more consequential action, tied to
  // a real patient visit) keeps its own confirm step separately.
  const handleDeleteSuggestion = async (id) => {
    setDeletingSuggestionId(id);
    try {
      const token = await getToken();
      const response = await fetch(`${API.feedback}/suggestions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
      } else {
        alert(data.message || 'Failed to delete suggestion.');
      }
    } catch (error) {
      alert('Network error. Please try again.');
    } finally {
      setDeletingSuggestionId(null);
    }
  };

  const getOverallRating = (ratings) => {
    if (!ratings) return null;
    const values = Object.values(ratings).filter(v => typeof v === 'number');
    if (values.length === 0) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const currentlyLoading = activeTab === 'feedback' ? loading : loadingSuggestions;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Patient Feedback</Text>
        <Text style={styles.subtitle}>
          {activeTab === 'feedback'
            ? `${feedbacks.length} submission${feedbacks.length !== 1 ? 's' : ''}`
            : `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* Phase 9 — tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && (
                tab.key === 'suggestions' ? styles.tabActiveSuggestions : styles.tabActiveFeedback
              ),
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {currentlyLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* ─── Feedback tab ─── */}
          {activeTab === 'feedback' && (
            feedbacks.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyText}>No feedback submitted yet</Text>
                <Text style={styles.emptySubtext}>Pull down to refresh</Text>
              </View>
            ) : (
              feedbacks.map(item => {
                const overall = getOverallRating(item.ratings);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.card}
                    onPress={() => navigation.navigate('FeedbackDetail', { feedbackId: item.id })}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardTop}>
                      <View style={styles.cardLeft}>
                        <Text style={styles.visitDate}>
                          Visit: {item.visitDate || '—'}
                          {item.visitTime ? ` at ${item.visitTime}` : ''}
                        </Text>
                        <Text style={styles.doctorName}>
                          🩺 {item.consultingDoctor || 'Unknown'}
                        </Text>
                        {item.patientName && (
                          <Text style={styles.patientInfo}>
                            👤 {item.patientName}
                            {item.patientRelation ? ` (${item.patientRelation})` : ''}
                          </Text>
                        )}
                        {item.submittedByName && (
                          <Text style={styles.submitterName}>
                            Submitted by: {item.submittedByName}
                          </Text>
                        )}
                      </View>
                      {overall && (
                        <View style={styles.overallBadge}>
                          <Text style={styles.overallScore}>{overall}</Text>
                          <Text style={styles.overallMax}>/5</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.ratingsRow}>
                      {item.ratings?.staffBehaviour && (
                        <View style={styles.ratingChip}>
                          <Text style={styles.ratingChipLabel}>Staff</Text>
                          <RatingDots value={item.ratings.staffBehaviour} />
                        </View>
                      )}
                      {item.ratings?.waitingTime && (
                        <View style={styles.ratingChip}>
                          <Text style={styles.ratingChipLabel}>Wait</Text>
                          <RatingDots value={item.ratings.waitingTime} />
                        </View>
                      )}
                      {item.ratings?.housekeeping && (
                        <View style={styles.ratingChip}>
                          <Text style={styles.ratingChipLabel}>Housekeeping</Text>
                          <RatingDots value={item.ratings.housekeeping} />
                        </View>
                      )}
                    </View>

                    {item.servicesUsed?.length > 0 && (
                      <View style={styles.servicesRow}>
                        {item.servicesUsed.map(s => (
                          <View key={s} style={styles.serviceTag}>
                            <Text style={styles.serviceTagText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {item.overallExperience && (
                      <Text style={styles.comment} numberOfLines={2}>
                        "{item.overallExperience}"
                      </Text>
                    )}

                    <Text style={styles.submittedAt}>
                      Submitted: {formatDate(item.submittedAt)}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )
          )}

          {/* ─── Suggestions tab (Phase 9) ─── */}
          {activeTab === 'suggestions' && (
            suggestions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>💡</Text>
                <Text style={styles.emptyText}>No suggestions yet</Text>
                <Text style={styles.emptySubtext}>Pull down to refresh</Text>
              </View>
            ) : (
              suggestions.map(item => (
                <View key={item.id} style={styles.suggestionCard}>
                  <Text style={styles.suggestionText}>{item.suggestionText}</Text>
                  <View style={styles.suggestionFooter}>
                    <View>
                      <Text style={styles.suggestionSubmitter}>
                        {item.submittedByName || 'Unknown'}
                      </Text>
                      <Text style={styles.submittedAt}>
                        {formatDate(item.submittedAt)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.suggestionDeleteBtn}
                      onPress={() => handleDeleteSuggestion(item.id)}
                      disabled={deletingSuggestionId === item.id}
                    >
                      {deletingSuggestionId === item.id
                        ? <ActivityIndicator size="small" color="#c53030" />
                        : <Text style={styles.suggestionDeleteText}>Delete</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:          { flex: 1, backgroundColor: '#f0f4f8' },
  header:           { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn:          { marginBottom: 8 },
  backText:         { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:            { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle:         { fontSize: 13, color: '#718096', marginTop: 2 },

  // Phase 9 — tabs
  tabs: {
    flexDirection: 'row', backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 13,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActiveFeedback:    { borderBottomColor: '#3182ce' },
  tabActiveSuggestions: { borderBottomColor: '#d69e2e' },
  tabText:       { fontSize: 14, fontWeight: '600', color: '#718096' },
  tabTextActive: { color: '#2d3748', fontWeight: '800' },

  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  loadingText:      { marginTop: 12, color: '#718096' },
  list:             { padding: 16, gap: 12 },
  emptyState:       { alignItems: 'center', paddingTop: 60 },
  emptyIcon:        { fontSize: 40, marginBottom: 12 },
  emptyText:        { fontSize: 16, color: '#4a5568', fontWeight: '600' },
  emptySubtext:     { fontSize: 13, color: '#a0aec0', marginTop: 4 },
  card:             { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
  cardTop:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardLeft:         { flex: 1, marginRight: 12 },
  visitDate:        { fontSize: 14, fontWeight: '600', color: '#2d3748', marginBottom: 2 },
  doctorName:       { fontSize: 13, color: '#4a5568', marginBottom: 2 },
  patientInfo:      { fontSize: 13, color: '#4a5568', marginBottom: 2 },
  submitterName:    { fontSize: 12, color: '#3182ce', fontStyle: 'italic', marginTop: 2 },
  overallBadge:     { backgroundColor: '#ebf8ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', flexDirection: 'row' },
  overallScore:     { fontSize: 18, fontWeight: 'bold', color: '#2b6cb0' },
  overallMax:       { fontSize: 12, color: '#718096', marginLeft: 1, alignSelf: 'flex-end', marginBottom: 2 },
  ratingsRow:       { flexDirection: 'row', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
  ratingChip:       { alignItems: 'center', gap: 3 },
  ratingChipLabel:  { fontSize: 11, color: '#718096' },
  servicesRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  serviceTag:       { backgroundColor: '#f0f4f8', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  serviceTagText:   { fontSize: 11, color: '#4a5568', textTransform: 'capitalize' },
  comment:          { fontSize: 13, color: '#718096', fontStyle: 'italic', marginBottom: 8, lineHeight: 18 },
  submittedAt:      { fontSize: 11, color: '#a0aec0' },

  // Phase 9 — suggestion cards, same warm amber accent as the submission
  // side, so this reads as the same feature.
  suggestionCard: {
    backgroundColor: '#fffbeb', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#f6e05e',
  },
  suggestionText: {
    fontSize: 14, color: '#744210', lineHeight: 20, marginBottom: 12,
  },
  suggestionFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  suggestionSubmitter: { fontSize: 12, color: '#92400e', fontWeight: '600' },
  suggestionDeleteBtn: {
    backgroundColor: '#fff5f5', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#feb2b2',
    minWidth: 60, alignItems: 'center',
  },
  suggestionDeleteText: { color: '#c53030', fontWeight: '700', fontSize: 13 },
});

const rd = StyleSheet.create({
  row:       { flexDirection: 'row', gap: 2 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e2e8f0' },
  dotFilled: { backgroundColor: '#f6ad55' },
});