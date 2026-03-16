import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing,
} from 'react-native';
import { C, Space, Radius, Font, Shadow } from '../utils/theme';

interface Props {
  result: any;
  mood: string;
  onReset: () => void;
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

export default function ResultScreen({ result, mood, onReset }: Props) {
  const stressColor = result.predicted_stress_score > 0.66 ? C.stressHigh
                    : result.predicted_stress_score > 0.33 ? C.stressMid
                    : C.stressLow;
  const stressPct = Math.round(result.predicted_stress_score * 100);
  const moodColor = MOOD_COLORS[mood] || C.violet;
  const careLevel = result.care_level || 1;
  const careLevelColors = [C.stressLow, C.stressMid, C.warning, C.stressHigh];
  const careColor = careLevelColors[careLevel - 1] || C.violet;

  const anims = useStagger(7, 120);

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
          <View style={[s.heroGlow, { backgroundColor: stressColor + '15' }]} />

          <Text style={[Font.label, { color: C.textDim, marginBottom: Space['3'] }]}>
            Your ScreenSense analysis
          </Text>

          {/* Big ring */}
          <View style={s.ringOuter}>
            <View style={[s.ringInner, { borderColor: stressColor + '40' }]}>
              <View style={[s.ringFill, { borderColor: stressColor }]} />
              <View style={s.ringCenter}>
                <Text style={[Font.display, { color: stressColor, fontSize: 60, lineHeight: 64 }]}>{stressPct}</Text>
                <Text style={[Font.caption, { color: C.textDim }]}>/ 100 stress</Text>
              </View>
            </View>
          </View>

          <Text style={[Font.h2, { color: stressColor, marginBottom: Space['2'] }]}>
            {result.stress_category.charAt(0).toUpperCase() + result.stress_category.slice(1)} stress
          </Text>
          <Text style={[Font.micro, { color: C.textGhost, letterSpacing: 0.3 }]}>
            Random Forest · Breiman (2001) · scikit-learn
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
            <TouchableOpacity style={[s.crisisLink, { borderColor: careColor + '40' }]}>
              <Text style={[s.crisisLinkTxt, { color: careColor }]}>View support resources →</Text>
            </TouchableOpacity>
          )}
        </View>
      </AnimBlock>

      {/* ── SHAP EXPLAINABILITY ── */}
      {result.shap_explanation && (
        <AnimBlock i={3}>
          <View style={s.section}>
            <Text style={[Font.label, s.sectionLabel]}>Why this score?</Text>
            <View style={s.shapCard}>
              <View style={s.shapTopDriver}>
                <Text style={[Font.caption, { color: C.textDim }]}>Biggest driver today</Text>
                <Text style={[Font.h3, { color: stressColor }]}>
                  {result.shap_explanation.top_driver} · {result.shap_explanation.top_driver_pct}%
                </Text>
              </View>
              {result.shap_explanation.contributions.slice(0, 5).map((c: any, i: number) => {
                const isStress = c.direction === 'increases_stress';
                const barColor = isStress ? stressColor : C.stressLow;
                return (
                  <View key={c.feature} style={s.shapRow}>
                    <Text style={s.shapIcon}>{c.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={s.shapRowHeader}>
                        <Text style={[Font.caption, { color: C.textSub, fontWeight: '500' }]}>{c.label}</Text>
                        <Text style={[Font.caption, { color: barColor, fontWeight: '700' }]}>
                          {isStress ? '↑' : '↓'} {c.pct_contribution}%
                        </Text>
                      </View>
                      <View style={s.shapTrack}>
                        <View style={[s.shapFill, { width: `${Math.min(c.pct_contribution, 100)}%` as any, backgroundColor: barColor }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
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

      {/* ── RATIONALE ── */}
      <AnimBlock i={6}>
        {result.care_level < 4 && (
          <View style={s.section}>
            <Text style={[Font.label, s.sectionLabel]}>Psychological rationale</Text>
            <Text style={[Font.caption, { color: C.textDim, lineHeight: 20, fontStyle: 'italic' }]}>
              {result.rationale}
            </Text>
          </View>
        )}

        {/* I need help button — always visible */}
        <TouchableOpacity style={s.helpBtn}>
          <Text style={s.helpBtnTxt}>🆘  I need support right now</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.resetBtn} onPress={onReset}>
          <Text style={[Font.caption, { color: C.textDim, fontWeight: '600' }]}>Start new check-in</Text>
        </TouchableOpacity>
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
  shapTopDriver: { marginBottom: Space['4'], paddingBottom: Space['4'], borderBottomWidth: 1, borderBottomColor: C.line },
  shapRow: { flexDirection: 'row', alignItems: 'center', gap: Space['3'], marginBottom: Space['3'] },
  shapIcon: { fontSize: 16, width: 24 },
  shapRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Space['1'] },
  shapTrack: { height: 4, backgroundColor: C.elevated, borderRadius: 2 },
  shapFill: { height: 4, borderRadius: 2 },

  // Message
  messageCard: { backgroundColor: C.card, borderRadius: Radius.md, padding: Space['5'], borderLeftWidth: 3, ...Shadow.sm },

  // Places
  placeCard: { backgroundColor: C.card, borderRadius: Radius.md, padding: Space['4'], marginBottom: Space['2'], flexDirection: 'row', gap: Space['3'], alignItems: 'flex-start', ...Shadow.sm },
  placeIconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  placeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Space['1'] },

  // Buttons
  helpBtn: { marginHorizontal: Space['6'], backgroundColor: 'rgba(248,113,113,0.10)', borderRadius: Radius.lg, padding: Space['5'], alignItems: 'center', marginBottom: Space['3'] },
  helpBtnTxt: { fontSize: 14, color: C.danger, fontWeight: '700' },
  resetBtn: { alignItems: 'center', padding: Space['4'] },
});
