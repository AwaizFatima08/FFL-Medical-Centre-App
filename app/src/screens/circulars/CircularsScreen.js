// app/src/screens/circulars/CircularsScreen.js
import { webAlert, webConfirm } from '../../utils/webAlert';
// Flow 3 — Health Awareness Circulars & Administrative Notices
// Two tabs: Medical | Administrative
// Upload by: admin_incharge, cmo
// View by: all roles

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
  Linking,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

const TABS = [
  { key: 'medical',        label: '🏥 Medical' },
  { key: 'administrative', label: '📋 Administrative' },
];

const UPLOAD_ROLES = ['admin_incharge', 'cmo'];


export default function CircularsScreen({ navigation, route }) {
  const { userRole } = route.params || {};

  const [activeTab, setActiveTab]     = useState('medical');
  const [circulars, setCirculars]     = useState({ medical: [], administrative: [] });
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [deletingId, setDeletingId]   = useState(null);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchCirculars = async () => {
    try {
      const token = await getToken();
      const [medRes, adminRes] = await Promise.all([
        fetch(`${API.circulars}/list?category=medical`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API.circulars}/list?category=administrative`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);
      const medData   = await medRes.json();
      const adminData = await adminRes.json();
      setCirculars({
        medical:        medRes.ok   ? (medData.data   || []) : [],
        administrative: adminRes.ok ? (adminData.data || []) : [],
      });
    } catch {
      webAlert('Error', 'Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchCirculars();
  }, []));

  const onRefresh = () => {
    setRefreshing(true);
    fetchCirculars();
  };

  const handleOpen = (item) => {
    if (!item.fileUrl) return;
    Linking.openURL(item.fileUrl).catch(() => {
      webAlert('Error', 'Could not open file. Please try again.');
    });
  };

  const handleDelete = (item) => {
    webConfirm(
      'Delete Circular',
      `Delete "${item.title}"? This cannot be undone.`,
      async () => {
        setDeletingId(item.id);
        try {
          const token = await getToken();
          const response = await fetch(`${API.circulars}/${item.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await response.json();
          if (response.ok) {
            fetchCirculars();
          } else {
            webAlert('Error', data.message || 'Delete failed.');
          }
        } catch {
          webAlert('Error', 'Network error. Please try again.');
        } finally {
          setDeletingId(null);
        }
      }
    );
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts._seconds ? ts._seconds * 1000 : ts);
    return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const isImage = (mimeType) => mimeType?.startsWith('image/');
  const isPdf   = (mimeType) => mimeType === 'application/pdf';

  const currentList = circulars[activeTab] || [];
  const canUpload   = UPLOAD_ROLES.includes(userRole);

  const renderCircular = (item) => (
    <View key={item.id} style={styles.card}>
      {/* Thumbnail / type indicator */}
      <View style={styles.cardLeft}>
        <View style={[styles.typeBadge, isPdf(item.mimeType) ? styles.typePdf : styles.typeImage]}>
          <Text style={styles.typeBadgeText}>
            {isPdf(item.mimeType) ? 'PDF' : 'IMG'}
          </Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.cardDate}>📅 {formatDate(item.createdAt)}</Text>
        <Text style={styles.cardFilename} numberOfLines={1}>
          📎 {item.originalFilename || 'file'}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.openBtn}
          onPress={() => handleOpen(item)}
        >
          <Text style={styles.openBtnText}>Open</Text>
        </TouchableOpacity>

        {canUpload && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item)}
            disabled={deletingId === item.id}
          >
            {deletingId === item.id
              ? <ActivityIndicator size="small" color="#c53030" />
              : <Text style={styles.deleteBtnText}>Delete</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Circulars & Notices</Text>
        <Text style={styles.subtitle}>Official communications from Medical Centre</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {circulars[tab.key]?.length > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>
                  {circulars[tab.key].length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Upload button */}
      {canUpload && (
        <TouchableOpacity
          style={styles.uploadBtn}
          onPress={() => navigation.navigate('CircularUpload', { userRole, category: activeTab })}
        >
          <Text style={styles.uploadBtnText}>+ Upload {activeTab === 'medical' ? 'Medical' : 'Administrative'} Circular</Text>
        </TouchableOpacity>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading circulars...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {currentList.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>
                {activeTab === 'medical' ? '🏥' : '📋'}
              </Text>
              <Text style={styles.emptyText}>No {activeTab} circulars yet</Text>
              <Text style={styles.emptySubtext}>Pull down to refresh</Text>
            </View>
          ) : (
            currentList.map(renderCircular)
          )}
        </ScrollView>
      )}
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

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#3182ce' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#718096' },
  tabTextActive: { color: '#3182ce' },
  tabBadge: {
    backgroundColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  tabBadgeActive: { backgroundColor: '#ebf8ff' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: '#718096' },
  tabBadgeTextActive: { color: '#3182ce' },

  uploadBtn: {
    margin: 12, marginBottom: 4, backgroundColor: '#3182ce',
    borderRadius: 8, paddingVertical: 11, alignItems: 'center',
  },
  uploadBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  scroll: { flex: 1 },
  scrollContent: { padding: 12 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardLeft: { marginRight: 12 },
  typeBadge: {
    width: 48, height: 48, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  typePdf:   { backgroundColor: '#fff5f5' },
  typeImage: { backgroundColor: '#ebf8ff' },
  typeBadgeText: { fontSize: 12, fontWeight: '800', color: '#4a5568' },

  cardContent: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#2d3748', marginBottom: 4 },
  cardDate: { fontSize: 12, color: '#718096', marginBottom: 2 },
  cardFilename: { fontSize: 11, color: '#a0aec0' },

  cardActions: { gap: 6, alignItems: 'flex-end' },
  openBtn: {
    backgroundColor: '#3182ce', borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  openBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  deleteBtn: {
    backgroundColor: '#fff5f5', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#feb2b2',
    minWidth: 60, alignItems: 'center',
  },
  deleteBtnText: { color: '#c53030', fontWeight: '700', fontSize: 13 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  loadingText: { marginTop: 10, color: '#718096', fontSize: 14 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#4a5568', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#a0aec0', marginTop: 4 },
});