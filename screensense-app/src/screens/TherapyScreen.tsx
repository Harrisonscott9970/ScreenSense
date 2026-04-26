import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Animated, Easing,
} from 'react-native';

function FadeIn({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 400, delay, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[style, {
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
    }]}>
      {children}
    </Animated.View>
  );
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

async function getStoredUserId(): Promise<string> {
  try { return (await AsyncStorage.getItem('ss_user_id')) || 'anonymous'; } catch { return 'anonymous'; }
}

async function logIntervention(tool: string, extra?: Record<string, any>) {
  try {
    const uid = await getStoredUserId();
    await api.logIntervention(uid, tool, extra);
    // Also update local breathing session count for immediate ProfileScreen update
    if (tool === 'breathing') {
      const prev = await AsyncStorage.getItem('ss_breathing_sessions');
      const sessions = prev ? JSON.parse(prev) : [];
      sessions.push({ cycles: extra?.cycles ?? 0, ts: new Date().toISOString() });
      await AsyncStorage.setItem('ss_breathing_sessions', JSON.stringify(sessions));
    }
  } catch {}
}

const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.55)', SUB = 'rgba(238,240,255,0.32)',
      CARD = 'rgba(255,255,255,0.04)', BOR = 'rgba(255,255,255,0.08)';

type Tool = 'breathing' | 'cbt' | 'gratitude' | 'mindfulness' | null;

