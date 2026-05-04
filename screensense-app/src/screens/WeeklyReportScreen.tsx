import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Animated, Linking,
} from 'react-native';
import { BASE_URL } from '../services/api';

const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.55)', SUB = 'rgba(238,240,255,0.32)',
      CARD = 'rgba(255,255,255,0.05)', BOR = 'rgba(255,255,255,0.09)';

const MOOD_COL: Record<string, string> = {
  joyful: G, content: '#AED581', calm: C, energised: A,
  anxious: R, stressed: '#FF8A65', low: '#7E57C2', numb: '#78909C',
};

const MOOD_EMOJI: Record<string, string> = {
  joyful: '😄', content: '🙂', calm: '😌', energised: '⚡',
  anxious: '😰', stressed: '😤', low: '😔', numb: '😶',
};

interface WeeklyReportProps { userId: string; }

export default function WeeklyReportScreen({ userId }: WeeklyReportProps) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetch(`${BASE_URL}/weekly-report/${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setReport(d);
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const exportCSV = () => {
    Linking.openURL(`${BASE_URL}/export/${userId}/csv`).catch(() => {});
  };

  if (loading) return (
    <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={V} size="large" />
      <Text style={[s.muted, { marginTop: 12 }]}>Generating your weekly report…</Text>
    </View>
  );

  if (!report) return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.hero}>
          <Text style={s.heroH}>Weekly report</Text>
          <Text style={s.muted}>No check-ins this week yet. Complete at least one check-in to see your report.</Text>
        </View>
        <TouchableOpacity style={s.exportBtn} onPress={exportCSV}>
          <Text style={s.exportBtnTxt}>📥 Export all data as CSV</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  const trendColor = report.stress_trend === 'improving' ? G : report.stress_trend === 'worsening' ? R : A;
  const trendIcon  = report.stress_trend === 'improving' ? '↓' : report.stress_trend === 'worsening' ? '↑' : '→';
  const avgStressColor = report.avg_stress_score > 0.6 ? R : report.avg_stress_score > 0.35 ? A : G;

  // Mood frequency — sorted descending for the bar chart
  const moodEntries: [string, number][] = report.mood_counts
    ? Object.entries(report.mood_counts as Record<string, number>)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
    : [];
  const maxMoodCount = moodEntries.length > 0 ? moodEntries[0][1] as number : 1;

  // Screen-stress delta interpretation
  const delta = report.screen_stress_delta;
  const deltaText = delta != null
    ? delta > 0.05
      ? `High-screen days had ${Math.round(delta * 100)} pts more stress on average`
      : delta < -0.05
        ? `High-screen days actually had less stress this week`
        : 'No clear screen-stress link this week'
    : null;

  return (
    <Animated.ScrollView
      style={[s.root, { opacity: fadeAnim }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ── */}
      <View style={s.hero}>
        <Text style={s.heroGreet}>
          Week of {new Date(report.week_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
        </Text>
        <Text style={s.heroH}>Your weekly{'\n'}ScreenSense</Text>
        <Text style={s.muted}>
          {report.total_checkins} check-in{report.total_checkins !== 1 ? 's' : ''} · generated{' '}
          {new Date(report.generated_at).toLocaleDateString('en-GB')}
        </Text>
      </View>

      {/* ── AI narrative ── */}
      <View style={s.narrativeCard}>
        <View style={s.narrativeDot} />
        <Text style={s.narrativeTxt}>{report.narrative}</Text>
      </View>

      {/* ── Key stats ── */}
      <View style={s.statsGrid}>
        <StatCard label="Avg stress"  value={`${Math.round(report.avg_stress_score * 100)}`} sub="/ 100"            color={avgStressColor} />
        <StatCard label="Trend"       value={trendIcon}                                        sub={report.stress_trend} color={trendColor} />
        <StatCard label="Avg sleep"   value={`${report.avg_sleep_hours}h`}                     sub="per night"        color={C} />
        <StatCard label="Avg screen"  value={`${report.avg_screen_time}h`}                     sub="per day"          color={A} />
      </View>

      {/* ── Best / worst day ── */}
      <View style={s.dayRow}>
        <View style={[s.dayCard, { borderColor: G + '40', backgroundColor: G + '0a' }]}>
          <Text style={s.dayCardLabel}>✨ Best day</Text>
          <Text style={[s.dayCardDay, { color: G }]}>
            {new Date(report.best_day.date).toLocaleDateString('en-GB', { weekday: 'long' })}
          </Text>
          <Text style={s.dayCardMood}>{report.best_day.mood}</Text>
          <Text style={[s.dayCardScore, { color: G }]}>{Math.round(report.best_day.score * 100)}/100</Text>
        </View>
        <View style={[s.dayCard, { borderColor: R + '40', backgroundColor: R + '0a' }]}>
          <Text style={s.dayCardLabel}>⚠️ Hardest day</Text>
          <Text style={[s.dayCardDay, { color: R }]}>
            {new Date(report.worst_day.date).toLocaleDateString('en-GB', { weekday: 'long' })}
          </Text>
          <Text style={s.dayCardMood}>{report.worst_day.mood}</Text>
          <Text style={[s.dayCardScore, { color: R }]}>{Math.round(report.worst_day.score * 100)}/100</Text>
        </View>
      </View>

      {/* ── Daily stress chart ── */}
      <Text style={s.secLabel}>Stress across the week</Text>
      <View style={s.chartCard}>
        <View style={s.chartBars}>
          {report.daily_scores.map((d: any, i: number) => {
            const h   = Math.max(d.stress * 100, 4);
            const col = MOOD_COL[d.mood] || V;
            return (
              <View key={i} style={s.chartCol}>
                <View style={s.chartBarWrap}>
                  <View style={[s.chartBar, { height: `${h}%` as any, backgroundColor: col }]} />
                </View>
                <Text style={s.chartLbl}>
                  {new Date(d.date).toLocaleDateString('en-GB', { weekday: 'narrow' })}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Sleep trend card ── */}
      {report.sleep_trend && report.sleep_trend !== 'insufficient data' && (
        <>
          <Text style={s.secLabel}>Sleep this week</Text>
          <View style={[s.insightCard, {
            borderColor: report.sleep_trend === 'improving' ? G + '40' : report.sleep_trend === 'worsening' ? R + '40' : A + '40',
            backgroundColor: report.sleep_trend === 'improving' ? G + '0a' : report.sleep_trend === 'worsening' ? R + '0a' : A + '0a',
          }]}>
            <Text style={s.insightIcon}>
              {report.sleep_trend === 'improving' ? '🌙' : report.sleep_trend === 'worsening' ? '⚠️' : '😴'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.insightTitle, {
                color: report.sleep_trend === 'improving' ? G : report.sleep_trend === 'worsening' ? R : A,
              }]}>
                Sleep {report.sleep_trend}
              </Text>
              <Text style={s.insightSub}>
                Avg {report.avg_sleep_hours}h per night ·{' '}
                {report.sleep_trend === 'improving'
                  ? 'Your sleep improved across the week — keep it up.'
                  : report.sleep_trend === 'worsening'
                    ? 'Sleep quality dropped toward the end of the week. Consider a consistent bedtime.'
                    : 'Sleep was consistent this week.'}
              </Text>
            </View>
          </View>
        </>
      )}

      {/* ── Screen vs stress insight ── */}
      {deltaText && (
        <>
          <Text style={s.secLabel}>Screen time insight</Text>
          <View style={[s.insightCard, { borderColor: A + '40', backgroundColor: A + '08' }]}>
            <Text style={s.insightIcon}>📱</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.insightTitle, { color: A }]}>Screen vs stress</Text>
              <Text style={s.insightSub}>{deltaText}</Text>
            </View>
          </View>
        </>
      )}

      {/* ── Mood frequency breakdown ── */}
      {moodEntries.length > 0 && (
        <>
          <Text style={s.secLabel}>Mood breakdown</Text>
          <View style={s.moodCard}>
            {moodEntries.map(([mood, count]) => {
              const pct = Math.round(((count as number) / maxMoodCount) * 100);
              return (
                <View key={mood} style={s.moodRow}>
                  <Text style={s.moodEmoji}>{MOOD_EMOJI[mood] || '😐'}</Text>
                  <Text style={s.moodLabel}>{mood}</Text>
                  <View style={s.moodBarWrap}>
                    <View style={[s.moodBar, {
                      width: `${pct}%` as any,
                      backgroundColor: MOOD_COL[mood] || V,
                    }]} />
                  </View>
                  <Text style={[s.moodCount, { color: MOOD_COL[mood] || V }]}>{count as number}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── Export ── */}
      <Text style={s.secLabel}>Your data</Text>
      <TouchableOpacity style={s.exportBtn} onPress={exportCSV}>
        <Text style={s.exportBtnTxt}>📥 Export full history as CSV</Text>
      </TouchableOpacity>
      <Text style={s.exportNote}>
        Your data is yours. Export includes all check-ins, stress scores, moods, and AI outputs. GDPR compliant.
      </Text>

      <View style={{ height: 60 }} />
    </Animated.ScrollView>
  );
}

function StatCard({ label, value, sub, color }: any) {
  return (
    <View style={sc.card}>
      <Text style={sc.lbl}>{label}</Text>
      <Text style={[sc.val, { color }]}>{value}</Text>
      <Text style={sc.sub}>{sub}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card: { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: BOR },
  lbl:  { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  val:  { fontSize: 22, fontWeight: '800', lineHeight: 24, marginBottom: 2 },
  sub:  { fontSize: 9, color: MUT, textAlign: 'center' },
});

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: 'transparent' },
  content:       { paddingHorizontal: 28, paddingBottom: 40, maxWidth: 680, alignSelf: 'center' as any, width: '100%' },
  muted:         { fontSize: 13, color: MUT, lineHeight: 20, textAlign: 'center' },
  hero:          { paddingTop: 40, paddingBottom: 20 },
  heroGreet:     { fontSize: 11, color: SUB, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  heroH:         { fontSize: 36, fontWeight: '800', color: TXT, letterSpacing: -1, marginBottom: 6, lineHeight: 40 },
  narrativeCard: { backgroundColor: 'rgba(79,195,247,0.07)', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(79,195,247,0.2)', flexDirection: 'row', gap: 10 },
  narrativeDot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: C, marginTop: 6, flexShrink: 0 },
  narrativeTxt:  { fontSize: 14, color: TXT, lineHeight: 24, flex: 1 },
  statsGrid:     { flexDirection: 'row', gap: 8, marginBottom: 16 },
  dayRow:        { flexDirection: 'row', gap: 10, marginBottom: 20 },
  dayCard:       { flex: 1, borderRadius: 14, padding: 14, borderWidth: 1 },
  dayCardLabel:  { fontSize: 10, color: MUT, marginBottom: 6 },
  dayCardDay:    { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  dayCardMood:   { fontSize: 11, color: MUT, marginBottom: 6, textTransform: 'capitalize' },
  dayCardScore:  { fontSize: 20, fontWeight: '900' },
  secLabel:      { fontSize: 11, fontWeight: '700', color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  chartCard:     { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 0.5, borderColor: BOR },
  chartBars:     { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 6 },
  chartCol:      { flex: 1, alignItems: 'center' },
  chartBarWrap:  { flex: 1, width: '100%', justifyContent: 'flex-end', marginBottom: 4 },
  chartBar:      { width: '100%', borderRadius: 3, minHeight: 3 },
  chartLbl:      { fontSize: 9, color: SUB },
  insightCard:   { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, gap: 10 },
  insightIcon:   { fontSize: 20, marginTop: 1 },
  insightTitle:  { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  insightSub:    { fontSize: 12, color: MUT, lineHeight: 18 },
  moodCard:      { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 0.5, borderColor: BOR, gap: 10 },
  moodRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moodEmoji:     { fontSize: 15, width: 22 },
  moodLabel:     { fontSize: 11, color: MUT, width: 68, textTransform: 'capitalize' },
  moodBarWrap:   { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3 },
  moodBar:       { height: 6, borderRadius: 3, minWidth: 4 },
  moodCount:     { fontSize: 11, fontWeight: '700', width: 20, textAlign: 'right' },
  exportBtn:     { backgroundColor: 'rgba(108,99,255,0.12)', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(108,99,255,0.25)', marginBottom: 8 },
  exportBtnTxt:  { fontSize: 14, color: VL, fontWeight: '700' },
  exportNote:    { fontSize: 11, color: SUB, textAlign: 'center', lineHeight: 17, marginBottom: 8 },
});
