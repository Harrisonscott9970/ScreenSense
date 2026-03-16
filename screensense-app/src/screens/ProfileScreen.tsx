import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, ActivityIndicator,
} from 'react-native';

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';
const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.48)', SUB = 'rgba(238,240,255,0.22)',
      CARD = 'rgba(255,255,255,0.04)', BOR = 'rgba(255,255,255,0.08)';

interface ProfileScreenProps {
  userId: string;
  userName: string;
  userEmail: string;
  onLogout: () => void;
}

export default function ProfileScreen({ userId, userName, userEmail, onLogout }: ProfileScreenProps) {
  const [stats, setStats] = useState<any>(null);
  const [notifications, setNotifications] = useState(true);
  const [stressThreshold, setStressThreshold] = useState(6);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/insights/${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const initials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* Hero */}
      <View style={s.hero}>
        <View style={s.avatarWrap}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{initials}</Text></View>
          <View style={s.avatarGlow} />
        </View>
        <Text style={s.userName}>{userName}</Text>
        <Text style={s.userEmail}>{userEmail}</Text>
        {stats && (
          <View style={s.streakBadge}>
            <Text style={s.streakTxt}>🔥 {stats.streak_days} day streak</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      {loading ? <ActivityIndicator color={V} style={{ marginBottom: 20 }} /> : stats ? (
        <View style={s.statsGrid}>
          <StatTile label="Check-ins" value={String(stats.total_entries)} color={VL} />
          <StatTile label="Wellbeing" value={`${stats.wellbeing_score}`} color={G} />
          <StatTile label="Avg stress" value={`${Math.round(stats.avg_stress_score * 100)}`} color={R} />
          <StatTile label="Avg sleep" value={`${stats.avg_sleep}h`} color={C} />
        </View>
      ) : null}

      {/* Settings sections */}
      <Section label="Notifications">
        <SettingRow label="Daily check-in reminder" sub="Get nudged to check in each day">
          <Switch value={notifications} onValueChange={setNotifications} trackColor={{ true: V }} thumbColor="#fff" />
        </SettingRow>
        <SettingRow label="Stress threshold alerts" sub={`Alert when screen time exceeds ${stressThreshold}h`}>
          <View style={s.thresholdRow}>
            {[4, 5, 6, 7, 8].map(n => (
              <TouchableOpacity key={n} style={[s.thresholdBtn, stressThreshold === n && s.thresholdBtnOn]} onPress={() => setStressThreshold(n)}>
                <Text style={[s.thresholdTxt, stressThreshold === n && { color: TXT }]}>{n}h</Text>
              </TouchableOpacity>
            ))}
          </View>
        </SettingRow>
      </Section>

      <Section label="About ScreenSense">
        <InfoRow label="Version" value="1.0.0" />
        <InfoRow label="ML Model" value="Random Forest + LSTM" />
        <InfoRow label="Data storage" value="Local SQLite" />
        <InfoRow label="Dissertation" value="BSc Computer Science" />
        <InfoRow label="Author" value="Harrison Scott · 10805603" />
      </Section>

      <Section label="References">
        <View style={s.refCard}>
          {[
            'Russell (1980) — Circumplex Model of Affect',
            'Breiman (2001) — Random Forests',
            'Hochreiter & Schmidhuber (1997) — LSTM',
            'Kaplan (1995) — Attention Restoration Theory',
            'Ulrich (1984) — Stress Recovery Theory',
            'Fogg (2009) — Behaviour Model',
            'Hutto & Gilbert (2014) — VADER Sentiment',
            'Dey (2001) — Context-Aware Computing',
          ].map(ref => (
            <Text key={ref} style={s.refTxt}>· {ref}</Text>
          ))}
        </View>
      </Section>

      <Section label="Account">
        <TouchableOpacity style={s.logoutBtn} onPress={onLogout}>
          <Text style={s.logoutTxt}>Sign out</Text>
        </TouchableOpacity>
        <Text style={s.legalTxt}>Your data is stored locally and never shared. GDPR compliant.</Text>
      </Section>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={s.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.settingLabel}>{label}</Text>
        <Text style={s.settingSub}>{sub}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.statTile}>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 32, paddingBottom: 40, maxWidth: 700, alignSelf: 'center' as any, width: '100%' },

  hero: { alignItems: 'center', paddingTop: 44, paddingBottom: 28 },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(108,99,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(108,99,255,0.5)' },
  avatarTxt: { fontSize: 28, fontWeight: '800', color: VL },
  avatarGlow: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(108,99,255,0.12)', top: -10, left: -10 },
  userName: { fontSize: 24, fontWeight: '800', color: TXT, marginBottom: 4, letterSpacing: -0.3 },
  userEmail: { fontSize: 13, color: MUT, marginBottom: 10 },
  streakBadge: { backgroundColor: 'rgba(108,99,255,0.15)', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(108,99,255,0.3)' },
  streakTxt: { fontSize: 13, color: VL, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statTile: { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: BOR },
  statVal: { fontSize: 20, fontWeight: '800', lineHeight: 22, marginBottom: 3 },
  statLabel: { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.5 },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  sectionCard: { backgroundColor: CARD, borderRadius: 16, borderWidth: 0.5, borderColor: BOR, overflow: 'hidden' },

  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: BOR },
  settingLabel: { fontSize: 14, fontWeight: '500', color: TXT, marginBottom: 2 },
  settingSub: { fontSize: 11, color: MUT },
  thresholdRow: { flexDirection: 'row', gap: 4 },
  thresholdBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 0.5, borderColor: BOR },
  thresholdBtnOn: { backgroundColor: 'rgba(108,99,255,0.25)', borderColor: 'rgba(108,99,255,0.5)' },
  thresholdTxt: { fontSize: 12, color: MUT, fontWeight: '600' },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderBottomColor: BOR },
  infoLabel: { fontSize: 13, color: MUT },
  infoValue: { fontSize: 13, color: TXT, fontWeight: '500' },

  refCard: { padding: 14 },
  refTxt: { fontSize: 11, color: MUT, lineHeight: 22, fontStyle: 'italic' },

  logoutBtn: { margin: 14, backgroundColor: 'rgba(244,63,94,0.12)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)' },
  logoutTxt: { fontSize: 15, fontWeight: '700', color: '#F43F5E' },
  legalTxt: { fontSize: 11, color: SUB, textAlign: 'center', padding: 8, lineHeight: 18 },
});
