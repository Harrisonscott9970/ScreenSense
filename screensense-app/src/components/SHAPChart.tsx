import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

const V = '#6C63FF', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.48)', SUB = 'rgba(238,240,255,0.22)',
      CARD = 'rgba(255,255,255,0.05)', BOR = 'rgba(255,255,255,0.09)';

interface SHAPContribution {
  feature: string;
  label: string;
  icon: string;
  shap_value: number;
  feature_value: number;
  direction: 'increases_stress' | 'reduces_stress';
  abs_impact: number;
  pct_contribution: number;
}

interface SHAPChartProps {
  explanation: {
    method: string;
    contributions: SHAPContribution[];
    top_driver: string;
    top_driver_pct: number;
  };
  stressColor: string;
}

export default function SHAPChart({ explanation, stressColor }: SHAPChartProps) {
  const anims = useRef(
    explanation.contributions.slice(0, 6).map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    Animated.stagger(80, anims.map(a =>
      Animated.timing(a, { toValue: 1, duration: 500, useNativeDriver: false })
    )).start();
  }, []);

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.title}>Why this score?</Text>
          <Text style={s.sub}>AI explainability — what drove your stress prediction</Text>
        </View>
        <View style={[s.methodBadge, { borderColor: V + '40', backgroundColor: V + '15' }]}>
          <Text style={[s.methodTxt, { color: '#9B94FF' }]}>SHAP</Text>
        </View>
      </View>

      {/* Top driver callout */}
      <View style={[s.topDriver, { backgroundColor: stressColor + '12', borderColor: stressColor + '35' }]}>
        <Text style={s.topDriverLabel}>Biggest driver today</Text>
        <Text style={[s.topDriverValue, { color: stressColor }]}>
          {explanation.top_driver} · {explanation.top_driver_pct}% of prediction
        </Text>
      </View>

      {/* Feature bars */}
      {explanation.contributions.slice(0, 6).map((c, i) => {
        const isStress = c.direction === 'increases_stress';
        const barColor = isStress ? stressColor : '#4CAF82';
        const pct = Math.min(c.pct_contribution, 100);

        return (
          <View key={c.feature} style={s.row}>
            <Text style={s.rowIcon}>{c.icon}</Text>
            <View style={s.rowContent}>
              <View style={s.rowHeader}>
                <Text style={s.rowLabel}>{c.label}</Text>
                <View style={s.rowRight}>
                  <Text style={[s.rowDirection, { color: isStress ? stressColor : '#4CAF82' }]}>
                    {isStress ? '↑' : '↓'}
                  </Text>
                  <Text style={[s.rowPct, { color: barColor }]}>{pct}%</Text>
                </View>
              </View>
              <View style={s.barTrack}>
                <Animated.View style={[
                  s.barFill,
                  {
                    backgroundColor: barColor,
                    width: anims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', `${pct}%`],
                    }) as any,
                  }
                ]} />
              </View>
              <Text style={s.rowValue}>
                Value: {c.feature_value} · {isStress ? 'contributing to stress' : 'reducing stress'}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Citation */}
      <Text style={s.cite}>
        {explanation.method.includes('SHAP')
          ? 'Lundberg & Lee (2017). A unified approach to interpreting model predictions. NeurIPS.'
          : 'Feature importance — install shap package for exact SHAP values'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: BOR },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerLeft: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: TXT, marginBottom: 2 },
  sub: { fontSize: 11, color: MUT, fontStyle: 'italic' },
  methodBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  methodTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  topDriver: { borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1 },
  topDriverLabel: { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3, fontWeight: '600' },
  topDriverValue: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  rowIcon: { fontSize: 16, width: 22, marginTop: 2 },
  rowContent: { flex: 1 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rowLabel: { fontSize: 12, color: TXT, fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowDirection: { fontSize: 14, fontWeight: '800' },
  rowPct: { fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },
  barTrack: { height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, marginBottom: 3 },
  barFill: { height: 5, borderRadius: 3 },
  rowValue: { fontSize: 10, color: SUB },
  cite: { fontSize: 9, color: SUB, fontStyle: 'italic', marginTop: 8, lineHeight: 14 },
});
