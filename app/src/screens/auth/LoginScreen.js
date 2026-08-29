// ─────────────────────────────────────────────────────────────
import { webAlert, webConfirm } from '../../utils/webAlert';
//  FFL Medical Centre — LoginScreen.js
//  Path: ffl-medical-centre-app/src/screens/auth/LoginScreen.js
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { saveToken, saveUserData } from '../../utils/storage';
import axios from 'axios';
import { API } from '../../config/api';

const REMEMBERED_EMAIL_KEY = 'ffl_remembered_email';
const IS_WEB = Platform.OS === 'web';

export default function LoginScreen({ navigation }) {
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [showPass,   setShowPass]   = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(REMEMBERED_EMAIL_KEY).then((saved) => {
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    });
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      webAlert('Missing Fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await userCredential.user.getIdToken();

      try {
        await axios.post(`${API.auth}/update-last-login`, {}, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch (updateError) {
        console.warn('update-last-login failed (non-critical):', updateError.message);
      }

      let profileRes;
      try {
        profileRes = await axios.get(`${API.auth}/me`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch (firstAttemptError) {
        if (firstAttemptError.response) {
          throw firstAttemptError;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        profileRes = await axios.get(`${API.auth}/me`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
      }
      const { user, employee } = profileRes.data.data;

      if (!user.isActive) {
        webAlert(
          'Account Pending',
          'Your account is awaiting admin approval. You will be notified once activated.',
        );
        await auth.signOut();
        setLoading(false);
        return;
      }

      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      } else {
        await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

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

  const signInCard = (
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

      <View style={styles.rowBetween}>
        <TouchableOpacity
          style={styles.rememberRow}
          onPress={() => setRememberMe(!rememberMe)}
        >
          <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
            {rememberMe && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.rememberText}>Remember me</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

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
  );

  if (IS_WEB) {
    return (
      <View style={styles.webRoot}>
        {/* Left credentials panel */}
        <View style={styles.webPanel}>
          <Image
            source={require('../../../assets/homilabs_logo_light.png')}
            style={styles.panelLogo}
            resizeMode="contain"
          />
          <Text style={styles.panelDeveloped}>Developed by</Text>
          <Text style={styles.panelBrand}>homilabs.pk</Text>
          <Text style={styles.panelManaged}>
            Managed By:{'\n'}Awaiz Fatima{'\n'}Muhammad Abdulhadi{'\n'}Parishay Zainab
          </Text>
          <Text style={styles.panelTagline}>CODE WITH PURPOSE{'\n'}BUILD WITH HEART</Text>
        </View>

        {/* Right sign-in column */}
        <ScrollView contentContainerStyle={styles.webFormColumn}>
          <Image
            source={require('../../../assets/FFCL_Logo.png')}
            style={styles.topLogo}
            resizeMode="contain"
          />
          {signInCard}
        </ScrollView>
      </View>
    );
  }

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
        <Image
          source={require('../../../assets/FFCL_Logo.png')}
          style={styles.topLogo}
          resizeMode="contain"
        />

        {signInCard}

        <View style={styles.creditBlock}>
          <Image
            source={require('../../../assets/homilabs_logo_light.png')}
            style={styles.footerLogo}
            resizeMode="contain"
          />
          <Text style={styles.creditSub}>Developed by homilabs.pk</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#003049' },
  scroll:    { flexGrow: 1, justifyContent: 'center', padding: 16, paddingVertical: 20 },

  // ── Web two-column layout ──
  webRoot: { flex: 1, flexDirection: 'row', minHeight: '100%' },
  webPanel: {
    width: 320,
    backgroundColor: '#00243a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  panelLogo:      { width: 64, height: 64, marginBottom: 12 },
  panelDeveloped: { color: '#7fb3c8', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  panelBrand:     { color: '#fdf0d5', fontSize: 20, fontWeight: '700', marginTop: 2, marginBottom: 20 },
  panelManaged:   { color: '#a8c5d6', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  panelTagline:   { color: '#7fb3c8', fontSize: 11, textAlign: 'center', letterSpacing: 0.8, lineHeight: 18 },

  webFormColumn: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 40, paddingHorizontal: 20,
  },

  topLogo: {
    width: 190, height: 76,
    alignSelf: 'center',
    marginBottom: 14,
  },

  card: {
    backgroundColor: '#ccfbfd',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 380,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#003049', marginBottom: 2 },
  cardSub:   { fontSize: 13, color: '#5e718b', marginBottom: 14 },

  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 4 },
  input: {
    borderWidth: 1.5, borderColor: '#abb2bc',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc',
    marginBottom: 10,
  },
  passRow:   { position: 'relative' },
  passInput: { paddingRight: 42 },
  eyeBtn:    { position: 'absolute', right: 12, top: 9 },
  eyeText:   { fontSize: 15 },

  rowBetween: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  rememberRow: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: '#94a3b8',
    alignItems: 'center', justifyContent: 'center', marginRight: 6,
    backgroundColor: '#fff',
  },
  checkboxChecked: { backgroundColor: '#096a00', borderColor: '#096a00' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  rememberText: { fontSize: 13, color: '#334155' },
  forgotText:   { color: '#0c0039', fontSize: 13, fontWeight: '600' },

  loginBtn: {
    backgroundColor: '#096a00',
    borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', marginBottom: 14,
    elevation: 4,
    shadowColor: '#c1121f', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },

  dividerRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  divider:     { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { color: '#586476', fontSize: 12, marginHorizontal: 8 },

  signupBtn: {
    borderWidth: 1.5, borderColor: '#003049',
    borderRadius: 10, paddingVertical: 10,
    alignItems: 'center',
  },
  signupBtnText: { color: '#003049', fontSize: 14, fontWeight: '700' },

  // Mobile-only footer credit
  creditBlock: {
    alignItems: 'center',
    marginTop: 14,
    opacity: 0.75,
  },
  footerLogo: { width: 28, height: 28, marginBottom: 4 },
  creditSub:  { color: '#7fb3c8', fontSize: 11, letterSpacing: 0.3 },
});