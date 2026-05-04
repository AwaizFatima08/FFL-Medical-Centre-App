// app/src/screens/home/NurseHome.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LogoutButton from '../../components/LogoutButton';

export default function NurseHome() {
  return (
    <View style={styles.container}>
      <LogoutButton />
      <Text style={styles.title}>Nurse Dashboard</Text>
      <Text style={styles.subtitle}>FFL Medical Centre</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 14, color: '#718096', marginTop: 8 },
});
