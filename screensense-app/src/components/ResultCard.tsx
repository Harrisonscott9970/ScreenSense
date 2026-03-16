import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Radius } from '../utils/theme';

// ── StressRing ──────────────────────────────────────────────────
interface StressRingProps { score: number; category: string; }

export function StressRing({ score, category }: StressRingProps) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: score, duration: 1000, useNativeDriver: false }).start();
  }, [score]);

  const color = score > 0.66 ? Colors.stressHigh : score > 0.33 ? Colors.stressMid : Colors.stressLow;
  const pct = Math.round(score * 100);
  const label = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <View style={rs.card}>
      <View style={[rs.glowBg, { backgroundColor: color + '15' }]} />
      <View style={rs.row}>
        <View style={rs.ringWrap}>
          <View style={[rs.ring, { borderColor: Colors.card2 }]} />
          <View style={[rs.ringInner, { borderColor: color }]} />
          <View style={rs.center}>
            <Text style={[rs.score, { color }]}>{pct}</Text>
            <Text style={rs.outOf}>/100</Text>
          </View>
        </View>
        <View style={rs.info}>
          <Text style={rs.catLabel}>Predicted stress level</Text>
          <Text style={[rs.category, { color }]}>{label}</Text>
          <View style={rs.barBg}>
            <Animated.View style={[rs.barFill, { backgroundColor: color, width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) as any }]} />
          </View>
          <Text style={rs.model}>Random Forest · scikit-learn · Breiman (2001)</Text>
        </View>
      </View>
    </View>
  );
}
export default StressRing;

const rs = StyleSheet.create({
  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 18, marginBottom: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden', position: 'relative' },
  glowBg: { position: 'absolute', top: -30, right: -30, width: 150, height: 150, borderRadius: 75 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringWrap: { width: 84, height: 84, position: 'relative', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ring: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 7 },
  ringInner: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 7, borderLeftColor: 'transparent', borderBottomColor: 'transparent' },
  center: { alignItems: 'center' },
  score: { fontSize: 22, fontWeight: '800', lineHeight: 24 },
  outOf: { fontSize: 10, color: Colors.textSubtle },
  info: { flex: 1 },
  catLabel: { fontSize: 10, color: Colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  category: { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  barBg: { height: 5, backgroundColor: Colors.card2, borderRadius: 3, marginBottom: 8 },
  barFill: { height: 5, borderRadius: 3 },
  model: { fontSize: 10, color: Colors.textSubtle, fontStyle: 'italic' },
});

// ── ResultCard ──────────────────────────────────────────────────
interface ResultCardProps { label: string; accentColor: string; content: string; italic?: boolean; small?: boolean; }

export function ResultCard({ label, accentColor, content, italic, small }: ResultCardProps) {
  return (
    <View style={[cs.card, { borderLeftColor: accentColor }]}>
      <View style={[cs.dot, { backgroundColor: accentColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={cs.label}>{label}</Text>
        <Text style={[cs.content, italic && { fontStyle: 'italic' }, small && { fontSize: 13, lineHeight: 20 }]}>{content}</Text>
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  card: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: Colors.border, borderLeftWidth: 3, flexDirection: 'row', gap: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 4, flexShrink: 0 },
  label: { fontSize: 9, color: Colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: '600' },
  content: { fontSize: 15, color: Colors.text, lineHeight: 24 },
});

// ── PlaceCard ──────────────────────────────────────────────────
interface PlaceCardProps { place: { name: string; type: string; icon: string; reason: string; distance_m?: number; address?: string }; index: number; }

export function PlaceCard({ place, index }: PlaceCardProps) {
  return (
    <View style={ps.card}>
      <View style={ps.iconWrap}>
        <Text style={ps.icon}>{place.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={ps.row}>
          <Text style={ps.name}>{place.name}</Text>
          {place.distance_m != null && <Text style={ps.dist}>{place.distance_m}m</Text>}
        </View>
        <Text style={ps.type}>{place.type}</Text>
        <Text style={ps.reason}>{place.reason}</Text>
      </View>
      <Text style={ps.num}>{String(index + 1).padStart(2, '0')}</Text>
    </View>
  );
}

const ps = StyleSheet.create({
  card: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: Colors.border, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.card2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  icon: { fontSize: 22 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  name: { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },
  dist: { fontSize: 11, color: Colors.cyan, fontWeight: '600' },
  type: { fontSize: 10, color: Colors.violet, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, fontWeight: '600' },
  reason: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  num: { fontSize: 11, fontWeight: '800', color: Colors.textSubtle, alignSelf: 'flex-start' },
});
