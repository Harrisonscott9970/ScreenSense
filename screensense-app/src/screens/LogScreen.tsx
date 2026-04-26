import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated, TextInput,
} from 'react-native';

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 380, delay, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}
import { format } from 'date-fns';

import { BASE_URL } from '../services/api';

const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.55)', SUB = 'rgba(238,240,255,0.32)',
      CARD = 'rgba(255,255,255,0.04)', BOR = 'rgba(255,255,255,0.08)';

const MOOD_COL: Record<string, string> = {
  joyful: G, content: '#AED581', calm: C, energised: A,
  anxious: R, stressed: '#FF8A65', low: '#7E57C2', numb: '#78909C',
};
const MOOD_EMO: Record<string, string> = {
  joyful: '😄', content: '🙂', calm: '😌', energised: '⚡',
  anxious: '😰', stressed: '😤', low: '😔', numb: '😶',
};
const STRESS_COL = (s: number) => s > 0.66 ? R : s > 0.33 ? A : G;

interface LogScreenProps {
  userId?: string;
}

const MOODS_ALL = ['all', 'joyful', 'content', 'calm', 'energised', 'anxious', 'stressed', 'low', 'numb'];
const DATE_FILTERS = ['all', 'today', 'week', 'month'] as const;
type DateFilter = typeof DATE_FILTERS[number];

