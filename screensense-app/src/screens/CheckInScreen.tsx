/**
 * CheckInScreen — 7-step daily wellbeing wizard
 * ===============================================
 * Step 0: Welcome + live screen time + GPS status
 * Step 1: Mood selection (Russell circumplex model)
 * Step 2: Intensity + Energy sliders
 * Step 3: Sleep last night (user-entered, not hardcoded)
 * Step 4: Body scan (MBSR, Kabat-Zinn 1990)
 * Step 5: Thought patterns (CBT, Beck 1979)
 * Step 6: Journal (VADER sentiment + BiLSTM distress)
 *
 * Real device data:
 *  - GPS: useDeviceData hook (expo-location)
 *  - Screen time: passed from App.tsx (AppState tracking)
 *  - Sleep: user-entered in step 3
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Animated, ActivityIndicator, ScrollView, Easing, Pressable, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { C, Space, Radius, Font, Shadow } from '../utils/theme';
import { api } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
let Haptics: any = null;
try { Haptics = require('expo-haptics'); } catch {}
import { useDeviceData } from '../hooks/useDeviceData';
import ResultScreen from './ResultScreen';

// ── Mood data (Russell circumplex model) ──────────────────────
const MOODS = [
  { label: 'Anxious',   icon: '😰', color: C.moods.anxious,   valence: -0.7 },
  { label: 'Stressed',  icon: '😤', color: C.moods.stressed,  valence: -0.6 },
  { label: 'Low',       icon: '😔', color: C.moods.low,       valence: -0.8 },
  { label: 'Numb',      icon: '😶', color: C.moods.numb,      valence: -0.4 },
  { label: 'Calm',      icon: '😌', color: C.moods.calm,      valence:  0.6 },
  { label: 'Content',   icon: '🙂', color: C.moods.content,   valence:  0.7 },
  { label: 'Energised', icon: '⚡', color: C.moods.energised, valence:  0.5 },
  { label: 'Joyful',    icon: '😄', color: C.moods.joyful,    valence:  0.9 },
];

const THOUGHT_CHIPS = [
  'Overthinking', 'Self-criticism', 'Worry about future',
  'Replaying past', 'Comparison to others', 'None right now',
];

const BODY_AREAS = [
  { label: 'Head & mind', icon: '🧠' },
  { label: 'Chest',       icon: '💗' },
  { label: 'Stomach',     icon: '🌀' },
  { label: 'Muscles',     icon: '💪' },
  { label: 'Whole body',  icon: '🙏' },
  { label: 'Nowhere',     icon: '✨' },
];

function greeting(name: string) {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  return `Good ${time}, ${name.split(' ')[0]}`;
}

interface Props {
  userId?: string;
  userName?: string;
  screenTimeHours?: number;   // passed from App.tsx real tracking
  onComplete?: (mood: string, stress: number, result: any) => void;
  onNavigate?: (screen: string) => void;
}

const TOTAL = 7; // steps 0–6

export default function CheckInScreen({
  userId = 'user_001',
  userName = 'Harrison',
  screenTimeHours = 0,
  onComplete,
  onNavigate,
}: Props) {
  const [step, setStep]             = useState(0);
  const [mood, setMood]             = useState<string | null>(null);
  const [energy, setEnergy]         = useState(5);
  const [intensity, setIntensity]   = useState(5);
  const [sleepHours, setSleepHours] = useState(7);
  const [body, setBody]             = useState<string[]>([]);
  const [thoughts, setThoughts]     = useState<string[]>([]);
  const [journal, setJournal]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<any>(null);
  const [error, setError]           = useState('');

  // Real GPS from device
  const { latitude, longitude, locationLabel, isLoadingLocation, requestLocation } = useDeviceData();

  // Animations
  const progress   = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const moodScales = useRef(MOODS.map(() => new Animated.Value(1))).current;
  const ctaScale   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: step / TOTAL, duration: 350,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [step]);

  const transition = (next: number) => {
    // CTA pulse on advance
    Animated.sequence([
      Animated.spring(ctaScale, { toValue: 0.95, useNativeDriver: true, tension: 400, friction: 10 }),
      Animated.spring(ctaScale, { toValue: 1,    useNativeDriver: true, tension: 400, friction: 10 }),
    ]).start();
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 0,   duration: 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -12, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      translateY.setValue(16);
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
  };

  const selectMood = (label: string, idx: number) => {
    setMood(label);
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle?.Light);
    MOODS.forEach((_, i) => {
      Animated.spring(moodScales[i], {
        toValue: i === idx ? 1.06 : 0.94,
        useNativeDriver: true, tension: 400, friction: 22,
      }).start();
    });
  };

  const submit = async () => {
    if (!mood) return;
    setLoading(true);
    setError('');
    try {
      // Use real tracked screen time; small default if session just started
      const screenTime = screenTimeHours > 0 ? screenTimeHours : 0.1;
      const scrollMins = Math.round(screenTime * 60 * 0.25); // ~25% of screen time

      const res = await api.checkin({
        user_id:             userId,
        mood_label:          mood.toLowerCase(),
        mood_words:          thoughts.filter(t => t !== 'None right now'),
        screen_time_hours:   screenTime,
        scroll_session_mins: scrollMins,
        sleep_hours:         sleepHours,
        energy_level:        energy,
        latitude:            latitude ?? undefined,
        longitude:           longitude ?? undefined,
        journal_text:        journal || undefined,
      });
      setResult(res);
      onComplete?.(mood, res.predicted_stress_score, res);
      // Auto-retrain every 10th check-in (continual learning — Widmer & Kubat 1996)
      try {
        const key = `ss_checkin_count_${userId}`;
        const prev = parseInt((await AsyncStorage.getItem(key)) || '0', 10);
        const next = prev + 1;
        await AsyncStorage.setItem(key, String(next));
        if (next % 10 === 0) {
          api.retrain(userId).catch(() => {});
        }
      } catch {}
    } catch (e: any) {
      setError(e.message || 'Could not reach the backend. Make sure it\'s running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  if (result) return (
    <ResultScreen
      result={result}
      mood={mood!}
      userId={userId}
      onNavigate={onNavigate}
      onReset={() => {
        setStep(0); setMood(null); setResult(null);
        setJournal(''); setBody([]); setThoughts([]);
        setSleepHours(7); setEnergy(5); setIntensity(5);
      }}
    />
  );

  const sel = MOODS.find(m => m.label === mood);
  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const canNext = [true, !!mood, true, true, true, true, true][step] ?? true;

  return (
    <View style={s.root}>
      {/* Progress bar */}
      <View style={s.progressTrack}>
        <Animated.View style={[s.progressFill, { width: progressWidth }]} />
      </View>

      {/* Nav row */}
      <View style={s.navRow}>
        {step > 0 ? (
          <TouchableOpacity style={s.navBtn} onPress={() => transition(step - 1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={s.navBtnTxt}>←</Text>
          </TouchableOpacity>
        ) : <View style={s.navBtn} />}
        <Text style={s.stepLbl}>Step {step + 1} of {TOTAL}</Text>
        <TouchableOpacity style={s.crisisBtn} onPress={() => onNavigate?.('crisis')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.crisisBtnTxt}>🆘</Text>
        </TouchableOpacity>
      </View>

      {/* Step content */}
      <Animated.View style={[s.stepArea, { opacity, transform: [{ translateY }] }]}>

        {/* ── STEP 0: Welcome ── */}
        {step === 0 && (
          <View style={s.step}>
            <View style={s.welcomeOrb} />
            <Text style={[Font.label, s.stepLabel]}>{greeting(userName)}</Text>
            <Text style={[Font.h1, s.stepTitle]}>How are you{'\n'}feeling today?</Text>
            <Text style={[Font.body, s.stepBody]}>
              A 2-minute check-in that adapts to your mood, context, and history.
            </Text>

            {/* Location status card */}
            <View style={s.locationRow}>
              <Text style={{ fontSize: 14 }}>
                {isLoadingLocation ? '⏳' : latitude ? '📍' : '⚠️'}
              </Text>
              <Text style={s.locationTxt} numberOfLines={1}>
                {isLoadingLocation ? 'Getting your location…' : locationLabel}
              </Text>
              {!latitude && !isLoadingLocation && (
                <TouchableOpacity onPress={requestLocation} style={s.locationRetry}>
                  <Text style={s.locationRetryTxt}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={s.featureRow}>
              {[
                { icon: '🧠', text: 'ML stress analysis' },
                { icon: '📍', text: 'Place recommendations' },
                { icon: '🩺', text: 'Stepped care model' },
              ].map(f => (
                <View key={f.text} style={s.featurePill}>
                  <Text style={{ fontSize: 14 }}>{f.icon}</Text>
                  <Text style={s.featurePillTxt}>{f.text}</Text>
                </View>
              ))}
            </View>

            <View style={s.screenTimePill}>
              <Text style={s.screenTimeTxt}>
                📱 Screen time this session:{' '}
                <Text style={{ fontWeight: '700', color: C.text }}>
                  {screenTimeHours.toFixed(1)}h
                </Text>
              </Text>
            </View>
          </View>
        )}

        {/* ── STEP 1: Mood ── */}
        {step === 1 && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={s.step}>
              <Text style={[Font.label, s.stepLabel]}>Circumplex model · Russell (1980)</Text>
              <Text style={[Font.h1, s.stepTitle]}>Select your{'\n'}mood</Text>
              <View style={s.moodGrid}>
                {MOODS.map((m, i) => {
                  const on = mood === m.label;
                  return (
                    <Animated.View key={m.label} style={[s.moodTileWrap, { transform: [{ scale: moodScales[i] }] }]}>
                      <Pressable
                        style={[s.moodTile, on && { backgroundColor: m.color + '22' }]}
                        onPress={() => selectMood(m.label, i)}
                        android_ripple={{ color: m.color + '30' }}
                      >
                        {on && <View style={[s.moodSelectedIndicator, { backgroundColor: m.color }]} />}
                        <Text style={s.moodEmoji}>{m.icon}</Text>
                        <Text style={[s.moodName, { color: on ? m.color : C.text }]}>{m.label}</Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
              {sel && (
                <View style={s.valencePill}>
                  <View style={[s.valenceDot, { backgroundColor: sel.color }]} />
                  <Text style={s.valenceTxt}>
                    Valence {sel.valence > 0 ? '+' : ''}{sel.valence} · {sel.valence > 0 ? 'positive' : 'negative'} affect
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* ── STEP 2: Intensity + Energy ── */}
        {step === 2 && (
          <View style={s.step}>
            <Text style={[Font.label, s.stepLabel]}>Self-report intensity</Text>
            <Text style={[Font.h1, s.stepTitle]}>How intense{'\n'}is this feeling?</Text>
            <Text style={[Font.body, s.stepBody]}>Tap a number — 1 is barely noticeable, 10 is overwhelming.</Text>

            <View style={s.numGrid}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                const on = intensity === n;
                const col = sel?.color || C.violet;
                return (
                  <TouchableOpacity key={n}
                    style={[s.numBtn, on && { backgroundColor: col, borderColor: col }]}
                    onPress={() => setIntensity(n)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.numBtnTxt, on && { color: '#fff' }]}>{n}</Text>
                    {n === 1 && <Text style={s.numHint}>mild</Text>}
                    {n === 10 && <Text style={s.numHint}>intense</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[Font.label, { ...s.stepLabel, marginTop: Space['6'] }]}>Energy level</Text>
            <Text style={[Font.caption, { color: C.textDim, marginBottom: Space['3'] }]}>1 = completely drained · 10 = fully energised</Text>
            <View style={s.numGrid}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                const on = energy === n;
                return (
                  <TouchableOpacity key={n}
                    style={[s.numBtn, on && { backgroundColor: C.teal, borderColor: C.teal }]}
                    onPress={() => setEnergy(n)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.numBtnTxt, on && { color: '#fff' }]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── STEP 3: Sleep ── */}
        {step === 3 && (
          <View style={s.step}>
            <Text style={[Font.label, s.stepLabel]}>Sleep hygiene · Walker (2017)</Text>
            <Text style={[Font.h1, s.stepTitle]}>How long did{'\n'}you sleep?</Text>
            <Text style={[Font.body, s.stepBody]}>
              Sleep quality is the strongest predictor of next-day stress. Adults need 7–9 hours.
            </Text>

            <View style={s.bigNumberRow}>
              <Text style={[Font.display, {
                color: sleepHours >= 7 ? C.teal : sleepHours >= 5 ? '#FFB74D' : C.danger,
                fontSize: 80, lineHeight: 84,
              }]}>
                {sleepHours}
              </Text>
              <Text style={[Font.body, { color: C.textDim, fontSize: 28, marginTop: 32 }]}>h</Text>
            </View>

            <View style={s.sleepGrid}>
              {[3, 4, 5, 5.5, 6, 6.5, 7, 7.5, 8, 9, 10].map(n => {
                const on = sleepHours === n;
                const col = n >= 7 ? C.teal : n >= 5 ? '#FFB74D' : C.danger;
                return (
                  <TouchableOpacity key={n}
                    style={[s.sleepBtn, { backgroundColor: on ? col : C.elevated, borderColor: on ? col : 'transparent' }]}
                    onPress={() => setSleepHours(n)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.sleepBtnTxt, { color: on ? '#fff' : C.textSub }]}>
                      {n % 1 === 0 ? `${n}h` : `${n}h`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[s.insightPill, {
              marginTop: Space['5'],
              backgroundColor: sleepHours >= 7
                ? C.tealDim
                : sleepHours >= 5 ? 'rgba(255,183,77,0.12)' : 'rgba(244,63,94,0.12)',
              borderColor: sleepHours >= 7 ? C.teal : sleepHours >= 5 ? '#FFB74D' : C.danger,
            }]}>
              <Text style={[s.insightTxt, {
                color: sleepHours >= 7 ? C.teal : sleepHours >= 5 ? '#FFB74D' : C.danger,
              }]}>
                {sleepHours >= 7
                  ? '✓ Good sleep. Supports emotional regulation and lower stress.'
                  : sleepHours >= 5
                  ? '⚠ Below-optimal. Poor sleep amplifies stress responses (Walker, 2017).'
                  : '⚠ Significant sleep deficit — your stress score will reflect this.'}
              </Text>
            </View>
          </View>
        )}

        {/* ── STEP 4: Body scan ── */}
        {step === 4 && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={s.step}>
              <Text style={[Font.label, s.stepLabel]}>MBSR body scan · Kabat-Zinn (1990)</Text>
              <Text style={[Font.h1, s.stepTitle]}>Where do you{'\n'}feel this?</Text>
              <Text style={[Font.body, s.stepBody]}>Select all that apply</Text>
              <View style={s.chipGrid}>
                {BODY_AREAS.map(a => {
                  const on = body.includes(a.label);
                  return (
                    <TouchableOpacity key={a.label}
                      style={[s.bodyChip, on && { backgroundColor: C.tealDim, borderColor: C.teal }]}
                      onPress={() => setBody(p => p.includes(a.label) ? p.filter(x => x !== a.label) : [...p, a.label])}
                      activeOpacity={0.75}
                    >
                      <Text style={{ fontSize: 20 }}>{a.icon}</Text>
                      <Text style={[s.bodyChipTxt, on && { color: C.teal }]}>{a.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── STEP 5: Thought patterns ── */}
        {step === 5 && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={s.step}>
              <Text style={[Font.label, s.stepLabel]}>CBT cognitive patterns · Beck (1979)</Text>
              <Text style={[Font.h1, s.stepTitle]}>Any thought{'\n'}patterns?</Text>
              <View style={s.thoughtWrap}>
                {THOUGHT_CHIPS.map(t => {
                  const on = thoughts.includes(t);
                  return (
                    <TouchableOpacity key={t}
                      style={[s.thoughtChip, on && { backgroundColor: C.violetDim, borderColor: C.violet }]}
                      onPress={() => setThoughts(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}
                    >
                      <Text style={[s.thoughtTxt, on && { color: C.violetSoft }]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {thoughts.length > 0 && !thoughts.includes('None right now') && (
                <View style={s.insightPill}>
                  <Text style={s.insightTxt}>
                    The Thought Challenger in Therapy can help reframe these patterns.
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* ── STEP 6: Journal ── */}
        {step === 6 && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={80}
          >
            <ScrollView
              style={{ flex: 1 }}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={s.step}>
                <Text style={[Font.label, s.stepLabel]}>VADER sentiment + BiLSTM distress analysis</Text>
                <Text style={[Font.h1, s.stepTitle]}>Anything on{'\n'}your mind?</Text>
                <Text style={[Font.body, s.stepBody]}>
                  Optional. Processed by our local NLP pipeline — never shared externally. GDPR compliant.
                </Text>
                <TextInput
                  style={s.journal}
                  placeholder={`What's been happening today, ${userName.split(' ')[0]}?`}
                  placeholderTextColor={C.textGhost}
                  multiline
                  blurOnSubmit={false}
                  value={journal}
                  onChangeText={setJournal}
                  maxLength={500}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Space['2'] }}>
                  <TouchableOpacity onPress={Keyboard.dismiss} style={s.kbDismiss}>
                    <Text style={s.kbDismissTxt}>Done typing ↓</Text>
                  </TouchableOpacity>
                  <Text style={Font.micro}>{journal.length} / 500</Text>
                </View>
                {error ? <Text style={s.errorTxt}>{error}</Text> : null}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

      </Animated.View>

      {/* CTA */}
      <View style={s.ctaArea}>
        <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
        <TouchableOpacity
          style={[s.cta, (!canNext || loading) && s.ctaDisabled]}
          onPress={() => step < TOTAL - 1 ? transition(step + 1) : submit()}
          disabled={!canNext || loading}
          activeOpacity={0.88}
        >
          {loading ? (
            <View style={s.loadRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={s.ctaTxt}>Analysing your context…</Text>
            </View>
          ) : (
            <Text style={s.ctaTxt}>
              {step === TOTAL - 1 ? 'Analyse my wellbeing' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>
        </Animated.View>
        {step === 0 && (
          <Text style={[Font.micro, { textAlign: 'center', marginTop: Space['3'] }]}>
            Stored locally · Never shared · GDPR compliant
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  progressTrack: { height: 2, backgroundColor: C.line },
  progressFill:  { height: 2, backgroundColor: C.violet },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space['6'], paddingVertical: Space['4'] },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navBtnTxt: { fontSize: 20, color: C.textSub },
  stepLbl: { ...Font.label, color: C.textDim },
  crisisBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  crisisBtnTxt: { fontSize: 18 },
  stepArea: { flex: 1 },
  step: { flex: 1, paddingHorizontal: Space['6'], paddingTop: Space['4'], maxWidth: 620, alignSelf: 'center' as any, width: '100%' },
  stepLabel: { marginBottom: Space['2'] },
  stepTitle: { ...Font.h1, marginBottom: Space['4'] },
  stepBody:  { ...Font.body, marginBottom: Space['6'] },
  welcomeOrb: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: C.violetGlow, top: -120, alignSelf: 'center' as any },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: Space['2'], backgroundColor: C.card, borderRadius: Radius.md, paddingHorizontal: Space['4'], paddingVertical: Space['3'], marginBottom: Space['4'] },
  locationTxt: { fontSize: 12, color: C.textSub, flex: 1 },
  locationRetry: { backgroundColor: C.violetDim, borderRadius: Radius.sm, paddingHorizontal: Space['3'], paddingVertical: Space['1'] },
  locationRetryTxt: { fontSize: 11, color: C.violetSoft, fontWeight: '600' },

  featureRow: { flexDirection: 'row', gap: Space['2'], flexWrap: 'wrap', marginBottom: Space['4'] },
  featurePill: { flexDirection: 'row', alignItems: 'center', gap: Space['2'], backgroundColor: C.card, borderRadius: Radius.full, paddingHorizontal: Space['4'], paddingVertical: Space['2'] },
  featurePillTxt: { fontSize: 12, color: C.textSub, fontWeight: '500' },

  screenTimePill: { backgroundColor: C.elevated, borderRadius: Radius.md, paddingHorizontal: Space['4'], paddingVertical: Space['3'] },
  screenTimeTxt: { fontSize: 13, color: C.textDim },

  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space['3'], marginBottom: Space['4'] },
  moodTileWrap: { width: 'calc(25% - 9px)' as any, minWidth: 80 },
  moodTile: { backgroundColor: C.card, borderRadius: Radius.md, paddingVertical: Space['5'], paddingHorizontal: Space['2'], alignItems: 'center', position: 'relative', overflow: 'hidden', minHeight: 88 },
  moodSelectedIndicator: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: 1 },
  moodEmoji: { fontSize: 36, marginBottom: Space['2'] },
  moodName: { fontSize: 12, fontWeight: '600', color: C.text, textAlign: 'center' as any },
  valencePill: { flexDirection: 'row', alignItems: 'center', gap: Space['2'], backgroundColor: C.card, borderRadius: Radius.full, paddingHorizontal: Space['4'], paddingVertical: Space['2'], alignSelf: 'flex-start' as any },
  valenceDot: { width: 6, height: 6, borderRadius: 3 },
  valenceTxt: { fontSize: 11, color: C.textDim },

  bigNumberRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginVertical: Space['8'], gap: Space['2'] },

  // Number grid for intensity/energy — large tappable buttons
  numGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space['2'], marginBottom: Space['4'] },
  numBtn: { width: 56, height: 56, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated, borderWidth: 1.5, borderColor: 'transparent' },
  numBtnTxt: { fontSize: 20, fontWeight: '700', color: C.textSub },
  numHint: { fontSize: 8, color: C.textGhost, marginTop: 1 },

  // Sleep grid — wider buttons with half-hour options
  sleepGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space['2'], justifyContent: 'center', marginBottom: Space['4'] },
  sleepBtn: { minWidth: 58, height: 58, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space['3'], borderWidth: 1.5 },
  sleepBtnTxt: { fontSize: 15, fontWeight: '700' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space['3'] },
  bodyChip: { flexDirection: 'row', alignItems: 'center', gap: Space['2'], backgroundColor: C.card, borderRadius: Radius.md, paddingHorizontal: Space['4'], paddingVertical: Space['4'], borderWidth: 1, borderColor: 'transparent' },
  bodyChipTxt: { fontSize: 14, fontWeight: '500', color: C.textSub },

  thoughtWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space['3'], marginBottom: Space['4'] },
  thoughtChip: { paddingHorizontal: Space['5'], paddingVertical: Space['4'], borderRadius: Radius.full, backgroundColor: C.card, borderWidth: 1, borderColor: 'transparent' },
  thoughtTxt: { fontSize: 15, color: C.textSub, fontWeight: '500' },

  insightPill: { backgroundColor: C.violetDim, borderRadius: Radius.md, padding: Space['4'], borderWidth: 1, borderColor: C.violet + '30' },
  insightTxt: { fontSize: 13, color: C.violetSoft, lineHeight: 20 },

  journal: { backgroundColor: C.card, borderRadius: Radius.lg, padding: Space['5'], color: C.text, fontSize: 16, minHeight: 140, textAlignVertical: 'top', lineHeight: 24 },
  errorTxt: { fontSize: 13, color: C.danger, textAlign: 'center', marginTop: Space['3'] },
  kbDismiss: { backgroundColor: 'rgba(124,110,250,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(124,110,250,0.25)' },
  kbDismissTxt: { fontSize: 12, color: '#9B94FF', fontWeight: '600' },

  ctaArea: { padding: Space['6'], paddingTop: Space['4'] },
  cta: { backgroundColor: C.violet, borderRadius: Radius.lg, padding: Space['5'], alignItems: 'center', ...Shadow.violet },
  ctaDisabled: { opacity: 0.45 },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: Space['3'] },
});
