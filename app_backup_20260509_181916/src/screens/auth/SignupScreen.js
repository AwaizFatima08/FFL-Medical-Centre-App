// ─────────────────────────────────────────────────────────────
//  FFL Medical Centre — SignupScreen.js
//  Path: ffl-medical-centre-app/src/screens/auth/SignupScreen.js
//
//  Flow:
//  1. User enters name, employee no., phone, email, password
//  2. Firebase Auth creates the account
//  3. Backend /register saves user doc (isActive: false, role: employee)
//  4. User sees "Pending Approval" message
//  5. Admin activates & assigns correct role → user can log in
// ─────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Alert,
} from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import axios from 'axios';
import { API } from '../../config/api';

const STEP_ACCOUNT  = 1; // email + password
const STEP_IDENTITY = 2; // name + employee no. + phone

export default function SignupScreen({ navigation }) {
  const [step,           setStep]           = useState(STEP_ACCOUNT);
  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [confirmPass,    setConfirmPass]    = useState('');
  const [fullName,       setFullName]       = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [phone,          setPhone]          = useState('');
  const [showPass,       setShowPass]       = useState(false);
  const [loading,        setLoading]        = useState(false);

  // ── Step 1 validation
  const goToStep2 = () => {
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter your email address.'); return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.'); return;
    }
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters.'); return;
    }
    if (password !== confirmPass) {
      Alert.alert('Mismatch', 'Passwords do not match.'); return;
    }
    setStep(STEP_IDENTITY);
  };

  // ── Final submit
  const handleSignup = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name.'); return;
    }
    if (!employeeNumber.trim()) {
      Alert.alert('Required', 'Please enter your employee number.'); return;
    }
    if (!phone.trim() || phone.length < 10) {
      Alert.alert('Invalid', 'Please enter a valid phone number.'); return;
    }

    setLoading(true);
    let firebaseUser = null;

    try {
      // 1. Create Firebase Auth account
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      firebaseUser = credential.user;
      const idToken = await firebaseUser.getIdToken();

      // 2. Register on backend — sets isActive: false, role: employee
      await axios.post(`${API.AUTH}/register`, {
        fullName:       fullName.trim(),
        phoneNumber:    phone.trim(),
        employeeNumber: employeeNumber.trim().toUpperCase(),
      }, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      // 3. Sign out — user cannot use the app until admin activates
      await auth.signOut();

      Alert.alert(
        '✅ Registration Submitted',
        'Your account has been created and is awaiting admin approval.\n\nYou will be notified once your account is activated.',
        [{ text: 'Back to Login', onPress: () => navigation.navigate('Login') }],
      );

    } catch (error) {
      // If backend failed, delete the Firebase Auth account to keep things consistent
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
      Alert.alert('Registration Failed', message);
    } finally {
      setLoading(false);
    }
  };

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
          <TouchableOpacity onPress={() => step === STEP_IDENTITY ? setStep(STEP_ACCOUNT) : navigation.goBack()}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>FFL</Text>
            <Text style={styles.logoSub}>MEDICAL CENTRE</Text>
          </View>
        </View>

        {/* ── Step Indicator ── */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, step >= STEP_ACCOUNT  && styles.stepDotActive]} />
          <View style={[styles.stepLine, step >= STEP_IDENTITY && styles.stepLineActive]} />
          <View style={[styles.stepDot, step >= STEP_IDENTITY && styles.stepDotActive]} />
        </View>
        <View style={styles.stepLabelRow}>
          <Text style={[styles.stepLabel, step === STEP_ACCOUNT  && styles.stepLabelActive]}>Account</Text>
          <Text style={[styles.stepLabel, step === STEP_IDENTITY && styles.stepLabelActive]}>Identity</Text>
        </View>

        {/* ── Card ── */}
        <View style={styles.card}>

          {step === STEP_ACCOUNT && (
            <>
              <Text style={styles.cardTitle}>Create Account</Text>
              <Text style={styles.cardSub}>Step 1 of 2 — Login credentials</Text>

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="you@fatima-group.com"
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

          {step === STEP_IDENTITY && (
            <>
              <Text style={styles.cardTitle}>Your Details</Text>
              <Text style={styles.cardSub}>Step 2 of 2 — Identity & employee info</Text>

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
                placeholder="e.g. FFL-00100"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                value={employeeNumber}
                onChangeText={setEmployeeNumber}
              />

              <Text style={styles.label}>Mobile Number</Text>
              <TextInput
                style={styles.input}
                placeholder="03xx-xxxxxxx"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              {/* Info box */}
              <View style={styles.infoBox}>
                <Text style={styles.infoIcon}>ℹ️</Text>
                <Text style={styles.infoText}>
                  Your account will be reviewed by the Medical Centre admin before you can log in. This usually takes 1 working day.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={handleSignup}
                disabled={loading}
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
            <Text style={styles.loginLinkText}>Already have an account? <Text style={styles.loginLinkBold}>Sign In</Text></Text>
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
  logoText:  { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  logoSub:   { color: '#fff', fontSize: 4.5, fontWeight: '700', letterSpacing: 1 },

  // Step indicator
  stepRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingHorizontal: 60 },
  stepDot:       { width: 14, height: 14, borderRadius: 7, backgroundColor: '#334155' },
  stepDotActive: { backgroundColor: '#c1121f' },
  stepLine:      { flex: 1, height: 2, backgroundColor: '#334155' },
  stepLineActive:{ backgroundColor: '#c1121f' },
  stepLabelRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 50, marginBottom: 20 },
  stepLabel:     { color: '#64748b', fontSize: 11, fontWeight: '600' },
  stepLabelActive: { color: '#fdf0d5' },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 28,
    elevation: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#003049', marginBottom: 4 },
  cardSub:   { fontSize: 13, color: '#64748b', marginBottom: 24 },

  label:  { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc', marginBottom: 16,
  },
  passRow:    { position: 'relative' },
  passInput:  { paddingRight: 48 },
  eyeBtn:     { position: 'absolute', right: 14, top: 12 },
  eyeText:    { fontSize: 18 },

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
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },

  loginLink:     { alignItems: 'center', marginTop: 4 },
  loginLinkText: { color: '#64748b', fontSize: 13 },
  loginLinkBold: { color: '#003049', fontWeight: '700' },
});
