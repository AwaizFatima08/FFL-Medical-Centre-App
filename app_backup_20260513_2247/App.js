// app/App.js
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';  // ← added Platform
import { onAuthStateChanged } from 'firebase/auth';
import { getDoc, doc, updateDoc } from 'firebase/firestore';                   // ← added updateDoc
import { auth, db } from './src/config/firebase';
import AuthNavigator from './src/navigation/AuthNavigator';
import AppNavigator  from './src/navigation/AppNavigator';

// ── FCM token saving (web is not supported by Firebase Messaging in Expo) ──
// Only attempt on native (Android / iOS)
let getMessagingToken = null;
if (Platform.OS !== 'web') {
  // Dynamic import so web build doesn't crash on missing native module
  try {
    const { getMessaging, getToken } = require('firebase/messaging');
    getMessagingToken = async () => {
      const messaging = getMessaging();
      return await getToken(messaging, {
        vapidKey: process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY, // only needed for web; safe to leave here
      });
    };
  } catch (_) {
    // Firebase Messaging not available in this environment — skip silently
  }
}

// ── Save FCM token to Firestore for this user ──────────────────────────────
async function saveFcmToken(uid) {
  if (!getMessagingToken) return; // web or unsupported environment
  try {
    const token = await getMessagingToken();
    if (token) {
      await updateDoc(doc(db, 'users', uid), { fcmToken: token });
    }
  } catch (err) {
    // Non-fatal — app still works without push notifications
    console.warn('FCM token save failed:', err.message);
  }
}

export default function App() {
  const [user,     setUser]     = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.isActive === true) {
              setUserRole(data.role);
              setUser(firebaseUser);
              saveFcmToken(firebaseUser.uid); // ← save token after confirmed active login
            } else {
              setUser(null);
              setUserRole(null);
            }
          } else {
            setUser(null);
            setUserRole(null);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUser(null);
          setUserRole(null);
        }
      } else {
        setUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#3182ce" />
      </View>
    );
  }

  return (
    // flex: 1 on this wrapper ensures all screens fill the viewport height on web,
    // which is required for ScrollView to work correctly.
    <View style={styles.root}>
      <NavigationContainer>
        {user ? <AppNavigator userRole={userRole} /> : <AuthNavigator />}
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});