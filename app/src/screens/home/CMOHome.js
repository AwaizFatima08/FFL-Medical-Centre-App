// app/src/screens/home/CMOHome.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LogoutButton from '../../components/LogoutButton';

export default function CMOHome() {
  return (
    <View style={styles.container}>
      <LogoutButton />
      <Text style={styles.title}>CMO Dashboard</Text>
      <Text style={styles.subtitle}>FFL Medical Centre</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 14, color: '#718096', marginTop: 8 },
});
