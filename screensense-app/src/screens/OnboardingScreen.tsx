import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', TXT = '#EEF0FF', MUT = 'rgba(238,240,255,0.5)',
      SUB = 'rgba(238,240,255,0.25)';

const SLIDES = [
  {
    icon: '📱',
    color: V,
    title: 'Your digital\nwellbeing companion',
    sub: 'ScreenSense combines real device signals with AI to understand how your digital habits affect your mental health.',
    badge: 'Affect-aware computing',
  },
  {
    icon: '🧠',
    color: C,
    title: 'Powered by\nreal machine learning',
    sub: 'A trained Random Forest classifier and LSTM neural network analyse your mood, screen time, sleep, and location in real time.',
    badge: 'Breiman (2001) · Hochreiter (1997)',
  },
  {
    icon: '📍',
    color: G,
    title: 'Places that\nmatch how you feel',
    sub: 'Based on Kaplan\'s Attention Restoration Theory, the app recommends nearby spaces proven to support your current emotional state.',
    badge: 'Environmental psychology',
  },
  {
    icon: '🧘',
    color: A,
    title: 'Therapy tools\nbuilt in',
    sub: 'Guided breathing, CBT thought challenging, mindfulness timers, and gratitude journaling — all evidence-based, all in one place.',
    badge: 'CBT · MBSR · Positive psychology',
  },
];

interface OnboardingProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingProps) {
  const [slide, setSlide] = useState(0);
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dotAnims  = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  // Breathing orb
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 4000, useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 4000, useNativeDriver: true }),
    ])).start();
  }, []);
  const orbScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });

  const goTo = (next: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -30, duration: 200, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setSlide(next);
      slideAnim.setValue(40);
      scaleAnim.setValue(0.95);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      dotAnims.forEach((a, i) => {
        Animated.timing(a, { toValue: i === next ? 1 : 0, duration: 250, useNativeDriver: false }).start();
      });
    });
  };

  const next = () => {
    if (slide < SLIDES.length - 1) goTo(slide + 1);
    else {
      AsyncStorage.setItem('ss_onboarded', 'true').catch(() => {});
      onComplete();
    }
  };

  const current = SLIDES[slide];

  return (
    <View style={s.root}>
      {/* Background orb */}
      <Animated.View style={[s.bgOrb, { backgroundColor: current.color + '18', transform: [{ scale: orbScale }] }]} />
      <View style={[s.bgOrb2, { backgroundColor: current.color + '08' }]} />

      {/* Skip */}
      <TouchableOpacity style={s.skip} onPress={() => { AsyncStorage.setItem('ss_onboarded', 'true').catch(() => {}); onComplete(); }}>
        <Text style={s.skipTxt}>Skip</Text>
      </TouchableOpacity>

      {/* Content */}
      <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }]}>

        {/* Icon orb */}
        <View style={[s.iconOrb, { backgroundColor: current.color + '22', borderColor: current.color + '50' }]}>
          <Text style={s.icon}>{current.icon}</Text>
        </View>

        {/* Badge */}
        <View style={[s.badge, { backgroundColor: current.color + '18', borderColor: current.color + '35' }]}>
          <Text style={[s.badgeTxt, { color: current.color }]}>{current.badge}</Text>
        </View>

        {/* Title */}
        <Text style={s.title}>{current.title}</Text>

        {/* Sub */}
        <Text style={s.sub}>{current.sub}</Text>

      </Animated.View>

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((sl, i) => (
          <Animated.View key={i} style={[s.dot, {
            backgroundColor: current.color,
            width: dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [8, 24] }),
            opacity: dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          }]} />
        ))}
      </View>

      {/* CTA */}
      <View style={s.ctaWrap}>
        <TouchableOpacity style={[s.cta, { backgroundColor: current.color }]} onPress={next} activeOpacity={0.88}>
          <Text style={s.ctaTxt}>
            {slide < SLIDES.length - 1 ? 'Next  →' : 'Get started  →'}
          </Text>
        </TouchableOpacity>
        {slide === 0 && (
          <Text style={s.legalTxt}>Your data is stored locally · No ads · GDPR compliant</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', padding: 32 },

  bgOrb: { position: 'absolute', width: 500, height: 500, borderRadius: 250, top: -100, alignSelf: 'center' as any },
  bgOrb2: { position: 'absolute', width: 300, height: 300, borderRadius: 150, bottom: 50, right: -50 },

  skip: { position: 'absolute', top: 24, right: 28 },
  skipTxt: { fontSize: 14, color: 'rgba(238,240,255,0.35)', fontWeight: '500' },

  content: { alignItems: 'center', maxWidth: 480, width: '100%', marginBottom: 32 },

  iconOrb: { width: 100, height: 100, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginBottom: 24 },
  icon: { fontSize: 44 },

  badge: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, marginBottom: 20 },
  badgeTxt: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },

  title: { fontSize: 38, fontWeight: '900', color: TXT, textAlign: 'center', letterSpacing: -1.2, lineHeight: 44, marginBottom: 16 },
  sub: { fontSize: 15, color: MUT, textAlign: 'center', lineHeight: 26 },

  dots: { flexDirection: 'row', gap: 6, marginBottom: 28, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },

  ctaWrap: { width: '100%', maxWidth: 400 },
  cta: { borderRadius: 16, padding: 18, alignItems: 'center', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  ctaTxt: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  legalTxt: { fontSize: 11, color: SUB, textAlign: 'center', marginTop: 10 },
});
