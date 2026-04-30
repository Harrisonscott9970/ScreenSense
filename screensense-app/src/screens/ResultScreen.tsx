import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing,
} from 'react-native';
import { C, Space, Radius, Font, Shadow } from '../utils/theme';
import { api } from '../services/api';
import { AnimatedPress } from '../components/AnimatedPress';
let Haptics: any = null;
try { Haptics = require('expo-haptics'); } catch {}

interface Props {
  result: any;
  mood: string;
  userId?: string;
  onReset: () => void;
  onNavigate?: (screen: string) => void;
}

const MOOD_COLORS: Record<string, string> = {
  anxious: C.moods.anxious, stressed: C.moods.stressed,
  low: C.moods.low, numb: C.moods.numb,
  calm: C.moods.calm, content: C.moods.content,
  energised: C.moods.energised, joyful: C.moods.joyful,
};

// Stagger helper
function useStagger(count: number, delay = 100) {
  const anims = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(delay, anims.map(a =>
      Animated.spring(a, { toValue: 1, useNativeDriver: true, tension: 180, friction: 18 })
    )).start();
  }, []);
  return anims;
}

export default function ResultScreen({ result, mood, userId, onReset, onNavigate }: Props) {
  const [feedbackSent, setFeedbackSent] = useState<'helpful' | 'not_helpful' | null>(null);
  const [feedbackMsg, setFeedbackMsg]   = useState('');
  const [displayScore, setDisplayScore] = useState(0);

  const handleFeedback = async (helpful: boolean) => {
    if (feedbackSent) return;
    Haptics?.impactAsync(helpful ? Haptics.ImpactFeedbackStyle?.Medium : Haptics.ImpactFeedbackStyle?.Light);
    setFeedbackSent(helpful ? 'helpful' : 'not_helpful');
    try {
      const resp = await api.feedback(result.entry_id, helpful, userId || 'anonymous');
      setFeedbackMsg(resp.message || (helpful ? 'Great — noted!' : 'Noted, we\'ll adjust.'));
    } catch {
      setFeedbackMsg(helpful ? 'Thanks for your feedback!' : 'Got it, noted.');
    }
  };

  const stressColor = result.predicted_stress_score > 0.66 ? C.stressHigh
                    : result.predicted_stress_score > 0.33 ? C.stressMid
                    : C.stressLow;
  const stressPct = Math.round(result.predicted_stress_score * 100);
  const moodColor = MOOD_COLORS[mood] || C.violet;
  const careLevel = result.care_level || 1;
  const careLevelColors = [C.stressLow, C.stressMid, C.warning, C.stressHigh];
  const careColor = careLevelColors[careLevel - 1] || C.violet;

  // Ring + score animations
  const ringScale   = useRef(new Animated.Value(0.7)).current;
  const glowAnim    = useRef(new Animated.Value(0.5)).current;
  const ringRotate  = useRef(new Animated.Value(0)).current;
  const scoreAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Ring bounces in
    Animated.spring(ringScale, {
      toValue: 1, useNativeDriver: true, tension: 55, friction: 9,
    }).start();
    // Glow pulses
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1,   duration: 2200, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0.4, duration: 2200, useNativeDriver: true }),
    ])).start();
    // Fill arc spins in from 0 to final
    Animated.timing(ringRotate, {
      toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true, delay: 200,
    }).start();
    // Score counts up
    const listener = scoreAnim.addListener(({ value }) => setDisplayScore(Math.round(value)));
    Animated.timing(scoreAnim, {
      toValue: stressPct, duration: 1100,
      easing: Easing.out(Easing.cubic), useNativeDriver: false, delay: 300,
    }).start();
    return () => scoreAnim.removeListener(listener);
  }, []);

  const ringRotateDeg = ringRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const anims = useStagger(9, 120);

  const AnimBlock = ({ i, children }: { i: number; children: React.ReactNode }) => (
    <Animated.View style={{
      opacity: anims[i],
      transform: [{ translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }]
    }}>
      {children}
    </Animated.View>
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* ── HERO SCORE ── */}
      <AnimBlock i={0}>
        <View style={s.hero}>
          <Animated.View style={[s.heroGlow, { backgroundColor: stressColor + '20', opacity: glowAnim }]} />

          <Text style={[Font.label, { color: C.textDim, marginBottom: Space['3'] }]}>
            Your ScreenSense analysis
          </Text>

          {/* Big ring — spring entrance + spinning fill */}
          <Animated.View style={[s.ringOuter, { transform: [{ scale: ringScale }] }]}>
            <View style={[s.ringInner, { borderColor: stressColor + '40' }]}>
              <Animated.View style={[s.ringFill, { borderColor: stressColor, transform: [{ rotate: ringRotateDeg }] }]} />
              <View style={s.ringCenter}>
                <Text style={[Font.display, { color: stressColor, fontSize: 60, lineHeight: 64 }]}>{displayScore}</Text>
                <Text style={[Font.caption, { color: C.textDim }]}>/ 100 stress</Text>
              </View>
            </View>
          </Animated.View>

          <Text style={[Font.h2, { color: stressColor, marginBottom: Space['2'] }]}>
            {result.stress_category.charAt(0).toUpperCase() + result.stress_category.slice(1)} stress
          </Text>

          {/* Confidence interval — split-conformal prediction (Vovk et al. 2005) */}
          {result.prediction_interval && (() => {
            const piLo = Math.round(result.prediction_interval.low  * 100);
            const piHi = Math.round(result.prediction_interval.high * 100);
            const width = piHi - piLo;
            const wide = width > 30;                 // >30 pts = low-confidence window
            const coveragePct = Math.round((result.prediction_interval.coverage ?? 0.9) * 100);
            return (
              <View style={s.confRow}>
                <Text style={[Font.caption, { color: C.textDim }]}>
                  Likely between <Text style={{ color: stressColor, fontWeight: '700' }}>{piLo}</Text>
                  {' – '}
                  <Text style={{ color: stressColor, fontWeight: '700' }}>{piHi}</Text>
                  {' '}at {coveragePct}% confidence
                </Text>
                {wide && (
                  <Text style={[Font.micro, { color: C.warning, marginTop: 4, textAlign: 'center' }]}>
                    ⚠ Wider-than-usual range — add a journal entry for a sharper estimate
                  </Text>
                )}
              </View>
            );
          })()}

          {/* Conformal prediction SET — LAC (Angelopoulos & Bates, 2023) */}
          {result.prediction_set?.length > 1 && (
            <View style={s.predSetRow}>
              <Text style={[Font.micro, { color: C.textDim, textAlign: 'center' }]}>
                Uncertainty set:{' '}
                <Text style={{ fontWeight: '700' }}>{result.prediction_set.join(' or ')}</Text>
                {'  '}· 90% coverage guarantee · Vovk et al. (2005)
              </Text>
            </View>
          )}

          <Text style={[Font.micro, { color: C.textGhost, letterSpacing: 0.3, marginTop: Space['2'] }]}>
            {result.ensemble_method && result.rf_stress_score != null
              ? `RF + BiLSTM ensemble · Torous et al. (2017)`
              : 'Random Forest · Breiman (2001) · scikit-learn'}
          </Text>
        </View>
      </AnimBlock>

      {/* ── CONTEXT TAGS ── */}
      <AnimBlock i={1}>
        <View style={s.tagsRow}>
          <Tag text={mood} color={moodColor} />
          {result.weather_condition && <Tag text={result.weather_condition} color={C.teal} />}
          {result.neighbourhood && <Tag text={result.neighbourhood} color={C.warning} />}
          <Tag text={`Care Level ${careLevel}`} color={careColor} />
        </View>

        {/* Anomaly detection banner — Isolation Forest (Liu et al., 2008) */}
        {result.anomaly?.is_anomaly && (
          <View style={s.anomalyBanner}>
            <Text style={s.anomalyIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.anomalyTitle}>Unusual check-in detected</Text>
              <Text style={s.anomalyMsg}>{result.anomaly.message}</Text>
              <Text style={s.anomalyMeta}>
                Isolation Forest · Liu et al. (2008) · score {result.anomaly.decision_score}
                {' '}· {result.anomaly.history_size} entries in baseline
              </Text>
            </View>
          </View>
        )}
      </AnimBlock>

      {/* ── CARE PATHWAY ── */}
      <AnimBlock i={2}>
        <View style={[s.careCard, { backgroundColor: careColor + '10', borderColor: careColor + '30' }]}>
          <View style={s.careHeader}>
            <View style={[s.careLevelBadge, { backgroundColor: careColor + '20' }]}>
              <Text style={[s.careLevelTxt, { color: careColor }]}>
                {['✅ Stable', '📊 Monitor', '⚠️ Intervention', '🆘 Crisis'][careLevel - 1]}
              </Text>
            </View>
            <Text style={[Font.micro, { color: C.textGhost }]}>NHS stepped care</Text>
          </View>
          <Text style={[Font.body, { color: C.textSub, lineHeight: 22 }]}>{result.care_description}</Text>
          {result.clinical_note && (
            <Text style={[Font.caption, { color: C.textDim, marginTop: Space['3'], fontStyle: 'italic' }]}>
              {result.clinical_note}
            </Text>
          )}
          {result.show_crisis_resources && (
            <AnimatedPress style={[s.crisisLink, { borderColor: careColor + '40' }]} onPress={() => onNavigate?.('crisis')} scale={0.97}>
              <Text style={[s.crisisLinkTxt, { color: careColor }]}>View support resources →</Text>
            </AnimatedPress>
          )}
        </View>
      </AnimBlock>

      {/* ── SHAP EXPLAINABILITY ── */}
      {result.shap_explanation && (
        <AnimBlock i={3}>
          <View style={s.section}>
            <Text style={[Font.label, s.sectionLabel]}>Why this score?</Text>
            <View style={s.shapCard}>

              {/* Summary sentence — the human-readable "driven by" headline */}
              {result.shap_explanation.summary_sentence ? (
                <View style={s.shapSummary}>
                  <Text style={[Font.caption, { color: C.textDim, lineHeight: 20 }]}>
                    {result.shap_explanation.summary_sentence}
                  </Text>
                </View>
              ) : (
                <View style={s.shapTopDriver}>
                  <Text style={[Font.caption, { color: C.textDim }]}>Biggest driver today</Text>
                  <Text style={[Font.h3, { color: stressColor }]}>
                    {result.shap_explanation.top_driver} · {result.shap_explanation.top_driver_pct}%
                  </Text>
                </View>
              )}

              {result.shap_explanation.contributions.slice(0, 5).map((c: any) => {
                const isStress = c.direction === 'increases_stress';
                const barColor = isStress ? stressColor : C.stressLow;
                return (
                  <View key={c.feature} style={s.shapRow}>
                    <Text style={s.shapIcon}>{c.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={s.shapRowHeader}>
                        <Text style={[Font.caption, { color: C.textSub, fontWeight: '500' }]}>{c.label}</Text>
                        <View style={s.shapPctRow}>
                          <Text style={[Font.caption, { color: barColor, fontWeight: '700' }]}>
                            {isStress ? '↑' : '↓'} {c.pct_contribution}%
                          </Text>
                          {c.delta_formatted != null && (
                            <Text style={[Font.micro, { color: C.textGhost, marginLeft: 6 }]}>
                              {c.delta_formatted}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={s.shapTrack}>
                        <View style={[s.shapFill, { width: `${Math.min(c.pct_contribution, 100)}%` as any, backgroundColor: barColor }]} />
                      </View>
                    </View>
                  </View>
                );
              })}

              {result.shap_explanation.narrative && (
                <View style={s.shapNarrativeBox}>
                  <Text style={[Font.caption, { color: C.textDim, fontWeight: '600', marginBottom: 4 }]}>
                    What's driving your score
                  </Text>
                  {result.shap_explanation.narrative.split('\n\n').map((line: string, idx: number) => (
                    <Text key={idx} style={[Font.micro, { color: C.textSub, lineHeight: 18, marginBottom: 4 }]}>
                      {line.replace(/\*\*/g, '')}
                    </Text>
                  ))}
                </View>
              )}

              <Text style={[Font.micro, { color: C.textGhost, marginTop: Space['3'], fontStyle: 'italic' }]}>
                Lundberg & Lee (2017). SHAP — unified model interpretation. NeurIPS.
              </Text>
            </View>
          </View>
        </AnimBlock>
      )}

      {/* ── MESSAGE ── */}
      <AnimBlock i={4}>
        <View style={s.section}>
          <Text style={[Font.label, s.sectionLabel]}>Your message</Text>
          <View style={[s.messageCard, { borderLeftColor: C.teal }]}>
            <Text style={[Font.body, { color: C.text, fontStyle: 'italic', lineHeight: 26 }]}>
              {result.personalised_message}
            </Text>
          </View>
          {result.care_level < 4 && (
            <View style={[s.messageCard, { borderLeftColor: C.violetSoft, marginTop: Space['2'] }]}>
              <Text style={[Font.caption, { color: C.textDim, marginBottom: Space['1'] }]}>Reflection prompt</Text>
              <Text style={[Font.body, { color: C.textSub }]}>{result.cbt_prompt}</Text>
            </View>
          )}
        </View>
      </AnimBlock>

      {/* ── PLACES ── */}
      {result.care_level < 4 && result.place_recommendations?.length > 0 && (
        <AnimBlock i={5}>
          <View style={s.section}>
            <Text style={[Font.label, s.sectionLabel]}>Recommended places nearby</Text>
            {result.place_recommendations.map((p: any, i: number) => (
              <View key={i} style={s.placeCard}>
                <View style={s.placeIconBox}>
                  <Text style={{ fontSize: 24 }}>{p.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.placeTopRow}>
                    <Text style={[Font.h3, { fontSize: 15 }]}>{p.name}</Text>
                    {p.distance_m != null && (
                      <Text style={[Font.caption, { color: C.teal, fontWeight: '600' }]}>{p.distance_m}m</Text>
                    )}
                  </View>
                  <Text style={[Font.micro, { color: C.violet, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Space['1'] }]}>{p.type}</Text>
                  <Text style={[Font.caption, { color: C.textDim, lineHeight: 18 }]}>{p.reason}</Text>
                </View>
              </View>
            ))}
          </View>
        </AnimBlock>
      )}

      {/* ── FEEDBACK ── */}
      <AnimBlock i={6}>
        <View style={s.section}>
          <Text style={[Font.label, s.sectionLabel]}>Was this helpful?</Text>
          <View style={s.feedbackCard}>
            <Text style={[Font.caption, { color: C.textDim, marginBottom: Space['4'], lineHeight: 20 }]}>
              Your rating trains the AI to give better recommendations — Fogg (2009), content-based filtering (Lops et al., 2011).
            </Text>
            {feedbackMsg ? (
              <View style={s.feedbackConfirm}>
                <Text style={[Font.body, { color: C.stressLow, fontWeight: '600' }]}>✓ {feedbackMsg}</Text>
              </View>
            ) : (
              <View style={s.feedbackBtns}>
                <AnimatedPress
                  style={[s.fbBtn, s.fbBtnYes, feedbackSent === 'helpful' && s.fbBtnActive]}
                  onPress={() => handleFeedback(true)}
                  scale={0.94}
                >
                  <Text style={s.fbBtnTxt}>👍  Helpful</Text>
                </AnimatedPress>
                <AnimatedPress
                  style={[s.fbBtn, s.fbBtnNo, feedbackSent === 'not_helpful' && s.fbBtnActive]}
                  onPress={() => handleFeedback(false)}
                  scale={0.94}
                >
                  <Text style={[s.fbBtnTxt, { color: C.textDim }]}>👎  Not for me</Text>
                </AnimatedPress>
              </View>
            )}
          </View>
        </View>
      </AnimBlock>

      {/* ── COUNTERFACTUAL EXPLANATIONS ── */}
      {result.counterfactual?.changes?.length > 0 && (
        <AnimBlock i={7}>
          <View style={s.section}>
            <Text style={[Font.label, s.sectionLabel]}>What could help?</Text>
            <View style={s.cfCard}>
              <Text style={[Font.caption, { color: C.textDim, lineHeight: 20, marginBottom: Space['4'] }]}>
                {result.counterfactual.narrative}
              </Text>
              {result.counterfactual.changes.map((c: any) => {
                const isReduction = c.delta < 0;
                const arrowColor = isReduction ? C.stressLow : C.warning;
                return (
                  <View key={c.feature} style={s.cfRow}>
                    <View style={[s.cfDot, { backgroundColor: arrowColor + '30' }]}>
                      <Text style={{ fontSize: 12, color: arrowColor }}>{isReduction ? '↓' : '↑'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={s.cfRowTop}>
                        <Text style={[Font.caption, { color: C.textSub, fontWeight: '600' }]}>{c.label}</Text>
                        <Text style={[Font.caption, { color: arrowColor, fontWeight: '700' }]}>
                          {c.delta > 0 ? '+' : ''}{c.delta.toFixed(1)}{c.unit}
                        </Text>
                      </View>
                      <Text style={[Font.micro, { color: C.textGhost }]}>
                        {c.from}{c.unit} → {c.to}{c.unit}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <View style={s.cfFooter}>
                <Text style={[Font.micro, { color: C.textGhost, fontStyle: 'italic' }]}>
                  {result.counterfactual.achieved
                    ? '✓ These changes are predicted to shift you to lower stress'
                    : 'Partial improvement — further changes may also help'}
                </Text>
                <Text style={[Font.micro, { color: C.textGhost, marginTop: 4, fontStyle: 'italic' }]}>
                  Counterfactual method — Wachter et al. (2017)
                </Text>
              </View>
            </View>
          </View>
        </AnimBlock>
      )}

      {/* ── RATIONALE ── */}
      <AnimBlock i={8}>
        {result.care_level < 4 && (
          <View style={s.section}>
            <Text style={[Font.label, s.sectionLabel]}>Psychological rationale</Text>
            <Text style={[Font.caption, { color: C.textDim, lineHeight: 20, fontStyle: 'italic' }]}>
              {result.rationale}
            </Text>
          </View>
        )}

        {/* I need help button — always visible */}
        <AnimatedPress style={s.helpBtn} onPress={() => onNavigate?.('crisis')} scale={0.97}>
          <Text style={s.helpBtnTxt}>🆘  I need support right now</Text>
        </AnimatedPress>

        <AnimatedPress style={s.resetBtn} onPress={onReset} scale={0.96}>
          <Text style={[Font.caption, { color: C.textDim, fontWeight: '600' }]}>Start new check-in</Text>
        </AnimatedPress>
      </AnimBlock>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={[ts.t, { backgroundColor: color + '18' }]}>
      <Text style={[ts.txt, { color }]}>{text}</Text>
    </View>
  );
}
const ts = StyleSheet.create({
  t: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, marginRight: 6, marginBottom: 6 },
  txt: { fontSize: 12, fontWeight: '600' },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingBottom: 40, maxWidth: 680, alignSelf: 'center' as any, width: '100%' },

  // Hero
  hero: { alignItems: 'center', paddingTop: Space['10'], paddingBottom: Space['8'], paddingHorizontal: Space['6'], position: 'relative' },
  heroGlow: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -40, alignSelf: 'center' as any },
  ringOuter: { position: 'relative', width: 160, height: 160, marginBottom: Space['5'] },
  ringInner: { width: 160, height: 160, borderRadius: 80, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringFill:  { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 3, borderLeftColor: 'transparent', borderBottomColor: 'transparent', transform: [{ rotate: '45deg' }] },
  ringCenter: { alignItems: 'center' },
  confRow: { alignItems: 'center', marginBottom: Space['2'] },

  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Space['6'], marginBottom: Space['4'] },

  // Care card
  careCard: { marginHorizontal: Space['6'], borderRadius: Radius.lg, padding: Space['5'], borderWidth: 1, marginBottom: Space['5'] },
  careHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Space['3'] },
  careLevelBadge: { borderRadius: Radius.full, paddingHorizontal: Space['4'], paddingVertical: Space['2'] },
  careLevelTxt: { fontSize: 12, fontWeight: '700' },
  crisisLink: { marginTop: Space['4'], borderWidth: 1, borderRadius: Radius.md, padding: Space['3'], alignItems: 'center' },
  crisisLinkTxt: { fontSize: 13, fontWeight: '700' },

  // Sections
  section: { paddingHorizontal: Space['6'], marginBottom: Space['5'] },
  sectionLabel: { marginBottom: Space['3'] },

  // SHAP
  shapCard: { backgroundColor: C.card, borderRadius: Radius.lg, padding: Space['5'], ...Shadow.sm },
  shapSummary: { backgroundColor: 'rgba(124,110,250,0.08)', borderRadius: Radius.md, padding: Space['4'], marginBottom: Space['4'], borderWidth: 1, borderColor: 'rgba(124,110,250,0.2)' },
  shapTopDriver: { marginBottom: Space['4'], paddingBottom: Space['4'], borderBottomWidth: 1, borderBottomColor: C.line },
  shapRow: { flexDirection: 'row', alignItems: 'center', gap: Space['3'], marginBottom: Space['3'] },
  shapIcon: { fontSize: 16, width: 24 },
  shapRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Space['1'] },
  shapPctRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  shapTrack: { height: 4, backgroundColor: C.elevated, borderRadius: 2 },
  shapFill: { height: 4, borderRadius: 2 },
  shapNarrativeBox: { marginTop: Space['4'], paddingTop: Space['4'], borderTopWidth: 1, borderTopColor: C.line },

  // Message
  messageCard: { backgroundColor: C.card, borderRadius: Radius.md, padding: Space['5'], borderLeftWidth: 3, ...Shadow.sm },

  // Places
  placeCard: { backgroundColor: C.card, borderRadius: Radius.md, padding: Space['4'], marginBottom: Space['2'], flexDirection: 'row', gap: Space['3'], alignItems: 'flex-start', ...Shadow.sm },
  placeIconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  placeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Space['1'] },

  // Feedback
  feedbackCard: { backgroundColor: C.card, borderRadius: Radius.lg, padding: Space['5'], ...Shadow.sm },
  feedbackBtns: { flexDirection: 'row', gap: Space['3'] },
  fbBtn: { flex: 1, borderRadius: Radius.md, padding: Space['4'], alignItems: 'center', borderWidth: 1 },
  fbBtnYes: { backgroundColor: 'rgba(45,212,191,0.08)', borderColor: 'rgba(45,212,191,0.25)' },
  fbBtnNo: { backgroundColor: C.elevated, borderColor: C.line },
  fbBtnActive: { opacity: 0.6 },
  fbBtnTxt: { fontSize: 14, color: C.stressLow, fontWeight: '600' },
  feedbackConfirm: { backgroundColor: 'rgba(45,212,191,0.08)', borderRadius: Radius.md, padding: Space['4'], alignItems: 'center' },

  // Prediction set
  predSetRow: { backgroundColor: 'rgba(124,110,250,0.07)', borderRadius: Radius.md, paddingHorizontal: Space['4'], paddingVertical: Space['2'], marginTop: Space['2'], borderWidth: 1, borderColor: 'rgba(124,110,250,0.18)' },

  // Anomaly banner
  anomalyBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Space['3'], marginHorizontal: Space['6'], marginBottom: Space['3'], backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: Radius.md, padding: Space['4'], borderWidth: 1, borderColor: 'rgba(251,191,36,0.28)' },
  anomalyIcon: { fontSize: 20, lineHeight: 24 },
  anomalyTitle: { fontSize: 13, fontWeight: '700', color: C.warning, marginBottom: 2 },
  anomalyMsg: { fontSize: 12, color: C.textSub, lineHeight: 18, marginBottom: 4 },
  anomalyMeta: { fontSize: 9, color: C.textGhost, fontFamily: 'monospace' as any },

  // Counterfactual
  cfCard: { backgroundColor: C.card, borderRadius: Radius.lg, padding: Space['5'], ...Shadow.sm },
  cfRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Space['3'], marginBottom: Space['3'] },
  cfDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cfRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cfFooter: { marginTop: Space['3'], paddingTop: Space['3'], borderTopWidth: 1, borderTopColor: C.line },

  // Buttons
  helpBtn: { marginHorizontal: Space['6'], backgroundColor: 'rgba(248,113,113,0.10)', borderRadius: Radius.lg, padding: Space['5'], alignItems: 'center', marginBottom: Space['3'] },
  helpBtnTxt: { fontSize: 14, color: C.danger, fontWeight: '700' },
  resetBtn: { alignItems: 'center', padding: Space['4'] },
});
