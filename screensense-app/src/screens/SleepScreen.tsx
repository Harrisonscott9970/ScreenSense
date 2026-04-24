import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Animated, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', INDIGO = '#7986CB', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.48)', SUB = 'rgba(238,240,255,0.22)',
      CARD = 'rgba(255,255,255,0.05)', BOR = 'rgba(255,255,255,0.09)';

const WIND_DOWN = [
  { icon: '📱', label: 'Put phone face down', desc: 'Reduce temptation for one more scroll' },
  { icon: '💡', label: 'Dim your lights', desc: 'Signal to your brain that sleep is coming' },
  { icon: '📖', label: 'Read or journal', desc: 'Offline activity to quieten the mind' },
  { icon: '🌡', label: 'Cool the room', desc: '16–19°C is optimal for sleep onset' },
  { icon: '🧘', label: '5-minute breathing', desc: '4-7-8 technique activates parasympathetic system' },
  { icon: '☕', label: 'No caffeine after 2pm', desc: 'Caffeine half-life is ~5 hours' },
];

const SLEEP_TIPS = [
  { title: 'Consistent wake time', desc: 'The most powerful circadian anchor. Even on weekends.', color: A, icon: '⏰' },
  { title: 'Screen-free 30 min', desc: 'Blue light suppresses melatonin by up to 50%.', color: C, icon: '📵' },
  { title: 'Cool, dark room', desc: 'Core body temperature must drop to initiate sleep.', color: INDIGO, icon: '🌙' },
  { title: 'Worry journal', desc: 'Write tomorrow\'s tasks before bed. Offloads working memory.', color: VL, icon: '📝' },
];

