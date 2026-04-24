import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.48)', SUB = 'rgba(238,240,255,0.22)',
      CARD = 'rgba(255,255,255,0.05)', BOR = 'rgba(255,255,255,0.09)';

const DATA_TYPES = [
  {
    id: 'mood',
    icon: '😊',
    label: 'Mood check-ins',
    desc: 'Your mood selections, word chips, and intensity ratings',
    purpose: 'Core app function — mood tracking and pattern analysis',
    required: true,
    color: VL,
  },
  {
    id: 'journal',
    icon: '📝',
    label: 'Journal text',
    desc: 'Free-text journal entries you choose to write',
    purpose: 'VADER sentiment analysis for deeper insight',
    required: false,
    color: C,
  },
  {
    id: 'screen_time',
    icon: '📱',
    label: 'Screen time data',
    desc: 'Daily phone usage in hours (simulated in this version)',
    purpose: 'ML stress classification — strongest predictor at 33.9%',
    required: false,
    color: A,
  },
  {
    id: 'location',
    icon: '📍',
    label: 'Location (GPS)',
    desc: 'Approximate location used only to find nearby places',
    purpose: 'Place recommendations — not stored beyond session',
    required: false,
    color: G,
  },
  {
    id: 'sleep',
    icon: '😴',
    label: 'Sleep data',
    desc: 'Sleep duration and quality you manually enter',
    purpose: 'Wellbeing pattern analysis and care pathway assessment',
    required: false,
    color: '#7986CB',
  },
  {
    id: 'clinical',
    icon: '🩺',
    label: 'Clinical assessments',
    desc: 'PHQ-9, GAD-7, and WHO-5 questionnaire responses',
    purpose: 'Longitudinal mental health tracking — stored locally only',
    required: false,
    color: R,
  },
];

interface ConsentScreenProps {
  onComplete: (consents: Record<string, boolean>) => void;
  isSettings?: boolean;
}

