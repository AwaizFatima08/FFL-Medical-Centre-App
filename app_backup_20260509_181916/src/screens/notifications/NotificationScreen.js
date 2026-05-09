// app/src/screens/notifications/NotificationScreen.js

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';

// ─── Notification type config ────────────────────────────────────────────────
const TYPE_CONFIG = {
  ambulance:   { icon: '🚑', label: 'Ambulance',   color: '#c53030', bg: '#fff5f5' },
  trip:        { icon: '🚌', label: 'Medical Trip', color: '#2b6cb0', bg: '#ebf8ff' },
  circular:    { icon: '📢', label: 'Circular',     color: '#6b46c1', bg: '#faf5ff' },
  fitness:     { icon: '🏃', label: 'Fitness',      color: '#276749', bg: '#f0fff4' },
  vaccination: { icon: '💉', label: 'Vaccination',  color: '#c05621', bg: '#fffaf0' },
};

const DEFAULT_TYPE = { icon: '🔔', label: 'Notification', color: '#4a5568', bg: '#edf2f7' };

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [markingAll, setMarkingAll]       = useState(false);

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchNotifications = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API.notifications}/my`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setNotifications(data.data || []);
      }
    } catch (error) {
      // Silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchNotifications();
  }, []));

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markAsRead = async (id) => {
    try {
      const token = await getToken();
      await fetch(`${API.notifications}/${id}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      // Update locally — no full refetch needed
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
    } catch (error) {
      // Silent fail
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      const token = await getToken();
      await fetch(`${API.notifications}/read-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      alert('Failed to mark all as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationPress = async (item) => {
    // Mark as read on tap
    if (!item.isRead) {
      await markAsRead(item.id);
    }
    // Navigation on tap is not implemented (per decision) — nothing more to do
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const renderNotification = (item) => {
    const typeConfig = TYPE_CONFIG[item.type] || DEFAULT_TYPE;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, !item.isRead && styles.cardUnread]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.8}
      >
        {/* Unread indicator dot */}
        {!item.isRead && <View style={styles.unreadDot} />}

        <View style={[styles.iconContainer, { backgroundColor: typeConfig.bg }]}>
          <Text style={styles.icon}>{typeConfig.icon}</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, !item.isRead && styles.titleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.body} numberOfLines={3}>
            {item.body}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: typeConfig.bg }]}>
            <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
              {typeConfig.label}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={markAllRead}
            style={styles.markAllBtn}
            disabled={markingAll}
          >
            <Text style={styles.markAllText}>
              {markingAll ? 'Clearing...' : 'Mark all read'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Unread summary bar */}
      {unreadCount > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3182ce" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySubtitle}>
                You'll be notified about ambulance requests, trips, fitness appointments and more.
              </Text>
            </View>
          ) : (
            notifications.map(renderNotification)
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:      { flex: 1, backgroundColor: '#f0f4f8' },

  // Header
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    flexDirection: 'row', alignItems: 'flex-end',
  },
  backBtn:      { marginRight: 12, paddingBottom: 2 },
  backText:     { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  headerTitle:  { flex: 1, fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  markAllBtn:   { paddingBottom: 2 },
  markAllText:  { fontSize: 13, color: '#3182ce', fontWeight: '600' },

  // Summary bar
  summaryBar: {
    backgroundColor: '#ebf8ff',
    paddingHorizontal: 20, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#bee3f8',
  },
  summaryText:  { fontSize: 13, color: '#2b6cb0', fontWeight: '600' },

  // List
  list:         { flex: 1 },
  listContent:  { padding: 16, gap: 10 },

  // Card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    position: 'relative',
  },
  cardUnread: {
    backgroundColor: '#fff',
    borderLeftWidth: 3,
    borderLeftColor: '#3182ce',
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3182ce',
  },

  // Icon
  iconContainer: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12, flexShrink: 0,
  },
  icon:         { fontSize: 20 },

  // Content
  content:      { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  title: {
    flex: 1, fontSize: 14, fontWeight: '600',
    color: '#4a5568', lineHeight: 18,
  },
  titleUnread:  { color: '#2d3748', fontWeight: '700' },
  time:         { fontSize: 11, color: '#a0aec0', flexShrink: 0, marginTop: 1 },
  body: {
    fontSize: 13, color: '#718096',
    lineHeight: 18, marginBottom: 8,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '600' },

  // States
  centered: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', paddingTop: 80,
  },
  loadingText:  { marginTop: 12, fontSize: 14, color: '#718096' },
  emptyState: {
    alignItems: 'center', paddingTop: 60, paddingHorizontal: 32,
  },
  emptyIcon:    { fontSize: 48, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: 'bold', color: '#2d3748', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 20 },
});