export default function TherapyScreen() {
  const [activeTool, setActiveTool] = useState<Tool>(null);

  if (activeTool === 'breathing') return <BreathingExercise onBack={() => setActiveTool(null)} />;
  if (activeTool === 'cbt') return <CBTChallenger onBack={() => setActiveTool(null)} />;
  if (activeTool === 'gratitude') return <GratitudeLog onBack={() => setActiveTool(null)} />;
  if (activeTool === 'mindfulness') return <MindfulnessTimer onBack={() => setActiveTool(null)} />;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <FadeIn delay={0}>
        <View style={s.hero}>
          <Text style={s.heroGreet}>Therapy tools</Text>
          <Text style={s.heroH}>Daily mental{'\n'}wellness</Text>
          <Text style={s.heroSub}>Evidence-based CBT, mindfulness, and journaling</Text>
        </View>
      </FadeIn>

      <FadeIn delay={100}>
        <Text style={s.sectionLabel}>Choose a tool</Text>
      </FadeIn>

      <FadeIn delay={160}>
        <View style={s.toolGrid}>
          <ToolCard
            icon="🫁" title="Guided breathing" sub="4-7-8 technique · reduces anxiety"
            color={C} onPress={() => setActiveTool('breathing')} badge="CBT-backed"
          />
          <ToolCard
            icon="🧠" title="Thought challenger" sub="Identify & reframe cognitive distortions"
            color={V} onPress={() => setActiveTool('cbt')} badge="CBT technique"
          />
          <ToolCard
            icon="🙏" title="Gratitude log" sub="3 things daily · builds resilience"
            color={G} onPress={() => setActiveTool('gratitude')} badge="Positive psychology"
          />
          <ToolCard
            icon="🧘" title="Mindfulness timer" sub="Body scan · present-moment awareness"
            color={A} onPress={() => setActiveTool('mindfulness')} badge="Mindfulness-based"
          />
        </View>
      </FadeIn>

      <FadeIn delay={280}>
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>Research basis</Text>
          <Text style={s.infoTxt}>CBT (Beck, 1979) · MBSR (Kabat-Zinn, 1990) · Positive Psychology (Seligman, 2002). Each tool has clinical evidence for reducing anxiety and low mood.</Text>
        </View>
      </FadeIn>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ── BREATHING EXERCISE ──────────────────────────────────────────
function BreathingExercise({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale' | 'rest'>('inhale');
  const [count, setCount] = useState(4);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<any>(null);

  const PHASES = { inhale: 4, hold: 7, exhale: 8, rest: 2 };
  const NEXT: Record<string, keyof typeof PHASES> = { inhale: 'hold', hold: 'exhale', exhale: 'rest', rest: 'inhale' };
  const COLORS = { inhale: C, hold: A, exhale: G, rest: VL };
  const INSTRUCTIONS = {
    inhale: 'Breathe in slowly through your nose',
    hold: 'Hold your breath gently',
    exhale: 'Exhale completely through your mouth',
    rest: 'Rest and prepare',
  };

  const animatePhase = (p: string) => {
    const target = p === 'inhale' ? 1.4 : p === 'exhale' || p === 'rest' ? 0.8 : 1.1;
    Animated.timing(scaleAnim, {
      toValue: target, duration: PHASES[p as keyof typeof PHASES] * 1000,
      easing: Easing.inOut(Easing.ease), useNativeDriver: true,
    }).start();
  };

  const start = () => {
    setRunning(true);
    setPhase('inhale');
    setCount(PHASES.inhale);
    animatePhase('inhale');
  };

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setCount(c => {
        if (c <= 1) {
          setPhase(p => {
            const next = NEXT[p];
            if (next === 'inhale') setCycles(cy => cy + 1);
            setCount(PHASES[next]);
            animatePhase(next);
            return next;
          });
          return PHASES[NEXT[phase]];
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, phase]);

  return (
    <View style={s.toolScreen}>
      <BackBtn onBack={onBack} />
      <Text style={s.toolTitle}>4-7-8 Breathing</Text>
      <Text style={s.toolSub}>A clinically validated breathing technique for anxiety reduction (Weil, 2015)</Text>

      <View style={s.breatheWrap}>
        <Animated.View style={[s.breatheOrb, { transform: [{ scale: scaleAnim }], backgroundColor: (COLORS[phase] || C) + '25', borderColor: COLORS[phase] || C }]}>
          <Text style={[s.breatheCount, { color: COLORS[phase] || C }]}>{running ? count : '?'}</Text>
          <Text style={[s.breathePhase, { color: COLORS[phase] || C }]}>{running ? phase : 'ready'}</Text>
        </Animated.View>
      </View>

      <Text style={s.breatheInstruction}>{running ? INSTRUCTIONS[phase] : 'Press start to begin your breathing exercise'}</Text>

      {cycles > 0 && <Text style={s.cyclesTxt}>{cycles} {cycles === 1 ? 'cycle' : 'cycles'} completed</Text>}

      <TouchableOpacity style={[s.toolBtn, { backgroundColor: running ? R : C }]}
        onPress={() => {
          if (running) {
            setRunning(false);
            clearInterval(intervalRef.current);
            if (cycles > 0) logIntervention('breathing', { cycles, duration_mins: (cycles * 21) / 60 });
          } else {
            start();
          }
        }}>
        <Text style={s.toolBtnTxt}>{running ? 'Stop' : 'Start breathing exercise'}</Text>
      </TouchableOpacity>

      <View style={s.techniqueInfo}>
        <Text style={s.techniqueTitle}>The 4-7-8 technique</Text>
        <Text style={s.techniqueTxt}>Inhale for 4 seconds → Hold for 7 → Exhale for 8. The extended exhale activates the parasympathetic nervous system, reducing the fight-or-flight response. Recommended 4 cycles per session.</Text>
      </View>
    </View>
  );
}

// ── CBT THOUGHT CHALLENGER ──────────────────────────────────────
function CBTChallenger({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [thought, setThought] = useState('');
  const [distortion, setDistortion] = useState('');
  const [reframe, setReframe] = useState('');
  const [evidence, setEvidence] = useState('');

  const DISTORTIONS = [
    'All-or-nothing thinking', 'Catastrophising', 'Mind reading',
    'Emotional reasoning', 'Should statements', 'Personalisation',
    'Mental filter', 'Overgeneralisation',
  ];

  const steps = [
    {
      title: 'Identify the thought', sub: 'What automatic thought is causing distress?',
      input: thought, onInput: setThought,
      placeholder: 'e.g. "I always mess everything up"',
    },
    {
      title: 'Spot the distortion', sub: 'Which cognitive distortion pattern does this match?',
      chips: DISTORTIONS, selected: distortion, onSelect: setDistortion,
    },
    {
      title: 'Challenge the evidence', sub: 'What evidence contradicts this thought?',
      input: evidence, onInput: setEvidence,
      placeholder: 'e.g. "I completed the project last week successfully"',
    },
    {
      title: 'Reframe the thought', sub: 'Write a more balanced, realistic version',
      input: reframe, onInput: setReframe,
      placeholder: 'e.g. "Sometimes I make mistakes, but I also succeed often"',
    },
  ];

  const current = steps[step];
  const complete = step >= steps.length;

  useEffect(() => {
    if (complete) logIntervention('cbt');
  }, [complete]);

  return (
    <View style={s.toolScreen}>
      <BackBtn onBack={onBack} />
      <Text style={s.toolTitle}>Thought Challenger</Text>
      <Text style={s.toolSub}>CBT cognitive restructuring technique (Beck, 1979)</Text>

      <View style={s.progressRow}>
        {steps.map((_, i) => (
          <View key={i} style={[s.progressDot, { backgroundColor: i <= step ? V : 'rgba(255,255,255,0.1)' }]} />
        ))}
      </View>

      {!complete ? (
        <View style={s.cbtCard}>
          <Text style={s.cbtStepNum}>Step {step + 1} of {steps.length}</Text>
          <Text style={s.cbtTitle}>{current.title}</Text>
          <Text style={s.cbtSub}>{current.sub}</Text>

          {current.input !== undefined && (
            <TextInput style={[s.cbtInput, { minHeight: 80 }]}
              placeholder={current.placeholder} placeholderTextColor={SUB}
              multiline value={current.input} onChangeText={current.onInput}
            />
          )}

          {current.chips && (
            <View style={s.chipsWrap}>
              {current.chips.map(c => (
                <TouchableOpacity key={c} style={[s.chip, current.selected === c && s.chipOn]} onPress={() => current.onSelect!(c)}>
                  <Text style={[s.chipTxt, current.selected === c && s.chipTxtOn]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={s.toolBtn} onPress={() => setStep(s => s + 1)}>
            <Text style={s.toolBtnTxt}>{step < steps.length - 1 ? 'Next  →' : 'Complete'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.cbtResult}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
          <Text style={s.cbtResultTitle}>Thought challenged</Text>
          <View style={s.cbtResultCard}>
            <Text style={s.cbtResultLabel}>Original thought</Text>
            <Text style={s.cbtResultTxt}>{thought}</Text>
          </View>
          <View style={[s.cbtResultCard, { borderLeftColor: G }]}>
            <Text style={s.cbtResultLabel}>Reframed thought</Text>
            <Text style={s.cbtResultTxt}>{reframe}</Text>
          </View>
          <TouchableOpacity style={s.toolBtn} onPress={() => {
            setStep(0); setThought(''); setDistortion(''); setReframe(''); setEvidence('');
          }}>
            <Text style={s.toolBtnTxt}>Start again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── GRATITUDE LOG ───────────────────────────────────────────────
function GratitudeLog({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState(['', '', '']);
  const [saved, setSaved] = useState(false);

  const save = () => {
    const filled = entries.filter(e => e.trim());
    if (filled.length === 0) return;
    AsyncStorage.getItem('ss_gratitude').then(raw => {
      const existing = raw ? JSON.parse(raw) : [];
      existing.unshift({ date: new Date().toISOString(), entries: filled });
      return AsyncStorage.setItem('ss_gratitude', JSON.stringify(existing.slice(0, 30)));
    }).catch(() => {});
    logIntervention('gratitude', { duration_mins: 5 });
    setSaved(true);
  };

  return (
    <View style={s.toolScreen}>
      <BackBtn onBack={onBack} />
      <Text style={s.toolTitle}>Gratitude log</Text>
      <Text style={s.toolSub}>Positive psychology · Seligman (2002) · builds resilience over time</Text>

      {!saved ? (
        <>
          <Text style={s.gratInstr}>Write three things you're grateful for today — big or small.</Text>
          {entries.map((e, i) => (
            <View key={i} style={s.gratWrap}>
              <Text style={s.gratNum}>{i + 1}</Text>
              <TextInput style={s.gratInput}
                placeholder={['Something that made you smile…', 'Someone who helped you…', 'Something about yourself…'][i]}
                placeholderTextColor={SUB}
                value={e} onChangeText={v => setEntries(prev => prev.map((x, j) => j === i ? v : x))}
                multiline
              />
            </View>
          ))}
          <TouchableOpacity style={s.toolBtn} onPress={save}>
            <Text style={s.toolBtnTxt}>Save today's gratitude</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🙏</Text>
          <Text style={s.cbtResultTitle}>Gratitude saved</Text>
          <Text style={[s.toolSub, { textAlign: 'center', marginBottom: 24 }]}>
            Research shows daily gratitude practice increases wellbeing scores by up to 25% over 3 weeks (Emmons & McCullough, 2003).
          </Text>
          <TouchableOpacity style={s.toolBtn} onPress={() => { setSaved(false); setEntries(['', '', '']); }}>
            <Text style={s.toolBtnTxt}>Log again tomorrow</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── MINDFULNESS TIMER ───────────────────────────────────────────
function MindfulnessTimer({ onBack }: { onBack: () => void }) {
  const [duration, setDuration] = useState(5);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const PROMPTS = [
    'Notice the weight of your body on your seat.',
    'Take a slow breath and feel your chest rise.',
    'What sounds can you hear right now?',
    'Notice any tension in your shoulders and release it.',
    'What can you see directly in front of you?',
    'Feel the temperature of the air on your skin.',
    'Let your thoughts pass like clouds — observe, don\'t engage.',
  ];
  const [promptIdx, setPromptIdx] = useState(0);

  useEffect(() => {
    if (!running) return;
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.08, duration: 3000, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
    ])).start();

    const timer = setInterval(() => {
      setRemaining(r => {
        if (r === null || r <= 1) { clearInterval(timer); setRunning(false); setDone(true); return 0; }
        if (r % 30 === 0) setPromptIdx(i => (i + 1) % PROMPTS.length);
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (done) logIntervention('mindfulness', { duration_mins: duration });
  }, [done]);

  return (
    <View style={s.toolScreen}>
      <BackBtn onBack={onBack} />
      <Text style={s.toolTitle}>Mindfulness timer</Text>
      <Text style={s.toolSub}>Mindfulness-Based Stress Reduction · Kabat-Zinn (1990)</Text>

      {!done ? (
        <>
          {!running && (
            <>
              <Text style={s.mindDurLabel}>Session duration</Text>
              <View style={s.durRow}>
                {[3, 5, 10, 15].map(d => (
                  <TouchableOpacity key={d} style={[s.durBtn, duration === d && s.durBtnOn]} onPress={() => setDuration(d)}>
                    <Text style={[s.durTxt, duration === d && { color: TXT }]}>{d} min</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={s.timerWrap}>
            <Animated.View style={[s.timerOrb, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={s.timerCount}>{remaining !== null ? fmt(remaining) : `${duration}:00`}</Text>
              <Text style={s.timerLbl}>{running ? 'breathe' : 'ready'}</Text>
            </Animated.View>
          </View>

          {running && (
            <View style={s.promptCard}>
              <Text style={s.promptTxt}>{PROMPTS[promptIdx]}</Text>
            </View>
          )}

          <TouchableOpacity style={[s.toolBtn, { backgroundColor: running ? R : A }]}
            onPress={() => { if (running) { setRunning(false); setRemaining(null); } else { setRemaining(duration * 60); setRunning(true); setDone(false); } }}>
            <Text style={s.toolBtnTxt}>{running ? 'End session' : 'Begin session'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🧘</Text>
          <Text style={s.cbtResultTitle}>Session complete</Text>
          <Text style={[s.toolSub, { textAlign: 'center', marginBottom: 24 }]}>
            {duration} minutes of mindfulness. Regular practice reduces cortisol and improves emotional regulation (Kabat-Zinn, 1990).
          </Text>
          <TouchableOpacity style={s.toolBtn} onPress={() => { setDone(false); setRemaining(null); setRunning(false); }}>
            <Text style={s.toolBtnTxt}>Start another session</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────
function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <TouchableOpacity style={s.backBtn} onPress={onBack}>
      <Text style={s.backTxt}>← Back</Text>
    </TouchableOpacity>
  );
}

function ToolCard({ icon, title, sub, color, onPress, badge }: any) {
  return (
    <TouchableOpacity style={[s.toolCard, { borderColor: color + '30' }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.toolCardIcon, { backgroundColor: color + '20' }]}>
        <Text style={{ fontSize: 28 }}>{icon}</Text>
      </View>
      <Text style={s.toolCardTitle}>{title}</Text>
      <Text style={s.toolCardSub}>{sub}</Text>
      <View style={[s.toolCardBadge, { backgroundColor: color + '18', borderColor: color + '35' }]}>
        <Text style={[s.toolCardBadgeTxt, { color }]}>{badge}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 32, paddingBottom: 40, maxWidth: 700, alignSelf: 'center' as any, width: '100%' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 },

  hero: { paddingTop: 44, paddingBottom: 24 },
  heroGreet: { fontSize: 12, color: SUB, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 },
  heroH: { fontSize: 36, fontWeight: '800', color: TXT, letterSpacing: -1, marginBottom: 8, lineHeight: 40 },
  heroSub: { fontSize: 13, color: MUT },

  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  toolCard: { width: 'calc(50% - 6px)' as any, backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1 },
  toolCardIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  toolCardTitle: { fontSize: 14, fontWeight: '700', color: TXT, marginBottom: 4 },
  toolCardSub: { fontSize: 11, color: MUT, lineHeight: 17, marginBottom: 8 },
  toolCardBadge: { alignSelf: 'flex-start' as any, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  toolCardBadgeTxt: { fontSize: 9, fontWeight: '600' },

  infoCard: { backgroundColor: 'rgba(108,99,255,0.08)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(108,99,255,0.2)', marginBottom: 16 },
  infoTitle: { fontSize: 13, fontWeight: '700', color: TXT, marginBottom: 6 },
  infoTxt: { fontSize: 12, color: MUT, lineHeight: 20 },

  // Tool screens
  toolScreen: { flex: 1, padding: 28, paddingTop: 40, maxWidth: 600, alignSelf: 'center' as any, width: '100%' },
  backBtn: { marginBottom: 20 },
  backTxt: { fontSize: 13, color: MUT, fontWeight: '500' },
  toolTitle: { fontSize: 26, fontWeight: '800', color: TXT, letterSpacing: -0.5, marginBottom: 6 },
  toolSub: { fontSize: 12, color: MUT, marginBottom: 24, lineHeight: 18, fontStyle: 'italic' },
  toolBtn: { backgroundColor: V, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  toolBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Breathing
  breatheWrap: { alignItems: 'center', marginVertical: 32 },
  breatheOrb: { width: 180, height: 180, borderRadius: 90, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  breatheCount: { fontSize: 48, fontWeight: '800' },
  breathePhase: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  breatheInstruction: { fontSize: 15, color: MUT, textAlign: 'center', lineHeight: 24, marginBottom: 8 },
  cyclesTxt: { fontSize: 13, color: VL, textAlign: 'center', fontWeight: '600' },
  techniqueInfo: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginTop: 20, borderWidth: 0.5, borderColor: BOR },
  techniqueTitle: { fontSize: 13, fontWeight: '700', color: TXT, marginBottom: 6 },
  techniqueTxt: { fontSize: 12, color: MUT, lineHeight: 20 },

  // CBT
  progressRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  progressDot: { flex: 1, height: 4, borderRadius: 2 },
  cbtCard: { backgroundColor: CARD, borderRadius: 16, padding: 20, borderWidth: 0.5, borderColor: BOR },
  cbtStepNum: { fontSize: 10, color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  cbtTitle: { fontSize: 18, fontWeight: '700', color: TXT, marginBottom: 4 },
  cbtSub: { fontSize: 12, color: MUT, marginBottom: 14, lineHeight: 18 },
  cbtInput: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: BOR, borderRadius: 12, padding: 14, color: TXT, fontSize: 14, textAlignVertical: 'top', marginBottom: 4 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: BOR, backgroundColor: 'rgba(255,255,255,0.03)' },
  chipOn: { borderColor: V, backgroundColor: 'rgba(108,99,255,0.18)' },
  chipTxt: { fontSize: 12, color: MUT },
  chipTxtOn: { color: VL },
  cbtResult: { alignItems: 'center', paddingTop: 20 },
  cbtResultTitle: { fontSize: 20, fontWeight: '800', color: TXT, marginBottom: 16 },
  cbtResultCard: { width: '100%', backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: R, borderWidth: 0.5, borderColor: BOR },
  cbtResultLabel: { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 5 },
  cbtResultTxt: { fontSize: 14, color: TXT, lineHeight: 22 },

  // Gratitude
  gratInstr: { fontSize: 14, color: MUT, marginBottom: 20, lineHeight: 22 },
  gratWrap: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  gratNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(108,99,255,0.2)', textAlign: 'center', lineHeight: 28, fontSize: 13, fontWeight: '700', color: VL, flexShrink: 0 },
  gratInput: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: BOR, borderRadius: 12, padding: 12, color: TXT, fontSize: 14, textAlignVertical: 'top', minHeight: 60 },

  // Mindfulness
  mindDurLabel: { fontSize: 11, color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  durRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  durBtn: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BOR, alignItems: 'center' },
  durBtnOn: { backgroundColor: 'rgba(245,158,11,0.2)', borderColor: 'rgba(245,158,11,0.4)' },
  durTxt: { fontSize: 13, color: MUT, fontWeight: '600' },
  timerWrap: { alignItems: 'center', marginVertical: 28 },
  timerOrb: { width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.3)', alignItems: 'center', justifyContent: 'center' },
  timerCount: { fontSize: 36, fontWeight: '800', color: A },
  timerLbl: { fontSize: 12, color: MUT, textTransform: 'uppercase', letterSpacing: 1 },
  promptCard: { backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  promptTxt: { fontSize: 15, color: TXT, lineHeight: 24, textAlign: 'center', fontStyle: 'italic' },
});
