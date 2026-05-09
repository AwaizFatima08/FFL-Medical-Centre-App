// app/src/components/NotificationBell.js
// Reusable bell icon for home screen headers.
// Shows a red badge with unread count when there are unread notifications.
// Usage: <NotificationBell navigation={navigation} />

import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../config/api';

export default function NotificationBell({ navigation }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = async () => {
    try {
      const auth = getAuth();
      if (!auth.currentUser) return;
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API.notifications}/my`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        const unread = (data.data || []).filter(n => !n.isRead).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      // Silently fail — bell is non-critical UI
    }
  };

  // Refresh count every time the screen comes into focus
  useFocusEffect(useCallback(() => {
    fetchUnreadCount();
  }, []));

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => navigation.navigate('Notifications')}
      activeOpacity={0.7}
    >
      <Text style={styles.icon}>🔔</Text>
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#e53e3e',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});