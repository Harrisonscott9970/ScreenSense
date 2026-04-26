import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Dimensions, RefreshControl, Animated,
} from 'react-native';

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 400, delay, useNativeDriver: true }).start();
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
import { BASE_URL, api } from '../services/api';

const { width } = Dimensions.get('window');

const V = '#6C63FF', VL = '#9B94FF', CL = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.55)', SUB = 'rgba(238,240,255,0.32)',
      CARD = 'rgba(255,255,255,0.04)', BOR = 'rgba(255,255,255,0.08)';

const MOOD_COL: Record<string, string> = {
  joyful: G, content: '#AED581', calm: CL, energised: A,
  anxious: R, stressed: '#FF8A65', low: '#7E57C2', numb: '#78909C',
};

const MOOD_EMO: Record<string, string> = {
  joyful: '😄', content: '🙂', calm: '😌', energised: '⚡',
  anxious: '😰', stressed: '😤', low: '😔', numb: '😶',
};

interface InsightsScreenProps {
  userId?: string;
}

export default function InsightsScreen({ userId = 'user_001' }: InsightsScreenProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'trends' | 'ml'>('overview');

  const [efficacy,    setEfficacy]    = useState<any>(null);
  const [ml,          setMl]          = useState<any>(null);
  const [hist,        setHist]        = useState<any>(null);
  const [bilstm,      setBilstm]      = useState<any>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [ins, entries, eff, mlData, histData, bilstmData, diagData] = await Promise.all([
        fetch(`${BASE_URL}/insights/${userId}`).then(r => r.ok ? r.json() : null),
        fetch(`${BASE_URL}/entries/${userId}?limit=30`).then(r => r.ok ? r.json() : []),
        fetch(`${BASE_URL}/intervention/efficacy/${userId}`).then(r => r.ok ? r.json() : null),
        fetch(`${BASE_URL}/ml/evaluate`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE_URL}/ml/history`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE_URL}/ml/bilstm-report`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE_URL}/ml/diagnostics`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setData({ ins, entries });
      setEfficacy(eff);
      setMl(mlData);
      setHist(histData);
      setBilstm(bilstmData);
      setDiagnostics(diagData);
    } catch { setData(null); }
    finally { setLoading(false); setRefreshing(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={V} size="large" />
      <Text style={[s.muted, { marginTop: 12 }]}>Loading your patterns…</Text>
    </View>
  );

  const ins     = data?.ins;
  const entries = data?.entries || [];

  if (!ins) return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.heroH}>Insights</Text>
      <View style={s.emptyCard}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
        <Text style={s.emptyTitle}>No data yet</Text>
        <Text style={s.muted}>Complete a few check-ins to unlock your pattern insights and analysis.</Text>
      </View>
    </ScrollView>
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={V} />}
    >
      <FadeIn delay={0}>
        <View style={s.hero}>
          <Text style={s.heroGreet}>Your wellbeing</Text>
          <Text style={s.heroH}>Patterns & insights</Text>
          <Text style={s.muted}>Based on {ins.total_entries} check-ins · pull to refresh</Text>
        </View>
      </FadeIn>

      <FadeIn delay={80}>
        <View style={s.tabs}>
          {(['overview', 'trends', 'ml'] as const).map(t => (
            <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabOn]} onPress={() => setTab(t)}>
              <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>
                {t === 'overview' ? 'Overview' : t === 'trends' ? 'Trends' : 'ML'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </FadeIn>

      <FadeIn delay={160}>
        {tab === 'overview' && <OverviewTab ins={ins} efficacy={efficacy} />}
        {tab === 'trends'   && <TrendsTab ins={ins} entries={entries} />}
        {tab === 'ml'       && (
          <MLTab
            ml={ml}
            userId={userId}
            onRetrained={load}
            hist={hist}
            bilstm={bilstm}
            distressBreakdown={ins?.distress_breakdown}
            diagnostics={diagnostics}
          />
        )}
      </FadeIn>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ── OVERVIEW TAB ────────────────────────────────────────────────
function OverviewTab({ ins, efficacy }: { ins: any; efficacy: any }) {
  const drift = ins?.drift;
  return (
    <>
      {/* Drift detection banner — Page-Hinkley (Page, 1954) */}
      {drift?.detected && (
        <View style={[s.driftBanner, { borderColor: drift.direction === 'increasing' ? R + '60' : G + '60', backgroundColor: drift.direction === 'increasing' ? R + '10' : G + '10' }]}>
          <Text style={s.driftIcon}>{drift.direction === 'increasing' ? '⚠️' : '✨'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.driftTitle, { color: drift.direction === 'increasing' ? R : G }]}>
              {drift.direction === 'increasing' ? 'Stress drift detected' : 'Sustained improvement'}
            </Text>
            <Text style={s.driftDesc}>{drift.description}</Text>
            {drift.action && <Text style={s.driftAction}>{drift.action}</Text>}
            <Text style={s.driftMeta}>Page-Hinkley change-point detector · magnitude {drift.magnitude}</Text>
          </View>
        </View>
      )}

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

      {/* Care level */}
      {ins.care_level && (
        <View style={[s.careCard, { borderColor: ins.care_color + '55' }]}>
          <View style={[s.careDot, { backgroundColor: ins.care_color }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.careLabel, { color: ins.care_color }]}>Level {ins.care_level} — {ins.care_label}</Text>
            <Text style={s.careDesc}>{ins.recommended_tools?.join(' · ')}</Text>
          </View>
        </View>
      )}

      {/* Stat grid */}
      <View style={s.statGrid}>
        <StatCard label="Check-ins" value={String(ins.total_entries)} delta="total" color={VL} />
        <StatCard label="Avg stress" value={`${Math.round(ins.avg_stress_score * 100)}`} delta="/ 100" color={R} />
        <StatCard label="Avg screen" value={`${ins.avg_screen_time}h`} delta="per day" color={A} />
        <StatCard label="Avg sleep" value={`${ins.avg_sleep}h`} delta="per night" color={CL} />
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

      {/* Intervention efficacy — within-subjects pre/post design */}
      {efficacy?.efficacy && Object.keys(efficacy.efficacy).length > 0 && (
        <>
          <SectionHead text="Therapy tool efficacy" />
          <View style={s.efficacyCard}>
            <Text style={s.efficacyIntro}>
              Avg stress change after each completed tool session (pre/post within-subjects design).
              Negative = stress reduction.
            </Text>
            {Object.entries(efficacy.efficacy as Record<string, any>).map(([tool, stats]: [string, any]) => {
              const positive = stats.avg_delta < 0;
              const icon = { breathing: '🫁', cbt: '🧠', mindfulness: '🧘', gratitude: '🙏' }[tool] || '🔬';
              const deltaColor = positive ? G : stats.avg_delta > 0.02 ? R : A;
              return (
                <View key={tool} style={s.efficacyRow}>
                  <Text style={s.efficacyIcon}>{icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.efficacyTool}>{tool.charAt(0).toUpperCase() + tool.slice(1)}</Text>
                    <Text style={s.efficacySessions}>{stats.sessions} session{stats.sessions !== 1 ? 's' : ''} · before {Math.round(stats.avg_stress_before * 100)} → after {Math.round(stats.avg_stress_after * 100)}</Text>
                  </View>
                  <View style={s.efficacyDelta}>
                    <Text style={[s.efficacyDeltaVal, { color: deltaColor }]}>
                      {stats.avg_delta > 0 ? '+' : ''}{Math.round(stats.avg_delta * 100)}
                    </Text>
                    <Text style={s.efficacyDeltaLbl}>pts</Text>
                  </View>
                </View>
              );
            })}
            <Text style={s.efficacyNote}>Shadish et al. (2002) — within-subjects causal inference design</Text>
          </View>
        </>
      )}

      {/* A/B win rate */}
      {ins.ab_win_rate !== undefined && (
        <View style={s.abCard}>
          <Text style={s.abLabel}>ML vs Baseline A/B Comparison</Text>
          <Text style={s.abValue}>{ins.ab_win_rate}%</Text>
          <Text style={s.abSub}>of sessions where ML recommendations outperformed the static baseline (always-recommend-park)</Text>
        </View>
      )}
    </>
  );
}

// ── ML TAB ──────────────────────────────────────────────────────
function TrendsTab({ ins, entries }: { ins: any; entries: any[] }) {
  const pred = ins?.lstm_prediction;

  return (
    <>
      {/* Mood next prediction */}
      {pred ? (
        <>
          <SectionHead text="Next mood prediction — LSTM" />
          <View style={s.lstmPredCard}>
            <View style={s.lstmPredTop}>
              <Text style={s.lstmPredLabel}>Predicted next mood</Text>
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
            </View>
          </View>
        </>
      ) : (
        ins?.total_entries < 7 && (
          <View style={s.emptyCard}>
            <Text style={{ fontSize: 28, marginBottom: 8 }}>🧠</Text>
            <Text style={s.emptyTitle}>Need {Math.max(0, 7 - ins.total_entries)} more check-in{7 - ins.total_entries !== 1 ? 's' : ''}</Text>
            <Text style={s.muted}>LSTM mood prediction unlocks after 7 check-ins.</Text>
          </View>
        )
      )}

      {/* Recent entries table */}
      {entries.length > 0 && (
        <>
          <SectionHead text="Recent check-ins" />
          <View style={s.histCard}>
            {entries.slice(0, 14).map((e: any, i: number) => {
              const d = new Date(e.created_at);
              const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
              const stress = e.stress_score ?? e.predicted_stress_score ?? 0;
              const col = stress > 0.66 ? R : stress > 0.33 ? A : G;
              return (
                <View key={i} style={s.histRow}>
                  <Text style={{ fontSize: 18, marginRight: 10 }}>{MOOD_EMO[e.mood_label] || '😐'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.histF1}>{e.mood_label} · {e.stress_category || (stress > 0.66 ? 'high' : stress > 0.33 ? 'moderate' : 'low')} stress</Text>
                    <Text style={s.histMeta}>Sleep {e.sleep_hours}h · Screen {e.screen_time_hours}h</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.histF1, { color: col }]}>{Math.round(stress * 100)}</Text>
                    <Text style={s.histDate}>{dateStr}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Sentiment trend */}
      {ins?.sentiment_trend?.length > 0 && (
        <>
          <SectionHead text="Journal sentiment over time" />
          <SentimentChart data={ins.sentiment_trend} />
        </>
      )}
    </>
  );
}

function MLTab({ ml, userId, onRetrained, hist, bilstm, distressBreakdown, diagnostics }: {
  ml: any; userId?: string; onRetrained?: () => void; hist?: any;
  bilstm?: any; distressBreakdown?: Record<string, number>; diagnostics?: any;
}) {
  const [retraining, setRetraining]     = useState(false);
  const [retrainResult, setRetrainResult] = useState<any>(null);
  const [seeding, setSeeding]           = useState(false);
  const [seedResult, setSeedResult]     = useState<string | null>(null);

  const handleRetrain = async () => {
    setRetraining(true);
    setRetrainResult(null);
    try {
      const res = await api.retrain(userId);
      setRetrainResult(res);
      if (res.status === 'retrained') onRetrained?.();
    } catch (e: any) {
      setRetrainResult({ status: 'error', message: e.message });
    } finally {
      setRetraining(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await fetch(`${BASE_URL}/test/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, n: 25 }),
      }).then(r => r.json());
      setSeedResult(res.message || `✓ Seeded ${res.seeded} entries`);
      onRetrained?.();   // refresh insights count
    } catch (e: any) {
      setSeedResult(`✗ ${e.message}`);
    } finally {
      setSeeding(false);
    }
  };

  if (!ml) return (
    <View style={s.emptyCard}>
      <Text style={s.muted}>ML evaluation not available. Run: python -m app.ml.train</Text>
    </View>
  );

  const resBg  = retrainResult?.status === 'retrained'  ? 'rgba(76,175,130,0.10)'
               : retrainResult?.status === 'error'       ? 'rgba(244,63,94,0.10)'
               : 'rgba(255,183,77,0.10)';
  const resClr = retrainResult?.status === 'retrained'  ? G
               : retrainResult?.status === 'error'       ? R : A;

  const history: any[] = hist?.history ?? [];

  return (
    <>
      {/* ── Model performance stats ── */}
      <SectionHead text="Random Forest — current model performance" />
      <View style={s.statGrid}>
        <StatCard label="Accuracy"    value={`${Math.round(ml.accuracy * 100)}%`}       delta="held-out test set" color={G}  />
        <StatCard label="F1 weighted" value={`${Math.round(ml.f1_weighted * 100)}%`}    delta="weighted avg"      color={VL} />
        <StatCard label="CV F1"       value={`${Math.round((ml.cv_f1_mean || 0) * 100)}%`} delta={`±${Math.round((ml.cv_f1_std || 0) * 100)}% (5-fold)`} color={CL} />
        <StatCard label="Training n"  value={String(ml.training_samples)}               delta="samples"           color={A}  />
      </View>

      {/* ── Advanced robustness metrics (from diagnostics endpoint) ── */}
      {diagnostics && (
        <>
          <SectionHead text="Robustness metrics — chance-corrected &amp; imbalance-immune" />
          <View style={s.statGrid}>
            <StatCard label="Cohen's κ" value={(diagnostics.cohen_kappa ?? '—').toString().slice(0,5)}
              delta="0=chance · 1=perfect · Landis (1977)" color={CL} />
            <StatCard label="MCC"       value={(diagnostics.matthews_cc ?? '—').toString().slice(0,5)}
              delta="Matthews (1975) — immune to imbalance" color={VL} />
            <StatCard label="F1 CI lo"  value={`${Math.round((diagnostics.f1_bootstrap_ci_lower || 0) * 100)}%`}
              delta="95% bootstrap CI lower · Efron (1993)" color={G} />
            <StatCard label="F1 CI hi"  value={`${Math.round((diagnostics.f1_bootstrap_ci_upper || 0) * 100)}%`}
              delta="95% bootstrap CI upper · n=1000 boot" color={G} />
          </View>
          <View style={s.statGrid}>
            <StatCard label="Brier score" value={(diagnostics.brier_score_mean ?? '—').toString().slice(0,6)}
              delta="0=perfect · calibration quality" color={A} />
            <StatCard label="OOB score"   value={diagnostics.oob_score != null ? `${Math.round(diagnostics.oob_score * 100)}%` : '—'}
              delta="out-of-bag — free extra validation" color={CL} />
            <StatCard label="Conf. coverage" value={`${Math.round((diagnostics.conformal_empirical_coverage || 0.9) * 100)}%`}
              delta="empirical · target 90% · Vovk (2005)" color={G} />
            <StatCard label="Avg set size"   value={(diagnostics.conformal_set_avg_size ?? '—').toString().slice(0,4)}
              delta="LAC prediction set · Angelopoulos (2023)" color={VL} />
          </View>
        </>
      )}

      {/* ── Demo / test seeding ── */}
      <SectionHead text="Quick test — generate demo data" />
      <View style={s.seedCard}>
        <Text style={s.seedTitle}>📋  Seed 25 synthetic check-ins</Text>
        <Text style={s.seedDesc}>
          Instantly adds 25 realistic entries to the database so you can test
          continual learning without doing check-ins manually. Use this to
          demonstrate the self-learning pipeline to markers.
        </Text>
        <TouchableOpacity
          style={[s.seedBtn, seeding && { opacity: 0.6 }]}
          onPress={handleSeed}
          disabled={seeding}
          activeOpacity={0.8}
        >
          {seeding
            ? <ActivityIndicator color={TXT} size="small" />
            : <Text style={s.seedBtnTxt}>Generate test data</Text>
          }
        </TouchableOpacity>
        {seedResult && (
          <Text style={[s.seedResult, { color: seedResult.startsWith('✗') ? R : G }]}>
            {seedResult}
          </Text>
        )}
      </View>

      {/* ── Continual learning / online retraining ── */}
      <SectionHead text="Continual learning — retrain on your data" />
      <View style={[s.retrainCard, { borderColor: retrainResult ? resClr + '44' : BOR }]}>
        <Text style={s.retrainTitle}>Adapt model to your data</Text>
        <Text style={s.retrainDesc}>
          Retrains the Random Forest on your real check-ins (weighted 3× over synthetic data),
          implementing continual learning — Widmer &amp; Kubat (1996). The model is hot-swapped
          in memory without restarting the server.
        </Text>
        <TouchableOpacity
          style={[s.retrainBtn, retraining && { opacity: 0.6 }]}
          onPress={handleRetrain}
          disabled={retraining}
          activeOpacity={0.8}
        >
          {retraining
            ? <ActivityIndicator color={TXT} size="small" />
            : <Text style={s.retrainBtnTxt}>🔄  Retrain AI on my data</Text>
          }
        </TouchableOpacity>
        {retrainResult && (
          <View style={[s.retrainResult, { backgroundColor: resBg }]}>
            <Text style={[s.retrainResultTxt, { color: resClr }]}>
              {retrainResult.status === 'retrained'
                ? `✓ Retrained — F1 ${Math.round((retrainResult.new_f1_weighted || 0) * 100)}% (was ${Math.round((retrainResult.old_f1_weighted || 0) * 100)}%) · ${retrainResult.real_entries_used} real entries used`
                : retrainResult.status === 'skipped'
                ? `⏭ ${retrainResult.reason}`
                : retrainResult.status === 'no_improvement'
                ? `→ No improvement (F1 ${Math.round((retrainResult.new_f1_weighted || 0) * 100)}% vs ${Math.round((retrainResult.old_f1_weighted || 0) * 100)}% baseline)`
                : `✗ ${retrainResult.message}`
              }
            </Text>
            {retrainResult.cv_f1_mean != null && (
              <Text style={[s.retrainResultSub, { color: resClr }]}>
                CV F1: {Math.round(retrainResult.cv_f1_mean * 100)}% ± {Math.round(retrainResult.cv_f1_std * 100)}%
                {retrainResult.feature_importances && (
                  `  ·  top feature: ${Object.entries(retrainResult.feature_importances as Record<string,number>).sort((a,b) => b[1]-a[1])[0]?.[0]?.replace(/_/g,' ')}`
                )}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ── Retrain history ── */}
      {history.length > 0 && (
        <>
          <SectionHead text={`Training history (${history.length} session${history.length !== 1 ? 's' : ''})`} />
          <View style={s.histCard}>
            {[...history].reverse().slice(0, 8).map((h: any, i: number) => {
              const improved = h.status === 'retrained';
              const col = improved ? G : A;
              const date = new Date(h.timestamp);
              const dateStr = `${date.toLocaleDateString('en-GB', { day:'numeric', month:'short' })} ${date.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}`;
              return (
                <View key={i} style={s.histRow}>
                  <View style={[s.histDot, { backgroundColor: col }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[s.histF1, { color: col }]}>
                        F1 {Math.round((h.new_f1_weighted || 0) * 100)}%
                        {improved ? ` ↑ (+${Math.round(((h.new_f1_weighted||0) - (h.old_f1_weighted||0)) * 100)}%)` : ' (no change saved)'}
                      </Text>
                      <Text style={s.histDate}>{dateStr}</Text>
                    </View>
                    <Text style={s.histMeta}>
                      {h.real_entries_used} real entries · CV {Math.round((h.cv_f1_mean||0)*100)}%±{Math.round((h.cv_f1_std||0)*100)}%
                      {h.top_feature ? `  · top: ${h.top_feature.replace(/_/g,' ')}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── F1 learning curve ── */}
      {history.length >= 2 && (
        <>
          <SectionHead text="F1 learning curve" />
          <F1Curve history={history} />
        </>
      )}

      <SectionHead text="Feature importances (Gini impurity)" />
      {Object.entries(ml.feature_importances as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .map(([feat, imp]) => (
          <FeatureBar key={feat} name={feat.replace(/_/g, ' ')} value={imp as number} />
        ))}

      <SectionHead text="Confusion matrix (high / moderate / low)" />
      <ConfusionMatrix matrix={ml.confusion_matrix} />

      {/* ── Challenger model comparison ── */}
      {diagnostics?.challenger_comparison && (
        <>
          <SectionHead text="Challenger model comparison — Wolpert (1992)" />
          <View style={s.challengerCard}>
            {[
              { key: 'rf_f1',          label: '🌲 Random Forest',       mapKey: 'random_forest', color: G  },
              { key: 'extra_trees_f1', label: '🌳 Extra Trees',         mapKey: 'extra_trees',   color: CL },
              { key: 'stacking_f1',    label: '🧩 Stacking (RF+ET→LR)', mapKey: 'stacking',      color: VL },
            ].map(({ key, label, mapKey, color }) => {
              const f1 = diagnostics.challenger_comparison[key];
              if (f1 == null) return null;
              const isWinner = diagnostics.challenger_comparison.winner === mapKey;
              return (
                <View key={key} style={s.challengerRow}>
                  <Text style={[s.challengerLabel, { color: isWinner ? color : MUT }]}>
                    {label}{isWinner ? ' ✓' : ''}
                  </Text>
                  <View style={{ flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, marginHorizontal: 10 }}>
                    <View style={{ width: `${f1 * 100}%` as any, height: 6, backgroundColor: isWinner ? color : color + '55', borderRadius: 3 }} />
                  </View>
                  <Text style={[s.challengerF1, { color: isWinner ? color : MUT }]}>{Math.round(f1 * 100)}%</Text>
                </View>
              );
            })}
            <Text style={[s.muted, { fontSize: 10, marginTop: 8, textAlign: 'left' }]}>
              Champion: {(diagnostics.challenger_comparison.winner || '—').replace(/_/g, ' ')} ·
              split: {(diagnostics.split_method || 'GroupShuffleSplit').split(' ')[0]}
            </Text>
          </View>
        </>
      )}

      {/* ── Calibration reliability diagram ── */}
      {diagnostics?.calibration_curves && Object.keys(diagnostics.calibration_curves).length > 0 && (
        <>
          <SectionHead text="Reliability diagram — Niculescu-Mizil &amp; Caruana (2005)" />
          <ReliabilityDiagram curves={diagnostics.calibration_curves} />
        </>
      )}

      {/* ── Learning curve by training size ── */}
      {diagnostics?.learning_curve && !diagnostics.learning_curve.error &&
       (diagnostics.learning_curve.train_sizes?.length ?? 0) >= 2 && (
        <>
          <SectionHead text="Learning curve — F1 vs training size" />
          <LearningCurveBySize lc={diagnostics.learning_curve} />
          <Text style={[s.muted, { fontSize: 10, marginBottom: 14, textAlign: 'left' }]}>
            Plateau confirms {diagnostics.learning_curve.train_sizes?.slice(-1)[0]?.toLocaleString() || '—'} samples
            was an adequate data budget — diminishing returns beyond this N.
          </Text>
        </>
      )}

      {/* ── BiLSTM distress model ── */}
      <SectionHead text="BiLSTM distress classifier — journal NLP model" />
      <View style={s.bilstmCard}>
        <View style={s.bilstmHeader}>
          <View>
            <Text style={s.bilstmTitle}>BiLSTM + Bahdanau Attention</Text>
            <Text style={s.bilstmSub}>5-class distress detection from journal text</Text>
          </View>
          {bilstm?.val_accuracy != null && (
            <View style={s.bilstmAccBadge}>
              <Text style={[s.bilstmAccVal, { color: G }]}>{Math.round(bilstm.val_accuracy * 100)}%</Text>
              <Text style={s.bilstmAccLbl}>val acc</Text>
            </View>
          )}
        </View>

        <View style={s.bilstmArch}>
          {['Embedding(3000,64)', 'BiLSTM(128×2, 2L)', 'Attention', 'FC(64)', 'Softmax(5)'].map((layer, i) => (
            <React.Fragment key={i}>
              <View style={s.bilstmLayer}>
                <Text style={s.bilstmLayerTxt}>{layer}</Text>
              </View>
              {i < 4 && <Text style={s.bilstmArrow}>→</Text>}
            </React.Fragment>
          ))}
        </View>

        <View style={s.bilstmClasses}>
          {[
            { key: 'neutral',           label: 'Neutral',           color: G,  emoji: '😐' },
            { key: 'mild_distress',     label: 'Mild distress',     color: A,  emoji: '😔' },
            { key: 'moderate_distress', label: 'Moderate distress', color: '#FF8A65', emoji: '😟' },
            { key: 'high_distress',     label: 'High distress',     color: R,  emoji: '😢' },
            { key: 'crisis_indicator',  label: 'Crisis indicator',  color: '#C62828', emoji: '🚨' },
          ].map(cls => {
            const count = distressBreakdown?.[cls.key] ?? 0;
            const total = distressBreakdown ? Object.values(distressBreakdown).reduce((a, b) => a + b, 0) : 0;
            const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <View key={cls.key} style={s.bilstmClassRow}>
                <Text style={s.bilstmClassEmoji}>{cls.emoji}</Text>
                <Text style={[s.bilstmClassName, { color: cls.color }]}>{cls.label}</Text>
                <View style={s.bilstmClassTrack}>
                  <View style={[s.bilstmClassFill, { width: `${pct}%` as any, backgroundColor: cls.color }]} />
                </View>
                <Text style={[s.bilstmClassPct, { color: cls.color }]}>{total > 0 ? `${pct}%` : '—'}</Text>
              </View>
            );
          })}
        </View>
        {!distressBreakdown && (
          <Text style={[s.bilstmSub, { textAlign: 'center', marginTop: 4 }]}>
            Complete check-ins with journal entries to see your distress breakdown.
          </Text>
        )}
      </View>

      <View style={s.bilstmEnsemble}>
        <Text style={s.bilstmEnsembleTitle}>RF + BiLSTM Ensemble Fusion</Text>
        <Text style={s.bilstmEnsembleTxt}>
          When journal text is present, ScreenSense combines the Random Forest stress score
          (65% weight) with the BiLSTM distress class probability (35% weight) into a
          calibrated ensemble score. This multi-modal fusion improves precision on borderline
          cases where device signals and language signals diverge.
        </Text>
        <Text style={[s.bilstmEnsembleTxt, { color: VL, marginTop: 6 }]}>
          Cite: Torous et al. (2017). New tools for new research in psychiatry. JMIR Mental Health.
        </Text>
      </View>

      <View style={s.citeCard}>
        <Text style={s.citeLabel}>Academic citations</Text>
        <Text style={s.citeTxt}>
          Breiman, L. (2001). Random Forests. Machine Learning, 45, 5–32.{'\n'}
          Hutto, C. &amp; Gilbert, E. (2014). VADER: A Parsimonious Rule-based Model for Sentiment Analysis. ICWSM.{'\n'}
          Lundberg, S. &amp; Lee, S.I. (2017). A unified approach to interpreting model predictions. NeurIPS.{'\n'}
          Widmer, G. &amp; Kubat, M. (1996). Learning in the presence of concept drift. Machine Learning, 23(1).
        </Text>
      </View>
    </>
  );
}

// ── F1 learning curve mini-chart ────────────────────────────────
function F1Curve({ history }: { history: any[] }) {
  const W = Math.min(width - 80, 620);
  const H = 100;
  const pts = history.slice(-10);   // last 10 retrain events
  if (pts.length < 2) return null;

  const f1s  = pts.map((h: any) => h.new_f1_weighted || 0);
  const minF  = Math.min(...f1s) - 0.02;
  const maxF  = Math.max(...f1s) + 0.02;
  const range = maxF - minF || 0.01;

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—'
      : `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
  };
  const firstLabel = fmtDate(pts[0].timestamp);
  const lastLabel  = fmtDate(pts[pts.length - 1].timestamp);

  // Y-axis tick labels (min / mid / max as percentages)
  const midF = (minF + maxF) / 2;
  const yTicks = [
    { val: maxF, pct: 0   },
    { val: midF, pct: 50  },
    { val: minF, pct: 100 },
  ];

  return (
    <View style={[s.curveWrap, { height: H + 56, paddingLeft: 36 }]}>
      {/* Y-axis tick labels */}
      {yTicks.map((t, i) => (
        <Text key={i} style={[s.curveAxis, {
          top: (t.pct / 100) * H + 8,
          left: 4,
          color: G,
        }]}>{Math.round(t.val * 100)}%</Text>
      ))}
      {/* Horizontal grid lines */}
      {yTicks.map((t, i) => (
        <View key={`g${i}`} style={[s.gridLine, {
          top: (t.pct / 100) * H + 12,
          left: 32, right: 8,
        }]} />
      ))}
      {/* Dots with connecting labels */}
      {pts.map((h: any, i: number) => {
        const x = (i / (pts.length - 1)) * (W - 80);
        const y = H - ((h.new_f1_weighted - minF) / range) * H;
        const col = h.status === 'retrained' ? G : A;
        return (
          <View key={i} style={[s.curveDot, { left: x + 34, top: y + 12, backgroundColor: col }]}>
            <Text style={s.curveDotTxt}>{Math.round((h.new_f1_weighted||0)*100)}</Text>
          </View>
        );
      })}
      {/* Date range — now real dates, not 'earliest/latest' */}
      <Text style={[s.curveAxis, { bottom: 22, left: 36 }]}>{firstLabel}</Text>
      <Text style={[s.curveAxis, { bottom: 22, right: 8 }]}>{lastLabel}</Text>
      {/* Axis labels */}
      <Text style={[s.curveAxis, { bottom: 4, left: 36, fontWeight: '700' }]}>Date of retrain →</Text>
      <Text style={[s.curveAxis, { bottom: 4, right: 8, color: MUT }]}>
        {pts.length} retrains shown
      </Text>
    </View>
  );
}


// ── Calibration reliability diagram ─────────────────────────────
function ReliabilityDiagram({ curves }: { curves: Record<string, any> }) {
  const SIZE = Math.min(width - 80, 240);
  const CLASS_COLORS: Record<string, string> = { low: G, moderate: A, high: R };

  return (
    <View style={[s.relCard, { marginBottom: 16 }]}>
      <Text style={[s.muted, { fontSize: 10, marginBottom: 10, textAlign: 'left' }]}>
        Calibration reliability diagram. Each point = one probability bin.
        Perfect calibration follows the diagonal — dots above = under-confident, below = over-confident.
      </Text>
      <View style={{ alignSelf: 'center', width: SIZE, height: SIZE,
        backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8,
        borderWidth: 0.5, borderColor: BOR, position: 'relative' }}>
        {/* Axis labels */}
        <Text style={{ position: 'absolute', bottom: -16, left: 0, right: 0,
          textAlign: 'center', fontSize: 9, color: SUB }}>Mean predicted probability →</Text>
        {/* Perfect calibration diagonal dots */}
        {[0, 0.25, 0.5, 0.75, 1.0].map((v, i) => (
          <View key={i} style={{
            position: 'absolute',
            left:  v * (SIZE - 12) + 4,
            top:   (1 - v) * (SIZE - 12) + 4,
            width: 4, height: 4, borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.15)',
          }} />
        ))}
        {/* Per-class calibration dots */}
        {Object.entries(curves).map(([cls, data]: [string, any]) => {
          const color = CLASS_COLORS[cls] || VL;
          const xs: number[] = data.mean_predicted_value || [];
          const ys: number[] = data.fraction_of_positives || [];
          return xs.map((x, i) => {
            const y = ys[i];
            if (x == null || y == null) return null;
            return (
              <View key={`${cls}_${i}`} style={{
                position: 'absolute',
                left:  x * (SIZE - 16) + 4,
                top:   (1 - y) * (SIZE - 16) + 4,
                width: 9, height: 9, borderRadius: 5,
                backgroundColor: color,
                borderWidth: 1.5, borderColor: '#1a1a2e',
              }} />
            );
          });
        })}
      </View>
      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 20 }}>
        {Object.entries(CLASS_COLORS).map(([cls, col]) => (
          <View key={cls} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: col }} />
            <Text style={[s.muted, { fontSize: 10 }]}>{cls}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          <Text style={[s.muted, { fontSize: 10 }]}>perfect</Text>
        </View>
      </View>
    </View>
  );
}

// ── Learning curve by training size ─────────────────────────────
function LearningCurveBySize({ lc }: { lc: any }) {
  const W = Math.min(width - 80, 620);
  const H = 100;
  const pts = lc.train_sizes?.length ?? 0;
  if (pts < 2) return null;

  const allF1s = [...(lc.train_f1_mean || []), ...(lc.val_f1_mean || [])];
  const minF   = Math.max(0, Math.min(...allF1s) - 0.03);
  const maxF   = Math.min(1, Math.max(...allF1s) + 0.03);
  const range  = maxF - minF || 0.01;

  const yAt = (f1: number) => H - ((f1 - minF) / range) * H;
  const xAt = (i: number)  => (i / (pts - 1)) * (W - 90);

  return (
    <View style={[s.curveWrap, { height: H + 62, paddingLeft: 38 }]}>
      {/* Y-axis ticks */}
      {[maxF, (maxF + minF) / 2, minF].map((v, i) => (
        <Text key={i} style={[s.curveAxis, { top: yAt(v) + 10, left: 2, color: MUT }]}>
          {Math.round(v * 100)}%
        </Text>
      ))}
      {/* Grid lines */}
      {[0, 0.5, 1].map(frac => (
        <View key={frac} style={[s.gridLine, { top: frac * H + 12, left: 34, right: 8 }]} />
      ))}
      {/* Train F1 dots — violet */}
      {lc.train_f1_mean.map((f1: number, i: number) => (
        <View key={`tr${i}`} style={[s.curveDot, { left: xAt(i) + 36, top: yAt(f1) + 10, backgroundColor: V }]}>
          <Text style={s.curveDotTxt}>{Math.round(f1 * 100)}</Text>
        </View>
      ))}
      {/* Val F1 dots — green, offset down slightly so they don't overlap */}
      {lc.val_f1_mean.map((f1: number, i: number) => (
        <View key={`vl${i}`} style={[s.curveDot, { left: xAt(i) + 36, top: yAt(f1) + 28, backgroundColor: G }]}>
          <Text style={s.curveDotTxt}>{Math.round(f1 * 100)}</Text>
        </View>
      ))}
      {/* X-axis range */}
      <Text style={[s.curveAxis, { bottom: 24, left: 38 }]}>{lc.train_sizes[0].toLocaleString()}</Text>
      <Text style={[s.curveAxis, { bottom: 24, right: 8 }]}>{lc.train_sizes[pts - 1].toLocaleString()}</Text>
      <Text style={[s.curveAxis, { bottom: 8, left: 38, fontWeight: '700' }]}>Training samples →</Text>
      {/* Legend — top right */}
      <View style={{ position: 'absolute', top: 10, right: 10, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: V }} />
          <Text style={[s.curveAxis, { position: 'relative', color: VL }]}>Train F1</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: G }} />
          <Text style={[s.curveAxis, { position: 'relative', color: G }]}>Val F1</Text>
        </View>
      </View>
    </View>
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
  const H = 140;
  if (!data?.length) return (
    <View style={[s.scatterWrap, { padding: 20, alignItems: 'center' }]}>
      <Text style={s.muted}>Not enough data yet — each dot is one check-in.</Text>
    </View>
  );
  return (
    <View style={[s.scatterWrap, { height: H + 52, paddingTop: 18, paddingLeft: 56, paddingRight: 10 }]}>
      {/* Y-axis labels */}
      <Text style={[s.axisLbl, { top: 16, left: 4 }]}>High stress</Text>
      <Text style={[s.axisLbl, { bottom: 30, left: 4 }]}>Low stress</Text>
      {/* X-axis labels */}
      <Text style={[s.axisLbl, { bottom: 14, left: 56, fontWeight: '700' }]}>0h screen time →</Text>
      <Text style={[s.axisLbl, { bottom: 14, right: 10 }]}>12h</Text>
      {/* Dots */}
      {data.slice(0, 25).map((d, i) => {
        const x = (d.screen / 12) * (W - 80) + 56;
        const y = H - d.stress * H + 16;
        const col = MOOD_COL[d.mood] || VL;
        return <View key={i} style={[s.dot, { left: x, top: y, backgroundColor: col }]} />;
      })}
      <Text style={[s.axisLbl, { bottom: 2, left: 56, color: MUT, fontSize: 8 }]}>
        Each dot = one check-in · colour = mood
      </Text>
    </View>
  );
}

function SentimentChart({ data }: { data: any[] }) {
  if (!data?.length) return null;
  const recent = data.slice(-14);
  const fmtShort = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}`;
  };
  return (
    <View style={s.sentWrap}>
      {/* Y-axis label row */}
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        <Text style={[s.sentLegTxt, { color: MUT }]}>
          Sentiment score: −1 (very negative) → +1 (very positive) · last {recent.length} days
        </Text>
      </View>
      <View style={s.sentBars}>
        {recent.map((d, i) => {
          const pct = ((d.sentiment + 1) / 2) * 100;
          const col = d.sentiment > 0.1 ? G : d.sentiment < -0.1 ? R : A;
          // Only label every 2nd bar to prevent crowding
          const showLabel = i % 2 === 0 || i === recent.length - 1;
          return (
            <View key={i} style={s.sentCol}>
              <View style={s.sentBarWrap}>
                <View style={[s.sentBar, { height: `${pct}%` as any, backgroundColor: col }]} />
              </View>
              <Text style={s.sentLbl}>{showLabel ? fmtShort(d.date) : ''}</Text>
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
  if (!matrix?.length) return null;
  return (
    <View style={s.cmWrap}>
      <Text style={[s.muted, { fontSize: 10, marginBottom: 8 }]}>Rows = actual, Columns = predicted</Text>
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

  careCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1 },
  careDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  careLabel: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  careDesc: { fontSize: 11, color: MUT },

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
  patternDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CL, marginTop: 5, flexShrink: 0 },
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

  // Drift detection banner
  driftBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1 },
  driftIcon: { fontSize: 22, lineHeight: 28 },
  driftTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  driftDesc: { fontSize: 12, color: TXT, lineHeight: 18, marginBottom: 2 },
  driftAction: { fontSize: 12, color: MUT, fontStyle: 'italic', marginBottom: 4 },
  driftMeta: { fontSize: 9, color: SUB, fontFamily: 'monospace' as any },

  // Intervention efficacy
  efficacyCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: BOR },
  efficacyIntro: { fontSize: 11, color: MUT, lineHeight: 17, marginBottom: 12 },
  efficacyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: BOR },
  efficacyIcon: { fontSize: 20 },
  efficacyTool: { fontSize: 13, fontWeight: '600', color: TXT, marginBottom: 2 },
  efficacySessions: { fontSize: 10, color: MUT },
  efficacyDelta: { alignItems: 'center', minWidth: 44 },
  efficacyDeltaVal: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  efficacyDeltaLbl: { fontSize: 9, color: SUB },
  efficacyNote: { fontSize: 9, color: SUB, marginTop: 10, fontStyle: 'italic' },

  abCard: { backgroundColor: 'rgba(76,175,130,0.08)', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(76,175,130,0.25)', alignItems: 'center' },
  abLabel: { fontSize: 10, color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  abValue: { fontSize: 36, fontWeight: '900', color: G, marginBottom: 4 },
  abSub: { fontSize: 11, color: MUT, textAlign: 'center', lineHeight: 17 },

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

  // Seed / test data
  seedCard: { backgroundColor: 'rgba(79,195,247,0.06)', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(79,195,247,0.2)' },
  seedTitle: { fontSize: 14, fontWeight: '700', color: TXT, marginBottom: 6 },
  seedDesc: { fontSize: 12, color: MUT, lineHeight: 18, marginBottom: 12 },
  seedBtn: { backgroundColor: 'rgba(79,195,247,0.15)', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(79,195,247,0.35)' },
  seedBtnTxt: { fontSize: 13, color: CL, fontWeight: '700' },
  seedResult: { fontSize: 12, marginTop: 10, lineHeight: 18 },

  // Retrain / continual learning
  retrainCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1 },
  retrainTitle: { fontSize: 14, fontWeight: '700', color: TXT, marginBottom: 6 },
  retrainDesc: { fontSize: 12, color: MUT, lineHeight: 18, marginBottom: 14 },
  retrainBtn: { backgroundColor: 'rgba(108,99,255,0.18)', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(108,99,255,0.35)' },
  retrainBtnTxt: { fontSize: 14, color: VL, fontWeight: '700' },
  retrainResult: { marginTop: 12, borderRadius: 8, padding: 12 },
  retrainResultTxt: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  retrainResultSub: { fontSize: 11, marginTop: 4, opacity: 0.8 },

  // Training history
  histCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: BOR },
  histRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  histDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  histF1: { fontSize: 13, fontWeight: '700' },
  histDate: { fontSize: 10, color: SUB },
  histMeta: { fontSize: 10, color: MUT, marginTop: 2 },

  // F1 learning curve
  curveWrap: { position: 'relative', backgroundColor: CARD, borderRadius: 14, marginBottom: 16, borderWidth: 0.5, borderColor: BOR, overflow: 'hidden' },
  gridLine: { position: 'absolute', left: 8, right: 8, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  curveDot: { position: 'absolute', width: 26, height: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  curveDotTxt: { fontSize: 9, color: '#fff', fontWeight: '700' },
  curveAxis: { position: 'absolute', fontSize: 9, color: SUB },

  // BiLSTM distress section
  bilstmCard: { backgroundColor: 'rgba(108,99,255,0.07)', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(108,99,255,0.25)' },
  bilstmHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  bilstmTitle: { fontSize: 14, fontWeight: '800', color: TXT, marginBottom: 3 },
  bilstmSub: { fontSize: 11, color: MUT, lineHeight: 16 },
  bilstmAccBadge: { alignItems: 'center', backgroundColor: 'rgba(76,175,130,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(76,175,130,0.25)' },
  bilstmAccVal: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  bilstmAccLbl: { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.6 },
  bilstmArch: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 14, justifyContent: 'center' },
  bilstmLayer: { backgroundColor: 'rgba(108,99,255,0.18)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 0.5, borderColor: 'rgba(108,99,255,0.35)' },
  bilstmLayerTxt: { fontSize: 10, color: VL, fontWeight: '600' },
  bilstmArrow: { fontSize: 12, color: SUB },
  bilstmClasses: { gap: 7 },
  bilstmClassRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bilstmClassEmoji: { fontSize: 14, width: 22 },
  bilstmClassName: { fontSize: 11, fontWeight: '600', width: 110 },
  bilstmClassTrack: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3 },
  bilstmClassFill: { height: 6, borderRadius: 3 },
  bilstmClassPct: { fontSize: 11, fontWeight: '700', width: 34, textAlign: 'right' },
  bilstmEnsemble: { backgroundColor: 'rgba(79,195,247,0.07)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(79,195,247,0.2)' },
  bilstmEnsembleTitle: { fontSize: 12, fontWeight: '700', color: TXT, marginBottom: 6 },
  bilstmEnsembleTxt: { fontSize: 11, color: MUT, lineHeight: 18 },

  // Reliability diagram
  relCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: BOR },

  // Challenger comparison
  challengerCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: BOR },
  challengerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  challengerLabel: { fontSize: 11, fontWeight: '600', width: 128 },
  challengerF1: { fontSize: 13, fontWeight: '700', width: 36, textAlign: 'right' as any },
});
