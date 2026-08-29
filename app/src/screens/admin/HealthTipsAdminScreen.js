// app/src/screens/admin/HealthTipsAdminScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator,
} from 'react-native';
import {
  collection, query, orderBy, getDocs, addDoc,
  updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../../config/firebase';
import { webAlert, webConfirm } from '../../utils/webAlert';

export default function HealthTipsAdminScreen({ navigation }) {
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTipText, setNewTipText] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTips = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'healthTips'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setTips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      webAlert('Error', 'Failed to load health tips.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTips(); }, [fetchTips]);

  const handleAddTip = async () => {
    const trimmed = newTipText.trim();
    if (!trimmed) {
      webAlert('Missing text', 'Please enter tip text before adding.');
      return;
    }
    setSaving(true);
    try {
      const uid = getAuth().currentUser?.uid || null;
      await addDoc(collection(db, 'healthTips'), {
        text: trimmed,
        isActive: true,
        createdAt: serverTimestamp(),
        createdBy: uid,
      });
      setNewTipText('');
      fetchTips();
    } catch (e) {
      webAlert('Error', 'Failed to add tip. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (tip) => {
    try {
      await updateDoc(doc(db, 'healthTips', tip.id), { isActive: !tip.isActive });
      setTips(prev => prev.map(t => t.id === tip.id ? { ...t, isActive: !t.isActive } : t));
    } catch (e) {
      webAlert('Error', 'Failed to update tip.');
    }
  };

  const handleDelete = (tip) => {
    webConfirm(
      'Delete Tip',
      'Remove this health tip permanently?',
      async () => {
        try {
          await deleteDoc(doc(db, 'healthTips', tip.id));
          setTips(prev => prev.filter(t => t.id !== tip.id));
        } catch (e) {
          webAlert('Error', 'Failed to delete tip.');
        }
      },
      true, 'Delete'
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Health Tips</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.subheading}>
        Checked tips rotate on the employee dashboard, one per day. Unchecked tips stay saved but won't show.
      </Text>

      <View style={styles.addCard}>
        <Text style={styles.addLabel}>Add a new tip</Text>
        <TextInput
          style={styles.input}
          placeholder="Type in English, Urdu, or both..."
          value={newTipText}
          onChangeText={setNewTipText}
          multiline
        />
        <TouchableOpacity
          style={[styles.addButton, saving && styles.addButtonDisabled]}
          onPress={handleAddTip}
          disabled={saving}
        >
          <Text style={styles.addButtonText}>{saving ? 'Adding...' : 'Add Tip'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : tips.length === 0 ? (
        <Text style={styles.emptyText}>No tips yet — add your first one above.</Text>
      ) : (
        tips.map((tip) => (
          <View key={tip.id} style={styles.tipRow}>
            <TouchableOpacity
              style={[styles.checkbox, tip.isActive && styles.checkboxChecked]}
              onPress={() => handleToggleActive(tip)}
            >
              {tip.isActive && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
            <Text style={styles.tipText}>{tip.text}</Text>
            <TouchableOpacity onPress={() => handleDelete(tip)} style={styles.deleteButton}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f0f4f8', paddingTop: 56, paddingBottom: 40, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backButton: { width: 60 },
  backText: { fontSize: 15, color: '#4a5568' },
  heading: { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subheading: { fontSize: 13, color: '#718096', marginBottom: 20, lineHeight: 18 },

  addCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  addLabel: { fontSize: 14, fontWeight: '600', color: '#2d3748', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10,
    minHeight: 70, textAlignVertical: 'top', fontSize: 14, color: '#2d3748', marginBottom: 10,
  },
  addButton: { backgroundColor: '#3182ce', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  addButtonDisabled: { opacity: 0.6 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  emptyText: { textAlign: 'center', color: '#a0aec0', marginTop: 24 },

  tipRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#cbd5e0',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  checkboxChecked: { backgroundColor: '#38a169', borderColor: '#38a169' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  tipText: { flex: 1, fontSize: 14, color: '#2d3748', lineHeight: 20 },
  deleteButton: { marginLeft: 10, paddingHorizontal: 8 },
  deleteText: { color: '#e53e3e', fontSize: 13 },
});