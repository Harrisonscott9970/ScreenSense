import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.55)', SUB = 'rgba(238,240,255,0.32)',
      CARD = 'rgba(255,255,255,0.05)', BOR = 'rgba(255,255,255,0.09)';

const PROGRAMMES = [
  {
    id: 'anxiety_reset',
    title: '7-Day Anxiety Reset',
    icon: '🌊',
    color: C,
    duration: '7 days',
    commitment: '10 min/day',
    description: 'A structured programme combining CBT, breathing, and behavioural activation to reduce anxiety over one week.',
    theory: 'CBT (Beck, 1979) · Exposure (Wolpe, 1958) · Fogg Behaviour Model (2009)',
    days: [
      { day: 1, title: 'Understanding your anxiety', type: 'psychoeducation', icon: '📖', task: 'Read: What is anxiety and why does it happen? Then identify your 3 main anxiety triggers.', duration: '8 min' },
      { day: 2, title: 'Breathing as a tool', type: 'breathing', icon: '🫁', task: 'Complete the 4-7-8 breathing exercise 3 times today. Notice how your body responds.', duration: '10 min' },
      { day: 3, title: 'Thought challenging', type: 'cbt', icon: '🧠', task: 'Use the Thought Challenger to identify one anxious thought and reframe it.', duration: '12 min' },
      { day: 4, title: 'Avoidance patterns', type: 'reflection', icon: '🔍', task: 'Write about one thing you have been avoiding because of anxiety. What small step could you take?', duration: '10 min' },
      { day: 5, title: 'Behavioural activation', type: 'action', icon: '🚶', task: 'Do one small activity you have been putting off. Notice how you feel before and after.', duration: '15 min' },
      { day: 6, title: 'Grounding in the present', type: 'mindfulness', icon: '🧘', task: 'Complete a 10-minute mindfulness session. Focus on the 5-4-3-2-1 grounding technique.', duration: '10 min' },
      { day: 7, title: 'Review and forward plan', type: 'reflection', icon: '✅', task: 'Review what worked this week. Write 3 strategies you will keep using. Celebrate your progress.', duration: '10 min' },
    ],
  },
  {
    id: 'overthinking',
    title: 'Overthinking Programme',
    icon: '🌀',
    color: VL,
    duration: '5 days',
    commitment: '8 min/day',
    description: 'Break the rumination cycle using CBT thought records, attention training, and behavioural experiments.',
    theory: 'Wells (2009) Metacognitive Therapy · CBT (Beck, 1979)',
    days: [
      { day: 1, title: 'Recognising rumination', type: 'psychoeducation', icon: '📖', task: 'Learn the difference between productive problem-solving and unproductive rumination. Identify your patterns.', duration: '8 min' },
      { day: 2, title: 'Worry time technique', type: 'cbt', icon: '⏰', task: 'Schedule a 15-minute "worry period" today. Outside that time, postpone worrying thoughts to that slot.', duration: '8 min' },
      { day: 3, title: 'Attention training', type: 'mindfulness', icon: '🎯', task: 'Practice focusing your attention on external sounds for 5 minutes. This trains attention away from internal rumination.', duration: '8 min' },
      { day: 4, title: 'Challenge the "what ifs"', type: 'cbt', icon: '🧠', task: 'Use the Thought Challenger to work through your most frequent "what if" worry.', duration: '10 min' },
      { day: 5, title: 'Building metacognitive awareness', type: 'reflection', icon: '✅', task: 'Write about your relationship with your own thoughts. Are you your thoughts, or are you the observer of them?', duration: '8 min' },
    ],
  },
  {
    id: 'low_mood',
    title: 'Low Mood Recovery',
    icon: '🌱',
    color: G,
    duration: '7 days',
    commitment: '12 min/day',
    description: 'A behavioural activation programme to gently rebuild energy, motivation, and connection.',
    theory: 'Lewinsohn (1974) Behavioural Activation · Fredrickson (2001) Broaden-Build',
    days: [
      { day: 1, title: 'Understanding low mood', type: 'psychoeducation', icon: '📖', task: 'Learn how low mood, low activity, and low reward create a self-reinforcing cycle — and how to break it.', duration: '8 min' },
      { day: 2, title: 'Gratitude activation', type: 'gratitude', icon: '🙏', task: 'Write 3 things you are grateful for — even small ones. Research shows this shifts attention toward positive experience.', duration: '8 min' },
      { day: 3, title: 'Small pleasure scheduling', type: 'action', icon: '🎯', task: 'Plan 2 small pleasurable activities for today. They do not need to feel exciting — just do them anyway.', duration: '10 min' },
      { day: 4, title: 'Social connection', type: 'action', icon: '🤝', task: 'Reach out to one person today — a message, a call, anything. Low mood thrives in isolation.', duration: '10 min' },
      { day: 5, title: 'Movement and mood', type: 'action', icon: '🚶', task: 'Take a 15-minute walk, ideally outside. Notice any shift in how you feel before and after.', duration: '15 min' },
      { day: 6, title: 'Compassionate self-talk', type: 'cbt', icon: '💗', task: 'Write a letter to yourself as if you were writing to a close friend going through what you are experiencing.', duration: '12 min' },
      { day: 7, title: 'Building forward momentum', type: 'reflection', icon: '✅', task: 'Identify one thing you want to do more of. Create a simple, specific plan for the next week.', duration: '10 min' },
    ],
  },
  {
    id: 'sleep_repair',
    title: 'Sleep Repair Plan',
    icon: '🌙',
    color: '#7986CB',
    duration: '5 days',
    commitment: '10 min/day',
    description: 'CBT for Insomnia (CBT-I) techniques to improve sleep quality and regulate your circadian rhythm.',
    theory: 'CBT-I (Harvey, 2002) · Sleep hygiene (Morin, 1993)',
    days: [
      { day: 1, title: 'Sleep diary and baseline', type: 'tracking', icon: '📓', task: 'Track your sleep tonight: bedtime, wake time, quality (1-10), and how you feel in the morning.', duration: '5 min' },
      { day: 2, title: 'Sleep hygiene fundamentals', type: 'psychoeducation', icon: '📖', task: 'Identify 3 sleep hygiene factors you could improve. Set a consistent bedtime for the rest of this programme.', duration: '10 min' },
      { day: 3, title: 'Wind-down routine', type: 'action', icon: '🌙', task: 'Create a 20-minute wind-down routine: screen off, dim lights, relaxation activity. Do it tonight.', duration: '10 min' },
      { day: 4, title: 'Cognitive quieting', type: 'cbt', icon: '🧠', task: 'If racing thoughts keep you awake, try a "cognitive shuffle" — vividly imagine random unconnected images.', duration: '10 min' },
      { day: 5, title: 'Sustaining good sleep', type: 'reflection', icon: '✅', task: 'Review your sleep across the week. What helped most? Commit to 2 habits you will continue.', duration: '8 min' },
    ],
  },
];

