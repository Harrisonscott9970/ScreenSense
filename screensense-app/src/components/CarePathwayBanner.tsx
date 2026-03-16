import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';

const TXT = '#EEF0FF', MUT = 'rgba(238,240,255,0.55)', SUB = 'rgba(238,240,255,0.28)';

interface CarePathwayBannerProps {
  careLevel: number;
  careLabel: string;
  careColor: string;
  careDescription: string;
  recommendedTools: string[];
  showCrisisResources: boolean;
  riskFactors: string[];
  protectiveFactors: string[];
  clinicalNote: string;
  onOpenCrisis: () => void;
  onOpenTool: (tool: string) => void;
}

const LEVEL_ICONS = { 1: '✅', 2: '📊', 3: '⚠️', 4: '🆘' };
const TOOL_LABELS: Record<string, string> = {
  breathing: '🫁 Breathing',
  cbt: '🧠 Thought challenger',
  gratitude: '🙏 Gratitude',
  mindfulness: '🧘 Mindfulness',
};

export default function CarePathwayBanner({
  careLevel, careLabel, careColor, careDescription,
  recommendedTools, showCrisisResources,
  riskFactors, protectiveFactors, clinicalNote,
  onOpenCrisis, onOpenTool,
}: CarePathwayBannerProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [careLevel]);

  const bgColor = careLevel === 4
    ? 'rgba(244,63,94,0.1)'
    : careLevel === 3
    ? 'rgba(255,138,101,0.08)'
    : careLevel === 2
    ? 'rgba(255,183,77,0.07)'
    : 'rgba(76,175,130,0.07)';

  return (
    <Animated.View style={[s.root, { opacity: fadeAnim, transform: [{ translateY: slideAnim }], backgroundColor: bgColor, borderColor: careColor + '35' }]}>

      {/* Header */}
      <View style={s.header}>
        <View style={[s.levelBadge, { backgroundColor: careColor + '25', borderColor: careColor + '50' }]}>
          <Text style={s.levelIcon}>{LEVEL_ICONS[careLevel as keyof typeof LEVEL_ICONS]}</Text>
          <Text style={[s.levelLabel, { color: careColor }]}>Level {careLevel} — {careLabel}</Text>
        </View>
        <View style={[s.levelDot, { backgroundColor: careColor }]} />
      </View>

      <Text style={s.description}>{careDescription}</Text>

      {/* Clinical note */}
      <Text style={s.clinicalNote}>{clinicalNote}</Text>

      {/* Risk factors (level 3-4 only) */}
      {careLevel >= 3 && riskFactors.length > 0 && (
        <View style={s.riskSection}>
          <Text style={s.riskTitle}>Signals detected</Text>
          {riskFactors.slice(0, 3).map((r, i) => (
            <View key={i} style={s.riskRow}>
              <View style={[s.riskDot, { backgroundColor: careColor }]} />
              <Text style={s.riskTxt}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Protective factors (level 1-2) */}
      {careLevel <= 2 && protectiveFactors.length > 0 && (
        <View style={s.protectSection}>
          {protectiveFactors.slice(0, 2).map((p, i) => (
            <View key={i} style={s.protectRow}>
              <Text style={s.protectIcon}>✦</Text>
              <Text style={s.protectTxt}>{p}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recommended tools */}
      {recommendedTools.length > 0 && (
        <View style={s.toolsSection}>
          <Text style={s.toolsLabel}>Recommended for you now</Text>
          <View style={s.toolsRow}>
            {recommendedTools.slice(0, 3).map(tool => (
              <TouchableOpacity key={tool}
                style={[s.toolChip, { borderColor: careColor + '45', backgroundColor: careColor + '14' }]}
                onPress={() => onOpenTool(tool)}
              >
                <Text style={[s.toolChipTxt, { color: careColor }]}>{TOOL_LABELS[tool] || tool}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Crisis CTA */}
      {showCrisisResources && (
        <TouchableOpacity style={[s.crisisBtn, { backgroundColor: careLevel === 4 ? 'rgba(244,63,94,0.2)' : 'rgba(255,138,101,0.12)', borderColor: careColor + '50' }]}
          onPress={onOpenCrisis}>
          <Text style={[s.crisisBtnTxt, { color: careColor }]}>
            {careLevel === 4 ? '🆘 View crisis support resources' : '📞 View support resources'}
          </Text>
        </TouchableOpacity>
      )}

      {/* NICE reference */}
      <Text style={s.reference}>
        Care model: NHS Talking Therapies / NICE stepped care framework
      </Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  levelIcon: { fontSize: 13 },
  levelLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
  description: { fontSize: 13, color: TXT, lineHeight: 20, marginBottom: 6 },
  clinicalNote: { fontSize: 11, color: MUT, lineHeight: 17, marginBottom: 8, fontStyle: 'italic' },
  riskSection: { backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 10, padding: 10, marginBottom: 10 },
  riskTitle: { fontSize: 9, color: MUT, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, fontWeight: '600' },
  riskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 4 },
  riskDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5, flexShrink: 0 },
  riskTxt: { fontSize: 11, color: MUT, flex: 1, lineHeight: 16 },
  protectSection: { marginBottom: 8 },
  protectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 3 },
  protectIcon: { fontSize: 10, color: '#4CAF82', marginTop: 2 },
  protectTxt: { fontSize: 11, color: MUT, flex: 1, lineHeight: 16 },
  toolsSection: { marginBottom: 10 },
  toolsLabel: { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 7, fontWeight: '600' },
  toolsRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  toolChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  toolChipTxt: { fontSize: 11, fontWeight: '600' },
  crisisBtn: { borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, marginBottom: 8 },
  crisisBtnTxt: { fontSize: 13, fontWeight: '700' },
  reference: { fontSize: 9, color: 'rgba(238,240,255,0.18)', letterSpacing: 0.3, fontStyle: 'italic' },
});
