// app/src/screens/home/EmployeeHome.js

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Modal, Pressable, Image, Dimensions, Platform,
} from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import LogoutButton     from '../../components/LogoutButton';
import NotificationBell from '../../components/NotificationBell';
import { auth, db } from '../../config/firebase';

const PANEL_WIDTH = Math.min(280, Dimensions.get('window').width * 0.75);
const IS_WEB = Platform.OS === 'web';

const TILES = [
  { id: 'profile', label: 'My Profile', icon: '🧾', screen: 'MyProfile', active: true }, // Day 14, Step E
  { id: 'family', label: 'My Family', icon: '👨‍👩‍👧‍👦', screen: 'FamilyMemberList', active: true },
  { id: 'availability', label: 'Doctor Availability', icon: '👨‍⚕️', screen: 'DoctorAvailability', active: true },
  { id: 'ambulance', label: 'Request Ambulance', icon: '🚑', screen: 'AmbulanceRequest', active: true },
  { id: 'trip', label: 'Medical Trip', icon: '🚌', screen: 'TripMyBooking', active: true },
  { id: 'directory', label: 'Doctors Directory', icon: '🏥', screen: 'DirectoryList', active: true },
  { id: 'feedback', label: 'Feedback', icon: '📋', screen: 'Feedback', active: true },
  { id: 'circulars', label: 'Circulars & Notices', icon: '📢', screen: 'Circulars', active: true },
  { id: 'fitness', label: 'Annual Fitness', icon: '🏃', screen: 'FitnessEmployee', active: true },
  { id: 'donors', label: 'Blood Donors', icon: '🩸', screen: 'BloodDonorDirectory', active: true },
   { id: 'vaccination', label: 'Vaccination', icon: '💉', screen: 'VaccinationChildList', active: false },
  { id: 'lab', label: 'Lab Updates', icon: '🧪', screen: null, active: false },
  { id: 'pharmacy', label: 'Pharmacy Updates', icon: '💊', screen: null, active: false },
];

const SORTED_TILES = [...TILES].sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));

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

function pickTipOfDay(pool) {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / 86400000);
  return pool[dayOfYear % pool.length];
}

