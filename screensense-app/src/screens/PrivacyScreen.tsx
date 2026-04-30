import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { C, Space, Radius, Font } from '../utils/theme';

export default function PrivacyScreen() {
  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <Text style={s.heroH}>Privacy Policy</Text>
        <Text style={s.heroSub}>Last updated: March 2026 · Harrison Scott</Text>
      </View>

      <Section title="1. What ScreenSense is">
        <Para text="ScreenSense is a digital wellbeing research application developed as a final year Computer Science dissertation project at the University of Plymouth. It is not a medical device, clinical service, or regulated health product." />
      </Section>

      <Section title="2. Data we collect">
        <Para text="With your consent, ScreenSense may collect:" />
        <Bullet text="Mood check-in data (mood, words, intensity, body areas, thought patterns)" />
        <Bullet text="Optional journal text you choose to write" />
        <Bullet text="Screen time estimates you enter or that are read from your device" />
        <Bullet text="Sleep duration and quality you manually enter" />
        <Bullet text="Approximate GPS location (used only for nearby place recommendations)" />
        <Bullet text="PHQ-9, GAD-7, and WHO-5 questionnaire responses" />
        <Bullet text="Energy level and heart rate (if entered)" />
      </Section>

      <Section title="3. How we use your data">
        <Para text="Your data is used exclusively to:" />
        <Bullet text="Generate personalised stress predictions using ML models running locally" />
        <Bullet text="Recommend nearby places matched to your current mood and stress level" />
        <Bullet text="Show you patterns and trends in your own wellbeing over time" />
        <Bullet text="Power the Scout AI companion with your current context" />
        <Para text="Your data is never sold, shared with advertisers, or used for any commercial purpose." />
      </Section>

      <Section title="4. Data storage and security">
        <Para text="All personal data is stored in a secure database associated with your account. Location data is used only to query nearby places and is not stored beyond the check-in session. Journal text is processed for sentiment analysis and then stored encrypted." />
      </Section>

      <Section title="5. Your rights (GDPR)">
        <Para text="Under UK GDPR and the Data Protection Act 2018, you have the right to:" />
        <Bullet text="Access all data we hold about you (Profile → Export data)" />
        <Bullet text="Delete all your data at any time (Profile → Delete all data)" />
        <Bullet text="Withdraw consent for any data type at any time (Profile → Data settings)" />
        <Bullet text="Request a copy of your data in machine-readable format (CSV export)" />
      </Section>

      <Section title="6. Clinical disclaimer">
        <Para text="ScreenSense is not a clinical service. It does not diagnose, treat, or monitor any medical condition. PHQ-9, GAD-7, and WHO-5 scores are screening tools only — not clinical diagnoses. The Scout AI companion is a conversational support tool, not a therapist." />
        <Para text="If you are experiencing a mental health crisis, please contact:" />
        <Bullet text="Samaritans: 116 123 (free, 24/7)" />
        <Bullet text="Crisis Text Line: Text SHOUT to 85258" />
        <Bullet text="NHS 111: 111 (select mental health option)" />
        <Bullet text="Emergency services: 999" />
      </Section>

      <Section title="7. Third-party services">
        <Para text="ScreenSense uses the following third-party services:" />
        <Bullet text="Foursquare Places API — for nearby place recommendations (no personal data shared)" />
        <Bullet text="Open-Meteo — for weather data (location only, no personal data)" />
        <Bullet text="ScreenSense bespoke ML engine — for Scout AI conversations (VADER sentiment + BiLSTM distress analysis, processed locally)" />
      </Section>

      <Section title="8. Contact">
        <Para text="For any questions about this privacy policy or your data, contact:" />
        <TouchableOpacity onPress={() => Linking.openURL('mailto:h.scott@students.plymouth.ac.uk')}>
          <Text style={s.link}>h.scott@students.plymouth.ac.uk</Text>
        </TouchableOpacity>
      </Section>

      <View style={s.footer}>
        <Text style={s.footerTxt}>ScreenSense · University of Plymouth · BSc Computer Science · 2025-26</Text>
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Para({ text }: { text: string }) {
  return <Text style={s.para}>{text}</Text>;
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={s.bulletRow}>
      <View style={s.bulletDot} />
      <Text style={s.bulletTxt}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: Space['6'], paddingBottom: Space['10'], maxWidth: 680, alignSelf: 'center' as any, width: '100%' },

  hero: { paddingTop: Space['10'], paddingBottom: Space['6'], borderBottomWidth: 1, borderBottomColor: C.line, marginBottom: Space['6'] },
  heroH: { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: Space['2'] },
  heroSub: { fontSize: 13, color: C.textDim },

  section: { marginBottom: Space['6'] },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: Space['3'], borderLeftWidth: 3, borderLeftColor: C.violet, paddingLeft: Space['3'] },
  para: { fontSize: 14, color: C.textSub, lineHeight: 22, marginBottom: Space['3'] },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Space['3'], marginBottom: Space['2'], paddingLeft: Space['2'] },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.violet, marginTop: 9, flexShrink: 0 },
  bulletTxt: { fontSize: 14, color: C.textSub, lineHeight: 22, flex: 1 },
  link: { fontSize: 14, color: C.teal, textDecorationLine: 'underline' },

  footer: { marginTop: Space['8'], paddingTop: Space['5'], borderTopWidth: 1, borderTopColor: C.line },
  footerTxt: { fontSize: 11, color: C.textGhost, textAlign: 'center', lineHeight: 18 },
});
