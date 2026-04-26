import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../services/api';

const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.55)', SUB = 'rgba(238,240,255,0.32)',
      CARD = 'rgba(255,255,255,0.05)', BOR = 'rgba(255,255,255,0.09)';

// ── PHQ-9 Questions (Kroenke et al., 2001) ─────────────────────
const PHQ9 = {
  id: 'phq9',
  title: 'PHQ-9',
  fullTitle: 'Patient Health Questionnaire',
  description: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
  citation: 'Kroenke, K., Spitzer, R.L., & Williams, J.B. (2001). The PHQ-9. Journal of General Internal Medicine, 16(9), 606-613.',
  color: V,
  options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
  scores: [0, 1, 2, 3],
  questions: [
    'Little interest or pleasure in doing things',
    'Feeling down, depressed, or hopeless',
    'Trouble falling or staying asleep, or sleeping too much',
    'Feeling tired or having little energy',
    'Poor appetite or overeating',
    'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
    'Trouble concentrating on things, such as reading the newspaper or watching television',
    'Moving or speaking so slowly that other people could have noticed — or being so fidgety or restless that you have been moving around a lot more than usual',
    'Thoughts that you would be better off dead, or thoughts of hurting yourself in some way',
  ],
  interpret: (score: number) => {
    if (score <= 4)  return { label: 'Minimal', color: G, desc: 'Minimal depressive symptoms. Continue monitoring.', care: 1 };
    if (score <= 9)  return { label: 'Mild', color: A, desc: 'Mild depression. Self-help and monitoring recommended.', care: 2 };
    if (score <= 14) return { label: 'Moderate', color: '#FF8A65', desc: 'Moderate depression. Consider speaking to a GP or counsellor.', care: 3 };
    if (score <= 19) return { label: 'Moderately severe', color: R, desc: 'Moderately severe depression. Professional support strongly recommended.', care: 3 };
    return { label: 'Severe', color: '#C62828', desc: 'Severe depression. Please seek professional help as soon as possible.', care: 4 };
  },
};

// ── GAD-7 Questions (Spitzer et al., 2006) ─────────────────────
const GAD7 = {
  id: 'gad7',
  title: 'GAD-7',
  fullTitle: 'Generalised Anxiety Disorder Scale',
  description: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
  citation: 'Spitzer, R.L., Kroenke, K., Williams, J.B., & Löwe, B. (2006). A brief measure for assessing generalized anxiety disorder. Archives of Internal Medicine, 166(10), 1092-1097.',
  color: C,
  options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
  scores: [0, 1, 2, 3],
  questions: [
    'Feeling nervous, anxious, or on edge',
    'Not being able to stop or control worrying',
    'Worrying too much about different things',
    'Trouble relaxing',
    'Being so restless that it\'s hard to sit still',
    'Becoming easily annoyed or irritable',
    'Feeling afraid as if something awful might happen',
  ],
  interpret: (score: number) => {
    if (score <= 4)  return { label: 'Minimal', color: G, desc: 'Minimal anxiety. Continue self-monitoring.', care: 1 };
    if (score <= 9)  return { label: 'Mild', color: A, desc: 'Mild anxiety. Self-help strategies recommended.', care: 2 };
    if (score <= 14) return { label: 'Moderate', color: '#FF8A65', desc: 'Moderate anxiety. Consider speaking to a GP.', care: 3 };
    return { label: 'Severe', color: R, desc: 'Severe anxiety. Professional support strongly recommended.', care: 4 };
  },
};

// ── WHO-5 (Bech et al., 1998) ──────────────────────────────────
const WHO5 = {
  id: 'who5',
  title: 'WHO-5',
  fullTitle: 'WHO Wellbeing Index',
  description: 'Over the last two weeks, how have you been feeling?',
  citation: 'Bech, P. (1998). Quality of life in the psychiatric patient. Mosby-Wolfe.',
  color: G,
  options: ['At no time', 'Some of the time', 'Less than half the time', 'More than half the time', 'Most of the time', 'All of the time'],
  scores: [0, 1, 2, 3, 4, 5],
  questions: [
    'I have felt cheerful and in good spirits',
    'I have felt calm and relaxed',
    'I have felt active and vigorous',
    'I woke up feeling fresh and rested',
    'My daily life has been filled with things that interest me',
  ],
  interpret: (score: number) => {
    const pct = score * 4; // WHO-5 multiplied by 4 = 0-100
    if (pct >= 72) return { label: 'Good wellbeing', color: G, desc: 'Your wellbeing score is in the healthy range.', care: 1 };
    if (pct >= 50) return { label: 'Moderate wellbeing', color: A, desc: 'Moderate wellbeing. Some areas to focus on.', care: 2 };
    return { label: 'Low wellbeing', color: R, desc: 'Low wellbeing score. Consider speaking to a GP.', care: 3 };
  },
  scoreTransform: (raw: number) => raw * 4, // Convert to 0-100
};

