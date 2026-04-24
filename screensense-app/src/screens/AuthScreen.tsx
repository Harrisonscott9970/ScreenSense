/**
 * AuthScreen v2 — Real backend auth
 * Connects to /auth/signup and /auth/login
 * Stores JWT token for session persistence
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, Space, Radius, Font, Shadow } from '../utils/theme';
import { BASE_URL } from '../services/api';

interface Props { onAuth: (userId: string, name: string, token: string) => void; }

export default function AuthScreen({ onAuth }: Props) {
  const [mode, setMode]       = useState<'login' | 'signup'>('login');
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const switchMode = (m: 'login' | 'signup') => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setMode(m); setError('');
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const validate = () => {
    if (!email.trim()) return 'Please enter your email';
    if (!email.includes('@')) return 'Please enter a valid email';
    if (!password) return 'Please enter a password';
    if (mode === 'signup') {
      if (!name.trim()) return 'Please enter your name';
      if (password.length < 6) return 'Password must be at least 6 characters';
      if (password !== confirm) return 'Passwords do not match';
    }
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true); setError('');

    try {
      const endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login';
      const body = mode === 'signup'
        ? { name: name.trim(), email: email.trim().toLowerCase(), password }
        : { email: email.trim().toLowerCase(), password };

      const res = await fetch(`${BASE_URL.replace('/api', '')}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Something went wrong');

      // Persist auth data — AsyncStorage works on iOS, Android and web
      try {
        await AsyncStorage.setItem('ss_user_id', data.user_id);
        await AsyncStorage.setItem('ss_user_name', data.name);
        await AsyncStorage.setItem('ss_user_email', data.email ?? '');
        await AsyncStorage.setItem('ss_token', data.token);
      } catch {}

      onAuth(data.user_id, data.name, data.token);
    } catch (e: any) {
      setError(e.message || 'Could not connect. Make sure the app is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoOrb} />
          <View style={s.logoBox}><Text style={{ fontSize: 28 }}>📱</Text></View>
          <Text style={s.logoTxt}>Screen<Text style={{ color: C.teal }}>Sense</Text></Text>
          <Text style={s.logoSub}>Your digital wellbeing companion</Text>
        </View>

        {/* Card */}
        <Animated.View style={[s.card, { opacity: fadeAnim }]}>
          <Text style={s.cardTitle}>{mode === 'login' ? 'Welcome back' : 'Create account'}</Text>
          <Text style={s.cardSub}>
            {mode === 'login'
              ? 'Sign in to continue your wellbeing journey'
              : 'Start tracking your digital wellbeing today'}
          </Text>

          {mode === 'signup' && (
            <Field label="Your name" value={name} onChange={setName} placeholder="Harrison" />
          )}
          <Field label="Email address" value={email} onChange={setEmail} placeholder="you@example.com" keyboard="email-address" />
          <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" secure />
          {mode === 'signup' && (
            <Field label="Confirm password" value={confirm} onChange={setConfirm} placeholder="••••••••" secure />
          )}

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading} activeOpacity={0.88}>
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnTxt}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={s.switchBtn} onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
            <Text style={s.switchTxt}>
              {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
              <Text style={{ color: C.violetSoft, fontWeight: '600' }}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Feature pills */}
        <View style={s.featureRow}>
          {['🧠 ML stress analysis', '📍 Place recommendations', '🩺 Stepped care model'].map(f => (
            <View key={f} style={s.featurePill}>
              <Text style={s.featurePillTxt}>{f}</Text>
            </View>
          ))}
        </View>

        <Text style={s.legal}>
          By continuing you agree to our Privacy Policy. Your data is stored securely and never shared.
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, placeholder, secure, keyboard }: any) {
  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      <TextInput style={f.input}
        placeholder={placeholder} placeholderTextColor={C.textGhost}
        value={value} onChangeText={onChange}
        secureTextEntry={secure} keyboardType={keyboard || 'default'}
        autoCapitalize={secure ? 'none' : keyboard === 'email-address' ? 'none' : 'words'}
        autoCorrect={false}
      />
    </View>
  );
}
const f = StyleSheet.create({
  wrap: { marginBottom: Space['4'] },
  label: { fontSize: 11, fontWeight: '600', color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: Space['2'] },
  input: { backgroundColor: C.elevated, borderRadius: Radius.md, padding: Space['4'], color: C.text, fontSize: 15 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: Space['6'], paddingBottom: Space['10'], alignItems: 'center', minHeight: '100%' as any, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: Space['8'], position: 'relative' },
  logoOrb: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(124,110,250,0.1)', top: -60 },
  logoBox: { width: 64, height: 64, borderRadius: 18, backgroundColor: C.violetDim, alignItems: 'center', justifyContent: 'center', marginBottom: Space['4'] },
  logoTxt: { fontSize: 30, fontWeight: '900', color: C.text, letterSpacing: -0.8, marginBottom: Space['2'] },
  logoSub: { fontSize: 14, color: C.textDim },
  card: { width: '100%', maxWidth: 420, backgroundColor: C.card, borderRadius: Radius.xl, padding: Space['6'], marginBottom: Space['5'], ...Shadow.md },
  cardTitle: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: Space['1'], letterSpacing: -0.3 },
  cardSub: { fontSize: 13, color: C.textDim, marginBottom: Space['6'] },
  error: { fontSize: 13, color: C.danger, marginBottom: Space['3'], textAlign: 'center' },
  btn: { backgroundColor: C.violet, borderRadius: Radius.lg, padding: Space['5'], alignItems: 'center', ...Shadow.violet },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchBtn: { marginTop: Space['5'], alignItems: 'center' },
  switchTxt: { fontSize: 14, color: C.textDim },
  featureRow: { flexDirection: 'row', gap: Space['2'], flexWrap: 'wrap', justifyContent: 'center', marginBottom: Space['4'] },
  featurePill: { backgroundColor: C.card, borderRadius: Radius.full, paddingHorizontal: Space['3'], paddingVertical: Space['2'] },
  featurePillTxt: { fontSize: 11, color: C.textSub },
  legal: { fontSize: 11, color: C.textGhost, textAlign: 'center', lineHeight: 17, maxWidth: 320 },
});
