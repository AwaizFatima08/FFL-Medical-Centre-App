// app/src/components/LogoutButton.js
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, Platform } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

export default function LogoutButton() {
  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      // Alert.alert does not work on web — use browser confirm instead
      const confirmed = window.confirm('Are you sure you want to logout?');
      if (!confirmed) return;
      try {
        await signOut(auth);
      } catch (error) {
        window.alert('Failed to logout. Please try again.');
      }
    } else {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: async () => {
              try {
                await signOut(auth);
              } catch (error) {
                Alert.alert('Error', 'Failed to logout. Please try again.');
              }
            },
          },
        ]
      );
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handleLogout}>
      <Text style={styles.text}>Logout</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 48,
    right: 20,
    backgroundColor: '#e53e3e',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  text: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
