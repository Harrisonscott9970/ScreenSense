import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { format } from 'date-fns';

import { BASE_URL } from '../services/api';

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
const STRESS_COL = (s: number) => s > 0.66 ? R : s > 0.33 ? A : G;

interface LogScreenProps {
  userId?: string;
}

export default function LogScreen({ userId = 'user_001' }: LogScreenProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetch(`${BASE_URL}/entries/${userId}?limit=50`).then(r => r.json());
      setEntries(Array.isArray(data) ? data : []);
    } catch { setEntries([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

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
      <View style={s.hero}>
        <Text style={s.heroGreet}>Your history</Text>
        <Text style={s.heroH}>Mood log</Text>
        <Text style={s.heroSub}>{entries.length} entries · pull to refresh</Text>
      </View>

      {entries.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>📓</Text>
          <Text style={s.emptyTitle}>No entries yet</Text>
          <Text style={s.muted}>Complete a check-in to start building your mood log.</Text>
        </View>
      ) : (
        entries.map(e => (
          <EntryCard
            key={e.id} entry={e}
            isExpanded={expanded === e.id}
            onPress={() => setExpanded(expanded === e.id ? null : e.id)}
          />
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