const ASSESSMENTS = [PHQ9, GAD7, WHO5];

// Delta between most recent and second-most-recent result for each assessment.
// For PHQ-9 and GAD-7, lower is better. For WHO-5, higher is better.
function computeDelta(history: any[], assessmentId: string): { delta: number; better: boolean } | null {
  const entries = history.filter(h => h.id === assessmentId);
  if (entries.length < 2) return null;
  const newer = entries[0].score;
  const older  = entries[1].score;
  const delta = newer - older;
  const better = assessmentId === 'who5' ? delta > 0 : delta < 0;
  return { delta, better };
}

interface Props { userId?: string; }

export default function ClinicalScreen({ userId }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem('ss_clinical').then(v => {
      try { if (v) setHistory(JSON.parse(v)); } catch {}
    }).catch(() => {});
  }, []);

  const assessment = ASSESSMENTS.find(a => a.id === selected);

  const transitionQ = (next: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -15, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setCurrentQ(next);
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  const answer = async (score: number) => {
    const newAnswers = [...answers, score];
    setAnswers(newAnswers);
    if (currentQ < (assessment?.questions.length || 0) - 1) {
      transitionQ(currentQ + 1);
    } else {
      // Complete
      const total = newAnswers.reduce((a, b) => a + b, 0);
      const displayScore = assessment?.id === 'who5' ? total * 4 : total;
      const interp = assessment?.interpret(total);
      const resultData = {
        id: assessment?.id,
        title: assessment?.title,
        score: displayScore,
        rawScore: total,
        max: assessment?.id === 'who5' ? 100 : (assessment?.questions.length || 0) * 3,
        interpretation: interp,
        date: new Date().toISOString(),
        answers: newAnswers,
      };
      setResult(resultData);
      try {
        const raw = await AsyncStorage.getItem('ss_clinical');
        const saved = raw ? JSON.parse(raw) : [];
        saved.unshift(resultData);
        await AsyncStorage.setItem('ss_clinical', JSON.stringify(saved.slice(0, 20)));
        setHistory(saved.slice(0, 20));
      } catch {}

      // POST to backend so clinical scores inform the care pathway model
      if (userId) {
        fetch(`${BASE_URL}/clinical/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id:        userId,
            assessment_id:  resultData.id,
            score:          resultData.score,
            raw_score:      resultData.rawScore,
            interpretation: interp?.label,
            answers:        newAnswers,
          }),
        }).catch(() => {}); // fire-and-forget — local save already succeeded
      }
    }
  };

  const reset = () => {
    setSelected(null);
    setAnswers([]);
    setCurrentQ(0);
    setResult(null);
  };

  // ── Home ───────────────────────────────────────────────────
  if (!selected) {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <Text style={s.heroGreet}>Clinical measures</Text>
          <Text style={s.heroH}>Validated{'\n'}assessments</Text>
          <Text style={s.heroSub}>Evidence-based questionnaires used in NHS practice. Complete every 2–4 weeks — not daily.</Text>
        </View>

        <Text style={s.secLabel}>Available assessments</Text>
        {ASSESSMENTS.map(a => {
          const lastResult = history.find(h => h.id === a.id);
          const deltaInfo  = computeDelta(history, a.id);
          return (
            <TouchableOpacity key={a.id} style={[s.assessCard, { borderLeftColor: a.color }]}
              onPress={() => { setSelected(a.id); setAnswers([]); setCurrentQ(0); setResult(null); }}
              activeOpacity={0.85}>
              <View style={s.assessHeader}>
                <View style={{ flex: 1 }}>
                  <View style={s.assessTitleRow}>
                    <View style={[s.assessBadge, { backgroundColor: a.color + '20', borderColor: a.color + '40' }]}>
                      <Text style={[s.assessBadgeTxt, { color: a.color }]}>{a.title}</Text>
                    </View>
                    <Text style={s.assessQCount}>{a.questions.length} questions · ~2 min</Text>
                    {deltaInfo && (
                      <View style={[s.deltaBadge, { backgroundColor: deltaInfo.better ? G + '20' : R + '20' }]}>
                        <Text style={[s.deltaBadgeTxt, { color: deltaInfo.better ? G : R }]}>
                          {deltaInfo.better ? '↓' : '↑'}{Math.abs(deltaInfo.delta)} vs last
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.assessFullTitle}>{a.fullTitle}</Text>
                  <Text style={s.assessDesc}>{a.description.substring(0, 70)}…</Text>
                </View>
                {lastResult && (
                  <View style={[s.lastScore, { borderColor: lastResult.interpretation.color + '50', backgroundColor: lastResult.interpretation.color + '15' }]}>
                    <Text style={[s.lastScoreVal, { color: lastResult.interpretation.color }]}>{lastResult.score}</Text>
                    <Text style={s.lastScoreLbl}>last</Text>
                  </View>
                )}
              </View>
              <Text style={s.assessCite}>{a.citation.split('.')[0]} et al.</Text>
            </TouchableOpacity>
          );
        })}

        {history.length > 0 && (
          <>
            <Text style={[s.secLabel, { marginTop: 8 }]}>Recent results</Text>
            {history.slice(0, 5).map((h, i) => {
              // delta vs the next older result of the same type
              const sameType = history.filter(x => x.id === h.id);
              const myIdx    = sameType.findIndex(x => x === h);
              const prevH    = sameType[myIdx + 1];
              const hDelta   = prevH ? h.score - prevH.score : null;
              const hBetter  = hDelta !== null ? (h.id === 'who5' ? hDelta > 0 : hDelta < 0) : false;
              return (
                <View key={i} style={s.histCard}>
                  <View style={[s.histBadge, { backgroundColor: h.interpretation.color + '20', borderColor: h.interpretation.color + '35' }]}>
                    <Text style={[s.histBadgeTxt, { color: h.interpretation.color }]}>{h.title}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.histLabel}>{h.interpretation.label}</Text>
                    <Text style={s.histDate}>{new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                  {hDelta !== null && (
                    <Text style={[s.histDelta, { color: hBetter ? G : R }]}>
                      {hBetter ? '↓' : '↑'}{Math.abs(hDelta)}
                    </Text>
                  )}
                  <Text style={[s.histScore, { color: h.interpretation.color }]}>{h.score}/{h.max}</Text>
                </View>
              );
            })}
          </>
        )}

        <View style={s.disclaimerCard}>
          <Text style={s.disclaimerTitle}>Important</Text>
          <Text style={s.disclaimerTxt}>These are screening tools used to track symptoms over time — not diagnostic instruments. A high score does not mean you have a condition. If you are concerned about your results, please speak to a GP or mental health professional.</Text>
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  // ── Result ─────────────────────────────────────────────────
  if (result) {
    const interp = result.interpretation;
    // Delta vs previous attempt of the same type
    const prevEntries = history.filter(h => h.id === result.id);
    const prevResult  = prevEntries.length >= 2 ? prevEntries[1] : null;
    const scoreDelta  = prevResult ? result.score - prevResult.score : null;
    const deltaIsBetter = scoreDelta !== null
      ? (result.id === 'who5' ? scoreDelta > 0 : scoreDelta < 0)
      : false;
    return (
      <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.resultHero}>
          <View style={[s.resultOrb, { backgroundColor: interp.color + '18' }]} />
          <Text style={s.resultLabel}>{result.title} result</Text>
          <View style={[s.resultRing, { borderColor: interp.color + '60', backgroundColor: interp.color + '14' }]}>
            <Text style={[s.resultScore, { color: interp.color }]}>{result.score}</Text>
            <Text style={s.resultMax}>/ {result.max}</Text>
          </View>
          <Text style={[s.resultInterp, { color: interp.color }]}>{interp.label}</Text>
        </View>

        <View style={[s.resultCard, { borderLeftColor: interp.color }]}>
          <Text style={s.resultCardTitle}>What this means</Text>
          <Text style={s.resultCardTxt}>{interp.desc}</Text>
        </View>

        {scoreDelta !== null && (
          <View style={[s.resultCard, { borderLeftColor: deltaIsBetter ? G : R, backgroundColor: (deltaIsBetter ? G : R) + '0A' }]}>
            <Text style={s.resultCardTitle}>Change since last assessment</Text>
            <Text style={[s.resultCardTxt, { color: deltaIsBetter ? G : R, fontWeight: '700' }]}>
              {deltaIsBetter ? '↓' : '↑'} {Math.abs(scoreDelta)} point{Math.abs(scoreDelta) !== 1 ? 's' : ''} {deltaIsBetter ? 'lower' : 'higher'} than last time
            </Text>
            <Text style={[s.resultCardTxt, { fontSize: 12, color: MUT, marginTop: 4 }]}>
              {prevResult?.score} → {result.score}
              {' · '}
              {deltaIsBetter
                ? (result.id === 'who5' ? 'Your wellbeing has improved.' : 'Your symptoms have reduced — positive progress.')
                : (result.id === 'who5' ? 'Your wellbeing has dipped — worth monitoring.' : 'Scores have increased — consider additional support.')}
            </Text>
          </View>
        )}

        <View style={s.resultCard}>
          <Text style={s.resultCardTitle}>Care level</Text>
          <Text style={s.resultCardTxt}>
            {interp.care === 1 && 'Level 1 — Continue self-monitoring and positive habits.'}
            {interp.care === 2 && 'Level 2 — Guided self-help recommended. Try the therapy tools in ScreenSense.'}
            {interp.care === 3 && 'Level 3 — Structured support recommended. Consider speaking to your GP or university wellbeing service.'}
            {interp.care === 4 && 'Level 4 — Please seek professional support. Your GP can refer you to NHS Talking Therapies.'}
          </Text>
          {interp.care >= 3 && (
            <View style={s.nhsCard}>
              <Text style={s.nhsCardTxt}>🏥 NHS Talking Therapies: talkingtherapies.nhs.uk · 0300 123 3393</Text>
            </View>
          )}
        </View>

        <View style={s.resultCard}>
          <Text style={s.resultCardTitle}>Citation</Text>
          <Text style={[s.resultCardTxt, { fontStyle: 'italic', fontSize: 11 }]}>
            {ASSESSMENTS.find(a => a.id === result.id)?.citation}
          </Text>
        </View>

        <TouchableOpacity style={s.doneBtn} onPress={reset}>
          <Text style={s.doneBtnTxt}>Back to assessments</Text>
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  // ── Question ───────────────────────────────────────────────
  if (!assessment) return null;
  const progress = (currentQ + 1) / assessment.questions.length;

  return (
    <View style={s.root}>
      <View style={s.qProgressWrap}>
        <View style={[s.qProgressFill, { width: `${progress * 100}%` as any, backgroundColor: assessment.color }]} />
      </View>

      <View style={s.qHeader}>
        <TouchableOpacity onPress={reset}><Text style={s.qBack}>← Exit</Text></TouchableOpacity>
        <Text style={s.qCount}>{currentQ + 1} / {assessment.questions.length}</Text>
        <View style={[s.qBadge, { backgroundColor: assessment.color + '20', borderColor: assessment.color + '40' }]}>
          <Text style={[s.qBadgeTxt, { color: assessment.color }]}>{assessment.title}</Text>
        </View>
      </View>

      <Animated.View style={[s.qContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={s.qInstruction}>{assessment.description}</Text>
        <Text style={s.qText}>{assessment.questions[currentQ]}</Text>
      </Animated.View>

      <View style={s.qOptions}>
        {assessment.options.map((opt, i) => (
          <TouchableOpacity key={i} style={[s.qOption, { borderColor: assessment.color + '35' }]}
            onPress={() => { answer(assessment.scores[i]).catch(() => {}); }} activeOpacity={0.8}>
            <View style={[s.qOptionDot, { backgroundColor: assessment.color + '30', borderColor: assessment.color + '60' }]}>
              <Text style={[s.qOptionDotTxt, { color: assessment.color }]}>{i}</Text>
            </View>
            <Text style={s.qOptionTxt}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 28, paddingBottom: 40, maxWidth: 680, alignSelf: 'center' as any, width: '100%' },

  hero: { paddingTop: 40, paddingBottom: 24 },
  heroGreet: { fontSize: 11, color: SUB, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  heroH: { fontSize: 36, fontWeight: '800', color: TXT, letterSpacing: -1, marginBottom: 8, lineHeight: 40 },
  heroSub: { fontSize: 13, color: MUT, lineHeight: 20 },

  secLabel: { fontSize: 11, fontWeight: '700', color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  assessCard: { backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: BOR, borderLeftWidth: 3 },
  assessHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  assessTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  assessBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  assessBadgeTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  assessQCount: { fontSize: 10, color: SUB },
  assessFullTitle: { fontSize: 14, fontWeight: '700', color: TXT, marginBottom: 3 },
  assessDesc: { fontSize: 12, color: MUT, lineHeight: 18 },
  assessCite: { fontSize: 10, color: SUB, fontStyle: 'italic', marginTop: 6 },
  lastScore: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center', minWidth: 48 },
  lastScoreVal: { fontSize: 18, fontWeight: '800', lineHeight: 20 },
  lastScoreLbl: { fontSize: 8, color: SUB, textTransform: 'uppercase' },
  deltaBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  deltaBadgeTxt: { fontSize: 10, fontWeight: '700' },

  histCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 0.5, borderColor: BOR },
  histBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  histBadgeTxt: { fontSize: 11, fontWeight: '700' },
  histLabel: { fontSize: 13, fontWeight: '600', color: TXT, marginBottom: 2 },
  histDate: { fontSize: 11, color: MUT },
  histScore: { fontSize: 16, fontWeight: '800' },
  histDelta: { fontSize: 12, fontWeight: '700', marginRight: 6 },

  disclaimerCard: { backgroundColor: 'rgba(255,183,77,0.08)', borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,183,77,0.2)' },
  disclaimerTitle: { fontSize: 13, fontWeight: '700', color: A, marginBottom: 6 },
  disclaimerTxt: { fontSize: 12, color: MUT, lineHeight: 20 },

  // Result
  resultHero: { alignItems: 'center', paddingTop: 36, paddingBottom: 24, position: 'relative' },
  resultOrb: { position: 'absolute', width: 240, height: 240, borderRadius: 120, top: -40, alignSelf: 'center' as any },
  resultLabel: { fontSize: 10, color: SUB, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 18 },
  resultRing: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 3, marginBottom: 12 },
  resultScore: { fontSize: 36, fontWeight: '900', lineHeight: 40 },
  resultMax: { fontSize: 12, color: SUB },
  resultInterp: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  resultCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: BOR, borderLeftWidth: 3, borderLeftColor: V },
  resultCardTitle: { fontSize: 10, color: SUB, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6, fontWeight: '600' },
  resultCardTxt: { fontSize: 14, color: TXT, lineHeight: 22 },
  nhsCard: { backgroundColor: 'rgba(79,195,247,0.1)', borderRadius: 8, padding: 10, marginTop: 10, borderWidth: 1, borderColor: 'rgba(79,195,247,0.2)' },
  nhsCardTxt: { fontSize: 12, color: C, lineHeight: 18 },
  doneBtn: { backgroundColor: V, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  doneBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Question screen
  qProgressWrap: { height: 3, backgroundColor: 'rgba(255,255,255,0.06)' },
  qProgressFill: { height: 3 },
  qHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 10 },
  qBack: { fontSize: 13, color: MUT, fontWeight: '500' },
  qCount: { fontSize: 12, color: SUB, fontWeight: '600' },
  qBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  qBadgeTxt: { fontSize: 11, fontWeight: '700' },
  qContent: { flex: 1, paddingHorizontal: 28, paddingTop: 16 },
  qInstruction: { fontSize: 12, color: SUB, fontStyle: 'italic', marginBottom: 16, lineHeight: 18 },
  qText: { fontSize: 22, fontWeight: '700', color: TXT, lineHeight: 32 },
  qOptions: { paddingHorizontal: 28, paddingBottom: 32, gap: 8 },
  qOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1 },
  qOptionDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  qOptionDotTxt: { fontSize: 12, fontWeight: '700' },
  qOptionTxt: { fontSize: 14, color: TXT, fontWeight: '500', flex: 1 },
});
