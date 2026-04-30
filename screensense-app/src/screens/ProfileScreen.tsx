import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Switch, TextInput,
  ActivityIndicator, Alert, Platform, Animated, Linking, Image,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, Space, Radius } from '../utils/theme';
import { BASE_URL } from '../services/api';
import { setupNotifications, scheduleWeeklyReport, cancelWeeklyReport } from '../utils/notifications';
import { AnimatedPress } from '../components/AnimatedPress';

// Lazy-load image picker so web doesn't crash if it's absent
let ImagePicker: any = null;
try { ImagePicker = require('expo-image-picker'); } catch {}

// ── Fade-in helper ────────────────────────────────────────────────────────────
function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 420, delay, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}

interface Props {
  userId: string;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  onNavigate?: (screen: string) => void;
}

export default function ProfileScreen({ userId, userName, userEmail, onLogout, onNavigate }: Props) {
  const [stats, setStats]                 = useState<any>(null);
  const [loading, setLoading]             = useState(true);
  const [threshold, setThreshold]         = useState(6);
  const [notifications, setNotifications] = useState(false);
  const [screenGoal, setScreenGoal]       = useState(4);
  const [breathingSessions, setBreathingSessions] = useState(0);

  // ── New profile fields ────────────────────────────────────────
  const [nickname, setNickname]         = useState('');
  const [editingNick, setEditingNick]   = useState(false);
  const [nickDraft, setNickDraft]       = useState('');
  const [profilePic, setProfilePic]     = useState<string | null>(null);

  // ── Change password ───────────────────────────────────────────
  const [pwOpen, setPwOpen]             = useState(false);
  const [currentPw, setCurrentPw]       = useState('');
  const [newPw, setNewPw]               = useState('');
  const [confirmPw, setConfirmPw]       = useState('');
  const [pwLoading, setPwLoading]       = useState(false);
  const [pwMsg, setPwMsg]               = useState<{ text: string; ok: boolean } | null>(null);

  // ── Load persisted preferences ────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem('ss_screen_goal').then(v => { if (v) setScreenGoal(parseInt(v, 10)); });
    AsyncStorage.getItem('ss_notifications').then(v => { if (v === 'true') setNotifications(true); });
    AsyncStorage.getItem('ss_threshold').then(v => { if (v) setThreshold(parseInt(v, 10)); });
    AsyncStorage.getItem('ss_breathing_sessions').then(v => {
      if (v) { try { setBreathingSessions(JSON.parse(v).length); } catch {} }
    });
    AsyncStorage.getItem('ss_nickname').then(v => { if (v) setNickname(v); });
    AsyncStorage.getItem('ss_profile_pic').then(v => { if (v) setProfilePic(v); });
  }, []);

  useEffect(() => {
    fetch(`${BASE_URL}/insights/${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setStats).catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const displayName = nickname || userName;
  const initials    = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  // ── Profile picture ───────────────────────────────────────────
  const pickImage = async () => {
    if (!ImagePicker) return;
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Allow photo library access to set a profile picture.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        // Store as data URI so it's fully self-contained (no path dependency)
        const uri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setProfilePic(uri);
        await AsyncStorage.setItem('ss_profile_pic', uri);
      }
    } catch (e) {
      // Silently ignore — not critical
    }
  };

  const removePhoto = async () => {
    setProfilePic(null);
    await AsyncStorage.removeItem('ss_profile_pic');
  };

  // ── Nickname ──────────────────────────────────────────────────
  const startEditNick = () => { setNickDraft(nickname); setEditingNick(true); };
  const saveNick = async () => {
    const trimmed = nickDraft.trim();
    setNickname(trimmed);
    setEditingNick(false);
    if (trimmed) {
      await AsyncStorage.setItem('ss_nickname', trimmed);
    } else {
      await AsyncStorage.removeItem('ss_nickname');
    }
  };
  const cancelNick = () => setEditingNick(false);

  // ── Change password ───────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!currentPw) { setPwMsg({ text: 'Enter your current password.', ok: false }); return; }
    if (newPw.length < 6) { setPwMsg({ text: 'New password must be at least 6 characters.', ok: false }); return; }
    if (newPw !== confirmPw) { setPwMsg({ text: 'New passwords do not match.', ok: false }); return; }
    setPwLoading(true); setPwMsg(null);
    try {
      const token = await AsyncStorage.getItem('ss_token').catch(() => null) || '';
      const res = await fetch(`${BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, current_password: currentPw, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to change password');
      setPwMsg({ text: '✓ Password updated successfully.', ok: true });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwOpen(false), 1500);
    } catch (e: any) {
      setPwMsg({ text: e.message || 'Something went wrong.', ok: false });
    } finally {
      setPwLoading(false);
    }
  };

  // ── Delete account ────────────────────────────────────────────
  const handleDeleteData = async () => {
    const token = await AsyncStorage.getItem('ss_token').catch(() => null) || '';
    const doDelete = async () => {
      fetch(`${BASE_URL}/auth/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).then(() => onLogout()).catch(() => {});
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete all your data? This cannot be undone.')) doDelete();
    } else {
      Alert.alert(
        'Delete all data',
        'This will permanently delete all your check-ins and account data. This cannot be undone.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: doDelete }]
      );
    }
  };

  const handleExport = () => {
    const url = `${BASE_URL}/export/${userId}/csv`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Export', `Could not open browser. Visit:\n${url}`)
    );
  };

  const handleNotificationsToggle = async (value: boolean) => {
    setNotifications(value);
    await AsyncStorage.setItem('ss_notifications', value ? 'true' : 'false');
    if (value) {
      const granted = await setupNotifications();
      if (granted) {
        await scheduleWeeklyReport();
      } else {
        setNotifications(false);
        await AsyncStorage.setItem('ss_notifications', 'false');
        Alert.alert('Notifications', 'Permission denied. Please enable notifications in your device settings.');
      }
    } else {
      await cancelWeeklyReport();
    }
  };

  const handleGoalChange = async (n: number) => {
    setScreenGoal(n);
    await AsyncStorage.setItem('ss_screen_goal', n.toString());
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* ── Hero / avatar ── */}
      <FadeIn delay={0}>
        <View style={s.hero}>
          {/* Avatar — tap to pick photo */}
          <TouchableOpacity style={s.avatarWrap} onPress={pickImage} activeOpacity={0.8}>
            {profilePic ? (
              <Image source={{ uri: profilePic }} style={s.avatarImg} />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarTxt}>{initials}</Text>
              </View>
            )}
            <View style={s.avatarGlow} />
            {/* Camera badge */}
            <View style={s.cameraBadge}>
              <Text style={s.cameraBadgeTxt}>📷</Text>
            </View>
          </TouchableOpacity>

          {/* Remove photo link */}
          {profilePic && (
            <TouchableOpacity onPress={removePhoto} style={s.removePhotoBtn}>
              <Text style={s.removePhotoTxt}>Remove photo</Text>
            </TouchableOpacity>
          )}

          {/* Display name + nickname editing */}
          {editingNick ? (
            <View style={s.nickEditRow}>
              <TextInput
                style={s.nickInput}
                value={nickDraft}
                onChangeText={setNickDraft}
                placeholder={userName}
                placeholderTextColor={C.textGhost}
                autoFocus
                maxLength={32}
                returnKeyType="done"
                onSubmitEditing={saveNick}
              />
              <TouchableOpacity style={s.nickSaveBtn} onPress={saveNick}>
                <Text style={s.nickSaveTxt}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.nickCancelBtn} onPress={cancelNick}>
                <Text style={s.nickCancelTxt}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.nameRow} onPress={startEditNick} activeOpacity={0.7}>
              <Text style={s.name}>{displayName}</Text>
              <Text style={s.editPencil}> ✏️</Text>
            </TouchableOpacity>
          )}

          {nickname ? (
            <Text style={s.realName}>{userName}</Text>
          ) : null}
          <Text style={s.email}>{userEmail}</Text>

          {stats && (
            <View style={s.streakBadge}>
              <Text style={s.streakTxt}>🔥 {stats.streak_days} day streak</Text>
            </View>
          )}
        </View>
      </FadeIn>

      {/* ── Stats ── */}
      <FadeIn delay={100}>
        {loading
          ? <ActivityIndicator color={C.violet} style={{ marginBottom: Space['5'] }} />
          : stats ? (
          <View style={s.statsRow}>
            {[
              { label: 'Check-ins', value: String(stats.total_entries),                        color: C.violetSoft },
              { label: 'Wellbeing', value: `${stats.wellbeing_score}`,                          color: C.stressLow },
              { label: 'Avg stress', value: `${Math.round(stats.avg_stress_score * 100)}`,      color: C.stressHigh },
              { label: 'Breathing', value: String(breathingSessions),                           color: C.teal },
            ].map(st => (
              <View key={st.label} style={s.statTile}>
                <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </FadeIn>

      {/* ── Account settings ── */}
      <FadeIn delay={150}>
        <Section label="Account settings">

          {/* Change password — expandable */}
          <AnimatedPress
            style={[s.pwToggleRow, pwOpen && { borderBottomWidth: 0 }]}
            onPress={() => { setPwOpen(v => !v); setPwMsg(null); }}
            scale={0.98}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>🔑 Change password</Text>
              <Text style={s.settingSub}>Update your sign-in password</Text>
            </View>
            <Text style={[s.navArrow, { transform: [{ rotate: pwOpen ? '90deg' : '0deg' }] }]}>›</Text>
          </AnimatedPress>

          {pwOpen && (
            <View style={s.pwForm}>
              <PwField label="Current password"  value={currentPw} onChange={setCurrentPw} />
              <PwField label="New password"       value={newPw}     onChange={setNewPw} />
              <PwField label="Confirm new password" value={confirmPw} onChange={setConfirmPw} />
              {pwMsg && (
                <Text style={[s.pwMsg, { color: pwMsg.ok ? C.teal : C.danger }]}>{pwMsg.text}</Text>
              )}
              <AnimatedPress
                style={[s.pwSaveBtn, pwLoading && { opacity: 0.5 }]}
                onPress={handleChangePassword}
                disabled={pwLoading}
                scale={0.96}
              >
                {pwLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.pwSaveTxt}>Update password</Text>
                }
              </AnimatedPress>
            </View>
          )}

          {/* Nickname row */}
          <View style={[s.settingRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>😊 Nickname</Text>
              <Text style={s.settingSub}>
                {nickname ? `Showing as "${nickname}"` : 'Tap your name at the top to set one'}
              </Text>
            </View>
            {nickname ? (
              <TouchableOpacity onPress={startEditNick}>
                <Text style={s.editLinkTxt}>Edit</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={startEditNick}>
                <Text style={s.editLinkTxt}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
        </Section>
      </FadeIn>

      {/* ── Notifications ── */}
      <FadeIn delay={200}>
        <Section label="Notifications">
          <SettingRow label="Weekly report reminder" sub="Sunday 8pm — review your 7-day summary">
            <Switch
              value={notifications}
              onValueChange={handleNotificationsToggle}
              trackColor={{ true: C.violet }}
              thumbColor="#fff"
            />
          </SettingRow>
          <SettingRow label="Screen time threshold" sub={`Alert when usage exceeds ${threshold}h`}>
            <View style={s.chipRow}>
              {[3, 4, 5, 6, 7, 8].map(n => (
                <AnimatedPress
                  key={n}
                  style={[s.chip, threshold === n && s.chipOn]}
                  onPress={() => { setThreshold(n); AsyncStorage.setItem('ss_threshold', n.toString()).catch(() => {}); }}
                  scale={0.88}
                >
                  <Text style={[s.chipTxt, threshold === n && { color: C.text }]}>{n}h</Text>
                </AnimatedPress>
              ))}
            </View>
          </SettingRow>
        </Section>
      </FadeIn>

      {/* ── Screen time goal ── */}
      <FadeIn delay={240}>
        <Section label="Daily screen time goal">
          <View style={s.goalWrap}>
            <Text style={s.goalDesc}>
              Set your daily screen time target. ScreenSense uses this to personalise stress predictions and nudges.
            </Text>
            <View style={s.chipRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                <AnimatedPress
                  key={n}
                  style={[s.chip, screenGoal === n && s.goalChipOn]}
                  onPress={() => handleGoalChange(n)}
                  scale={0.88}
                >
                  <Text style={[s.chipTxt, screenGoal === n && { color: C.text }]}>{n}h</Text>
                </AnimatedPress>
              ))}
            </View>
            <Text style={s.goalHint}>WHO recommends ≤ 2h recreational screen time · UK avg is 6.4h</Text>
          </View>
        </Section>
      </FadeIn>

      {/* ── Navigation ── */}
      <FadeIn delay={280}>
        <Section label="Navigation">
          {[
            { label: '📅 Weekly report',        screen: 'weekly',     sub: 'Your 7-day summary' },
            { label: '🩺 Clinical assessments', screen: 'clinical',   sub: 'PHQ-9 · GAD-7 · WHO-5' },
            { label: '📚 Therapy programmes',   screen: 'programmes', sub: 'Structured journeys' },
            { label: '🌙 Sleep tracking',        screen: 'sleep',      sub: 'Rest & recovery' },
            { label: '🔒 Privacy policy',        screen: 'privacy',    sub: 'Data & GDPR' },
          ].map(item => (
            <AnimatedPress key={item.screen} style={s.navRow} onPress={() => onNavigate?.(item.screen)} scale={0.97}>
              <View style={{ flex: 1 }}>
                <Text style={s.navLabel}>{item.label}</Text>
                <Text style={s.navSub}>{item.sub}</Text>
              </View>
              <Text style={s.navArrow}>›</Text>
            </AnimatedPress>
          ))}
        </Section>
      </FadeIn>

      {/* ── Your data ── */}
      <FadeIn delay={320}>
        <Section label="Your data">
          <AnimatedPress style={s.dataBtn} onPress={handleExport} scale={0.97}>
            <Text style={s.dataBtnTxt}>📥 Export all data as CSV</Text>
          </AnimatedPress>
          <Text style={s.dataNote}>GDPR compliant — your data, your right</Text>
        </Section>
      </FadeIn>

      {/* ── Sign out / delete ── */}
      <FadeIn delay={380}>
        <Section label="Account">
          <AnimatedPress style={s.logoutBtn} onPress={onLogout} scale={0.97}>
            <Text style={s.logoutTxt}>Sign out</Text>
          </AnimatedPress>
          <AnimatedPress style={s.deleteBtn} onPress={handleDeleteData} scale={0.97}>
            <Text style={s.deleteTxt}>Delete all my data</Text>
          </AnimatedPress>
          <Text style={s.legalNote}>All data stored securely · Never shared · GDPR compliant</Text>
        </Section>
      </FadeIn>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PwField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={pw.wrap}>
      <Text style={pw.label}>{label}</Text>
      <TextInput
        style={pw.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={C.textGhost}
        placeholder="••••••••"
      />
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={sec.wrap}>
      <Text style={sec.label}>{label}</Text>
      <View style={sec.card}>{children}</View>
    </View>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={sr.row}>
      <View style={{ flex: 1 }}>
        <Text style={sr.label}>{label}</Text>
        <Text style={sr.sub}>{sub}</Text>
      </View>
      {children}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pw = StyleSheet.create({
  wrap:  { marginBottom: Space['3'] },
  label: { fontSize: 11, fontWeight: '600', color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Space['2'] },
  input: { backgroundColor: C.elevated, borderRadius: Radius.md, padding: Space['3'], color: C.text, fontSize: 14 },
});

const sec = StyleSheet.create({
  wrap:  { marginBottom: Space['5'] },
  label: { fontSize: 11, fontWeight: '700', color: C.textGhost, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Space['3'] },
  card:  { backgroundColor: C.card, borderRadius: Radius.lg, overflow: 'hidden' },
});

const sr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', padding: Space['4'], borderBottomWidth: 1, borderBottomColor: C.line },
  label: { fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 2 },
  sub:   { fontSize: 12, color: C.textDim },
});

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: Space['6'], paddingBottom: Space['10'], maxWidth: 680, alignSelf: 'center' as any, width: '100%' },

  // Hero
  hero:        { alignItems: 'center', paddingTop: Space['10'], paddingBottom: Space['6'] },
  avatarWrap:  { position: 'relative', marginBottom: Space['2'] },
  avatar:      { width: 88, height: 88, borderRadius: 44, backgroundColor: C.violetDim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(124,110,250,0.4)' },
  avatarImg:   { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: 'rgba(124,110,250,0.5)' },
  avatarTxt:   { fontSize: 30, fontWeight: '800', color: C.violetSoft },
  avatarGlow:  { position: 'absolute', width: 108, height: 108, borderRadius: 54, backgroundColor: 'rgba(124,110,250,0.12)', top: -10, left: -10, pointerEvents: 'none' as any },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: C.violet, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.card },
  cameraBadgeTxt: { fontSize: 12, lineHeight: 14 },

  removePhotoBtn: { marginTop: 2, marginBottom: Space['2'] },
  removePhotoTxt: { fontSize: 11, color: C.danger, textDecorationLine: 'underline' },

  nameRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 2, marginTop: Space['3'] },
  name:       { fontSize: 24, fontWeight: '800', color: C.text },
  editPencil: { fontSize: 14, color: C.textGhost },
  realName:   { fontSize: 12, color: C.textGhost, marginBottom: 2 },
  email:      { fontSize: 13, color: C.textDim, marginBottom: Space['3'] },
  streakBadge:{ backgroundColor: C.violetDim, borderRadius: Radius.full, paddingHorizontal: Space['4'], paddingVertical: Space['2'] },
  streakTxt:  { fontSize: 13, color: C.violetSoft, fontWeight: '600' },

  nickEditRow: { flexDirection: 'row', alignItems: 'center', gap: Space['2'], marginTop: Space['3'], marginBottom: Space['2'] },
  nickInput:   { flex: 1, backgroundColor: C.elevated, borderRadius: Radius.md, paddingHorizontal: Space['3'], paddingVertical: Space['2'], color: C.text, fontSize: 18, fontWeight: '700', maxWidth: 240 },
  nickSaveBtn: { backgroundColor: C.violet, borderRadius: Radius.md, paddingHorizontal: Space['4'], paddingVertical: Space['2'] },
  nickSaveTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  nickCancelBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  nickCancelTxt: { color: C.textGhost, fontSize: 14 },

  // Stats
  statsRow:  { flexDirection: 'row', gap: Space['2'], marginBottom: Space['5'] },
  statTile:  { flex: 1, backgroundColor: C.card, borderRadius: Radius.md, padding: Space['3'], alignItems: 'center' },
  statVal:   { fontSize: 20, fontWeight: '800', lineHeight: 22, marginBottom: 2 },
  statLabel: { fontSize: 9, color: C.textGhost, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Chips
  chipRow:    { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  chip:       { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: C.elevated },
  chipOn:     { backgroundColor: C.violetDim },
  chipTxt:    { fontSize: 11, color: C.textDim, fontWeight: '600' },
  goalChipOn: { backgroundColor: (C.teal + '40') as any },

  // Account settings section
  pwToggleRow: { flexDirection: 'row', alignItems: 'center', padding: Space['4'], borderBottomWidth: 1, borderBottomColor: C.line },
  settingRow:  { flexDirection: 'row', alignItems: 'center', padding: Space['4'], borderTopWidth: 1, borderTopColor: C.line },
  settingLabel:{ fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 2 },
  settingSub:  { fontSize: 12, color: C.textDim },
  editLinkTxt: { fontSize: 13, color: C.violetSoft, fontWeight: '600' },

  // Password form
  pwForm:    { padding: Space['4'], backgroundColor: C.elevated, borderTopWidth: 1, borderTopColor: C.line },
  pwMsg:     { fontSize: 13, marginBottom: Space['3'], fontWeight: '500' },
  pwSaveBtn: { backgroundColor: C.violet, borderRadius: Radius.md, padding: Space['4'], alignItems: 'center', marginTop: Space['2'] },
  pwSaveTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Goal
  goalWrap: { padding: Space['4'] },
  goalDesc: { fontSize: 12, color: C.textDim, lineHeight: 18, marginBottom: Space['3'] },
  goalHint: { fontSize: 11, color: C.textGhost, marginTop: Space['3'], lineHeight: 16 },

  // Nav
  navRow:   { flexDirection: 'row', alignItems: 'center', padding: Space['4'], borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: 'transparent' },
  navLabel: { fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 1 },
  navSub:   { fontSize: 11, color: C.textDim },
  navArrow: { fontSize: 20, color: C.textGhost },

  // Data
  dataBtn:    { margin: Space['4'], backgroundColor: C.violetDim, borderRadius: Radius.md, padding: Space['4'], alignItems: 'center' },
  dataBtnTxt: { fontSize: 14, color: C.violetSoft, fontWeight: '600' },
  dataNote:   { fontSize: 11, color: C.textGhost, textAlign: 'center', paddingBottom: Space['4'] },

  // Sign out / delete
  logoutBtn:  { margin: Space['4'], marginBottom: Space['2'], backgroundColor: C.violetDim, borderRadius: Radius.md, padding: Space['4'], alignItems: 'center' },
  logoutTxt:  { fontSize: 15, fontWeight: '700', color: C.violetSoft },
  deleteBtn:  { marginHorizontal: Space['4'], marginBottom: Space['2'], backgroundColor: 'rgba(248,113,113,0.1)', borderRadius: Radius.md, padding: Space['4'], alignItems: 'center' },
  deleteTxt:  { fontSize: 14, fontWeight: '600', color: C.danger },
  legalNote:  { fontSize: 11, color: C.textGhost, textAlign: 'center', padding: Space['4'] },
});