export default function SleepScreen() {
  const [tab, setTab] = useState<'tracker' | 'winddown' | 'tips'>('tracker');
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [quality, setQuality] = useState(7);
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [windDownDone, setWindDownDone] = useState<string[]>([]);
  const [screenFree, setScreenFree] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('ss_sleep').then(v => {
      try { if (v) setEntries(JSON.parse(v)); } catch {}
    }).catch(() => {});
  }, []);

  const save = () => {
    const entry = {
      date: new Date().toISOString().split('T')[0],
      bedtime, wakeTime, quality, notes,
      duration: calcDuration(bedtime, wakeTime),
      saved: new Date().toISOString(),
    };
    const updated = [entry, ...entries.filter(e => e.date !== entry.date)].slice(0, 30);
    setEntries(updated);
    AsyncStorage.setItem('ss_sleep', JSON.stringify(updated)).catch(() => {});
    setNotes('');
  };

  const calcDuration = (bed: string, wake: string) => {
    const [bh, bm] = bed.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 24 * 60;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const avgQuality = entries.length
    ? (entries.slice(0, 7).reduce((a, e) => a + e.quality, 0) / Math.min(entries.length, 7)).toFixed(1)
    : '—';

  const avgDuration = entries.length
    ? (() => {
        const recent = entries.slice(0, 7);
        const total = recent.reduce((a, e) => {
          const parts = e.duration.match(/(\d+)h (\d+)m/);
          return parts ? a + parseInt(parts[1]) * 60 + parseInt(parts[2]) : a;
        }, 0);
        const avg = total / recent.length;
        return `${Math.floor(avg / 60)}h ${Math.round(avg % 60)}m`;
      })()
    : '—';

  const qualityColor = quality >= 7 ? G : quality >= 5 ? A : R;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <Text style={s.heroGreet}>Sleep tracking</Text>
        <Text style={s.heroH}>Rest &{'\n'}recovery</Text>
        <Text style={s.heroSub}>Poor sleep is the strongest link between screen overload and mood deterioration. Track it daily.</Text>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={[s.statVal, { color: INDIGO }]}>{avgDuration}</Text>
          <Text style={s.statLbl}>Avg duration</Text>
          <Text style={s.statSub}>last 7 nights</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statVal, { color: avgQuality >= '7' ? G : avgQuality >= '5' ? A : R }]}>{avgQuality}/10</Text>
          <Text style={s.statLbl}>Avg quality</Text>
          <Text style={s.statSub}>last 7 nights</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statVal, { color: C }]}>{entries.length}</Text>
          <Text style={s.statLbl}>Nights logged</Text>
          <Text style={s.statSub}>total entries</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['tracker', 'winddown', 'tips'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabOn]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>
              {t === 'tracker' ? '📓 Log' : t === 'winddown' ? '🌙 Wind-down' : '💡 Tips'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* TRACKER TAB */}
      {tab === 'tracker' && (
        <View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Log last night's sleep</Text>

            <View style={s.timeRow}>
              <View style={s.timeField}>
                <Text style={s.timeLabel}>Bedtime</Text>
                <TextInput style={s.timeInput} value={bedtime} onChangeText={setBedtime}
                  placeholder="23:00" placeholderTextColor={SUB} />
              </View>
              <Text style={s.timeDivider}>→</Text>
              <View style={s.timeField}>
                <Text style={s.timeLabel}>Wake time</Text>
                <TextInput style={s.timeInput} value={wakeTime} onChangeText={setWakeTime}
                  placeholder="07:00" placeholderTextColor={SUB} />
              </View>
              <View style={s.durationBadge}>
                <Text style={s.durationVal}>{calcDuration(bedtime, wakeTime)}</Text>
                <Text style={s.durationLbl}>duration</Text>
              </View>
            </View>

            <Text style={s.qualityLabel}>Sleep quality · {quality}/10</Text>
            <View style={s.qualityDots}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <TouchableOpacity key={n}
                  style={[s.qualityDot, { backgroundColor: quality >= n ? qualityColor : 'rgba(255,255,255,0.07)' }]}
                  onPress={() => setQuality(n)} />
              ))}
            </View>

            <View style={s.screenFreeRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.screenFreeLabel}>Screen-free 30 min before bed?</Text>
                <Text style={s.screenFreeSub}>Blue light suppresses melatonin by up to 50%</Text>
              </View>
              <Switch value={screenFree} onValueChange={setScreenFree}
                trackColor={{ true: G, false: 'rgba(255,255,255,0.1)' }} thumbColor="#fff" />
            </View>

            <TextInput style={s.notesInput}
              placeholder="Any notes about your sleep…"
              placeholderTextColor={SUB}
              multiline value={notes} onChangeText={setNotes}
            />

            <TouchableOpacity style={s.saveBtn} onPress={save}>
              <Text style={s.saveBtnTxt}>Save sleep log →</Text>
            </TouchableOpacity>
          </View>

          {/* History */}
          {entries.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Recent nights</Text>
              {entries.slice(0, 7).map((e, i) => {
                const qCol = e.quality >= 7 ? G : e.quality >= 5 ? A : R;
                return (
                  <View key={i} style={s.histRow}>
                    <Text style={s.histDate}>{new Date(e.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                    <Text style={s.histDuration}>{e.duration}</Text>
                    <Text style={s.histBed}>{e.bedtime} – {e.wakeTime}</Text>
                    <View style={[s.histQuality, { borderColor: qCol + '50', backgroundColor: qCol + '18' }]}>
                      <Text style={[s.histQualityTxt, { color: qCol }]}>{e.quality}/10</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* WIND-DOWN TAB */}
      {tab === 'winddown' && (
        <View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Tonight's wind-down routine</Text>
            <Text style={s.cardSub}>Complete these 30 minutes before your target bedtime of {bedtime}. Based on CBT-I (Harvey, 2002).</Text>
            {WIND_DOWN.map(item => {
              const done = windDownDone.includes(item.label);
              return (
                <TouchableOpacity key={item.label}
                  style={[s.windDownItem, done && { borderColor: INDIGO + '55', backgroundColor: INDIGO + '10' }]}
                  onPress={() => setWindDownDone(p => p.includes(item.label) ? p.filter(x => x !== item.label) : [...p, item.label])}
                >
                  <View style={[s.windDownCheck, done && { backgroundColor: INDIGO, borderColor: INDIGO }]}>
                    {done && <Text style={{ fontSize: 12, color: '#fff' }}>✓</Text>}
                  </View>
                  <Text style={{ fontSize: 22 }}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.windDownLabel, done && { color: INDIGO }]}>{item.label}</Text>
                    <Text style={s.windDownDesc}>{item.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {windDownDone.length === WIND_DOWN.length && (
              <View style={s.windDownComplete}>
                <Text style={s.windDownCompleteTxt}>🌙 Wind-down complete · Ready for sleep</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* TIPS TAB */}
      {tab === 'tips' && (
        <View>
          {SLEEP_TIPS.map(tip => (
            <View key={tip.title} style={[s.tipCard, { borderLeftColor: tip.color }]}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>{tip.icon}</Text>
              <Text style={s.tipTitle}>{tip.title}</Text>
              <Text style={s.tipDesc}>{tip.desc}</Text>
            </View>
          ))}

          <View style={s.card}>
            <Text style={s.cardTitle}>Sleep and digital wellbeing</Text>
            <Text style={s.cardSub}>Research consistently shows that excessive screen time — especially in the evening — disrupts sleep architecture by suppressing melatonin, increasing cognitive arousal, and delaying sleep onset. ScreenSense tracks the relationship between your daily screen time and sleep quality over time in the Insights tab.</Text>
            <Text style={[s.cardSub, { color: VL, marginTop: 8 }]}>Reference: Walker, M. (2017). Why We Sleep. Scribner.</Text>
          </View>
        </View>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 28, paddingBottom: 40, maxWidth: 680, alignSelf: 'center' as any, width: '100%' },
  hero: { paddingTop: 40, paddingBottom: 20 },
  heroGreet: { fontSize: 11, color: SUB, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  heroH: { fontSize: 36, fontWeight: '800', color: TXT, letterSpacing: -1, marginBottom: 8, lineHeight: 40 },
  heroSub: { fontSize: 13, color: MUT, lineHeight: 20 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: BOR },
  statVal: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  statLbl: { fontSize: 10, color: MUT, fontWeight: '600', textAlign: 'center' },
  statSub: { fontSize: 9, color: SUB, textAlign: 'center' },

  tabs: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 0.5, borderColor: BOR },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabOn: { backgroundColor: INDIGO },
  tabTxt: { fontSize: 12, color: MUT, fontWeight: '500' },
  tabTxtOn: { color: TXT, fontWeight: '700' },

  card: { backgroundColor: CARD, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 0.5, borderColor: BOR },
  cardTitle: { fontSize: 15, fontWeight: '700', color: TXT, marginBottom: 6 },
  cardSub: { fontSize: 12, color: MUT, lineHeight: 19, marginBottom: 14 },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  timeField: { flex: 1 },
  timeLabel: { fontSize: 10, color: SUB, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  timeInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, color: TXT, fontSize: 18, fontWeight: '700', textAlign: 'center', borderWidth: 1, borderColor: BOR },
  timeDivider: { fontSize: 16, color: SUB, marginTop: 14 },
  durationBadge: { backgroundColor: 'rgba(121,134,203,0.2)', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: INDIGO + '40' },
  durationVal: { fontSize: 14, fontWeight: '700', color: INDIGO, lineHeight: 16 },
  durationLbl: { fontSize: 8, color: SUB, textTransform: 'uppercase', letterSpacing: 0.4 },

  qualityLabel: { fontSize: 11, color: SUB, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, fontWeight: '600' },
  qualityDots: { flexDirection: 'row', gap: 7, marginBottom: 14 },
  qualityDot: { flex: 1, height: 8, borderRadius: 4 },

  screenFreeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, padding: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, borderWidth: 0.5, borderColor: BOR },
  screenFreeLabel: { fontSize: 13, color: TXT, fontWeight: '500', marginBottom: 2 },
  screenFreeSub: { fontSize: 11, color: MUT },

  notesInput: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, color: TXT, fontSize: 13, minHeight: 70, borderWidth: 1, borderColor: BOR, textAlignVertical: 'top', marginBottom: 12 },
  saveBtn: { backgroundColor: INDIGO, borderRadius: 12, padding: 14, alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: BOR },
  histDate: { fontSize: 12, color: MUT, width: 90, flexShrink: 0 },
  histDuration: { fontSize: 12, fontWeight: '600', color: TXT, width: 60, flexShrink: 0 },
  histBed: { fontSize: 11, color: SUB, flex: 1 },
  histQuality: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  histQualityTxt: { fontSize: 11, fontWeight: '700' },

  windDownItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: BOR },
  windDownCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: BOR, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  windDownLabel: { fontSize: 14, fontWeight: '600', color: TXT, marginBottom: 2 },
  windDownDesc: { fontSize: 11, color: MUT },
  windDownComplete: { backgroundColor: 'rgba(121,134,203,0.15)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: INDIGO + '40', marginTop: 6 },
  windDownCompleteTxt: { fontSize: 14, color: INDIGO, fontWeight: '700' },

  tipCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: BOR, borderLeftWidth: 3 },
  tipTitle: { fontSize: 15, fontWeight: '700', color: TXT, marginBottom: 4 },
  tipDesc: { fontSize: 13, color: MUT, lineHeight: 20 },
});
