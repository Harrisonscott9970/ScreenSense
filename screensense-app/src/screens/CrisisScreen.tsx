import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Linking, Easing,
} from 'react-native';

const R = '#F43F5E', V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7',
      G = '#4CAF82', A = '#FFB74D', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.55)', SUB = 'rgba(238,240,255,0.28)',
      CARD = 'rgba(255,255,255,0.05)', BOR = 'rgba(255,255,255,0.09)';

const CRISIS_RESOURCES = [
  { name: 'Samaritans', desc: 'Free, confidential support 24/7', phone: '116 123', url: 'https://www.samaritans.org', hours: '24/7', icon: '📞', color: '#4CAF82' },
  { name: 'Crisis Text Line', desc: 'Text SHOUT to 85258', phone: 'Text SHOUT to 85258', url: 'https://giveusashout.org', hours: '24/7', icon: '💬', color: '#4FC3F7' },
  { name: 'NHS 111', desc: 'Urgent mental health support', phone: '111', url: 'https://111.nhs.uk', hours: '24/7', icon: '🏥', color: '#FFB74D' },
  { name: 'Mind', desc: 'Mental health support & information', phone: '0300 123 3393', url: 'https://www.mind.org.uk', hours: 'Mon–Fri 9am–6pm', icon: '🌿', color: '#9B94FF' },
  { name: 'Student Minds', desc: 'UK student mental health charity', phone: null, url: 'https://www.studentminds.org.uk', hours: 'Online', icon: '🎓', color: '#FFB74D' },
];

const GROUNDING = [
  { n: 5, sense: 'see', icon: '👁', instruction: 'Look around and name 5 things you can see right now. Take your time.' },
  { n: 4, sense: 'touch', icon: '✋', instruction: 'Notice 4 things you can physically touch. Feel their texture and temperature.' },
  { n: 3, sense: 'hear', icon: '👂', instruction: 'Close your eyes and listen for 3 distinct sounds in your environment.' },
  { n: 2, sense: 'smell', icon: '👃', instruction: 'Notice 2 scents — from your environment, coffee, air, anything.' },
  { n: 1, sense: 'taste', icon: '👅', instruction: 'Notice 1 taste in your mouth right now. Breathe slowly.' },
];

interface CrisisScreenProps {
  onBack: () => void;
  userName?: string;
  riskFactors?: string[];
  isAutoEscalated?: boolean;
}

