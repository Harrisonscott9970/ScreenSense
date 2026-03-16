import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Dimensions, RefreshControl,
} from 'react-native';

const { width } = Dimensions.get('window');
const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';
const USER = 'user_001';

const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.48)', SUB = 'rgba(238,240,255,0.22)',
      CARD = 'rgba(255,255,255,0.04)', BOR = 'rgba(255,255,255,0.08)';

const MOOD_COL: Record<string, string> = {
  joyful: G, content: '#AED581', calm: C, energised: A,
  anxious: R, stressed: '#FF8A65', low: '#7E57C2', numb: '#78909C',
};

const MOOD_EMO: Record<string, string> = {
  joyful: '😄', content: '🙂', calm: '😌', energised: '⚡',
  anxious: '😰', stressed: '😤', low: '😔', numb: '😶',
};

export default function InsightsScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'ml' | 'lstm'>('overview');

  const load = useCallback(async () => {
    try {
      const [ins, ml] = await Promise.all([
        fetch(`${BASE}/insights/${USER}`).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}/ml/evaluate`).then(r => r.ok ? r.json() : null),
      ]);
      setData({ ins, ml });
    } catch { setData(null); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) return (
    <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={V} size="large" />
      <Text style={[s.muted, { marginTop: 12 }]}>Loading your patterns…</Text>
    </View>
  );

  const ins = data?.ins;
  const ml = data?.ml;

  if (!ins) return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.heroH}>Insights</Text>
      <View style={s.emptyCard}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
        <Text style={s.emptyTitle}>No data yet</Text>
        <Text style={s.muted}>Complete a few check-ins to unlock your pattern insights and AI analysis.</Text>
      </View>
      {ml && <MLTab ml={ml} />}
    </ScrollView>
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={V} />}
    >
      <View style={s.hero}>
        <Text style={s.heroGreet}>Your wellbeing</Text>
        <Text style={s.heroH}>Patterns & insights</Text>
        <Text style={s.muted}>Based on {ins.total_entries} check-ins · pull to refresh</Text>
      </View>

      {/* Tab switcher */}
      <View style={s.tabs}>
        {(['overview', 'ml', 'lstm'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabOn]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>
              {t === 'overview' ? 'Overview' : t === 'ml' ? 'ML Report' : 'LSTM'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'overview' && <OverviewTab ins={ins} />}
      {tab === 'ml'       && <MLTab ml={ml} />}
      {tab === 'lstm'     && <LSTMTab ins={ins} />}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ── OVERVIEW TAB ────────────────────────────────────────────────
function OverviewTab({ ins }: { ins: any }) {
  return (
    <>
      {/* Wellbeing score + baseline */}
      <View style={s.wellCard}>
        <View style={s.wellLeft}>
          <Text style={s.wellLabel}>Wellbeing score</Text>
          <Text style={[s.wellScore, { color: scoreColor(ins.wellbeing_score) }]}>
            {ins.wellbeing_score}
          </Text>
          <Text style={s.wellSub}>/ 100 · based on your entries</Text>
        </View>
        <View style={s.wellRight}>
          <BaselineChip delta={ins.baseline_delta_pct} />
          <Text style={s.streakTxt}>🔥 {ins.streak_days} day streak</Text>
        </View>
      </View>

      {/* Stat grid */}
      <View style={s.statGrid}>
        <StatCard label="Check-ins" value={String(ins.total_entries)} delta="total" color={VL} />
        <StatCard label="Avg stress" value={`${Math.round(ins.avg_stress_score * 100)}`} delta="/ 100" color={R} />
        <StatCard label="Avg screen" value={`${ins.avg_screen_time}h`} delta="per day" color={A} />
        <StatCard label="Avg sleep" value={`${ins.avg_sleep}h`} delta="per night" color={C} />
      </View>

      {/* Mood calendar */}
      <SectionHead text="Mood calendar — last 28 days" />
      <MoodCalendar moodByDay={ins.mood_by_day} />

      {/* Mood frequency */}
      <SectionHead text="Mood frequency" />
      <MoodFrequency freq={ins.mood_frequency} total={ins.total_entries} />

      {/* Pattern summary */}
      <SectionHead text="AI pattern insight" />
      <View style={s.patternCard}>
        <View style={s.patternDot} />
        <Text style={s.patternTxt}>{ins.pattern_summary}</Text>
      </View>

      {/* Screen vs stress */}
      <SectionHead text="Screen time vs stress" />
      <ScatterPlot data={ins.screen_vs_stress} />

      {/* Sentiment trend */}
      {ins.sentiment_trend?.length > 0 && (
        <>
          <SectionHead text="Journal sentiment trend (VADER)" />
          <SentimentChart data={ins.sentiment_trend} />
        </>
      )}
    </>
  );
}

// ── ML TAB ──────────────────────────────────────────────────────
function MLTab({ ml }: { ml: any }) {
  if (!ml) return (
    <View style={s.emptyCard}>
      <Text style={s.muted}>ML evaluation not available. Run: python -m app.ml.train</Text>
    </View>
  );
  return (
    <>
      <SectionHead text="Model performance" />
      <View style={s.statGrid}>
        <StatCard label="Accuracy" value={`${Math.round(ml.accuracy * 100)}%`} delta="test set" color={G} />
        <StatCard label="F1 weighted" value={`${Math.round(ml.f1_weighted * 100)}%`} delta="weighted" color={VL} />
        <StatCard label="Training n" value={String(ml.training_samples)} delta="samples" color={C} />
        <StatCard label="Model" value="RF" delta="n=200 trees" color={A} />
      </View>

      <SectionHead text="Feature importances" />
      {Object.entries(ml.feature_importances as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .map(([feat, imp]) => (
          <FeatureBar key={feat} name={feat.replace(/_/g, ' ')} value={imp as number} />
        ))}

      <SectionHead text="Confusion matrix" />
      <ConfusionMatrix matrix={ml.confusion_matrix} />

      <View style={s.citeCard}>
        <Text style={s.citeLabel}>Cite as</Text>
        <Text style={s.citeTxt}>Breiman, L. (2001). Random Forests. Machine Learning, 45, 5–32.{'\n'}Hutto, C. & Gilbert, E. (2014). VADER. ICWSM.</Text>
      </View>
    </>
  );
}

// ── LSTM TAB ────────────────────────────────────────────────────
function LSTMTab({ ins }: { ins: any }) {
  const pred = ins?.lstm_prediction;
  return (
    <>
      <SectionHead text="LSTM longitudinal mood predictor" />

      {!pred ? (
        <View style={s.emptyCard}>
          <Text style={{ fontSize: 32, marginBottom: 10 }}>🧠</Text>
          <Text style={s.emptyTitle}>Need {7 - (ins?.total_entries || 0)} more check-ins</Text>
          <Text style={s.muted}>The LSTM model learns your personal mood patterns over time. It needs at least 7 entries to make a prediction.</Text>
          <View style={s.lstmInfoCard}>
            <Text style={s.lstmInfoTitle}>How the LSTM works</Text>
            <Text style={s.lstmInfoTxt}>The model takes your last 7 check-ins as a sequence and predicts your next mood valence. Unlike the Random Forest (which treats each check-in independently), the LSTM learns temporal dependencies — "after 3 high-stress days, anxiety typically follows."</Text>
            <Text style={[s.lstmInfoTxt, { marginTop: 6, color: VL }]}>Cite: Hochreiter & Schmidhuber (1997). LSTM. Neural Computation.</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={s.lstmPredCard}>
            <View style={s.lstmPredTop}>
              <Text style={s.lstmPredLabel}>Next mood prediction</Text>
              <Text style={s.lstmPredMood}>{MOOD_EMO[pred.predicted_mood] || '🎯'} {pred.predicted_mood}</Text>
              <Text style={s.lstmPredValence}>Valence: {pred.predicted_valence > 0 ? '+' : ''}{pred.predicted_valence}</Text>
            </View>
            <View style={s.lstmPredMeta}>
              <View style={s.lstmMetaItem}>
                <Text style={s.lstmMetaVal}>{Math.round(pred.confidence * 100)}%</Text>
                <Text style={s.lstmMetaLbl}>Confidence</Text>
              </View>
              <View style={s.lstmMetaItem}>
                <Text style={s.lstmMetaVal}>{pred.sequence_length}</Text>
                <Text style={s.lstmMetaLbl}>Entries used</Text>
              </View>
              <View style={s.lstmMetaItem}>
                <Text style={s.lstmMetaVal}>LSTM</Text>
                <Text style={s.lstmMetaLbl}>Model</Text>
              </View>
            </View>
          </View>

          <View style={s.lstmInfoCard}>
            <Text style={s.lstmInfoTitle}>Architecture</Text>
            <Text style={s.lstmInfoTxt}>2-layer LSTM, hidden size 64, dropout 0.3. Trained on sequences of 7 consecutive check-ins. Input: screen time, sleep, energy, hour, day, scroll, HR, RF stress score. Output: mood valence (-1 to +1) via tanh activation.</Text>
            <Text style={[s.lstmInfoTxt, { marginTop: 6, color: VL }]}>{pred.model}</Text>
          </View>

          <View style={s.lstmInfoCard}>
            <Text style={s.lstmInfoTitle}>Dissertation framing</Text>
            <Text style={s.lstmInfoTxt}>This LSTM forms the second layer of the hybrid AI ensemble — complementing the Random Forest's real-time cross-sectional classification with longitudinal within-person mood forecasting. The combination is the novel technical contribution of this project.</Text>
          </View>
        </>
      )}
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────
function SectionHead({ text }: { text: string }) {
  return <Text style={s.secHead}>{text}</Text>;
}

function StatCard({ label, value, delta, color }: any) {
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statDelta}>{delta}</Text>
    </View>
  );
}

function BaselineChip({ delta }: { delta: number }) {
  const positive = delta < 0;
  const col = positive ? G : R;
  const arrow = positive ? '↓' : '↑';
  return (
    <View style={[s.baseChip, { borderColor: col + '40', backgroundColor: col + '14' }]}>
      <Text style={[s.baseChipTxt, { color: col }]}>{arrow} {Math.abs(delta)}% vs baseline</Text>
    </View>
  );
}

function MoodCalendar({ moodByDay }: { moodByDay: Record<string, string> }) {
  const days: Date[] = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); days.push(d);
  }
  return (
    <View style={s.calGrid}>
      {days.map((d, i) => {
        const key = d.toISOString().split('T')[0];
        const mood = moodByDay[key];
        return (
          <View key={i} style={[s.calCell, { backgroundColor: mood ? (MOOD_COL[mood] || VL) : 'rgba(255,255,255,0.05)' }]} />
        );
      })}
    </View>
  );
}

function MoodFrequency({ freq, total }: { freq: Record<string, number>; total: number }) {
  return (
    <View style={s.freqWrap}>
      {Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([mood, count]) => {
        const pct = Math.round((count / total) * 100);
        const col = MOOD_COL[mood] || VL;
        return (
          <View key={mood} style={s.freqRow}>
            <Text style={s.freqEmoji}>{MOOD_EMO[mood] || '🙂'}</Text>
            <Text style={s.freqName}>{mood}</Text>
            <View style={s.freqTrack}>
              <View style={[s.freqFill, { width: `${pct}%` as any, backgroundColor: col }]} />
            </View>
            <Text style={[s.freqPct, { color: col }]}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

function ScatterPlot({ data }: { data: any[] }) {
  const W = Math.min(width - 80, 620);
  const H = 130;
  if (!data?.length) return null;
  return (
    <View style={[s.scatterWrap, { height: H + 30 }]}>
      {data.slice(0, 25).map((d, i) => {
        const x = (d.screen / 12) * (W - 20);
        const y = H - d.stress * H;
        const col = MOOD_COL[d.mood] || VL;
        return <View key={i} style={[s.dot, { left: x, top: y, backgroundColor: col }]} />;
      })}
      <Text style={[s.axisLbl, { bottom: 2, left: 0 }]}>0h screen</Text>
      <Text style={[s.axisLbl, { bottom: 2, right: 0 }]}>12h screen</Text>
      <Text style={[s.axisLbl, { top: 2, left: 0 }]}>High stress</Text>
      <Text style={[s.axisLbl, { bottom: 2, left: '45%' as any }]}>Low stress →</Text>
    </View>
  );
}

function SentimentChart({ data }: { data: any[] }) {
  const W = Math.min(width - 80, 620);
  if (!data?.length) return null;
  return (
    <View style={s.sentWrap}>
      <View style={s.sentBars}>
        {data.slice(-14).map((d, i) => {
          const pct = ((d.sentiment + 1) / 2) * 100;
          const col = d.sentiment > 0.1 ? G : d.sentiment < -0.1 ? R : A;
          return (
            <View key={i} style={s.sentCol}>
              <View style={s.sentBarWrap}>
                <View style={[s.sentBar, { height: `${pct}%` as any, backgroundColor: col }]} />
              </View>
              <Text style={s.sentLbl}>{new Date(d.date).getDate()}</Text>
            </View>
          );
        })}
      </View>
      <View style={s.sentLegend}>
        <View style={[s.sentDot, { backgroundColor: G }]} /><Text style={s.sentLegTxt}>Positive</Text>
        <View style={[s.sentDot, { backgroundColor: A }]} /><Text style={s.sentLegTxt}>Neutral</Text>
        <View style={[s.sentDot, { backgroundColor: R }]} /><Text style={s.sentLegTxt}>Negative</Text>
      </View>
    </View>
  );
}

function FeatureBar({ name, value }: { name: string; value: number }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: MUT }}>{name}</Text>
        <Text style={{ fontSize: 12, color: VL, fontWeight: '600' }}>{(value * 100).toFixed(1)}%</Text>
      </View>
      <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
        <View style={{ width: `${value * 100}%` as any, height: 5, backgroundColor: V, borderRadius: 3 }} />
      </View>
    </View>
  );
}

function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const labels = ['High', 'Low', 'Mod'];
  return (
    <View style={s.cmWrap}>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        <View style={{ width: 50 }} />
        {labels.map(l => <Text key={l} style={s.cmH}>{l}</Text>)}
      </View>
      {matrix.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
          <Text style={[s.cmH, { width: 50 }]}>{labels[i]}</Text>
          {row.map((val, j) => (
            <View key={j} style={[s.cmCell, i === j && s.cmDiag]}>
              <Text style={{ fontSize: 13, color: TXT, fontWeight: i === j ? '700' : '400' }}>{val}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function scoreColor(score: number) {
  if (score >= 70) return G;
  if (score >= 45) return A;
  return R;
}

// ── Styles ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 32, paddingBottom: 40, maxWidth: 700, alignSelf: 'center' as any, width: '100%' },
  muted: { fontSize: 13, color: MUT, lineHeight: 20, textAlign: 'center' },

  hero: { paddingTop: 44, paddingBottom: 20 },
  heroGreet: { fontSize: 12, color: SUB, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 },
  heroH: { fontSize: 36, fontWeight: '800', color: TXT, letterSpacing: -1, marginBottom: 6 },

  tabs: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 4, marginBottom: 20, borderWidth: 0.5, borderColor: BOR },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabOn: { backgroundColor: V },
  tabTxt: { fontSize: 12, fontWeight: '500', color: MUT },
  tabTxtOn: { color: TXT, fontWeight: '700' },

  wellCard: { backgroundColor: CARD, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 0.5, borderColor: BOR, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wellLeft: {},
  wellLabel: { fontSize: 10, color: SUB, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 },
  wellScore: { fontSize: 48, fontWeight: '900', lineHeight: 52 },
  wellSub: { fontSize: 10, color: SUB },
  wellRight: { alignItems: 'flex-end', gap: 8 },
  baseChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  baseChipTxt: { fontSize: 11, fontWeight: '600' },
  streakTxt: { fontSize: 13, color: MUT, fontWeight: '500' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { backgroundColor: CARD, borderRadius: 12, padding: 13, flex: 1, minWidth: 130, borderWidth: 0.5, borderColor: BOR },
  statLabel: { fontSize: 10, color: SUB, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 },
  statVal: { fontSize: 22, fontWeight: '800', lineHeight: 24 },
  statDelta: { fontSize: 10, color: VL, marginTop: 2 },

  secHead: { fontSize: 11, fontWeight: '700', color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },

  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 16 },
  calCell: { width: (Math.min(width - 80, 620) - 28 * 4) / 7, height: 32, borderRadius: 4 },

  freqWrap: { marginBottom: 16 },
  freqRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  freqEmoji: { fontSize: 16, width: 24 },
  freqName: { fontSize: 12, color: MUT, width: 72, fontWeight: '500' },
  freqTrack: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3 },
  freqFill: { height: 6, borderRadius: 3 },
  freqPct: { fontSize: 11, fontWeight: '700', width: 36, textAlign: 'right' },

  patternCard: { backgroundColor: 'rgba(79,195,247,0.07)', borderWidth: 1, borderColor: 'rgba(79,195,247,0.2)', borderRadius: 14, padding: 16, marginBottom: 16, flexDirection: 'row', gap: 10 },
  patternDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C, marginTop: 5, flexShrink: 0 },
  patternTxt: { fontSize: 13, color: TXT, lineHeight: 22, flex: 1 },

  scatterWrap: { position: 'relative', backgroundColor: CARD, borderRadius: 14, marginBottom: 16, borderWidth: 0.5, borderColor: BOR, padding: 10 },
  dot: { position: 'absolute', width: 9, height: 9, borderRadius: 5 },
  axisLbl: { position: 'absolute', fontSize: 9, color: SUB },

  sentWrap: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: BOR },
  sentBars: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4, marginBottom: 8 },
  sentCol: { flex: 1, alignItems: 'center' },
  sentBarWrap: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  sentBar: { width: '100%', borderRadius: 2, minHeight: 2 },
  sentLbl: { fontSize: 8, color: SUB, marginTop: 2 },
  sentLegend: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  sentDot: { width: 8, height: 8, borderRadius: 4 },
  sentLegTxt: { fontSize: 10, color: SUB },

  emptyCard: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 0.5, borderColor: BOR },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TXT, marginBottom: 8 },

  lstmPredCard: { backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 18, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(108,99,255,0.25)' },
  lstmPredTop: { alignItems: 'center', marginBottom: 16 },
  lstmPredLabel: { fontSize: 10, color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  lstmPredMood: { fontSize: 28, fontWeight: '800', color: TXT, marginBottom: 4 },
  lstmPredValence: { fontSize: 13, color: VL },
  lstmPredMeta: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 12 },
  lstmMetaItem: { alignItems: 'center' },
  lstmMetaVal: { fontSize: 18, fontWeight: '700', color: TXT, marginBottom: 2 },
  lstmMetaLbl: { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.5 },
  lstmInfoCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: BOR },
  lstmInfoTitle: { fontSize: 12, fontWeight: '700', color: TXT, marginBottom: 6 },
  lstmInfoTxt: { fontSize: 12, color: MUT, lineHeight: 19 },

  cmWrap: { backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: BOR },
  cmH: { fontSize: 11, color: SUB, flex: 1, textAlign: 'center' },
  cmCell: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 7, marginHorizontal: 2, borderWidth: 0.5, borderColor: BOR },
  cmDiag: { backgroundColor: 'rgba(108,99,255,0.2)', borderColor: 'rgba(108,99,255,0.35)' },

  citeCard: { backgroundColor: CARD, borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 0.5, borderColor: BOR },
  citeLabel: { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  citeTxt: { fontSize: 11, color: MUT, lineHeight: 18, fontStyle: 'italic' },
});
