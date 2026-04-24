import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, ActivityIndicator, Alert, TextInput, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, Space, Radius, Font, Shadow } from '../utils/theme';
import { BASE_URL, DEFAULT_LOCAL_IP, setServerIp } from '../services/api';

interface Props {
  userId: string;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  onNavigate?: (screen: string) => void;
}

export default function ProfileScreen({ userId, userName, userEmail, onLogout, onNavigate }: Props) {
  const [stats, setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(6);
  const [notifications, setNotifications] = useState(true);
  const [serverIp, setServerIpState]   = useState(DEFAULT_LOCAL_IP);
  const [ipSaved, setIpSaved]          = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('ss_server_ip').then(v => { if (v) setServerIpState(v); });
  }, []);

  const handleSaveIp = async () => {
    await setServerIp(serverIp);
    setIpSaved(true);
    setTimeout(() => setIpSaved(false), 2000);
  };

  useEffect(() => {
    fetch(`${BASE_URL}/insights/${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setStats).catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const initials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  const handleDeleteData = async () => {
    const token = await AsyncStorage.getItem('ss_token').catch(() => null) || '';
    const doDelete = async () => {
      fetch(`${BASE_URL.replace('/api', '')}/auth/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).then(() => onLogout()).catch(() => {});
    };
    // Web uses window.confirm; native uses Alert
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete all your data? This cannot be undone.')) doDelete();
    } else {
      Alert.alert(
        'Delete all data',
        'This will permanently delete all your check-ins and account data. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleExport = () => {
    if (typeof window !== 'undefined') {
      window.open(`${BASE_URL}/export/${userId}/csv`, '_blank');
    }
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* Avatar */}
      <View style={s.hero}>
        <View style={s.avatarWrap}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{initials}</Text></View>
          <View style={s.avatarGlow} />
        </View>
        <Text style={s.name}>{userName}</Text>
        <Text style={s.email}>{userEmail}</Text>
        {stats && (
          <View style={s.streakBadge}>
            <Text style={s.streakTxt}>🔥 {stats.streak_days} day streak</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      {loading ? <ActivityIndicator color={C.violet} style={{ marginBottom: Space['5'] }} /> : stats ? (
        <View style={s.statsRow}>
          {[
            { label: 'Check-ins', value: String(stats.total_entries), color: C.violetSoft },
            { label: 'Wellbeing', value: `${stats.wellbeing_score}`, color: C.stressLow },
            { label: 'Avg stress', value: `${Math.round(stats.avg_stress_score * 100)}`, color: C.stressHigh },
            { label: 'Avg sleep', value: `${stats.avg_sleep}h`, color: C.teal },
          ].map(st => (
            <View key={st.label} style={s.statTile}>
              <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Settings */}
      <Section label="Notifications">
        <SettingRow label="Daily check-in reminder" sub="Get nudged to check in each day">
          <Switch value={notifications} onValueChange={setNotifications} trackColor={{ true: C.violet }} thumbColor="#fff" />
        </SettingRow>
        <SettingRow label="Screen time threshold" sub={`Alert when usage exceeds ${threshold}h`}>
          <View style={s.thresholdRow}>
            {[3, 4, 5, 6, 7, 8].map(n => (
              <TouchableOpacity key={n} style={[s.thresholdBtn, threshold === n && s.thresholdBtnOn]} onPress={() => setThreshold(n)}>
                <Text style={[s.thresholdTxt, threshold === n && { color: C.text }]}>{n}h</Text>
              </TouchableOpacity>
            ))}
          </View>
        </SettingRow>
      </Section>

      <Section label="Navigation">
        {[
          { label: '📅 Weekly report', screen: 'weekly', sub: 'Your 7-day summary' },
          { label: '🩺 Clinical assessments', screen: 'clinical', sub: 'PHQ-9 · GAD-7 · WHO-5' },
          { label: '📚 Therapy programmes', screen: 'programmes', sub: 'Structured journeys' },
          { label: '🌙 Sleep tracking', screen: 'sleep', sub: 'Rest & recovery' },
          { label: '🔒 Privacy policy', screen: 'privacy', sub: 'Data & GDPR' },
        ].map(item => (
          <TouchableOpacity key={item.screen} style={s.navRow} onPress={() => onNavigate?.(item.screen)}>
            <View style={{ flex: 1 }}>
              <Text style={s.navLabel}>{item.label}</Text>
              <Text style={s.navSub}>{item.sub}</Text>
            </View>
            <Text style={s.navArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </Section>

      {/* Server IP setting — mobile only */}
      {Platform.OS !== 'web' && (
        <Section label="Developer settings">
          <View style={s.ipRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.ipLabel}>Backend server IP</Text>
              <Text style={s.ipSub}>Run `ipconfig` → use your IPv4 address</Text>
            </View>
          </View>
          <View style={s.ipInputRow}>
            <TextInput
              style={s.ipInput}
              value={serverIp}
              onChangeText={setServerIpState}
              placeholder="e.g. 192.168.0.28"
              placeholderTextColor={C.textGhost}
              keyboardType="decimal-pad"
              autoCapitalize="none"
            />
            <TouchableOpacity style={[s.ipSaveBtn, ipSaved && { backgroundColor: C.stressLow }]} onPress={handleSaveIp}>
              <Text style={s.ipSaveTxt}>{ipSaved ? '✓ Saved' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </Section>
      )}

      <Section label="Your data">
        <TouchableOpacity style={s.dataBtn} onPress={handleExport}>
          <Text style={s.dataBtnTxt}>📥 Export all data as CSV</Text>
        </TouchableOpacity>
        <Text style={s.dataNote}>GDPR compliant — your data, your right</Text>
      </Section>

      <Section label="About">
        {[
          ['Version', '1.0.0'],
          ['ML models', 'RF + LSTM + BiLSTM'],
          ['Student ID', '10805603'],
          ['Institution', 'University of Plymouth'],
          ['Module', 'COMP3000 Computing Project'],
        ].map(([k, v]) => (
          <View key={k} style={s.infoRow}>
            <Text style={s.infoKey}>{k}</Text>
            <Text style={s.infoVal}>{v}</Text>
          </View>
        ))}
      </Section>

      <Section label="References">
        <View style={s.refsCard}>
          {[
            'Russell (1980) — Circumplex Model of Affect',
            'Breiman (2001) — Random Forests',
            'Hochreiter & Schmidhuber (1997) — LSTM',
            'Schuster & Paliwal (1997) — BiLSTM',
            'Kaplan (1995) — Attention Restoration Theory',
            'Ulrich (1984) — Stress Recovery Theory',
            'NICE (2022) — Stepped care model',
            'Hutto & Gilbert (2014) — VADER',
          ].map(r => <Text key={r} style={s.refTxt}>· {r}</Text>)}
        </View>
      </Section>

      <Section label="Account">
        <TouchableOpacity style={s.logoutBtn} onPress={onLogout}>
          <Text style={s.logoutTxt}>Sign out</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteData}>
          <Text style={s.deleteTxt}>Delete all my data</Text>
        </TouchableOpacity>
        <Text style={s.legalNote}>All data stored securely · Never shared · GDPR compliant</Text>
      </Section>

      <View style={{ height: 60 }} />
    </ScrollView>
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
const sec = StyleSheet.create({
  wrap: { marginBottom: Space['5'] },
  label: { fontSize: 11, fontWeight: '700', color: C.textGhost, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Space['3'] },
  card: { backgroundColor: C.card, borderRadius: Radius.lg, overflow: 'hidden' },
});
const sr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: Space['4'], borderBottomWidth: 1, borderBottomColor: C.line },
  label: { fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 2 },
  sub: { fontSize: 12, color: C.textDim },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: Space['6'], paddingBottom: Space['10'], maxWidth: 680, alignSelf: 'center' as any, width: '100%' },
  hero: { alignItems: 'center', paddingTop: Space['10'], paddingBottom: Space['6'] },
  avatarWrap: { position: 'relative', marginBottom: Space['4'] },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.violetDim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(124,110,250,0.4)' },
  avatarTxt: { fontSize: 28, fontWeight: '800', color: C.violetSoft },
  avatarGlow: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(124,110,250,0.12)', top: -10, left: -10 },
  name: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 4 },
  email: { fontSize: 13, color: C.textDim, marginBottom: Space['3'] },
  streakBadge: { backgroundColor: C.violetDim, borderRadius: Radius.full, paddingHorizontal: Space['4'], paddingVertical: Space['2'] },
  streakTxt: { fontSize: 13, color: C.violetSoft, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: Space['2'], marginBottom: Space['5'] },
  statTile: { flex: 1, backgroundColor: C.card, borderRadius: Radius.md, padding: Space['3'], alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800', lineHeight: 22, marginBottom: 2 },
  statLabel: { fontSize: 9, color: C.textGhost, textTransform: 'uppercase', letterSpacing: 0.5 },
  thresholdRow: { flexDirection: 'row', gap: 4 },
  thresholdBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: C.elevated },
  thresholdBtnOn: { backgroundColor: C.violetDim },
  thresholdTxt: { fontSize: 11, color: C.textDim, fontWeight: '600' },
  navRow: { flexDirection: 'row', alignItems: 'center', padding: Space['4'], borderBottomWidth: 1, borderBottomColor: C.line },
  navLabel: { fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 1 },
  navSub: { fontSize: 11, color: C.textDim },
  navArrow: { fontSize: 20, color: C.textGhost },
  dataBtn: { margin: Space['4'], backgroundColor: C.violetDim, borderRadius: Radius.md, padding: Space['4'], alignItems: 'center' },
  dataBtnTxt: { fontSize: 14, color: C.violetSoft, fontWeight: '600' },
  dataNote: { fontSize: 11, color: C.textGhost, textAlign: 'center', paddingBottom: Space['4'] },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Space['4'], borderBottomWidth: 1, borderBottomColor: C.line },
  infoKey: { fontSize: 13, color: C.textDim },
  infoVal: { fontSize: 13, color: C.text, fontWeight: '500' },
  refsCard: { padding: Space['4'] },
  refTxt: { fontSize: 11, color: C.textDim, lineHeight: 22, fontStyle: 'italic' },
  logoutBtn: { margin: Space['4'], marginBottom: Space['2'], backgroundColor: C.violetDim, borderRadius: Radius.md, padding: Space['4'], alignItems: 'center' },
  logoutTxt: { fontSize: 15, fontWeight: '700', color: C.violetSoft },
  deleteBtn: { marginHorizontal: Space['4'], marginBottom: Space['2'], backgroundColor: 'rgba(248,113,113,0.1)', borderRadius: Radius.md, padding: Space['4'], alignItems: 'center' },
  deleteTxt: { fontSize: 14, fontWeight: '600', color: C.danger },
  legalNote: { fontSize: 11, color: C.textGhost, textAlign: 'center', padding: Space['4'] },
  ipRow: { flexDirection: 'row', alignItems: 'center', padding: Space['4'], paddingBottom: Space['2'] },
  ipLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  ipSub: { fontSize: 11, color: C.textDim },
  ipInputRow: { flexDirection: 'row', alignItems: 'center', gap: Space['2'], paddingHorizontal: Space['4'], paddingBottom: Space['4'] },
  ipInput: { flex: 1, backgroundColor: C.elevated, borderRadius: Radius.md, paddingHorizontal: Space['4'], paddingVertical: Space['3'], color: C.text, fontSize: 14, fontFamily: 'monospace' as any },
  ipSaveBtn: { backgroundColor: C.violetDim, borderRadius: Radius.md, paddingHorizontal: Space['4'], paddingVertical: Space['3'] },
  ipSaveTxt: { fontSize: 13, color: C.violetSoft, fontWeight: '700' },
});