export default function EmployeeHome({ navigation }) {
  const [panelVisible, setPanelVisible] = useState(false);
  const [firstName, setFirstName] = useState('there');
  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;

  // Day 14, Step E — whether the logged-in employee still needs to confirm
  // their profile. Drives the small badge on the My Profile tile below.
  const [profileNeedsConfirm, setProfileNeedsConfirm] = useState(false);

  // Day 14, Step F — Family tab active/alert state.
  // Rule (PHASE4_DESIGN.md §7): tab is active whenever the employee has at
  // least one active family member, OR marital status is 'married' (even
  // with zero members — that's the alert state). Alert clears only when
  // admin explicitly marks familyDataStatus 'complete'.
  // Defaults to true/false (normal, non-alert) until the fetch resolves, so
  // the tile doesn't flash disabled on first paint for the common case.
  const [familyTileActive, setFamilyTileActive] = useState(true);
  const [familyTileAlert,  setFamilyTileAlert]  = useState(false);

  useEffect(() => {
    async function fetchName() {
      const uid = auth?.currentUser?.uid;
      if (!uid) return;
      try {
        const q = query(collection(db, 'employees'), where('userId', '==', uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const fullName = data.fullName;
          if (fullName) setFirstName(fullName.split(' ')[0]);
          // Day 14, Step E — badge the My Profile tile until confirmed
          setProfileNeedsConfirm(!data.dataConfirmedByEmployee);

          // Day 14, Step F — Family tile active/alert state
          const memberQ = query(
            collection(db, 'familyMembers'),
            where('employeeId', '==', uid),
            where('isActive', '==', true),
          );
          const memberSnap = await getDocs(memberQ);
          const hasActiveMembers = !memberSnap.empty;
          const isMarried = data.maritalStatus === 'married';
          const isActive = hasActiveMembers || isMarried;
          setFamilyTileActive(isActive);
          setFamilyTileAlert(isActive && data.familyDataStatus !== 'complete');
        }
      } catch (e) {
        // stays "there" (and family tile stays in its default state) if lookup fails
      }
    }
    fetchName();
  }, []);

    const [tipText, setTipText] = useState(pickTipOfDay(HEALTH_TIPS));

  useEffect(() => {
    async function fetchTip() {
      try {
        const q = query(collection(db, 'healthTips'), where('isActive', '==', true));
        const snap = await getDocs(q);
        const activeTips = snap.docs.map(d => d.data().text).filter(Boolean);
        if (activeTips.length > 0) {
          setTipText(pickTipOfDay(activeTips));
        }
        // if none active, keeps the local fallback already set
      } catch (e) {
        // keeps local fallback on failure
      }
    }
    fetchTip();
  }, []);

  const openPanel = () => {
    setPanelVisible(true);
    Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  };

  const closePanel = () => {
    Animated.timing(slideAnim, { toValue: -PANEL_WIDTH, duration: 200, useNativeDriver: true })
      .start(() => setPanelVisible(false));
  };

  const handleTilePress = (tile) => {
    // Day 14, Step F — family tile's active-ness is dynamic (see effect
    // above), everything else stays static as before.
    const effectiveActive = tile.id === 'family' ? familyTileActive : tile.active;
    if (!effectiveActive) return;
    if (!IS_WEB) closePanel();
    navigation.navigate(tile.screen, { userRole: 'employee' });
  };

  const now = new Date();
  const dateString = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeString = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const panelBody = (
    <ScrollView contentContainerStyle={styles.panelContent}>
      <Text style={styles.panelTitle}>Menu</Text>
      {SORTED_TILES.map((tile) => {
        // Day 14, Step F — family tile active-ness is dynamic; everything
        // else uses its static value from the TILES array as before.
        const effectiveActive = tile.id === 'family' ? familyTileActive : tile.active;
        return (
          <TouchableOpacity
            key={tile.id}
            style={[styles.panelItem, !effectiveActive && styles.panelItemDisabled]}
            onPress={() => handleTilePress(tile)}
            activeOpacity={effectiveActive ? 0.6 : 1}
          >
            <Text style={styles.panelItemIcon}>{tile.icon}</Text>
            <Text style={[styles.panelItemLabel, !effectiveActive && styles.panelItemLabelDisabled]}>
              {tile.label}
            </Text>
            {/* Day 14, Step E/F — nudge badges, same visual language as the
                family module's "Edit pending review" badge */}
            {tile.id === 'profile' && profileNeedsConfirm && (
              <View style={styles.confirmBadge}>
                <Text style={styles.confirmBadgeText}>Confirm</Text>
              </View>
            )}
            {tile.id === 'family' && effectiveActive && familyTileAlert && (
              <View style={styles.confirmBadge}>
                <Text style={styles.confirmBadgeText}>Update</Text>
              </View>
            )}
            {tile.active && !effectiveActive && tile.id === 'family' && (
              <Text style={styles.comingSoon}>Not applicable</Text>
            )}
            {!tile.active && <Text style={styles.comingSoon}>Soon</Text>}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      {IS_WEB && (
        <View style={[styles.webPanel, { width: PANEL_WIDTH }]}>
          {panelBody}
        </View>
      )}

      <View style={styles.mainArea}>
        <ScrollView contentContainerStyle={styles.container}>

          {IS_WEB ? (
            <View style={styles.headerRowWeb}>
              <Image
                source={require('../../../assets/FFCL_Logo.png')}
                style={styles.headerLogoWeb}
                resizeMode="contain"
              />
              <View style={styles.headerRightWeb}>
                <NotificationBell navigation={navigation} />
                <LogoutButton />
              </View>
            </View>
          ) : (
            <View style={styles.headerRowMobile}>
              <TouchableOpacity onPress={openPanel} style={styles.menuButton}>
                <Text style={styles.menuIcon}>☰</Text>
              </TouchableOpacity>
              <Image
                source={require('../../../assets/FFCL_Logo.png')}
                style={styles.headerLogoMobile}
                resizeMode="contain"
              />
              <View style={{ flex: 1 }} />
              <View style={styles.headerRight}>
                <NotificationBell navigation={navigation} />
                <LogoutButton />
              </View>
            </View>
          )}

          <View style={styles.dashboard}>
            <Text style={styles.greeting}>{getGreetingPrefix()}, {firstName}</Text>
            <Text style={styles.dateText}>{dateString}</Text>
            <Text style={styles.timeText}>{timeString}</Text>

            <View style={styles.tipCard}>
              <Text style={styles.tipLabel}>💡 Health Tip of the Day</Text>
              <Text style={styles.tipText}>{tipText}</Text>
            </View>

            <View style={styles.emergencyCard}>
              <Text style={styles.emergencyLabel}>🚨 Medical Centre Emergency Numbers</Text>
              <Text style={styles.emergencyRow}>Reception: 5935</Text>
              <Text style={styles.emergencyRow}>Medical Emergency: 5555</Text>
            </View>

            {/* Health graphic — now a normal inline image, not a background layer */}
            <Image
              source={require('../../../assets/health_watermark.png')}
              style={styles.healthGraphic}
              resizeMode="contain"
            />
          </View>
        </ScrollView>
      </View>

      {!IS_WEB && (
        <Modal visible={panelVisible} transparent animationType="none" onRequestClose={closePanel}>
          <Pressable style={styles.backdrop} onPress={closePanel} />
          <Animated.View style={[styles.panel, { width: PANEL_WIDTH, transform: [{ translateX: slideAnim }] }]}>
            {panelBody}
          </Animated.View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#f0f4f8' },
  mainArea: { flex: 1, position: 'relative' },

  watermark: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%', opacity: 0.5, alignSelf: 'center',
  },

  container: {
    flexGrow: 1, paddingTop: 24, paddingBottom: 40, paddingHorizontal: 20,
  },

  // Mobile header: hamburger + small logo left, icons right
  headerRowMobile: {
    flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 32, gap: 12,
  },
  menuButton: { padding: 6 },
  menuIcon: { fontSize: 26, color: '#2d3748' },
  headerLogoMobile: { width: 120, height: 120 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Web header: logo truly centered regardless of icon width, icons pinned top-right
  headerRowWeb: {
    position: 'relative',
    width: '100%', height: 140, marginBottom: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  headerLogoWeb: { width: 300, height: 300 },
  headerRightWeb: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },

  dashboard: { alignItems: 'center', width: '100%', maxWidth: 500, alignSelf: 'center' },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#2d3748', marginBottom: 4, textAlign: 'center' },
  dateText: { fontSize: 16, color: '#4a5568', textAlign: 'center' },
  timeText: { fontSize: 16, color: '#4a5568', marginBottom: 24, textAlign: 'center' },

  tipCard: {
    backgroundColor: '#f7eaea', borderRadius: 12, padding: 20,
    width: '100%', borderWidth: 1, borderColor: '#feb2b2', marginBottom: 16, alignItems: 'center', opacity: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  tipLabel: { fontSize: 18, fontWeight: '600', color: '#2d3748', marginBottom: 6, textAlign: 'center' },
  tipText: { fontSize: 16, fontWeight: '400', color: '#4a5568', lineHeight: 20, textAlign: 'center' },

  emergencyCard: {
    backgroundColor: '#fff5f5', borderRadius: 12, padding: 16,
    width: '100%', borderWidth: 1, borderColor: '#feb2b2', alignItems: 'center', opacity: 1,
  },
  emergencyLabel: { fontSize: 18, fontWeight: '600', color: '#c53030', marginBottom: 8, textAlign: 'center' },
  emergencyRow: { fontSize: 16, fontWeight: '400', color: '#742a2a', marginTop: 2, textAlign: 'center' },

  // Health graphic — sits below the emergency card, own margin, own controllable size
  healthGraphic: {
  width: 280,
  height: 114,
  marginTop: 12,
},
  
  webPanel: {
    backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#e2e8f0',
  },

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

  panelContent: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 24 },
  panelTitle: { fontSize: 18, fontWeight: 'bold', color: '#2d3748', marginBottom: 16 },
  panelItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#edf2f7',
  },
  panelItemDisabled: { opacity: 0.5 },
  panelItemIcon: { fontSize: 22, marginRight: 14 },
  panelItemLabel: { fontSize: 15, color: '#2d3748', flex: 1 },
  panelItemLabelDisabled: { color: '#a0aec0' },
  comingSoon: { fontSize: 11, color: '#a0aec0', fontStyle: 'italic' },

  // Day 14, Step E
  confirmBadge: {
    backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, marginLeft: 6,
  },
  confirmBadgeText: { fontSize: 10, color: '#92400e', fontWeight: '700' },
});