// app/src/components/LogoutButton.js
import { webAlert, webConfirm } from '../utils/webAlert';
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

export default function LogoutButton() {
  const handleLogout = () => {
    webConfirm(
      'Logout',
      'Are you sure you want to logout?',
      async () => {
        try {
          await signOut(auth);
        } catch (error) {
          webAlert('Error', 'Failed to logout. Please try again.');
        }
      },
      true, 'Logout'
    );
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
