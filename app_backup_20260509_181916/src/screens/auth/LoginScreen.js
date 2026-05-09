// ─────────────────────────────────────────────────────────────
//  FFL Medical Centre — LoginScreen.js
//  Path: ffl-medical-centre-app/src/screens/auth/LoginScreen.js
// ─────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Alert,
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
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      // 1. Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await userCredential.user.getIdToken();

      // 2. Update last login on backend
      await axios.post(`${API.AUTH}/update-last-login`, {}, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      // 3. Fetch user profile (includes role & isActive)
      const profileRes = await axios.get(`${API.AUTH}/me`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const { user, employee } = profileRes.data.data;

      // 4. Check if admin has activated the account
      if (!user.isActive) {
        Alert.alert(
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
      Alert.alert('Login Failed', message);
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
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>FFL</Text>
            <Text style={styles.logoSub}>MEDICAL CENTRE</Text>
          </View>
          <Text style={styles.tagline}>Fatima Fertilizer Company</Text>
        </View>

        {/* ── Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          <Text style={styles.cardSub}>Use your FFL email and password</Text>

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

        <Text style={styles.footer}>FFL Medical Centre · Fatima Group</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#003049' },
  scroll:      { flexGrow: 1, justifyContent: 'center', padding: 24 },

  // Header
  header:      { alignItems: 'center', marginBottom: 32 },
  logoBox:     {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: '#c1121f',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    elevation: 8,
    shadowColor: '#c1121f', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8,
  },
  logoText:    { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  logoSub:     { color: '#fff', fontSize: 7,  fontWeight: '700', letterSpacing: 1.5 },
  tagline:     { color: '#fdf0d5', fontSize: 13, letterSpacing: 1 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  cardTitle:   { fontSize: 24, fontWeight: '800', color: '#003049', marginBottom: 4 },
  cardSub:     { fontSize: 13, color: '#64748b', marginBottom: 24 },

  label:       { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc',
    marginBottom: 16,
  },
  passRow:     { position: 'relative' },
  passInput:   { paddingRight: 48 },
  eyeBtn:      {
    position: 'absolute', right: 14, top: 12,
  },
  eyeText:     { fontSize: 18 },

  forgotBtn:   { alignSelf: 'flex-end', marginBottom: 20, marginTop: -8 },
  forgotText:  { color: '#c1121f', fontSize: 13, fontWeight: '600' },

  loginBtn: {
    backgroundColor: '#c1121f',
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginBottom: 20,
    elevation: 4,
    shadowColor: '#c1121f', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },

  dividerRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  divider:      { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText:  { color: '#94a3b8', fontSize: 12, marginHorizontal: 10 },

  signupBtn: {
    borderWidth: 1.5, borderColor: '#003049',
    borderRadius: 12, paddingVertical: 13,
    alignItems: 'center',
  },
  signupBtnText: { color: '#003049', fontSize: 15, fontWeight: '700' },

  footer: {
    textAlign: 'center', color: '#fdf0d5',
    fontSize: 11, marginTop: 24, opacity: 0.6,
  },
});
