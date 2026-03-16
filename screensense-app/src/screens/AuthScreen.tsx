import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';

const V = '#6C63FF', VL = '#9B94FF', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.48)', SUB = 'rgba(238,240,255,0.22)',
      CARD = 'rgba(255,255,255,0.05)', BOR = 'rgba(255,255,255,0.1)';

interface AuthScreenProps {
  onAuth: (userId: string, name: string) => void;
}

export default function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const switchMode = (newMode: 'login' | 'signup') => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setMode(newMode);
      setError('');
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const submit = async () => {
    if (!email || !password) { setError('Please fill in all fields'); return; }
    if (mode === 'signup' && !name) { setError('Please enter your name'); return; }
    setLoading(true);
    setError('');

    // Simulate auth — in production connect to a real auth backend
    await new Promise(r => setTimeout(r, 800));
    const userId = `user_${email.split('@')[0].replace(/[^a-z0-9]/gi, '_')}`;
    const displayName = mode === 'signup' ? name : email.split('@')[0];

    // Store locally
    try {
      localStorage.setItem('ss_user_id', userId);
      localStorage.setItem('ss_user_name', displayName);
      localStorage.setItem('ss_user_email', email);
    } catch {}

    setLoading(false);
    onAuth(userId, displayName);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>

        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoOrb} />
          <View style={s.logoBox}><Text style={{ fontSize: 28 }}>📱</Text></View>
          <Text style={s.logoTxt}>Screen<Text style={{ color: '#4FC3F7' }}>Sense</Text></Text>
          <Text style={s.logoSub}>Your digital wellbeing companion</Text>
        </View>

        {/* Card */}
        <Animated.View style={[s.card, { opacity: fadeAnim }]}>
          <Text style={s.cardTitle}>{mode === 'login' ? 'Welcome back' : 'Create account'}</Text>
          <Text style={s.cardSub}>{mode === 'login' ? 'Sign in to continue your wellbeing journey' : 'Start tracking your digital wellbeing'}</Text>

          {mode === 'signup' && (
            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>Your name</Text>
              <TextInput style={s.input} placeholder="Harrison" placeholderTextColor={SUB}
                value={name} onChangeText={setName} autoCapitalize="words" />
            </View>
          )}

          <View style={s.inputWrap}>
            <Text style={s.inputLabel}>Email address</Text>
            <TextInput style={s.input} placeholder="you@example.com" placeholderTextColor={SUB}
              value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={s.inputWrap}>
            <Text style={s.inputLabel}>Password</Text>
            <TextInput style={s.input} placeholder="••••••••" placeholderTextColor={SUB}
              value={password} onChangeText={setPassword} secureTextEntry />
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity style={[s.btn, loading && { opacity: 0.65 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> :
              <Text style={s.btnTxt}>{mode === 'login' ? 'Sign in  →' : 'Create account  →'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.switchBtn} onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
            <Text style={s.switchTxt}>
              {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
              <Text style={{ color: VL, fontWeight: '600' }}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Features */}
        <View style={s.features}>
          {['🧠 AI stress classification', '📍 Location-aware recommendations', '📊 Longitudinal insights'].map(f => (
            <View key={f} style={s.featureItem}>
              <Text style={s.featureTxt}>{f}</Text>
            </View>
          ))}
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  logoWrap: { alignItems: 'center', marginBottom: 32, position: 'relative' },
  logoOrb: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(108,99,255,0.15)', top: -60 },
  logoBox: { width: 60, height: 60, borderRadius: 18, backgroundColor: 'rgba(108,99,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(108,99,255,0.4)', marginBottom: 12 },
  logoTxt: { fontSize: 28, fontWeight: '900', color: TXT, letterSpacing: -0.8, marginBottom: 6 },
  logoSub: { fontSize: 13, color: MUT },

  card: { width: '100%', maxWidth: 400, backgroundColor: CARD, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: BOR, marginBottom: 20 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: TXT, marginBottom: 4, letterSpacing: -0.3 },
  cardSub: { fontSize: 13, color: MUT, marginBottom: 22 },

  inputWrap: { marginBottom: 14 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: SUB, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  input: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: BOR, borderRadius: 12, padding: 14, color: TXT, fontSize: 15 },

  error: { fontSize: 12, color: '#F43F5E', marginBottom: 12, textAlign: 'center' },

  btn: { backgroundColor: V, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 6, shadowColor: V, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  switchBtn: { marginTop: 16, alignItems: 'center' },
  switchTxt: { fontSize: 13, color: MUT },

  features: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  featureItem: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 0.5, borderColor: BOR },
  featureTxt: { fontSize: 11, color: MUT },
});
