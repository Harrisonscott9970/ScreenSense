/**
 * ScreenSense App — Production Version
 * ======================================
 * - AsyncStorage (works on iOS/Android AND web)
 * - Real screen-time tracking via AppState
 * - userId propagated to ALL screens
 * - Bottom tab nav (mobile) / sidebar (web)
 */
import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Dimensions, Platform, SafeAreaView, AppState,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, Space, Radius, Shadow } from './src/utils/theme';
import { initApiUrl, BASE_URL, api } from './src/services/api';
import { setupNotifications, scheduleWeeklyReport, addNotificationResponseListener } from './src/utils/notifications';

import OnboardingScreen    from './src/screens/OnboardingScreen';
import AuthScreen          from './src/screens/AuthScreen';
import CheckInScreen       from './src/screens/CheckInScreen';
import LogScreen           from './src/screens/LogScreen';
import InsightsScreen      from './src/screens/InsightsScreen';
import MapScreen           from './src/screens/MapScreen';
import TherapyScreen       from './src/screens/TherapyScreen';
import ProfileScreen       from './src/screens/ProfileScreen';
import ProgrammeScreen     from './src/screens/ProgrammeScreen';
import ClinicalScreen      from './src/screens/ClinicalScreen';
import SleepScreen         from './src/screens/SleepScreen';
import WeeklyReportScreen  from './src/screens/WeeklyReportScreen';
import PrivacyScreen       from './src/screens/PrivacyScreen';
import CrisisScreen        from './src/screens/CrisisScreen';

