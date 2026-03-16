/**
 * ScreenSense App — Mobile-first layout
 * ======================================
 * - Sidebar on web (>768px)
 * - Bottom tab bar on mobile
 * - Safe area handling
 * - Proper keyboard avoidance
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Dimensions, Platform, SafeAreaView, StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C, Space, Radius, Font, Shadow } from './src/utils/theme';

import OnboardingScreen  from './src/screens/OnboardingScreen';
import AuthScreen        from './src/screens/AuthScreen';
import CheckInScreen     from './src/screens/CheckInScreen';
import LogScreen         from './src/screens/LogScreen';
import InsightsScreen    from './src/screens/InsightsScreen';
import MapScreen         from './src/screens/MapScreen';
import TherapyScreen     from './src/screens/TherapyScreen';
import ProfileScreen     from './src/screens/ProfileScreen';
import ProgrammeScreen   from './src/screens/ProgrammeScreen';
import ClinicalScreen    from './src/screens/ClinicalScreen';
import SleepScreen       from './src/screens/SleepScreen';

const { width } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web' && width > 768;

type Tab = 'checkin' | 'map' | 'therapy' | 'programmes' | 'clinical' | 'sleep' | 'log' | 'insights' | 'profile';

// Bottom tabs — only 5 for mobile (most important)
const BOTTOM_TABS = [
  { tab: 'checkin'  as Tab, icon: '🌡', label: 'Check-in' },
  { tab: 'therapy'  as Tab, icon: '🧘', label: 'Therapy' },
  { tab: 'map'      as Tab, icon: '🗺', label: 'Map' },
  { tab: 'insights' as Tab, icon: '📊', label: 'Insights' },
  { tab: 'profile'  as Tab, icon: '👤', label: 'Profile' },
];

// Sidebar groups for web
const WEB_NAV = [
  { label: 'Daily',   items: [
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
    { tab: 'insights' as Tab, icon: '📊', label: 'Insights',  sub: 'Patterns & ML' },
  ]},
  { label: 'Account', items: [
    { tab: 'profile'  as Tab, icon: '👤', label: 'Profile',   sub: 'Settings & account' },
  ]},
];

export default function App() {
  const [phase, setPhase] = useState<'loading' | 'onboarding' | 'auth' | 'app'>('loading');
  const [user, setUser]   = useState<{ id: string; name: string; email: string } | null>(null);
  const [tab, setTab]     = useState<Tab>('checkin');
  const [lastMood, setLastMood]     = useState<string | undefined>();
  const [lastStress, setLastStress] = useState<number | undefined>();
  const [lastResult, setLastResult] = useState<any>(null);
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 8000, useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 8000, useNativeDriver: true }),
    ])).start();

    try {
      const id    = localStorage.getItem('ss_user_id');
      const name  = localStorage.getItem('ss_user_name');
      const email = localStorage.getItem('ss_user_email');
      const onboarded = localStorage.getItem('ss_onboarded');
      if (id && name && email) { setUser({ id, name, email }); setPhase('app'); }
      else if (onboarded) setPhase('auth');
      else setPhase('onboarding');
    } catch { setPhase('onboarding'); }
  }, []);

  const orb1 = breathe.interpolate({ inputRange: [0,1], outputRange: [1, 1.15] });
  const orb2 = breathe.interpolate({ inputRange: [0,1], outputRange: [1.1, 0.9] });

  const Bg = () => (
    <>
      <View style={bg.base} />
      <Animated.View style={[bg.orb1, { transform: [{ scale: orb1 }] }]} />
      <Animated.View style={[bg.orb2, { transform: [{ scale: orb2 }] }]} />
      <View style={bg.orb3} />
      <View style={bg.mtn1} />
      <View style={bg.mtn2} />
      <View style={bg.mtn3} />
    </>
  );

  const handleAuth = (userId: string, userName: string) => {
    const email = (() => { try { return localStorage.getItem('ss_user_email') || ''; } catch { return ''; } })();
    setUser({ id: userId, name: userName, email });
    setPhase('app');
  };

  const handleLogout = () => {
    try { ['ss_user_id','ss_user_name','ss_user_email'].forEach(k => localStorage.removeItem(k)); } catch {}
    setUser(null); setPhase('auth');
  };

  if (phase === 'loading') return <View style={s.root}><Bg /></View>;

  if (phase === 'onboarding') return (
    <View style={s.root}><StatusBar style="light" /><Bg />
      <SafeAreaView style={{ flex: 1 }}>
        <OnboardingScreen onComplete={() => setPhase('auth')} />
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

  const onComplete = (mood: string, stress: number, result: any) => {
    setLastMood(mood); setLastStress(stress); setLastResult(result);
  };

  const renderScreen = () => {
    switch (tab) {
      case 'checkin':    return <CheckInScreen userId={user.id} userName={user.name} onComplete={onComplete} />;
      case 'map':        return <MapScreen userId={user.id} currentMood={lastMood} currentStress={lastStress} lastResult={lastResult} />;
      case 'therapy':    return <TherapyScreen />;
      case 'programmes': return <ProgrammeScreen />;
      case 'clinical':   return <ClinicalScreen />;
      case 'sleep':      return <SleepScreen />;
      case 'log':        return <LogScreen />;
      case 'insights':   return <InsightsScreen />;
      case 'profile':    return <ProfileScreen userId={user.id} userName={user.name} userEmail={user.email} onLogout={handleLogout} />;
    }
  };

  const stressColor = lastStress
    ? lastStress > 0.66 ? C.stressHigh : lastStress > 0.33 ? C.stressMid : C.stressLow
    : C.violet;

  // ── WEB LAYOUT ────────────────────────────────────────────
  if (IS_WEB) {
    return (
      <View style={s.root}>
        <StatusBar style="light" />
        <Bg />

        {/* Sidebar */}
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
              <Text style={ws.userSub}>View profile →</Text>
            </View>
          </TouchableOpacity>
          <View style={ws.div} />

          {WEB_NAV.map(group => (
            <View key={group.label} style={ws.navGroup}>
              <Text style={ws.navGroupLabel}>{group.label}</Text>
              {group.items.map(item => {
                const active = tab === item.tab;
                return (
                  <TouchableOpacity key={item.tab}
                    style={[ws.navItem, active && ws.navItemActive]}
                    onPress={() => setTab(item.tab)} activeOpacity={0.75}
                  >
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

          {/* Stress bar */}
          {lastStress !== undefined && (
            <View style={ws.stressBar}>
              <Text style={ws.stressBarLabel}>Current stress</Text>
              <View style={ws.stressBarTrack}>
                <View style={[ws.stressBarFill, { width: `${lastStress * 100}%` as any, backgroundColor: stressColor }]} />
              </View>
              <Text style={ws.stressBarVal}>{Math.round(lastStress * 100)}/100 · {lastMood}</Text>
            </View>
          )}

          <View style={ws.sideFooter}>
            <Text style={ws.footTxt}>Harrison Scott · BSc CS</Text>
            <View style={ws.footBadge}><Text style={ws.footBadgeTxt}>Affective Computing</Text></View>
          </View>
        </View>

        {/* Main */}
        <View style={s.main}>{renderScreen()}</View>
      </View>
    );
  }

  // ── MOBILE LAYOUT ─────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Bg />

      {/* Content */}
      <SafeAreaView style={ms.safeArea}>
        <View style={ms.content}>{renderScreen()}</View>

        {/* Bottom tab bar */}
        <View style={ms.tabBar}>
          {BOTTOM_TABS.map(item => {
            const active = tab === item.tab;
            return (
              <TouchableOpacity key={item.tab} style={ms.tabItem} onPress={() => setTab(item.tab)} activeOpacity={0.7}>
                <View style={[ms.tabIconWrap, active && ms.tabIconWrapActive]}>
                  <Text style={[ms.tabIcon, { opacity: active ? 1 : 0.45 }]}>{item.icon}</Text>
                </View>
                <Text style={[ms.tabLabel, active && ms.tabLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Background styles ──────────────────────────────────────
const bg = StyleSheet.create({
  base: { position: 'absolute', inset: 0, backgroundColor: C.bg },
  orb1: { position: 'absolute', width: 600, height: 600, borderRadius: 300, backgroundColor: 'rgba(124,110,250,0.07)', top: -200, left: -80 },
  orb2: { position: 'absolute', width: 400, height: 400, borderRadius: 200, backgroundColor: 'rgba(45,212,191,0.05)', bottom: -80, right: -60 },
  orb3: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(124,110,250,0.05)', top: 200, right: 100 },
  mtn1: { position: 'absolute', bottom: 0, left: '8%',   width: 0, height: 0, borderLeftWidth: 280, borderRightWidth: 280, borderBottomWidth: 380, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'rgba(5,7,18,0.7)' },
  mtn2: { position: 'absolute', bottom: 0, left: '35%',  width: 0, height: 0, borderLeftWidth: 220, borderRightWidth: 220, borderBottomWidth: 300, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'rgba(7,9,20,0.75)' },
  mtn3: { position: 'absolute', bottom: 0, right: '5%',  width: 0, height: 0, borderLeftWidth: 340, borderRightWidth: 340, borderBottomWidth: 260, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'rgba(8,6,22,0.65)' },
});

// ── Shared ─────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg, ...(Platform.OS === 'web' ? { minHeight: '100vh' as any } : {}) },
  main: { flex: 1, overflow: 'hidden' as any },
});

// ── Web sidebar ────────────────────────────────────────────
const ws = StyleSheet.create({
  sidebar: { width: 200, backgroundColor: 'rgba(6,7,16,0.90)', borderRightWidth: 1, borderRightColor: C.line, paddingTop: Space['6'], paddingBottom: Space['5'], paddingHorizontal: Space['4'], flexShrink: 0, zIndex: 10 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Space['3'], marginBottom: Space['4'], paddingHorizontal: Space['1'] },
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
  stressBar: { marginBottom: Space['3'] },
  stressBarLabel: { fontSize: 8, color: C.textGhost, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Space['2'] },
  stressBarTrack: { height: 3, backgroundColor: C.elevated, borderRadius: 2, marginBottom: Space['1'] },
  stressBarFill: { height: 3, borderRadius: 2 },
  stressBarVal: { fontSize: 8, color: C.textGhost },
  sideFooter: { paddingHorizontal: Space['1'] },
  footTxt: { fontSize: 8, color: C.textGhost, marginBottom: Space['2'] },
  footBadge: { backgroundColor: C.violetDim, borderRadius: 4, paddingHorizontal: Space['2'], paddingVertical: 3, alignSelf: 'flex-start' as any },
  footBadgeTxt: { fontSize: 7, color: C.violetSoft, fontWeight: '600', letterSpacing: 0.3 },
});

// ── Mobile bottom nav ──────────────────────────────────────
const ms = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(6,7,16,0.97)',
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: Space['2'],
    paddingBottom: Platform.OS === 'ios' ? Space['1'] : Space['3'],
    paddingHorizontal: Space['2'],
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabIconWrap: { width: 36, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
  tabIconWrapActive: { backgroundColor: C.violetDim },
  tabIcon: { fontSize: 18 },
  tabLabel: { fontSize: 9, color: C.textGhost, fontWeight: '500', letterSpacing: 0.2 },
  tabLabelActive: { color: C.violetSoft, fontWeight: '700' },
});
