// ─────────────────────────────────────────────────────────────
//  FFL Medical Centre — ForgotPasswordScreen.js
//  Path: ffl-medical-centre-app/src/screens/auth/ForgotPasswordScreen.js
// ─────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert,
} from 'react-native';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../config/firebase';

export default function ForgotPasswordScreen({ navigation }) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter your email address.'); return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Invalid', 'Please enter a valid email address.'); return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (error) {
      let message = 'Failed to send reset email. Please try again.';
      if (error.code === 'auth/user-not-found') {
        // Security: don't reveal whether email exists — show success anyway
        setSent(true);
        return;
      } else if (error.code === 'auth/network-request-failed') {
        message = 'No internet connection.';
      }
      Alert.alert('Error', message);
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

      <View style={styles.inner}>
        {/* ── Back ── */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Text style={styles.backBtn}>← Back to Login</Text>
        </TouchableOpacity>

        {/* ── Logo ── */}
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>FFL</Text>
          <Text style={styles.logoSub}>MEDICAL CENTRE</Text>
        </View>

        {/* ── Card ── */}
        <View style={styles.card}>
          {!sent ? (
            <>
              <Text style={styles.cardTitle}>Reset Password</Text>
              <Text style={styles.cardSub}>
                Enter your registered email address and we'll send you a link to reset your password.
              </Text>

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

              <TouchableOpacity
                style={[styles.resetBtn, loading && styles.resetBtnDisabled]}
                onPress={handleReset}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.resetBtnText}>Send Reset Link</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            // ── Success State
            <>
              <View style={styles.successIcon}>
                <Text style={styles.successEmoji}>✉️</Text>
              </View>
              <Text style={styles.cardTitle}>Check Your Email</Text>
              <Text style={styles.cardSub}>
                If <Text style={styles.emailHighlight}>{email}</Text> is registered, a password reset link has been sent. Check your inbox and spam folder.
              </Text>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.resetBtnText}>Back to Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={() => { setSent(false); setEmail(''); }}
              >
                <Text style={styles.resendText}>Try a different email</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Help note ── */}
        <Text style={styles.helpText}>
          If you're having trouble, contact the Medical Centre admin.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#003049' },
  inner:     { flex: 1, padding: 24, justifyContent: 'center' },

  backRow:   { marginBottom: 32 },
  backBtn:   { color: '#fdf0d5', fontSize: 14, fontWeight: '600' },

  logoBox: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#c1121f',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 24,
    elevation: 8, shadowColor: '#c1121f',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8,
  },
  logoText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  logoSub:  { color: '#fff', fontSize: 5.5, fontWeight: '700', letterSpacing: 1.5 },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 28,
    elevation: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#003049', marginBottom: 8 },
  cardSub:   { fontSize: 13, color: '#64748b', lineHeight: 20, marginBottom: 24 },

  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc', marginBottom: 20,
  },

  resetBtn: {
    backgroundColor: '#c1121f', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    elevation: 4, shadowColor: '#c1121f',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  resetBtnDisabled: { opacity: 0.6 },
  resetBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },

  successIcon:  { alignItems: 'center', marginBottom: 16 },
  successEmoji: { fontSize: 48 },
  emailHighlight: { fontWeight: '700', color: '#003049' },

  resendBtn:  { alignItems: 'center', marginTop: 14 },
  resendText: { color: '#64748b', fontSize: 13 },

  helpText: {
    textAlign: 'center', color: '#fdf0d5',
    fontSize: 11, marginTop: 20, opacity: 0.6,
  },
});
