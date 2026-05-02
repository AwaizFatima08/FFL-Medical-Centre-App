import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './src/config/firebase';
import { getUserData } from './src/utils/storage';
import AuthNavigator from './src/navigation/AuthNavigator';

export default function App() {
  const [loading,       setLoading]       = useState(true);
  const [isLoggedIn,    setIsLoggedIn]    = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Check if user data exists and account is active
        const userData = await getUserData();
        if (userData && userData.user?.isActive) {
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(false);
        }
      } else {
        setIsLoggedIn(false);
      }
      setLoading(false);
    });

    return unsubscribe; // cleanup on unmount
  }, []);

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#c1121f" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      {/* 
        isLoggedIn is false for now — shows AuthNavigator (Login/Signup/ForgotPassword)
        Once role-based navigation is built, we will add AppNavigator here for logged-in users
      */}
      <AuthNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#003049',
  },
});
