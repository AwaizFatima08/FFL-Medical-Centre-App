// app/src/screens/home/EmployeeHome.js

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Modal, Pressable, Image, Dimensions,
} from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import LogoutButton     from '../../components/LogoutButton';
import NotificationBell from '../../components/NotificationBell';
import { auth, db } from '../../config/firebase';

const PANEL_WIDTH = Math.min(280, Dimensions.get('window').width * 0.75);

const TILES = [
  { id: 'ambulance', label: 'Request Ambulance', icon: '🚑', screen: 'AmbulanceRequest', active: true },
  { id: 'trip', label: 'Medical Trip', icon: '🚌', screen: 'TripMyBooking', active: true },
  { id: 'directory', label: 'Doctors Directory', icon: '🏥', screen: 'DirectoryList', active: true },
  { id: 'feedback', label: 'Feedback', icon: '📋', screen: 'Feedback', active: true },
  { id: 'availability', label: 'Doctor Availability', icon: '👨‍⚕️', screen: 'DoctorAvailability', active: true },
  { id: 'family', label: 'My Family', icon: '👨‍👩‍👧‍👦', screen: 'FamilyMemberList', active: true },
  { id: 'vaccination', label: 'Vaccination', icon: '💉', screen: 'VaccinationChildList', active: false },
  { id: 'circulars', label: 'Circulars & Notices', icon: '📢', screen: 'Circulars', active: true },
  { id: 'fitness', label: 'Annual Fitness', icon: '🏃', screen: 'FitnessEmployee', active: true },
  { id: 'donors', label: 'Blood Donors', icon: '🩸', screen: 'BloodDonorDirectory', active: true },
  { id: 'lab', label: 'Lab Updates', icon: '🧪', screen: null, active: false },
  { id: 'pharmacy', label: 'Pharmacy Updates', icon: '💊', screen: null, active: false },
];

const HEALTH_TIPS = [
  'Drink at least 8 glasses of water a day to stay hydrated during work hours.',
  'Take a 5-minute walk every hour to reduce the health risks of sitting too long.',
  'Wash your hands regularly to prevent the spread of common infections.',
  'Sit with your back straight and screen at eye level to avoid neck and back strain.',
  'Aim for 7-8 hours of sleep each night - it affects focus and immunity.',
  'Include fruits and vegetables in every meal for better long-term health.',
  'Give your eyes a break every 20 minutes by looking at something 20 feet away.',
  'Get your blood pressure checked periodically, even if you feel fine.',
  'Stretch your shoulders and wrists during long desk or screen sessions.',
  'Avoid skipping breakfast - it helps maintain energy and focus through the day.',
  'Limit added sugar and salt where you can - small changes add up.',
  'Take the stairs when possible - it adds light exercise to your day.',
  'Manage stress with short breathing breaks - even 2 minutes helps.',
  'Keep emergency numbers handy and know your nearest medical point.',
  'Regular hand and respiratory hygiene protects you and your colleagues.',
];

function getGreetingPrefix() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTipOfTheDay() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / 86400000);
  return HEALTH_TIPS[dayOfYear % HEALTH_TIPS.length];
}

