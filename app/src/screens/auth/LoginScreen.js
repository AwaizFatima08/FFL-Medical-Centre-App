// ─────────────────────────────────────────────────────────────
import { webAlert, webConfirm } from '../../utils/webAlert';
//  FFL Medical Centre — LoginScreen.js
//  Path: ffl-medical-centre-app/src/screens/auth/LoginScreen.js
// ─────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Image,
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { saveToken, saveUserData } from '../../utils/storage';
import axios from 'axios';
import { API } from '../../config/api';

export default function LoginScreen({ navigation }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      webAlert('Missing Fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      // 1. Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await userCredential.user.getIdToken();

      // 2. Update last login on backend
      try {
        await axios.post(`${API.auth}/update-last-login`, {}, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch (updateError) {
        console.warn('update-last-login failed (non-critical):', updateError.message);
      }    

      // 3. Fetch user profile (includes role & isActive)
      // Retry once on network-level failure only (e.g. Cloud Run cold start).
      // Do NOT retry if the server actually responded with an error —
      // that's a real failure, not a timing issue.
      let profileRes;
      try {
        profileRes = await axios.get(`${API.auth}/me`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch (firstAttemptError) {
        if (firstAttemptError.response) {
          throw firstAttemptError; // server responded with a real error — don't retry
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        profileRes = await axios.get(`${API.auth}/me`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
      }
      const { user, employee } = profileRes.data.data;

      // 4. Check if admin has activated the account
      if (!user.isActive) {
        webAlert(
          'Account Pending',
          'Your account is awaiting admin approval. You will be notified once activated.',
        );
        await auth.signOut();
        setLoading(false);
        return;
      }

      // 5. Persist token & profile locally
      await saveToken(idToken);
      await saveUserData({ user, employee });

      // Navigation is handled by the root navigator watching auth state
    } catch (error) {
      let message = 'Login failed. Please try again.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        message = 'Incorrect email or password.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many failed attempts. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        message = 'No internet connection.';
      }
      webAlert('Login Failed', message);
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
        <View style={styles.creditBlock}>
          <Image
            source={require('../../../assets/FFCL_Logo.png')}
            style={styles.creditLogo}
            resizeMode="contain"
          />
          
          
        </View>

        {/* ── Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          <Text style={styles.cardSub}>Use your personal email address used to create account</Text>

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
              placeholder="Enter password"
              placeholderTextColor="#94a3b8"
              secureTextEntry={!showPass}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPass(!showPass)}
            >
              <Text style={styles.eyeText}>{showPass ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotBtn}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.loginBtnText}>Sign In</Text>
            }
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>Don't have an account?</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={styles.signupBtn}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={styles.signupBtnText}>Create Account</Text>
          </TouchableOpacity>
        </View>

        {/* ── HomiLabs Credit ── */}
        <View style={styles.creditBlock}>
          <Text style={styles.creditLabel}>Developed by</Text>
          <Image
            source={require('../../../assets/homilabs_logo_light.png')}
            style={styles.creditLogo}
            resizeMode="contain"
          />
          <Text style={styles.creditSub}>homilabs.pk</Text>
          <Text style={styles.creditSub}>Managed By: Awaiz Fatima, Muhammad Abdulhadi, Parishay Zainab</Text>
          <Text style={styles.creditSub}>CODE WITH PURPOSE; BUILD WITH HEART</Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#003049' },
  scroll:      { flexGrow: 1, justifyContent: 'center', padding: 24 },

  // Card
  card: {
    backgroundColor: '#ccfbfd',
    borderRadius: 20,
    padding: 28,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  cardTitle:   { fontSize: 24, fontWeight: '800', color: '#003049', marginBottom: 4 },
  cardSub:     { fontSize: 18, color: '#5e718b', marginBottom: 24 },

  label:       { fontSize: 18, fontWeight: '1200', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#abb2bc',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 18, color: '#1e293b', backgroundColor: '#f8fafc',
    marginBottom: 16,
  },
  passRow:     { position: 'relative' },
  passInput:   { paddingRight: 48 },
  eyeBtn:      { position: 'absolute', right: 14, top: 12 },
  eyeText:     { fontSize: 18 },

  forgotBtn:   { alignSelf: 'flex-end', marginBottom: 20, marginTop: -8 },
  forgotText:  { color: '#0c0039', fontSize: 18, fontWeight: '600' },

  loginBtn: {
    backgroundColor: '#096a00',
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginBottom: 20,
    elevation: 4,
    shadowColor: '#c1121f', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText:     { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },

  dividerRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  divider:      { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText:  { color: '#586476', fontSize: 16, marginHorizontal: 10 },

  signupBtn: {
    borderWidth: 1.5, borderColor: '#003049',
    borderRadius: 12, paddingVertical: 13,
    alignItems: 'center',
  },
  signupBtnText: { color: '#003049', fontSize: 18, fontWeight: '700' },

  // HomiLabs credit
  creditBlock: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 8,
    opacity: 0.75,
  },
  creditLabel: {
    color: '#fdf0d5',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  creditLogo: {
    width: 1000,
    height: 100,
    marginBottom: 4,
  },
  creditSub: {
    color: '#7fb3c8',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});