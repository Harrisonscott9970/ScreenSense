import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, Space, Radius, Shadow } from '../utils/theme';
import { getBaseURL } from '../services/api';
import { AnimatedPress } from '../components/AnimatedPress';

interface Props { onAuth: (userId: string, name: string, token: string) => void; }

const _rootSt = { flex: 1 as const, backgroundColor: 'transparent' as const };
const AuthRoot: React.FC<{ children: React.ReactNode }> =
  Platform.OS === 'ios'
    ? ({ children }) => (
        <KeyboardAvoidingView style={_rootSt} behavior="padding">
          {children}
        </KeyboardAvoidingView>
      )
    : ({ children }) => <View style={_rootSt}>{children}</View>;

export default function AuthScreen({ onAuth }: Props) {
  const [mode, setMode]         = useState<'login' | 'signup'>('login');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const switchMode = (m: 'login' | 'signup') => {
    if (m === mode) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setMode(m); setError('');
      Animated.timing(fadeAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    });
  };

  const validate = () => {
    if (!email.trim())         return 'Please enter your email';
    if (!email.includes('@'))  return 'Please enter a valid email';
    if (!password)             return 'Please enter a password';
    if (mode === 'signup') {
      if (!name.trim())              return 'Please enter your name';
      if (password.length < 6)       return 'Password must be at least 6 characters';
      if (password !== confirm)      return 'Passwords do not match';
    }
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true); setError('');

    try {
      const currentUrl = getBaseURL();
      const endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login';
      const body = mode === 'signup'
        ? { name: name.trim(), email: email.trim().toLowerCase(), password }
        : { email: email.trim().toLowerCase(), password };

      const res = await fetch(`${currentUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Something went wrong');

      try {
        await AsyncStorage.setItem('ss_user_id',    data.user_id);
        await AsyncStorage.setItem('ss_user_name',  data.name);
        await AsyncStorage.setItem('ss_user_email', data.email ?? '');
        await AsyncStorage.setItem('ss_token',      data.token);
      } catch {}

      onAuth(data.user_id, data.name, data.token);

    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthRoot>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoOrb} />
          <View style={s.logoBox}><Text style={{ fontSize: 28 }}>📱</Text></View>
          <Text style={s.logoTxt}>Screen<Text style={{ color: C.teal }}>Sense</Text></Text>
          <Text style={s.logoSub}>Your digital wellbeing companion</Text>
        </View>

        {/* Card */}
        <Animated.View style={[s.card, { opacity: fadeAnim }]}>

          {/* Mode tabs */}
          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tab, mode === 'login' && s.tabActive]}
              onPress={() => switchMode('login')}
              activeOpacity={0.75}
            >
              <Text style={[s.tabTxt, mode === 'login' && s.tabTxtActive]}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, mode === 'signup' && s.tabActive]}
              onPress={() => switchMode('signup')}
              activeOpacity={0.75}
            >
              <Text style={[s.tabTxt, mode === 'signup' && s.tabTxtActive]}>Create account</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.cardSub}>
            {mode === 'login'
              ? 'Sign in to continue your wellbeing journey'
              : 'Start tracking your digital wellbeing today'}
          </Text>

          {mode === 'signup' && (
            <Field label="Your name" value={name} onChange={setName} placeholder="Harrison" />
          )}
          <Field label="Email address" value={email} onChange={setEmail}
                 placeholder="you@example.com" keyboard="email-address" />
          <Field label="Password" value={password} onChange={setPassword}
                 placeholder="••••••••" secure />
          {mode === 'signup' && (
            <Field label="Confirm password" value={confirm} onChange={setConfirm}
                   placeholder="••••••••" secure />
          )}

          {error ? <Text style={s.error}>{error}</Text> : null}

          <AnimatedPress
            style={[s.btn, loading && { opacity: 0.6 }]}
            onPress={submit}
            disabled={loading}
            scale={0.96}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnTxt}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>
            }
          </AnimatedPress>
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
    </AuthRoot>
  );
}

function Field({ label, value, onChange, placeholder, secure, keyboard }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; secure?: boolean; keyboard?: any;
}) {
  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      <TextInput
        style={f.input}
        placeholder={placeholder}
        placeholderTextColor={C.textGhost}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={keyboard || 'default'}
        autoCapitalize={secure ? 'none' : keyboard === 'email-address' ? 'none' : 'words'}
        autoCorrect={false}
      />
    </View>
  );
}

const f = StyleSheet.create({
  wrap:  { marginBottom: Space['4'] },
  label: { fontSize: 11, fontWeight: '600', color: C.textDim, textTransform: 'uppercase',
           letterSpacing: 0.7, marginBottom: Space['2'] },
  input: { backgroundColor: C.elevated, borderRadius: Radius.md, padding: Space['4'],
           color: C.text, fontSize: 15 },
});

const s = StyleSheet.create({
  content: {
    paddingHorizontal: Space['6'],
    paddingBottom: Space['10'],
    alignItems: 'center',
    minHeight: '100%' as any,
    justifyContent: 'center',
  },

  logoWrap:  { alignItems: 'center', marginBottom: Space['8'], position: 'relative' },
  logoOrb:   { position: 'absolute', width: 220, height: 220, borderRadius: 110,
               backgroundColor: 'rgba(124,110,250,0.1)', top: -60 },
  logoBox:   { width: 64, height: 64, borderRadius: 18, backgroundColor: C.violetDim,
               alignItems: 'center', justifyContent: 'center', marginBottom: Space['4'] },
  logoTxt:   { fontSize: 30, fontWeight: '900', color: C.text, letterSpacing: -0.8,
               marginBottom: Space['2'] },
  logoSub:   { fontSize: 14, color: C.textDim },

  card:      { width: '100%', maxWidth: 420, backgroundColor: C.card,
               borderRadius: Radius.xl, padding: Space['6'],
               marginBottom: Space['5'], ...Shadow.md },
  cardSub:   { fontSize: 13, color: C.textDim, marginBottom: Space['5'], textAlign: 'center' },

  tabs:      { flexDirection: 'row', backgroundColor: C.elevated, borderRadius: Radius.lg,
               padding: 4, marginBottom: Space['5'] },
  tab:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md },
  tabActive: { backgroundColor: C.violet, ...Shadow.violet },
  tabTxt:    { fontSize: 14, fontWeight: '600', color: C.textDim },
  tabTxtActive: { color: '#fff' },

  error: { fontSize: 13, color: C.danger, marginBottom: Space['3'], textAlign: 'center' },
  btn:   { backgroundColor: C.violet, borderRadius: Radius.lg, padding: Space['5'],
           alignItems: 'center', ...Shadow.violet },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },

  featureRow:     { flexDirection: 'row', gap: Space['2'], flexWrap: 'wrap',
                    justifyContent: 'center', marginBottom: Space['4'] },
  featurePill:    { backgroundColor: C.card, borderRadius: Radius.full,
                    paddingHorizontal: Space['3'], paddingVertical: Space['2'] },
  featurePillTxt: { fontSize: 11, color: C.textSub },
  legal:          { fontSize: 11, color: C.textGhost, textAlign: 'center',
                    lineHeight: 17, maxWidth: 320 },
});