export default function CrisisScreen({ onBack, userName = 'Harrison', riskFactors = [], isAutoEscalated = false }: CrisisScreenProps) {
  const [tab, setTab] = useState<'grounding' | 'resources' | 'info'>('grounding');
  const [groundingStep, setGroundingStep] = useState(0);
  const [groundingDone, setGroundingDone] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.05, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  const openURL = (url: string) => {
    if (typeof window !== 'undefined') window.open(url, '_blank');
    else Linking.openURL(url).catch(() => {});
  };

  return (
    <Animated.View style={[s.root, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Text style={s.backTxt}>← Back to app</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Animated.View style={[s.headerOrb, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={s.headerTitle}>You're not alone</Text>
          <Text style={s.headerSub}>
            {isAutoEscalated
              ? "ScreenSense has noticed some patterns that suggest you might benefit from extra support right now."
              : "You've reached out — that takes courage. Let's take this one step at a time."}
          </Text>
        </View>
      </View>

      {/* Disclaimer */}
      <View style={s.disclaimer}>
        <Text style={s.disclaimerTxt}>
          ⚠️ ScreenSense is not a clinical service and cannot provide crisis care. The resources below connect you with real people who can help. If you are in immediate danger, call 999.
        </Text>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['grounding', 'resources', 'info'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabOn]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>
              {t === 'grounding' ? '🌬 Grounding' : t === 'resources' ? '📞 Get help' : 'ℹ️ About'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── GROUNDING TAB ── */}
        {tab === 'grounding' && (
          <View>
            <Text style={s.sectionTitle}>5-4-3-2-1 Grounding technique</Text>
            <Text style={s.sectionSub}>This is a clinically validated anxiety grounding technique. It works by anchoring your attention to the present moment.</Text>

            {!groundingDone ? (
              <>
                <View style={s.groundingCard}>
                  <View style={s.groundingStep}>
                    <Text style={s.groundingIcon}>{GROUNDING[groundingStep].icon}</Text>
                    <View style={s.groundingBadge}>
                      <Text style={s.groundingBadgeTxt}>
                        {GROUNDING[groundingStep].n} thing{GROUNDING[groundingStep].n !== 1 ? 's' : ''} you can {GROUNDING[groundingStep].sense}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.groundingInstruction}>{GROUNDING[groundingStep].instruction}</Text>
                  <View style={s.groundingDots}>
                    {GROUNDING.map((_, i) => (
                      <View key={i} style={[s.groundingDot, { backgroundColor: i <= groundingStep ? C : 'rgba(255,255,255,0.1)' }]} />
                    ))}
                  </View>
                </View>
                <TouchableOpacity style={s.groundingBtn} onPress={() => {
                  if (groundingStep < GROUNDING.length - 1) setGroundingStep(s => s + 1);
                  else setGroundingDone(true);
                }}>
                  <Text style={s.groundingBtnTxt}>
                    {groundingStep < GROUNDING.length - 1 ? 'I\'ve done this  →' : 'Complete grounding'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={s.groundingComplete}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🌊</Text>
                <Text style={s.groundingCompleteTitle}>Well done</Text>
                <Text style={s.groundingCompleteSub}>
                  You've completed the grounding exercise. Many people find this helps reduce the intensity of difficult feelings. Remember — feelings are temporary and will pass.
                </Text>
                <TouchableOpacity style={s.groundingBtn} onPress={() => { setGroundingDone(false); setGroundingStep(0); }}>
                  <Text style={s.groundingBtnTxt}>Go again</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.groundingBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: BOR, marginTop: 8 }]}
                  onPress={() => setTab('resources')}>
                  <Text style={[s.groundingBtnTxt, { color: MUT }]}>See support resources →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Breathing */}
            <View style={s.breatheCard}>
              <Text style={s.breatheCardTitle}>Box breathing</Text>
              <Text style={s.breatheCardSub}>Breathe in for 4 · hold for 4 · out for 4 · hold for 4. Repeat 4 times. This activates your parasympathetic nervous system.</Text>
              <View style={s.boxBreath}>
                {['In · 4', 'Hold · 4', 'Out · 4', 'Hold · 4'].map((label, i) => (
                  <View key={i} style={[s.boxBreathStep, { borderColor: [C, A, V, G][i] + '60', backgroundColor: [C, A, V, G][i] + '14' }]}>
                    <Text style={[s.boxBreathLbl, { color: [C, A, V, G][i] }]}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── RESOURCES TAB ── */}
        {tab === 'resources' && (
          <View>
            <Text style={s.sectionTitle}>Get support now</Text>
            <Text style={s.sectionSub}>These are real services with trained people ready to help. All are free and confidential.</Text>

            {CRISIS_RESOURCES.map((r, i) => (
              <View key={i} style={[s.resourceCard, { borderLeftColor: r.color }]}>
                <View style={s.resourceTop}>
                  <Text style={{ fontSize: 24 }}>{r.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resourceName}>{r.name}</Text>
                    <Text style={s.resourceDesc}>{r.desc}</Text>
                    <View style={s.resourceMeta}>
                      <View style={[s.resourceHoursBadge, { backgroundColor: r.color + '18', borderColor: r.color + '35' }]}>
                        <Text style={[s.resourceHoursTxt, { color: r.color }]}>{r.hours}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={s.resourceActions}>
                  {r.phone && (
                    <TouchableOpacity style={[s.resourceBtn, { backgroundColor: r.color + '20', borderColor: r.color + '40' }]}
                      onPress={() => Linking.openURL(`tel:${r.phone.replace(/\D/g, '')}`).catch(() => {})}>
                      <Text style={[s.resourceBtnTxt, { color: r.color }]}>📞 {r.phone}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[s.resourceBtn, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: BOR }]}
                    onPress={() => openURL(r.url)}>
                    <Text style={s.resourceBtnTxt}>Visit website →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={s.emergencyCard}>
              <Text style={s.emergencyTitle}>🚨 Immediate danger</Text>
              <Text style={s.emergencyTxt}>If you or someone else is in immediate danger, call 999 or go to your nearest A&E.</Text>
              <TouchableOpacity style={s.emergencyBtn} onPress={() => Linking.openURL('tel:999').catch(() => {})}>
                <Text style={s.emergencyBtnTxt}>Call 999</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── INFO TAB ── */}
        {tab === 'info' && (
          <View>
            <Text style={s.sectionTitle}>About this feature</Text>

            {isAutoEscalated && riskFactors.length > 0 && (
              <View style={s.riskCard}>
                <Text style={s.riskCardTitle}>What ScreenSense noticed</Text>
                {riskFactors.map((r, i) => (
                  <View key={i} style={s.riskItem}>
                    <View style={s.riskDot} />
                    <Text style={s.riskTxt}>{r}</Text>
                  </View>
                ))}
                <Text style={s.riskDisclaimer}>This is pattern recognition, not clinical assessment. These signals may be coincidental.</Text>
              </View>
            )}

            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>What ScreenSense can and cannot do</Text>
              <InfoRow icon="✅" text="Track mood patterns over time" />
              <InfoRow icon="✅" text="Suggest evidence-based self-help tools" />
              <InfoRow icon="✅" text="Signpost to real crisis support services" />
              <InfoRow icon="✅" text="Provide grounding and breathing exercises" />
              <InfoRow icon="❌" text="Diagnose mental health conditions" />
              <InfoRow icon="❌" text="Replace professional clinical care" />
              <InfoRow icon="❌" text="Provide emergency crisis intervention" />
              <InfoRow icon="❌" text="Monitor you for safety between sessions" />
            </View>

            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>Stepped care model</Text>
              <Text style={s.infoCardTxt}>ScreenSense uses the NHS Talking Therapies / NICE stepped care framework to adapt the level of support it offers based on your patterns. This is a decision-support tool, not a clinical triage system.</Text>
              <Text style={[s.infoCardTxt, { color: VL, marginTop: 8 }]}>Reference: NICE (2022). Common mental health problems: identification and pathways to care.</Text>
            </View>

            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>Your data</Text>
              <Text style={s.infoCardTxt}>All entries are stored locally on your device. No mood data or journal text is shared with third parties. Crisis resource links open external websites — ScreenSense does not share your information with them.</Text>
            </View>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </Animated.View>
  );
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={ir.row}>
      <Text style={ir.icon}>{icon}</Text>
      <Text style={ir.txt}>{text}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  icon: { fontSize: 14, width: 20 },
  txt: { fontSize: 13, color: MUT, flex: 1, lineHeight: 20 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(244,63,94,0.04)' },

  header: { padding: 24, paddingTop: 32, alignItems: 'center' },
  backBtn: { alignSelf: 'flex-start' as any, marginBottom: 16 },
  backTxt: { fontSize: 13, color: MUT, fontWeight: '500' },
  headerCenter: { alignItems: 'center', position: 'relative' },
  headerOrb: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(244,63,94,0.1)', top: -60 },
  headerTitle: { fontSize: 30, fontWeight: '800', color: TXT, marginBottom: 8, letterSpacing: -0.5 },
  headerSub: { fontSize: 14, color: MUT, textAlign: 'center', lineHeight: 22, maxWidth: 400 },

  disclaimer: { backgroundColor: 'rgba(244,63,94,0.1)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)', borderRadius: 12, marginHorizontal: 24, padding: 12, marginBottom: 16 },
  disclaimerTxt: { fontSize: 12, color: '#F43F5E', lineHeight: 18, textAlign: 'center' },

  tabs: { flexDirection: 'row', marginHorizontal: 24, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4, marginBottom: 20, borderWidth: 0.5, borderColor: BOR },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabOn: { backgroundColor: 'rgba(244,63,94,0.2)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.35)' },
  tabTxt: { fontSize: 12, color: MUT, fontWeight: '500' },
  tabTxtOn: { color: TXT, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40, maxWidth: 680, alignSelf: 'center' as any, width: '100%' },

  sectionTitle: { fontSize: 20, fontWeight: '800', color: TXT, marginBottom: 6, letterSpacing: -0.3 },
  sectionSub: { fontSize: 13, color: MUT, lineHeight: 20, marginBottom: 20, fontStyle: 'italic' },

  groundingCard: { backgroundColor: 'rgba(79,195,247,0.08)', borderRadius: 18, padding: 22, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(79,195,247,0.2)' },
  groundingStep: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  groundingIcon: { fontSize: 36 },
  groundingBadge: { backgroundColor: 'rgba(79,195,247,0.18)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6 },
  groundingBadgeTxt: { fontSize: 13, color: C, fontWeight: '700' },
  groundingInstruction: { fontSize: 16, color: TXT, lineHeight: 26, marginBottom: 18 },
  groundingDots: { flexDirection: 'row', gap: 8 },
  groundingDot: { flex: 1, height: 4, borderRadius: 2 },
  groundingBtn: { backgroundColor: C, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 4 },
  groundingBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  groundingComplete: { alignItems: 'center', paddingVertical: 20 },
  groundingCompleteTitle: { fontSize: 24, fontWeight: '800', color: TXT, marginBottom: 10 },
  groundingCompleteSub: { fontSize: 14, color: MUT, textAlign: 'center', lineHeight: 22, marginBottom: 20 },

  breatheCard: { backgroundColor: CARD, borderRadius: 16, padding: 18, marginTop: 8, borderWidth: 0.5, borderColor: BOR },
  breatheCardTitle: { fontSize: 15, fontWeight: '700', color: TXT, marginBottom: 4 },
  breatheCardSub: { fontSize: 12, color: MUT, lineHeight: 19, marginBottom: 14 },
  boxBreath: { flexDirection: 'row', gap: 6 },
  boxBreathStep: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1 },
  boxBreathLbl: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  resourceCard: { backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: BOR, borderLeftWidth: 3 },
  resourceTop: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  resourceName: { fontSize: 15, fontWeight: '700', color: TXT, marginBottom: 2 },
  resourceDesc: { fontSize: 12, color: MUT, marginBottom: 6 },
  resourceMeta: { flexDirection: 'row' },
  resourceHoursBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  resourceHoursTxt: { fontSize: 10, fontWeight: '600' },
  resourceActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  resourceBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, flex: 1 },
  resourceBtnTxt: { fontSize: 12, fontWeight: '600', color: MUT, textAlign: 'center' },

  emergencyCard: { backgroundColor: 'rgba(244,63,94,0.1)', borderRadius: 16, padding: 18, marginTop: 8, borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)' },
  emergencyTitle: { fontSize: 16, fontWeight: '800', color: R, marginBottom: 6 },
  emergencyTxt: { fontSize: 13, color: MUT, lineHeight: 20, marginBottom: 14 },
  emergencyBtn: { backgroundColor: R, borderRadius: 12, padding: 14, alignItems: 'center' },
  emergencyBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

  riskCard: { backgroundColor: 'rgba(244,63,94,0.08)', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(244,63,94,0.2)' },
  riskCardTitle: { fontSize: 13, fontWeight: '700', color: R, marginBottom: 10 },
  riskItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  riskDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: R, marginTop: 6, flexShrink: 0 },
  riskTxt: { fontSize: 12, color: MUT, flex: 1, lineHeight: 18 },
  riskDisclaimer: { fontSize: 11, color: SUB, marginTop: 8, fontStyle: 'italic', lineHeight: 17 },

  infoCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: BOR },
  infoCardTitle: { fontSize: 14, fontWeight: '700', color: TXT, marginBottom: 10 },
  infoCardTxt: { fontSize: 13, color: MUT, lineHeight: 20 },
});