const TYPE_COLORS: Record<string, string> = {
  psychoeducation: C, cbt: VL, breathing: '#4FC3F7',
  mindfulness: A, action: G, reflection: '#9C27B0',
  gratitude: '#E91E63', tracking: '#607D8B',
};

export default function ProgrammeScreen() {
  const [active, setActive] = useState<string | null>(null);
  const [progData, setProgData] = useState<Record<string, any>>({});
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [journalText, setJournalText] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('ss_programmes').then(v => {
      try { if (v) setProgData(JSON.parse(v)); } catch {}
    }).catch(() => {});
  }, []);

  const save = (data: Record<string, any>) => {
    setProgData(data);
    AsyncStorage.setItem('ss_programmes', JSON.stringify(data)).catch(() => {});
  };

  const programme = PROGRAMMES.find(p => p.id === active);

  const startProgramme = (id: string) => {
    const updated = { ...progData, [id]: { started: new Date().toISOString(), completedDays: [], journal: {} } };
    save(updated);
    setActive(id);
  };

  const completeDay = (day: number) => {
    if (!active) return;
    const prog = progData[active] || { completedDays: [], journal: {} };
    if (!prog.completedDays.includes(day)) {
      prog.completedDays = [...prog.completedDays, day];
    }
    if (journalText) {
      prog.journal = { ...(prog.journal || {}), [day]: journalText };
    }
    save({ ...progData, [active]: prog });
    setJournalText('');
    setExpandedDay(null);
  };

  // ── Programme detail ───────────────────────────────────────
  if (active && programme) {
    const pd = progData[active] || { completedDays: [], journal: {} };
    const completed = pd.completedDays || [];
    const progressPct = Math.round((completed.length / programme.days.length) * 100);

    return (
      <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.backBtn} onPress={() => setActive(null)}>
          <Text style={s.backTxt}>← All programmes</Text>
        </TouchableOpacity>

        <View style={s.progHero}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>{programme.icon}</Text>
          <Text style={s.progTitle}>{programme.title}</Text>
          <Text style={s.progMeta}>{programme.duration} · {programme.commitment}</Text>
          <Text style={s.progDesc}>{programme.description}</Text>
          <Text style={[s.progTheory, { color: programme.color }]}>{programme.theory}</Text>

          <View style={s.progProgress}>
            <View style={s.progProgressRow}>
              <Text style={s.progProgressLbl}>Progress</Text>
              <Text style={[s.progProgressPct, { color: programme.color }]}>{progressPct}%</Text>
            </View>
            <View style={s.progProgressBar}>
              <View style={[s.progProgressFill, { width: `${progressPct}%` as any, backgroundColor: programme.color }]} />
            </View>
            <Text style={s.progProgressSub}>{completed.length} of {programme.days.length} days complete</Text>
          </View>
        </View>

        {programme.days.map(day => {
          const isDone = completed.includes(day.day);
          const isExpanded = expandedDay === day.day;
          const savedJournal = pd.journal?.[day.day];

          return (
            <TouchableOpacity key={day.day}
              style={[s.dayCard, isDone && { borderColor: programme.color + '55', backgroundColor: programme.color + '09' }]}
              onPress={() => setExpandedDay(isExpanded ? null : day.day)}
              activeOpacity={0.85}
            >
              <View style={s.dayHeader}>
                <View style={[s.dayNum, { backgroundColor: isDone ? programme.color : 'rgba(255,255,255,0.08)', borderColor: isDone ? programme.color : BOR }]}>
                  <Text style={[s.dayNumTxt, isDone && { color: '#fff' }]}>
                    {isDone ? '✓' : day.day}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.dayTitle, isDone && { color: programme.color }]}>{day.title}</Text>
                  <View style={s.dayMeta}>
                    <View style={[s.dayTypeBadge, { backgroundColor: (TYPE_COLORS[day.type] || V) + '20', borderColor: (TYPE_COLORS[day.type] || V) + '40' }]}>
                      <Text style={[s.dayTypeTxt, { color: TYPE_COLORS[day.type] || V }]}>{day.type}</Text>
                    </View>
                    <Text style={s.dayDuration}>{day.duration}</Text>
                  </View>
                </View>
                <Text style={s.dayArrow}>{isExpanded ? '↑' : '↓'}</Text>
              </View>

              {isExpanded && (
                <View style={s.dayExpanded}>
                  <View style={s.dayDivider} />
                  <Text style={{ fontSize: 28, marginBottom: 10 }}>{day.icon}</Text>
                  <Text style={s.dayTask}>{day.task}</Text>

                  {savedJournal ? (
                    <View style={s.savedJournal}>
                      <Text style={s.savedJournalLbl}>Your note</Text>
                      <Text style={s.savedJournalTxt}>{savedJournal}</Text>
                    </View>
                  ) : (
                    <TextInput style={s.dayJournal}
                      placeholder="Add a note about how this went…"
                      placeholderTextColor={SUB}
                      multiline value={journalText} onChangeText={setJournalText}
                    />
                  )}

                  {!isDone && (
                    <TouchableOpacity style={[s.doneBtn, { backgroundColor: programme.color }]}
                      onPress={() => completeDay(day.day)}>
                      <Text style={s.doneBtnTxt}>Mark as complete ✓</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {completed.length === programme.days.length && (
          <View style={[s.completeCard, { borderColor: programme.color + '50', backgroundColor: programme.color + '12' }]}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🎉</Text>
            <Text style={s.completeTitle}>Programme complete!</Text>
            <Text style={s.completeSub}>You finished the {programme.title}. Research shows consistent practice over 5–7 days creates measurable changes in mood regulation and stress response.</Text>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  // ── Home ───────────────────────────────────────────────────
  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <Text style={s.heroGreet}>Therapy programmes</Text>
        <Text style={s.heroH}>Structured{'\n'}journeys</Text>
        <Text style={s.heroSub}>Evidence-based programmes combining CBT, mindfulness, and behavioural activation. Each takes 5–7 days with 10 minutes daily.</Text>
      </View>

      {PROGRAMMES.map(p => {
        const pd = progData[p.id];
        const isStarted = !!pd;
        const completed = pd?.completedDays?.length || 0;
        const progressPct = isStarted ? Math.round((completed / p.days.length) * 100) : 0;

        return (
          <View key={p.id} style={[s.progCard, { borderLeftColor: p.color }]}>
            <View style={s.progCardHeader}>
              <Text style={{ fontSize: 32 }}>{p.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.progCardTitle}>{p.title}</Text>
                <Text style={s.progCardMeta}>{p.duration} · {p.commitment}</Text>
                <Text style={s.progCardDesc}>{p.description}</Text>
              </View>
            </View>

            {isStarted && (
              <View style={s.progCardProgress}>
                <View style={s.progProgressBar}>
                  <View style={[s.progProgressFill, { width: `${progressPct}%` as any, backgroundColor: p.color }]} />
                </View>
                <Text style={[s.progProgressSub, { marginTop: 4 }]}>{completed}/{p.days.length} days · {progressPct}%</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.progStartBtn, { backgroundColor: isStarted ? p.color + '20' : p.color, borderColor: p.color + '60' }]}
              onPress={() => isStarted ? setActive(p.id) : startProgramme(p.id)}
            >
              <Text style={[s.progStartBtnTxt, isStarted && { color: p.color }]}>
                {isStarted ? (progressPct === 100 ? '✓ Completed — review' : `Continue day ${completed + 1} →`) : 'Start programme →'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={s.infoCard}>
        <Text style={s.infoTitle}>Why structured programmes?</Text>
        <Text style={s.infoTxt}>Isolated exercises have limited impact. NICE guidelines emphasise structured, progressive interventions delivered over time — combining psychoeducation, skill practice, and reflection. These programmes are designed around that model.</Text>
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 28, paddingBottom: 40, maxWidth: 680, alignSelf: 'center' as any, width: '100%' },

  hero: { paddingTop: 40, paddingBottom: 24 },
  heroGreet: { fontSize: 11, color: SUB, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  heroH: { fontSize: 36, fontWeight: '800', color: TXT, letterSpacing: -1, marginBottom: 8, lineHeight: 40 },
  heroSub: { fontSize: 13, color: MUT, lineHeight: 20 },

  progCard: { backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: BOR, borderLeftWidth: 3 },
  progCardHeader: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  progCardTitle: { fontSize: 16, fontWeight: '800', color: TXT, marginBottom: 3 },
  progCardMeta: { fontSize: 11, color: MUT, marginBottom: 4 },
  progCardDesc: { fontSize: 12, color: MUT, lineHeight: 18 },
  progCardProgress: { marginBottom: 10 },
  progStartBtn: { borderRadius: 12, padding: 13, alignItems: 'center', borderWidth: 1 },
  progStartBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  infoCard: { backgroundColor: 'rgba(108,99,255,0.08)', borderRadius: 14, padding: 16, marginTop: 4, borderWidth: 1, borderColor: 'rgba(108,99,255,0.2)' },
  infoTitle: { fontSize: 13, fontWeight: '700', color: TXT, marginBottom: 6 },
  infoTxt: { fontSize: 12, color: MUT, lineHeight: 20 },

  backBtn: { paddingTop: 32, marginBottom: 16 },
  backTxt: { fontSize: 13, color: MUT, fontWeight: '500' },

  progHero: { alignItems: 'center', paddingBottom: 24 },
  progTitle: { fontSize: 26, fontWeight: '800', color: TXT, letterSpacing: -0.5, marginBottom: 4 },
  progMeta: { fontSize: 12, color: MUT, marginBottom: 8 },
  progDesc: { fontSize: 13, color: MUT, lineHeight: 20, textAlign: 'center', marginBottom: 6 },
  progTheory: { fontSize: 11, fontStyle: 'italic', marginBottom: 16 },
  progProgress: { width: '100%', backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: BOR },
  progProgressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progProgressLbl: { fontSize: 11, color: SUB, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  progProgressPct: { fontSize: 13, fontWeight: '700' },
  progProgressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, marginBottom: 4 },
  progProgressFill: { height: 6, borderRadius: 3 },
  progProgressSub: { fontSize: 11, color: SUB },

  dayCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: BOR },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayNum: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0 },
  dayNumTxt: { fontSize: 13, fontWeight: '700', color: MUT },
  dayTitle: { fontSize: 14, fontWeight: '700', color: TXT, marginBottom: 4 },
  dayMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayTypeBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  dayTypeTxt: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  dayDuration: { fontSize: 10, color: SUB },
  dayArrow: { fontSize: 14, color: SUB },
  dayExpanded: { marginTop: 12 },
  dayDivider: { height: 0.5, backgroundColor: BOR, marginBottom: 14 },
  dayTask: { fontSize: 14, color: TXT, lineHeight: 24, marginBottom: 14 },
  dayJournal: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, color: TXT, fontSize: 13, minHeight: 70, borderWidth: 1, borderColor: BOR, textAlignVertical: 'top', marginBottom: 10 },
  savedJournal: { backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: 'rgba(108,99,255,0.2)' },
  savedJournalLbl: { fontSize: 9, color: VL, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, fontWeight: '600' },
  savedJournalTxt: { fontSize: 13, color: TXT, lineHeight: 20 },
  doneBtn: { borderRadius: 12, padding: 13, alignItems: 'center' },
  doneBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  completeCard: { borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, marginTop: 8 },
  completeTitle: { fontSize: 22, fontWeight: '800', color: TXT, marginBottom: 8 },
  completeSub: { fontSize: 13, color: MUT, textAlign: 'center', lineHeight: 20 },
});