export default function EmployeeHome({ navigation }) {
  const [panelVisible, setPanelVisible] = useState(false);
  const [firstName, setFirstName] = useState('there');
  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;

  useEffect(() => {
    async function fetchName() {
      const uid = auth?.currentUser?.uid;
      if (!uid) return;
      try {
        const q = query(collection(db, 'employees'), where('userId', '==', uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const fullName = snap.docs[0].data().fullName;
          if (fullName) setFirstName(fullName.split(' ')[0]);
        }
      } catch (e) {
        // stays "there" if lookup fails — safe fallback, no crash
      }
    }
    fetchName();
  }, []);

  const openPanel = () => {
    setPanelVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const closePanel = () => {
    Animated.timing(slideAnim, {
      toValue: -PANEL_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setPanelVisible(false));
  };

  const handleTilePress = (tile) => {
    if (!tile.active) return;
    closePanel();
    navigation.navigate(tile.screen, { userRole: 'employee' });
  };

  const now = new Date();
  const dateString = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeString = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={openPanel} style={styles.menuButton}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.heading}>FFL Medical Centre</Text>
            <Text style={styles.subheading}>Employee Portal</Text>
          </View>
          <View style={styles.headerRight}>
            <NotificationBell navigation={navigation} />
            <LogoutButton />
          </View>
        </View>

        {/* Dashboard content */}
        <View style={styles.dashboard}>
          <Image
            source={require('../../../assets/FFCL_Logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.greeting}>{getGreetingPrefix()}, {firstName}</Text>
          <Text style={styles.dateText}>{dateString}</Text>
          <Text style={styles.timeText}>{timeString}</Text>

          <View style={styles.tipCard}>
            <Text style={styles.tipLabel}>💡 Health Tip of the Day</Text>
            <Text style={styles.tipText}>{getTipOfTheDay()}</Text>
          </View>

          <View style={styles.emergencyCard}>
            <Text style={styles.emergencyLabel}>🚨 Medical Centre Emergency Numbers</Text>
            <Text style={styles.emergencyRow}>Reception: 5935</Text>
            <Text style={styles.emergencyRow}>Medical Emergency: 5555</Text>
          </View>
        </View>

      </ScrollView>

      {/* Side panel */}
      <Modal visible={panelVisible} transparent animationType="none" onRequestClose={closePanel}>
        <Pressable style={styles.backdrop} onPress={closePanel} />
        <Animated.View style={[styles.panel, { width: PANEL_WIDTH, transform: [{ translateX: slideAnim }] }]}>
          <ScrollView contentContainerStyle={styles.panelContent}>
            <Text style={styles.panelTitle}>Menu</Text>
            {TILES.map((tile) => (
              <TouchableOpacity
                key={tile.id}
                style={[styles.panelItem, !tile.active && styles.panelItemDisabled]}
                onPress={() => handleTilePress(tile)}
                activeOpacity={tile.active ? 0.6 : 1}
              >
                <Text style={styles.panelItemIcon}>{tile.icon}</Text>
                <Text style={[styles.panelItemLabel, !tile.active && styles.panelItemLabelDisabled]}>
                  {tile.label}
                </Text>
                {!tile.active && <Text style={styles.comingSoon}>Soon</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, backgroundColor: '#f0f4f8',
    paddingTop: 56, paddingBottom: 40, paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', width: '100%', marginBottom: 32,
  },
  menuButton: { padding: 6 },
  menuIcon: { fontSize: 26, color: '#2d3748' },
  headerCenter: { flex: 1, alignItems: 'center' },
  heading:    { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subheading: { fontSize: 13, color: '#718096', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  dashboard: { alignItems: 'center', width: '100%', maxWidth: 500, alignSelf: 'center' },
  logo: { width: 100, height: 100, marginBottom: 16 },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#2d3748', marginBottom: 4 },
  dateText: { fontSize: 15, color: '#4a5568' },
  timeText: { fontSize: 15, color: '#4a5568', marginBottom: 24 },

  tipCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    width: '100%', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  tipLabel: { fontSize: 14, fontWeight: '600', color: '#2d3748', marginBottom: 6 },
  tipText: { fontSize: 14, color: '#4a5568', lineHeight: 20 },

  emergencyCard: {
    backgroundColor: '#fff5f5', borderRadius: 12, padding: 16,
    width: '100%', borderWidth: 1, borderColor: '#feb2b2',
  },
  emergencyLabel: { fontSize: 14, fontWeight: '600', color: '#c53030', marginBottom: 8 },
  emergencyRow: { fontSize: 14, color: '#742a2a', marginTop: 2 },

  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    position: 'absolute', top: 0, bottom: 0, left: 0,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 10,
  },
  panelContent: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 24 },
  panelTitle: { fontSize: 18, fontWeight: 'bold', color: '#2d3748', marginBottom: 16 },
  panelItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#edf2f7',
  },
  panelItemDisabled: { opacity: 0.5 },
  panelItemIcon: { fontSize: 22, marginRight: 14 },
  panelItemLabel: { fontSize: 15, color: '#2d3748', flex: 1 },
  panelItemLabelDisabled: { color: '#a0aec0' },
  comingSoon: { fontSize: 11, color: '#a0aec0', fontStyle: 'italic' },
});