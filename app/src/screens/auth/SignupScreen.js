// ─────────────────────────────────────────────────────────────
import { webAlert } from '../../utils/webAlert';
//  FFL Medical Centre — SignupScreen.js
//  Path: ffl-medical-centre-app/src/screens/auth/SignupScreen.js
//
//  Flow:
//  1. Step 1 — Email + password
//  2. Step 2 — Full name, employee number, phone, date of birth
//  3. Step 3 — Residence details + disclaimer checkbox
//  4. Firebase Auth creates the account
//  5. Backend /register saves user doc (isActive: false, role: employee)
//  6. POST_NOTIFICATIONS permission requested
//  7. User sees "Pending Approval" — admin activates & assigns role
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Switch,
} from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import axios from 'axios';
import { API } from '../../config/api';
import DatePickerField from '../../components/DatePickerField';

// ── Notification permission (Android 13+, safe to call on older versions)
const requestNotificationPermission = async () => {
  try {
    if (Platform.OS === 'android') {
      const { PermissionsAndroid } = require('react-native');
      if (PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'Notification Permission',
            message:
              'FFL Medical Centre needs permission to send you important alerts ' +
              'for ambulance requests, medical trips, and appointments.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not Now',
          }
        );
      }
    }
  } catch (_) {
    // Permission request failure is non-fatal — continue signup
  }
};

// ── Residence constants
const FAMILY_TYPES   = ['A-Type', 'B-Type', 'B-Modified', 'C-Type', 'D-Plus', 'D-Type', 'E-Type', 'E-Modified', 'F-Type', 'G-Type', 'MOQ'];
const BACHELOR_TYPES = ['BQ', 'BOQ', 'Guest House'];
const ALL_RESIDENCE_TYPES = [...FAMILY_TYPES, ...BACHELOR_TYPES];
const CITIES = ['Sadiqabad', 'Rahimyarkhan', 'Sanjarpur', 'Kot Sabzal'];

const isBachelorType = (type) => BACHELOR_TYPES.includes(type);

const STEP_ACCOUNT   = 1;
const STEP_IDENTITY  = 2;
const STEP_RESIDENCE = 3;

// ── Employee number formatter: auto-inserts dash after 3 prefix chars
const formatEmployeeNumber = (text) => {
  const clean = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length <= 3) return clean;
  return clean.slice(0, 3) + '-' + clean.slice(3, 8);
};

const VALID_PREFIXES = ['FFL', 'ESB', 'OSL', 'FAS'];
const EMP_PATTERN = /^(FFL|ESB|OSL|FAS)-\d{5}$/;