export default function LogScreen({ userId = 'user_001' }: LogScreenProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [moodFilter, setMoodFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetch(`${BASE_URL}/entries/${userId}?limit=100`).then(r => r.json());
      setEntries(Array.isArray(data) ? data : []);
    } catch { setEntries([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    return entries.filter(e => {
      if (moodFilter !== 'all' && e.mood_label !== moodFilter) return false;
      if (dateFilter !== 'all') {
        const d = new Date(e.created_at);
        if (dateFilter === 'today') {
          if (d.toDateString() !== now.toDateString()) return false;
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
          if (d < weekAgo) return false;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
          if (d < monthAgo) return false;
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (e.mood_label?.includes(q) || e.journal_text?.toLowerCase().includes(q) || e.personalised_message?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [entries, moodFilter, dateFilter, search]);

  if (loading) return (
    <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={V} size="large" />
    </View>
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={V} />}
    >
      <FadeIn delay={0}>
        <View style={s.hero}>
          <Text style={s.heroGreet}>Your history</Text>
          <Text style={s.heroH}>Mood log</Text>
          <Text style={s.heroSub}>{filtered.length} of {entries.length} entries · pull to refresh</Text>
        </View>
      </FadeIn>

      {/* Search bar */}
      <FadeIn delay={40}>
        <TextInput
          style={s.searchInput}
          placeholder="Search journal, mood, messages…"
          placeholderTextColor={SUB}
          value={search}
          onChangeText={setSearch}
        />
      </FadeIn>

      {/* Mood filter chips */}
      <FadeIn delay={60}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
          {MOODS_ALL.map(m => (
            <TouchableOpacity
              key={m}
              style={[s.filterChip, moodFilter === m && s.filterChipOn]}
              onPress={() => setMoodFilter(m)}
            >
              <Text style={[s.filterChipTxt, moodFilter === m && { color: VL }]}>
                {m === 'all' ? 'All moods' : MOOD_EMO[m] + ' ' + m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </FadeIn>

      {/* Date filter */}
      <FadeIn delay={80}>
        <View style={s.dateRow}>
          {DATE_FILTERS.map(d => (
            <TouchableOpacity key={d} style={[s.dateChip, dateFilter === d && s.dateChipOn]} onPress={() => setDateFilter(d)}>
              <Text style={[s.dateChipTxt, dateFilter === d && { color: VL }]}>
                {{ all: 'All time', today: 'Today', week: 'This week', month: 'This month' }[d]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </FadeIn>

      {filtered.length === 0 ? (
        <FadeIn delay={100}>
          <View style={s.empty}>
            {entries.length === 0 ? (
              <>
                <Text style={{ fontSize: 44, marginBottom: 12 }}>📓</Text>
                <Text style={s.emptyTitle}>No entries yet</Text>
                <Text style={s.muted}>Complete a check-in to start building your mood log.</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>🔍</Text>
                <Text style={s.emptyTitle}>No matches</Text>
                <Text style={s.muted}>Try a different mood or date filter.</Text>
              </>
            )}
          </View>
        </FadeIn>
      ) : (
        filtered.map((e, i) => (
          <FadeIn key={e.id} delay={80 + Math.min(i, 8) * 40}>
            <EntryCard
              entry={e}
              isExpanded={expanded === e.id}
              onPress={() => setExpanded(expanded === e.id ? null : e.id)}
            />
          </FadeIn>
        ))
      )}
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

function EntryCard({ entry: e, isExpanded, onPress }: any) {
  const moodCol = MOOD_COL[e.mood_label] || V;
  const stressCol = STRESS_COL(e.stress_score);
  const stressPct = Math.round(e.stress_score * 100);
  const dateStr = format(new Date(e.created_at), "EEE d MMM · HH:mm");

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      {/* Left accent */}
      <View style={[s.cardAccent, { backgroundColor: moodCol }]} />

      <View style={s.cardInner}>
        {/* Header row */}
        <View style={s.cardHeader}>
          <Text style={s.cardEmoji}>{MOOD_EMO[e.mood_label] || '🙂'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardMood, { color: moodCol }]}>
              {e.mood_label.charAt(0).toUpperCase() + e.mood_label.slice(1)}
              {e.mood_words?.length > 0 && (
                <Text style={s.cardWords}> · {e.mood_words.join(', ')}</Text>
              )}
            </Text>
            <Text style={s.cardDate}>{dateStr}</Text>
            {e.neighbourhood && <Text style={s.cardNeighbour}>📍 {e.neighbourhood}</Text>}
          </View>
          <View style={[s.stressBadge, { borderColor: stressCol + '55' }]}>
            <Text style={[s.stressNum, { color: stressCol }]}>{stressPct}</Text>
            <Text style={s.stressLbl}>stress</Text>
          </View>
        </View>

        {/* Signal pills */}
        <View style={s.pillRow}>
          <Pill icon="📱" text={`${e.screen_time_hours}h screen`} />
          <Pill icon="😴" text={`${e.sleep_hours}h sleep`} />
          <Pill icon="🔋" text={`${e.energy_level}/10`} />
          {e.weather_condition && <Pill icon="🌤" text={e.weather_condition} />}
          {e.sentiment_score != null && e.sentiment_score !== 0 && (
            <Pill icon="💬" text={`VADER: ${e.sentiment_score > 0 ? '+' : ''}${e.sentiment_score?.toFixed(2)}`} color={e.sentiment_score > 0.1 ? G : e.sentiment_score < -0.1 ? R : A} />
          )}
        </View>

        {/* Expanded content */}
        {isExpanded && (
          <View style={s.expanded}>
            <View style={s.expDivider} />

            <ExpLabel text="AI message" />
            <Text style={s.expMsg}>{e.personalised_message}</Text>

            <ExpLabel text="Reflection prompt" />
            <Text style={s.expCbt}>"{e.cbt_prompt}"</Text>

            {e.place_recommendations?.length > 0 && (
              <>
                <ExpLabel text="Recommended places" />
                {e.place_recommendations.map((p: any, i: number) => (
                  <View key={i} style={s.placeRow}>
                    <Text style={{ fontSize: 20 }}>{p.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.placeName}>{p.name}</Text>
                      <Text style={s.placeReason}>{p.reason}</Text>
                    </View>
                    {p.distance_m != null && <Text style={s.placeDist}>{p.distance_m}m</Text>}
                  </View>
                ))}
              </>
            )}

            <View style={s.mlChip}>
              <Text style={s.mlChipTxt}>
                RF stress: {e.stress_score?.toFixed(3)} · {e.stress_category} · {e.hour_of_day}:00
              </Text>
            </View>
          </View>
        )}

        <Text style={s.expandHint}>{isExpanded ? '↑ collapse' : '↓ show AI output'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function Pill({ icon, text, color }: { icon: string; text: string; color?: string }) {
  return (
    <View style={s.pill}>
      <Text style={{ fontSize: 11 }}>{icon}</Text>
      <Text style={[s.pillTxt, color && { color }]}>{text}</Text>
    </View>
  );
}

function ExpLabel({ text }: { text: string }) {
  return <Text style={s.expLabel}>{text}</Text>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 32, paddingBottom: 40, maxWidth: 700, alignSelf: 'center' as any, width: '100%' },
  muted: { fontSize: 13, color: MUT, lineHeight: 20, textAlign: 'center' },

  hero: { paddingTop: 44, paddingBottom: 20 },
  heroGreet: { fontSize: 12, color: SUB, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 },
  heroH: { fontSize: 36, fontWeight: '800', color: TXT, letterSpacing: -1, marginBottom: 4 },
  heroSub: { fontSize: 13, color: MUT },

  searchInput: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: BOR,
    paddingHorizontal: 16, paddingVertical: 10, color: TXT, fontSize: 13,
    marginBottom: 10,
  },
  filterRow: { marginBottom: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: CARD, borderWidth: 0.5, borderColor: BOR },
  filterChipOn: { borderColor: VL, backgroundColor: 'rgba(108,99,255,0.14)' },
  filterChipTxt: { fontSize: 11, color: MUT, fontWeight: '600', textTransform: 'capitalize' },
  dateRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  dateChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: CARD, borderWidth: 0.5, borderColor: BOR },
  dateChipOn: { borderColor: VL, backgroundColor: 'rgba(108,99,255,0.14)' },
  dateChipTxt: { fontSize: 11, color: MUT, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: TXT, marginBottom: 8 },

  card: { backgroundColor: CARD, borderRadius: 16, marginBottom: 10, borderWidth: 0.5, borderColor: BOR, flexDirection: 'row', overflow: 'hidden' },
  cardAccent: { width: 3, flexShrink: 0 },
  cardInner: { flex: 1, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardEmoji: { fontSize: 30, lineHeight: 36 },
  cardMood: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  cardWords: { fontSize: 13, fontWeight: '400', color: MUT },
  cardDate: { fontSize: 11, color: MUT, marginBottom: 2 },
  cardNeighbour: { fontSize: 11, color: C },
  stressBadge: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 52 },
  stressNum: { fontSize: 18, fontWeight: '800', lineHeight: 20 },
  stressLbl: { fontSize: 8, color: SUB, textTransform: 'uppercase', letterSpacing: 0.4 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 0.5, borderColor: BOR },
  pillTxt: { fontSize: 10, color: MUT, fontWeight: '500' },

  expanded: { marginTop: 12 },
  expDivider: { height: 0.5, backgroundColor: BOR, marginBottom: 12 },
  expLabel: { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginBottom: 5, marginTop: 10 },
  expMsg: { fontSize: 13, color: TXT, lineHeight: 20 },
  expCbt: { fontSize: 13, color: VL, lineHeight: 20, fontStyle: 'italic' },
  placeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 7 },
  placeName: { fontSize: 13, fontWeight: '600', color: TXT, marginBottom: 1 },
  placeReason: { fontSize: 11, color: MUT, lineHeight: 16 },
  placeDist: { fontSize: 11, color: C, fontWeight: '600' },
  mlChip: { backgroundColor: 'rgba(108,99,255,0.12)', borderRadius: 8, padding: 9, marginTop: 10, borderWidth: 0.5, borderColor: 'rgba(108,99,255,0.3)' },
  mlChipTxt: { fontSize: 10, color: VL, fontFamily: 'monospace' as any },

  expandHint: { fontSize: 10, color: SUB, textAlign: 'center', marginTop: 8, letterSpacing: 0.3 },
});