// ── Global error boundary — prevents blank screen on uncaught JS errors ──
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: any) {
    return { error: e?.message ?? String(e) };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#060712', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>⚠️</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>Something went wrong</Text>
          <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>{this.state.error}</Text>
          <TouchableOpacity
            style={{ backgroundColor: '#7c6efa', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const { width } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web' && width > 768;

type Tab = 'checkin' | 'map' | 'therapy' | 'programmes' |
           'clinical' | 'sleep' | 'log' | 'insights' | 'profile' |
           'weekly' | 'privacy' | 'crisis';

const BOTTOM_TABS = [
  { tab: 'checkin'  as Tab, icon: '🌡', label: 'Check-in' },
  { tab: 'map'      as Tab, icon: '🗺', label: 'Map' },
  { tab: 'therapy'  as Tab, icon: '🧘', label: 'Therapy' },
  { tab: 'insights' as Tab, icon: '📊', label: 'Insights' },
  { tab: 'profile'  as Tab, icon: '👤', label: 'Profile' },
];

const WEB_NAV = [
  { label: 'Daily', items: [
    { tab: 'checkin' as Tab, icon: '🌡', label: 'Check-in',   sub: 'Daily mood check' },
    { tab: 'sleep'   as Tab, icon: '🌙', label: 'Sleep',      sub: 'Track & restore' },
  ]},
  { label: 'Support', items: [
    { tab: 'therapy'    as Tab, icon: '🧘', label: 'Therapy',    sub: 'Tools & exercises' },
    { tab: 'programmes' as Tab, icon: '📚', label: 'Programmes', sub: 'Structured journeys' },
    { tab: 'clinical'   as Tab, icon: '🩺', label: 'Clinical',   sub: 'PHQ-9 · GAD-7' },
  ]},
  { label: 'Explore', items: [
    { tab: 'map'      as Tab, icon: '🗺', label: 'Map',       sub: 'Places nearby' },
    { tab: 'log'      as Tab, icon: '📓', label: 'Log',       sub: 'Your history' },
    { tab: 'insights' as Tab, icon: '📊', label: 'Insights',  sub: 'Patterns & trends' },
  ]},
  { label: 'Account', items: [
    { tab: 'profile' as Tab, icon: '👤', label: 'Profile',   sub: 'Settings & account' },
  ]},
];

// ── Cross-platform storage helpers ─────────────────────────────
async function storeItem(key: string, value: string) {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {}
}
async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch { return null; }
}
async function removeItems(keys: string[]) {
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {}
}

function AppInner() {
  const [phase, setPhase]   = useState<'loading' | 'onboarding' | 'auth' | 'app'>('loading');
  const [user, setUser]     = useState<{ id: string; name: string; email: string; token: string } | null>(null);
  const [tab, setTab]       = useState<Tab>('checkin');
  const [lastMood, setLastMood]     = useState<string | undefined>();
  const [lastStress, setLastStress] = useState<number | undefined>();
  const [lastResult, setLastResult] = useState<any>(null);
  const [screenTimeHours, setScreenTimeHours] = useState(0);
  const tabScales = useRef(BOTTOM_TABS.map(() => new Animated.Value(1))).current;

  // Real screen-time tracking
  const sessionStart  = useRef<number>(Date.now());
  const totalMinutes  = useRef<number>(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        const mins = (Date.now() - sessionStart.current) / 60000;
        totalMinutes.current += mins;
        setScreenTimeHours(parseFloat((totalMinutes.current / 60).toFixed(1)));
      } else if (state === 'active') {
        sessionStart.current = Date.now();
      }
    });
    const interval = setInterval(() => {
      const mins = (Date.now() - sessionStart.current) / 60000;
      setScreenTimeHours(parseFloat(((totalMinutes.current + mins) / 60).toFixed(1)));
    }, 60000);
    return () => { sub.remove(); clearInterval(interval); };
  }, []);

  // Animated background orbs
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 8000, useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 8000, useNativeDriver: true }),
    ])).start();

    // Load saved server IP before any API calls
    initApiUrl().catch(() => {});

    // Navigate to correct screen when user taps a notification
    const removeSub = addNotificationResponseListener((screen) => {
      if (screen === 'weekly') setTab('weekly');
    });

    // Restore session from AsyncStorage (works on mobile + web)
    (async () => {
      const id        = await getItem('ss_user_id');
      const name      = await getItem('ss_user_name');
      const email     = await getItem('ss_user_email');
      const token     = await getItem('ss_token');
      const onboarded = await getItem('ss_onboarded');

      if (id && name && token) {
        setUser({ id, name, email: email ?? '', token });
        setPhase('app');
        // Restore last check-in result so Map shows correct data on relaunch
        try {
          const res = await fetch(`${BASE_URL}/entries/${id}?limit=1`);
          if (res.ok) {
            const entries = await res.json();
            if (entries?.length > 0) {
              const e = entries[0];
              setLastMood(e.mood_label);
              setLastStress(e.stress_score ?? e.predicted_stress_score);
              setLastResult({
                place_recommendations: e.place_recommendations || [],
                care_level: e.care_level,
                risk_factors_detected: [],
              });
            }
          }
        } catch {}
      } else if (onboarded) {
        setPhase('auth');
      } else {
        setPhase('onboarding');
      }
    })();

    return () => { removeSub?.(); };
  }, []);

  const orb1 = breathe.interpolate({ inputRange: [0,1], outputRange: [1, 1.15] });
  const orb2 = breathe.interpolate({ inputRange: [0,1], outputRange: [1.1, 0.9] });

  const Bg = () => (
    <>
      <View style={bg.base} />
      <Animated.View style={[bg.orb1, { transform: [{ scale: orb1 }] }]} />
      <Animated.View style={[bg.orb2, { transform: [{ scale: orb2 }] }]} />
      <View style={bg.orb3} />
      <View style={bg.mtn1} /><View style={bg.mtn2} /><View style={bg.mtn3} />
    </>
  );

  const handleAuth = useCallback(async (userId: string, userName: string, token: string) => {
    // Email is already written to AsyncStorage by AuthScreen before onAuth is called
    const email = (await getItem('ss_user_email')) || '';
    await storeItem('ss_user_id', userId);
    await storeItem('ss_user_name', userName);
    await storeItem('ss_user_email', email);   // ensure email survives future restores
    await storeItem('ss_token', token);
    setUser({ id: userId, name: userName, email, token });
    setPhase('app');
    // Schedule weekly Sunday 8pm wellbeing report notification
    setupNotifications().then(granted => {
      if (granted) scheduleWeeklyReport().catch(() => {});
    }).catch(() => {});
    // Sync onboarding archetype to backend profile
    AsyncStorage.getItem('ss_archetype').then(archetype => {
      if (archetype) api.updateProfile(userId, { archetype }).catch(() => {});
    }).catch(() => {});
  }, []);

  const handleLogout = useCallback(async () => {
    await removeItems(['ss_user_id','ss_user_name','ss_user_email','ss_token','ss_onboarded']);
    setUser(null);
    setPhase('auth');
  }, []);

  const handleCheckInComplete = useCallback((mood: string, stress: number, result: any) => {
    setLastMood(mood);
    setLastStress(stress);
    setLastResult(result);
  }, []);

  const handleTabPress = useCallback((idx: number, targetTab: Tab) => {
    Animated.sequence([
      Animated.spring(tabScales[idx], { toValue: 1.25, useNativeDriver: true, tension: 350, friction: 10 }),
      Animated.spring(tabScales[idx], { toValue: 1,    useNativeDriver: true, tension: 350, friction: 10 }),
    ]).start();
    setTab(targetTab);
  }, [tabScales]);

  if (phase === 'loading') return <View style={s.root}><Bg /></View>;

  if (phase === 'onboarding') return (
    <View style={s.root}><StatusBar style="light" /><Bg />
      <SafeAreaView style={{ flex: 1 }}>
        <OnboardingScreen onComplete={async () => { await storeItem('ss_onboarded','1'); setPhase('auth'); }} />
      </SafeAreaView>
    </View>
  );

  if (phase === 'auth' || !user) return (
    <View style={s.root}><StatusBar style="light" /><Bg />
      <SafeAreaView style={{ flex: 1 }}>
        <AuthScreen onAuth={handleAuth} />
      </SafeAreaView>
    </View>
  );

  const renderScreen = () => {
    switch (tab) {
      case 'checkin':
        return (
          <CheckInScreen
            userId={user.id}
            userName={user.name}
            screenTimeHours={screenTimeHours}
            onComplete={handleCheckInComplete}
            onNavigate={(screen) => setTab(screen as Tab)}
          />
        );
      case 'map':
        return (
          <MapScreen
            userId={user.id}
            currentMood={lastMood}
            currentStress={lastStress}
            lastResult={lastResult}
          />
        );
      case 'therapy':    return <TherapyScreen />;
      case 'programmes': return <ProgrammeScreen />;
      case 'clinical':   return <ClinicalScreen userId={user.id} />;
      case 'sleep':      return <SleepScreen />;
      case 'log':        return <LogScreen userId={user.id} />;
      case 'insights':   return <InsightsScreen userId={user.id} />;
      case 'weekly':     return <WeeklyReportScreen userId={user.id} />;
      case 'profile':
        return (
          <ProfileScreen
            userId={user.id}
            userName={user.name}
            userEmail={user.email}
            onLogout={handleLogout}
            onNavigate={(screen) => setTab(screen as Tab)}
          />
        );
      case 'privacy':    return <PrivacyScreen />;
      case 'crisis':
        return (
          <CrisisScreen
            userName={user.name}
            riskFactors={lastResult?.risk_factors_detected}
            onBack={() => setTab('checkin')}
          />
        );
      default:
        return (
          <CheckInScreen
            userId={user.id}
            userName={user.name}
            screenTimeHours={screenTimeHours}
            onComplete={handleCheckInComplete}
            onNavigate={(screen) => setTab(screen as Tab)}
          />
        );
    }
  };

  const stressColor = lastStress
    ? (lastStress > 0.66 ? C.stressHigh : lastStress > 0.33 ? C.stressMid : C.stressLow)
    : C.violet;

  // ── MOBILE ────────────────────────────────────────────────
  if (!IS_WEB) {
    return (
      <View style={s.root}>
        <StatusBar style="light" /><Bg />
        <SafeAreaView style={ms.safe}>
          <View style={ms.content}>{renderScreen()}</View>
          <View style={ms.tabBar}>
            {BOTTOM_TABS.map((item, idx) => {
              const active = tab === item.tab;
              return (
                <TouchableOpacity key={item.tab} style={ms.tabItem} onPress={() => handleTabPress(idx, item.tab)} activeOpacity={0.7}>
                  <Animated.View style={[ms.tabIconWrap, active && ms.tabIconWrapActive, { transform: [{ scale: tabScales[idx] }] }]}>
                    <Text style={[ms.tabIcon, { opacity: active ? 1 : 0.4 }]}>{item.icon}</Text>
                  </Animated.View>
                  <Text style={[ms.tabLabel, active && ms.tabLabelActive]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── WEB ───────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar style="light" /><Bg />
      <View style={ws.sidebar}>
        <View style={ws.logoRow}>
          <View style={ws.logoBox}><Text style={{ fontSize: 14 }}>📱</Text></View>
          <View>
            <Text style={ws.logoTxt}>Screen<Text style={{ color: C.teal }}>Sense</Text></Text>
            <Text style={ws.logoSub}>Digital Wellbeing</Text>
          </View>
        </View>
        <View style={ws.div} />

        <TouchableOpacity style={ws.userRow} onPress={() => setTab('profile')}>
          <View style={ws.avatar}><Text style={ws.avatarTxt}>{user.name.slice(0,2).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={ws.userName}>{user.name}</Text>
            <Text style={ws.userSub}>View profile</Text>
          </View>
        </TouchableOpacity>
        <View style={ws.div} />

        {WEB_NAV.map(group => (
          <View key={group.label} style={ws.navGroup}>
            <Text style={ws.navGroupLabel}>{group.label}</Text>
            {group.items.map(item => {
              const active = tab === item.tab;
              return (
                <TouchableOpacity key={item.tab} style={[ws.navItem, active && ws.navItemActive]}
                  onPress={() => setTab(item.tab)} activeOpacity={0.75}>
                  <View style={[ws.navIcon, active && ws.navIconActive]}>
                    <Text style={{ fontSize: 13 }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[ws.navLabel, active && ws.navLabelActive]}>{item.label}</Text>
                    <Text style={ws.navSub}>{item.sub}</Text>
                  </View>
                  {active && <View style={ws.activeDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={{ flex: 1 }} />
        <View style={ws.div} />

        {/* Live screen time */}
        <View style={ws.screenTime}>
          <Text style={ws.screenTimeLabel}>Screen time today</Text>
          <Text style={ws.screenTimeVal}>{screenTimeHours.toFixed(1)}h</Text>
          <View style={ws.screenTimeBar}>
            <View style={[ws.screenTimeBarFill, {
              width: `${Math.min((screenTimeHours / 8) * 100, 100)}%` as any,
              backgroundColor: screenTimeHours > 6 ? C.stressHigh : screenTimeHours > 3 ? C.stressMid : C.stressLow,
            }]} />
          </View>
        </View>

        {lastStress !== undefined && (
          <View style={ws.stressBar}>
            <Text style={ws.stressBarLabel}>Current stress</Text>
            <View style={ws.stressBarTrack}>
              <View style={[ws.stressBarFill, { width: `${lastStress * 100}%` as any, backgroundColor: stressColor }]} />
            </View>
            <Text style={ws.stressBarVal}>{Math.round(lastStress * 100)}/100</Text>
          </View>
        )}

        <View style={ws.footer}>
          <Text style={ws.footTxt}>Harrison Scott · 10805603</Text>
          <View style={ws.footBadge}><Text style={ws.footBadgeTxt}>Affective Computing</Text></View>
        </View>
      </View>

      <View style={s.main}>{renderScreen()}</View>
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

const bg = StyleSheet.create({
  base: { position: 'absolute', inset: 0, backgroundColor: C.bg },
  orb1: { position: 'absolute', width: 600, height: 600, borderRadius: 300, backgroundColor: 'rgba(124,110,250,0.07)', top: -200, left: -80 },
  orb2: { position: 'absolute', width: 400, height: 400, borderRadius: 200, backgroundColor: 'rgba(45,212,191,0.05)', bottom: -80, right: -60 },
  orb3: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(124,110,250,0.05)', top: 200, right: 100 },
  mtn1: { position: 'absolute', bottom: 0, left: '8%', width: 0, height: 0, borderLeftWidth: 280, borderRightWidth: 280, borderBottomWidth: 380, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'rgba(5,7,18,0.7)' },
  mtn2: { position: 'absolute', bottom: 0, left: '35%', width: 0, height: 0, borderLeftWidth: 220, borderRightWidth: 220, borderBottomWidth: 300, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'rgba(7,9,20,0.75)' },
  mtn3: { position: 'absolute', bottom: 0, right: '5%', width: 0, height: 0, borderLeftWidth: 340, borderRightWidth: 340, borderBottomWidth: 260, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'rgba(8,6,22,0.65)' },
});

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg, ...(Platform.OS === 'web' ? { minHeight: '100vh' as any } : {}) },
  main: { flex: 1, overflow: 'hidden' as any },
});

const ms = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: 'rgba(6,7,16,0.97)', borderTopWidth: 1, borderTopColor: C.line, paddingTop: Space['2'], paddingBottom: Platform.OS === 'ios' ? 4 : Space['3'], paddingHorizontal: Space['1'] },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabIconWrap: { width: 38, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
  tabIconWrapActive: { backgroundColor: C.violetDim },
  tabIcon: { fontSize: 18 },
  tabLabel: { fontSize: 9, color: C.textGhost, fontWeight: '500' },
  tabLabelActive: { color: C.violetSoft, fontWeight: '700' },
});

const ws = StyleSheet.create({
  sidebar: { width: 200, backgroundColor: 'rgba(6,7,16,0.90)', borderRightWidth: 1, borderRightColor: C.line, paddingTop: Space['6'], paddingBottom: Space['5'], paddingHorizontal: Space['4'], flexShrink: 0, zIndex: 10 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Space['3'], marginBottom: Space['4'] },
  logoBox: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.violetDim, alignItems: 'center', justifyContent: 'center' },
  logoTxt: { fontSize: 14, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  logoSub: { fontSize: 8, color: C.textGhost, textTransform: 'uppercase', letterSpacing: 0.5 },
  div: { height: 1, backgroundColor: C.line, marginVertical: Space['3'] },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Space['2'], padding: Space['2'], borderRadius: Radius.md, backgroundColor: C.card },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.violetDim, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 10, fontWeight: '700', color: C.violetSoft },
  userName: { fontSize: 11, fontWeight: '600', color: C.text },
  userSub: { fontSize: 9, color: C.textGhost },
  navGroup: { marginBottom: Space['3'] },
  navGroupLabel: { fontSize: 8, color: C.textGhost, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', marginBottom: Space['1'], paddingHorizontal: Space['2'] },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: Space['2'], paddingVertical: Space['2'], paddingHorizontal: Space['2'], borderRadius: Radius.sm, marginBottom: 1, position: 'relative' },
  navItemActive: { backgroundColor: C.violetDim },
  navIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  navIconActive: { backgroundColor: 'rgba(124,110,250,0.25)' },
  navLabel: { fontSize: 11, fontWeight: '500', color: C.textDim },
  navLabelActive: { color: C.text, fontWeight: '700' },
  navSub: { fontSize: 8, color: C.textGhost },
  activeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.violet },
  screenTime: { marginBottom: Space['3'] },
  screenTimeLabel: { fontSize: 8, color: C.textGhost, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  screenTimeVal: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 },
  screenTimeBar: { height: 3, backgroundColor: C.elevated, borderRadius: 2, marginBottom: 2 },
  screenTimeBarFill: { height: 3, borderRadius: 2 },
  stressBar: { marginBottom: Space['3'] },
  stressBarLabel: { fontSize: 8, color: C.textGhost, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  stressBarTrack: { height: 3, backgroundColor: C.elevated, borderRadius: 2, marginBottom: 2 },
  stressBarFill: { height: 3, borderRadius: 2 },
  stressBarVal: { fontSize: 8, color: C.textGhost },
  footer: { paddingHorizontal: Space['1'] },
  footTxt: { fontSize: 8, color: C.textGhost, marginBottom: Space['2'] },
  footBadge: { backgroundColor: C.violetDim, borderRadius: 4, paddingHorizontal: Space['2'], paddingVertical: 3, alignSelf: 'flex-start' as any },
  footBadgeTxt: { fontSize: 7, color: C.violetSoft, fontWeight: '600', letterSpacing: 0.3 },
});