export default function ConsentScreen({ onComplete, isSettings = false }: ConsentScreenProps) {
  const [consents, setConsents] = useState<Record<string, boolean>>(
    Object.fromEntries(DATA_TYPES.map(d => [d.id, d.required]))
  );

  // Load saved consents from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem('ss_consents').then(saved => {
      if (saved) {
        try { setConsents(JSON.parse(saved)); } catch {}
      }
    }).catch(() => {});
  }, []);

  const toggle = (id: string, required: boolean) => {
    if (required) return;
    setConsents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const save = () => {
    // Required consents always true
    const final = { ...consents };
    DATA_TYPES.filter(d => d.required).forEach(d => { final[d.id] = true; });
    AsyncStorage.setItem('ss_consents', JSON.stringify(final)).catch(() => {});
    onComplete(final);
  };

  const acceptAll = () => {
    const all = Object.fromEntries(DATA_TYPES.map(d => [d.id, true]));
    setConsents(all);
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <View style={s.heroIcon}><Text style={{ fontSize: 32 }}>🔒</Text></View>
        <Text style={s.heroH}>Your data,{'\n'}your choice</Text>
        <Text style={s.heroSub}>
          ScreenSense is privacy-first. All data is stored locally on your device.
          Nothing is shared with third parties. You control exactly what is collected.
        </Text>
      </View>

      {/* GDPR info */}
      <View style={s.gdprCard}>
        <Text style={s.gdprTitle}>📋 Data protection</Text>
        <Text style={s.gdprTxt}>
          This app stores data locally using SQLite on your device. No data is transmitted to external servers except for anonymous place queries (Foursquare) and weather data (Open-Meteo). You have the right to export or delete all your data at any time from the Profile screen.
        </Text>
        <Text style={[s.gdprTxt, { color: VL, marginTop: 6 }]}>GDPR Article 13 compliance · UK Data Protection Act 2018</Text>
      </View>

      <Text style={s.secLabel}>Data collection settings</Text>

      {DATA_TYPES.map(dt => (
        <View key={dt.id} style={[s.consentCard, consents[dt.id] && { borderColor: dt.color + '45', backgroundColor: dt.color + '08' }]}>
          <View style={s.consentTop}>
            <View style={[s.consentIcon, { backgroundColor: dt.color + '20' }]}>
              <Text style={{ fontSize: 20 }}>{dt.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.consentTitleRow}>
                <Text style={s.consentLabel}>{dt.label}</Text>
                {dt.required && (
                  <View style={s.requiredBadge}>
                    <Text style={s.requiredTxt}>Required</Text>
                  </View>
                )}
              </View>
              <Text style={s.consentDesc}>{dt.desc}</Text>
              <Text style={s.consentPurpose}>Purpose: {dt.purpose}</Text>
            </View>
            <Switch
              value={consents[dt.id]}
              onValueChange={() => toggle(dt.id, dt.required)}
              disabled={dt.required}
              trackColor={{ true: dt.color, false: 'rgba(255,255,255,0.1)' }}
              thumbColor="#fff"
            />
          </View>
        </View>
      ))}

      {/* Clinical disclaimer */}
      <View style={s.disclaimerCard}>
        <Text style={s.disclaimerTitle}>⚕️ Clinical disclaimer</Text>
        <Text style={s.disclaimerTxt}>
          ScreenSense is a digital wellbeing tool, not a medical device. It does not diagnose, treat, or monitor medical conditions. PHQ-9 and GAD-7 scores are screening tools only — not clinical diagnoses. If you are concerned about your mental health, please speak to a GP or qualified mental health professional.
        </Text>
      </View>

      {/* Action buttons */}
      {!isSettings && (
        <TouchableOpacity style={s.acceptAllBtn} onPress={acceptAll}>
          <Text style={s.acceptAllTxt}>Accept all (recommended)</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.saveBtn} onPress={save}>
        <Text style={s.saveBtnTxt}>
          {isSettings ? 'Save preferences' : 'Continue with selected →'}
        </Text>
      </TouchableOpacity>

      <Text style={s.footNote}>
        You can change these settings at any time in Profile → Data settings.
        Disabling a data type will not delete existing data — use "Export & delete" in Profile for that.
      </Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 28, paddingBottom: 40, maxWidth: 640, alignSelf: 'center' as any, width: '100%' },

  hero: { alignItems: 'center', paddingTop: 44, paddingBottom: 28 },
  heroIcon: { width: 70, height: 70, borderRadius: 20, backgroundColor: 'rgba(108,99,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(108,99,255,0.35)', marginBottom: 16 },
  heroH: { fontSize: 34, fontWeight: '800', color: TXT, textAlign: 'center', letterSpacing: -0.8, lineHeight: 38, marginBottom: 12 },
  heroSub: { fontSize: 14, color: MUT, textAlign: 'center', lineHeight: 22 },

  gdprCard: { backgroundColor: 'rgba(108,99,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(108,99,255,0.2)' },
  gdprTitle: { fontSize: 13, fontWeight: '700', color: TXT, marginBottom: 6 },
  gdprTxt: { fontSize: 12, color: MUT, lineHeight: 19 },

  secLabel: { fontSize: 11, fontWeight: '700', color: SUB, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  consentCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: BOR },
  consentTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  consentIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  consentTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  consentLabel: { fontSize: 14, fontWeight: '700', color: TXT },
  requiredBadge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 0.5, borderColor: BOR },
  requiredTxt: { fontSize: 9, color: SUB, fontWeight: '600' },
  consentDesc: { fontSize: 12, color: MUT, lineHeight: 17, marginBottom: 3 },
  consentPurpose: { fontSize: 10, color: SUB, fontStyle: 'italic' },

  disclaimerCard: { backgroundColor: 'rgba(255,183,77,0.08)', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,183,77,0.2)' },
  disclaimerTitle: { fontSize: 13, fontWeight: '700', color: A, marginBottom: 6 },
  disclaimerTxt: { fontSize: 12, color: MUT, lineHeight: 19 },

  acceptAllBtn: { backgroundColor: 'rgba(108,99,255,0.12)', borderRadius: 14, padding: 15, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(108,99,255,0.25)', marginBottom: 8 },
  acceptAllTxt: { fontSize: 14, color: VL, fontWeight: '600' },
  saveBtn: { backgroundColor: V, borderRadius: 14, padding: 17, alignItems: 'center', marginBottom: 12, shadowColor: V, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  saveBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  footNote: { fontSize: 11, color: SUB, textAlign: 'center', lineHeight: 17 },
});