export default function SignupScreen({ navigation }) {
  const [step,           setStep]           = useState(STEP_ACCOUNT);

  // Step 1
  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [confirmPass,    setConfirmPass]    = useState('');
  const [showPass,       setShowPass]       = useState(false);

  // Step 2
  const [fullName,       setFullName]       = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [phone,          setPhone]          = useState('');
  const [dob,            setDob]            = useState(null);

  // Step 3 — residence
  const [townshipResidentWithFamily,   setTownshipResidentWithFamily]   = useState(null);
  const [townshipResidentBachelor,     setTownshipResidentBachelor]     = useState(null);
  const [residenceType,                setResidenceType]                = useState('');
  const [houseNumber,                  setHouseNumber]                  = useState('');
  const [roomNumber,                   setRoomNumber]                   = useState('');
  const [cityOfResidence,              setCityOfResidence]              = useState('');
  const [disclaimerAccepted,           setDisclaimerAccepted]           = useState(false);

  const [loading, setLoading] = useState(false);
  const isSubmitting = useRef(false);

  // ── Derived residence state
  const isTownshipResident   = townshipResidentWithFamily === true || townshipResidentBachelor === true;
  const isNonResident        = townshipResidentWithFamily === false && townshipResidentBachelor === false;
  const showResidenceType    = isTownshipResident;
  const showHouseNumber      = showResidenceType && residenceType && !isBachelorType(residenceType);
  const showRoomNumber       = showResidenceType && residenceType && isBachelorType(residenceType);
  const showCity             = isNonResident;

  // ── Step 1 validation
  const goToStep2 = () => {
    if (!email.trim()) {
      webAlert('Required', 'Please enter your email address.'); return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      webAlert('Invalid Email', 'Please enter a valid email address.'); return;
    }
    if (password.length < 8) {
      webAlert('Weak Password', 'Password must be at least 8 characters.'); return;
    }
    if (password !== confirmPass) {
      webAlert('Mismatch', 'Passwords do not match.'); return;
    }
    setStep(STEP_IDENTITY);
  };

  // ── Step 2 validation
  const goToStep3 = () => {
    if (!fullName.trim()) {
      webAlert('Required', 'Please enter your full name.'); return;
    }
    if (!employeeNumber.trim()) {
      webAlert('Required', 'Please enter your employee number.'); return;
    }
    if (!EMP_PATTERN.test(employeeNumber.trim())) {
      webAlert(
        'Invalid Employee Number',
        `Employee number must be in format PREFIX-00000 where PREFIX is one of: ${VALID_PREFIXES.join(', ')}.\n\nExample: FFL-00100`
      ); return;
    }
    if (!phone.trim() || phone.length < 10) {
      webAlert('Invalid', 'Please enter a valid phone number.'); return;
    }
    if (!dob) {
      webAlert('Required', 'Please select your date of birth.'); return;
    }
    setStep(STEP_RESIDENCE);
  };

  // ── Step 3 validation
  const validateResidence = () => {
    if (townshipResidentWithFamily === null) {
      webAlert('Required', 'Please indicate whether you are a township resident with family.'); return false;
    }
    if (townshipResidentWithFamily === false && townshipResidentBachelor === null) {
      webAlert('Required', 'Please indicate whether you are in bachelor accommodation.'); return false;
    }
    if (isTownshipResident && !residenceType) {
      webAlert('Required', 'Please select your residence type.'); return false;
    }
    if (showHouseNumber && !houseNumber.trim()) {
      webAlert('Required', 'Please enter your house number.'); return false;
    }
    if (showRoomNumber && !roomNumber.trim()) {
      webAlert('Required', 'Please enter your room number.'); return false;
    }
    if (showCity && !cityOfResidence) {
      webAlert('Required', 'Please select your city of residence.'); return false;
    }
    if (!disclaimerAccepted) {
      webAlert('Disclaimer', 'Please read and accept the disclaimer to continue.'); return false;
    }
    return true;
  };

  // ── Final submit
  const handleSignup = async () => {
    if (isSubmitting.current) return;
    if (!validateResidence()) return;

    isSubmitting.current = true;
    setLoading(true);
    let firebaseUser = null;

    try {
      // 1. Create Firebase Auth account
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      firebaseUser = credential.user;
      const idToken = await firebaseUser.getIdToken();

      // 2. Build residence payload
      const residencePayload = {
        townshipResidentWithFamily: townshipResidentWithFamily === true,
        townshipResidentBachelor:   townshipResidentBachelor === true,
        ...(isTownshipResident && residenceType ? { residenceType } : {}),
        ...(showHouseNumber && houseNumber.trim() ? { houseNumber: houseNumber.trim() } : {}),
        ...(showRoomNumber  && roomNumber.trim()  ? { roomNumber:  roomNumber.trim()  } : {}),
        ...(showCity        && cityOfResidence    ? { cityOfResidence }                 : {}),
      };

      // 3. Register on backend
      await axios.post(`${API.auth}/register`, {
        fullName:       fullName.trim(),
        phoneNumber:    phone.trim(),
        employeeNumber: employeeNumber.trim().toUpperCase(),
        dateOfBirth:    dob ? dob.toISOString().split('T')[0] : null,
        ...residencePayload,
      }, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      // 4. Request notification permission
      await requestNotificationPermission();

      // 5. Success
      webAlert(
        '✅ Registration Submitted',
        'Your account has been created and is awaiting admin approval. You will be notified once activated.'
      );
      await auth.signOut();
      navigation.navigate('Login');

    } catch (error) {
      if (firebaseUser) {
        try { await firebaseUser.delete(); } catch (_) {}
      }
      let message = 'Registration failed. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Please log in instead.';
      } else if (error.code === 'auth/network-request-failed') {
        message = 'No internet connection.';
      } else if (error.response?.status === 409) {
        message = error.response.data.message || 'Employee number already registered.';
      }
      webAlert('Registration Failed', message);
    } finally {
      isSubmitting.current = false;
      setLoading(false);
    }
  };

  // ── Small reusable dropdown component
  const DropdownPicker = ({ label, options, selected, onSelect }) => (
    <View style={styles.dropdownGroup}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionScroll}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionChip, selected === opt && styles.optionChipSelected]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.optionChipText, selected === opt && styles.optionChipTextSelected]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // ── Yes/No toggle row
  const YesNoRow = ({ label, value, onChange }) => (
    <View style={styles.yesNoGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.yesNoRow}>
        <TouchableOpacity
          style={[styles.yesNoBtn, value === true  && styles.yesNoBtnActive]}
          onPress={() => onChange(true)}
        >
          <Text style={[styles.yesNoBtnText, value === true  && styles.yesNoBtnTextActive]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.yesNoBtn, value === false && styles.yesNoBtnActive]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.yesNoBtnText, value === false && styles.yesNoBtnTextActive]}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#003049" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            if (step === STEP_IDENTITY)  setStep(STEP_ACCOUNT);
            else if (step === STEP_RESIDENCE) setStep(STEP_IDENTITY);
            else navigation.goBack();
          }}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>FFL</Text>
            <Text style={styles.logoSub}>MEDICAL CENTRE</Text>
          </View>
        </View>

        {/* ── Step Indicator ── */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, step >= STEP_ACCOUNT   && styles.stepDotActive]} />
          <View style={[styles.stepLine, step >= STEP_IDENTITY  && styles.stepLineActive]} />
          <View style={[styles.stepDot, step >= STEP_IDENTITY  && styles.stepDotActive]} />
          <View style={[styles.stepLine, step >= STEP_RESIDENCE && styles.stepLineActive]} />
          <View style={[styles.stepDot, step >= STEP_RESIDENCE && styles.stepDotActive]} />
        </View>
        <View style={styles.stepLabelRow}>
          <Text style={[styles.stepLabel, step === STEP_ACCOUNT   && styles.stepLabelActive]}>Account</Text>
          <Text style={[styles.stepLabel, step === STEP_IDENTITY  && styles.stepLabelActive]}>Identity</Text>
          <Text style={[styles.stepLabel, step === STEP_RESIDENCE && styles.stepLabelActive]}>Residence</Text>
        </View>

        {/* ── Card ── */}
        <View style={styles.card}>

          {/* ─── STEP 1: Account ─── */}
          {step === STEP_ACCOUNT && (
            <>
              <Text style={styles.cardTitle}>Create Account</Text>
              <Text style={styles.cardSub}>Step 1 of 3 — Login credentials</Text>

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Use your personal email address"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />

              <Text style={styles.label}>Password</Text>
              <View style={styles.passRow}>
                <TextInput
                  style={[styles.input, styles.passInput]}
                  placeholder="Min. 8 characters"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(!showPass)}>
                  <Text style={styles.eyeText}>{showPass ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPass}
                value={confirmPass}
                onChangeText={setConfirmPass}
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={goToStep2}>
                <Text style={styles.primaryBtnText}>Continue →</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ─── STEP 2: Identity ─── */}
          {step === STEP_IDENTITY && (
            <>
              <Text style={styles.cardTitle}>Your Details</Text>
              <Text style={styles.cardSub}>Step 2 of 3 — Identity & employee info</Text>

              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="As on your ID card"
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
                value={fullName}
                onChangeText={setFullName}
              />

              <Text style={styles.label}>Employee Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. FFL-00100 or ESB-00100"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                value={employeeNumber}
                onChangeText={(text) => setEmployeeNumber(formatEmployeeNumber(text))}
                maxLength={9}
              />
              <Text style={styles.fieldHint}>Enter 5-digit number with prefix · FFL-00000 · ESB-00000 · OSL-00000 · FAS-00000</Text>

              <Text style={styles.label}>Mobile Number</Text>
              <TextInput
                style={styles.input}
                placeholder="03xx-xxxxxxx"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <DatePickerField
                label="Date of Birth"
                value={dob}
                onChange={setDob}
                maximumDate={new Date()}
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={goToStep3}>
                <Text style={styles.primaryBtnText}>Continue →</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ─── STEP 3: Residence ─── */}
          {step === STEP_RESIDENCE && (
            <>
              <Text style={styles.cardTitle}>Residence Details</Text>
              <Text style={styles.cardSub}>Step 3 of 3 — Where do you live?</Text>

              <YesNoRow
                label="Are you a township resident with family?"
                value={townshipResidentWithFamily}
                onChange={(val) => {
                  setTownshipResidentWithFamily(val);
                  setTownshipResidentBachelor(null);
                  setResidenceType('');
                  setHouseNumber('');
                  setRoomNumber('');
                  setCityOfResidence('');
                }}
              />

              {townshipResidentWithFamily === false && (
                <YesNoRow
                  label="Are you in township bachelor accommodation?"
                  value={townshipResidentBachelor}
                  onChange={(val) => {
                    setTownshipResidentBachelor(val);
                    setResidenceType('');
                    setHouseNumber('');
                    setRoomNumber('');
                    setCityOfResidence('');
                  }}
                />
              )}

              {showResidenceType && (
                <DropdownPicker
                  label="Residence Type"
                  options={ALL_RESIDENCE_TYPES}
                  selected={residenceType}
                  onSelect={(val) => {
                    setResidenceType(val);
                    setHouseNumber('');
                    setRoomNumber('');
                  }}
                />
              )}

              {showHouseNumber && (
                <>
                  <Text style={styles.label}>House Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. A-12"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="characters"
                    value={houseNumber}
                    onChangeText={setHouseNumber}
                  />
                </>
              )}

              {showRoomNumber && (
                <>
                  <Text style={styles.label}>Room Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. BQ-24"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="characters"
                    value={roomNumber}
                    onChangeText={setRoomNumber}
                  />
                </>
              )}

              {showCity && (
                <DropdownPicker
                  label="City of Residence"
                  options={CITIES}
                  selected={cityOfResidence}
                  onSelect={setCityOfResidence}
                />
              )}

              {/* Disclaimer */}
              <View style={styles.disclaimerBox}>
                <Text style={styles.disclaimerTitle}>📋 Data Disclaimer</Text>
                <Text style={styles.disclaimerText}>
                  The personal and family information you provide will be used solely for
                  internal FFL Medical Centre operations. Your data will not be shared outside
                  the organisation. By registering, you consent to receiving app notifications
                  for medical alerts, appointments, and updates.
                </Text>
                <TouchableOpacity
                  style={styles.checkRow}
                  onPress={() => setDisclaimerAccepted(!disclaimerAccepted)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, disclaimerAccepted && styles.checkboxChecked]}>
                    {disclaimerAccepted && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkLabel}>
                    I have read and accept the above disclaimer
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoIcon}>ℹ️</Text>
                <Text style={styles.infoText}>
                  Your account will be reviewed by the Medical Centre admin before you can log in.
                  This usually takes 1 working day.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (!disclaimerAccepted || loading) && styles.primaryBtnDisabled,
                ]}
                onPress={handleSignup}
                disabled={!disclaimerAccepted || loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Submit Registration</Text>
                }
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginLinkText}>
              Already have an account?{' '}
              <Text style={styles.loginLinkBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#003049' },
  scroll:    { flexGrow: 1, padding: 24, paddingTop: 48 },

  header:    { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn:   { color: '#fdf0d5', fontSize: 15, fontWeight: '600', marginRight: 16 },
  logoBox: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#c1121f',
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  logoSub:  { color: '#fff', fontSize: 4.5, fontWeight: '700', letterSpacing: 1 },

  stepRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingHorizontal: 40 },
  stepDot:        { width: 14, height: 14, borderRadius: 7, backgroundColor: '#334155' },
  stepDotActive:  { backgroundColor: '#c1121f' },
  stepLine:       { flex: 1, height: 2, backgroundColor: '#334155' },
  stepLineActive: { backgroundColor: '#c1121f' },
  stepLabelRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, marginBottom: 20 },
  stepLabel:      { color: '#64748b', fontSize: 11, fontWeight: '600' },
  stepLabelActive:{ color: '#fdf0d5' },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 28,
    elevation: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#003049', marginBottom: 4 },
  cardSub:   { fontSize: 13, color: '#64748b', marginBottom: 24 },

  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  fieldHint: { fontSize: 11, color: '#94a3b8', marginTop: -10, marginBottom: 14, marginLeft: 2 },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc', marginBottom: 16,
  },
  passRow:   { position: 'relative' },
  passInput: { paddingRight: 48 },
  eyeBtn:    { position: 'absolute', right: 14, top: 12 },
  eyeText:   { fontSize: 18 },

  yesNoGroup: { marginBottom: 16 },
  yesNoRow:   { flexDirection: 'row', gap: 12, marginTop: 4 },
  yesNoBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    alignItems: 'center', backgroundColor: '#f8fafc',
  },
  yesNoBtnActive:     { backgroundColor: '#003049', borderColor: '#003049' },
  yesNoBtnText:       { fontSize: 14, fontWeight: '600', color: '#64748b' },
  yesNoBtnTextActive: { color: '#fff' },

  dropdownGroup:  { marginBottom: 16 },
  optionScroll:   { marginTop: 4 },
  optionChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc', marginRight: 8,
  },
  optionChipSelected:     { backgroundColor: '#003049', borderColor: '#003049' },
  optionChipText:         { fontSize: 13, fontWeight: '600', color: '#64748b' },
  optionChipTextSelected: { color: '#fff' },

  disclaimerBox: {
    backgroundColor: '#fef9ec', borderRadius: 10, padding: 14,
    borderLeftWidth: 3, borderLeftColor: '#f59e0b', marginBottom: 16,
  },
  disclaimerTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 6 },
  disclaimerText:  { fontSize: 12, color: '#78350f', lineHeight: 18, marginBottom: 12 },
  checkRow:        { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 2, borderColor: '#d97706',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10, backgroundColor: '#fff',
  },
  checkboxChecked: { backgroundColor: '#d97706', borderColor: '#d97706' },
  checkmark:       { color: '#fff', fontSize: 13, fontWeight: '900' },
  checkLabel:      { flex: 1, fontSize: 12, color: '#92400e', fontWeight: '600' },

  infoBox: {
    flexDirection: 'row', backgroundColor: '#eff6ff',
    borderRadius: 10, padding: 12, marginBottom: 20,
    borderLeftWidth: 3, borderLeftColor: '#3b82f6',
  },
  infoIcon: { fontSize: 16, marginRight: 8, marginTop: 1 },
  infoText: { flex: 1, fontSize: 12, color: '#1e40af', lineHeight: 18 },

  primaryBtn: {
    backgroundColor: '#c1121f', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 16,
    elevation: 4, shadowColor: '#c1121f',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },

  loginLink:     { alignItems: 'center', marginTop: 4 },
  loginLinkText: { color: '#64748b', fontSize: 13 },
  loginLinkBold: { color: '#003049', fontWeight: '700' },
});