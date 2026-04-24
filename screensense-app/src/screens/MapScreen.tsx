import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Animated, Linking, Dimensions,
} from 'react-native';
import { BASE_URL } from '../services/api';  // eslint-disable-line @typescript-eslint/no-unused-vars
const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.48)', SUB = 'rgba(238,240,255,0.22)',
      CARD = 'rgba(255,255,255,0.05)', BOR = 'rgba(255,255,255,0.09)';

const MOOD_COL: Record<string, string> = {
  joyful: G, content: '#AED581', calm: C, energised: A,
  anxious: R, stressed: '#FF8A65', low: '#7E57C2', numb: '#78909C',
};

// Therapeutic route types — the core differentiator
const ROUTE_TYPES = [
  {
    id: 'reset',
    label: 'Reset walk',
    icon: '🚶',
    color: G,
    description: 'A short outdoor walk to interrupt rumination and lower cortisol',
    duration: '10–20 min',
    benefit: 'Stress reduction',
    theory: 'Ulrich SRT (1984)',
    best_for: ['anxious', 'stressed', 'numb'],
    place_types: ['Park', 'Green Space', 'Garden'],
  },
  {
    id: 'refuge',
    label: 'Quiet indoor refuge',
    icon: '📚',
    color: VL,
    description: 'A calm, low-stimulation indoor space to decompress without social pressure',
    duration: '20–60 min',
    benefit: 'Attentional restoration',
    theory: 'Kaplan ART (1995)',
    best_for: ['anxious', 'stressed', 'overwhelmed'],
    place_types: ['Library', 'Museum', 'Gallery'],
  },
  {
    id: 'coffee',
    label: 'Low-stimulation coffee stop',
    icon: '☕',
    color: A,
    description: 'Mild positive stimulation — engaging but not demanding',
    duration: '20–40 min',
    benefit: 'Mild mood lift',
    theory: 'Ulrich SRT (1984)',
    best_for: ['low', 'numb', 'calm'],
    place_types: ['Café', 'Bookshop'],
  },
  {
    id: 'social',
    label: 'Social re-entry spot',
    icon: '🤝',
    color: C,
    description: 'A warm, social environment for reconnection and positive affect',
    duration: '30–90 min',
    benefit: 'Social reward',
    theory: 'Fredrickson Broaden-Build (2001)',
    best_for: ['content', 'energised', 'joyful'],
    place_types: ['Market', 'Restaurant', 'Social Space'],
  },
  {
    id: 'sunlight',
    label: 'Sunlight & nature boost',
    icon: '☀️',
    color: '#FFD54F',
    description: 'Natural light and greenery for circadian rhythm and mood regulation',
    duration: '15–30 min',
    benefit: 'Circadian regulation',
    theory: 'Kaplan ART (1995)',
    best_for: ['low', 'numb', 'calm'],
    place_types: ['Park', 'Riverside Walk', 'Garden'],
  },
];

interface MapScreenProps {
  userId: string;
  currentMood?: string;
  currentStress?: number;
  lastResult?: any;
}

export default function MapScreen({ userId, currentMood, currentStress, lastResult }: MapScreenProps) {
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<any>(null);
  const [view, setView] = useState<'routes' | 'map'>('routes');
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const openGoogleMaps = (placeName: string) => {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(placeName + ' London')}`;
    if (typeof window !== 'undefined') window.open(url, '_blank');
    else Linking.openURL(url).catch(() => {});
  };

  const openDirections = (placeName: string) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(placeName + ' London')}`;
    if (typeof window !== 'undefined') window.open(url, '_blank');
    else Linking.openURL(url).catch(() => {});
  };

  const selectPlace = (place: any) => {
    setSelectedPlace(place);
    slideAnim.setValue(300);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 12 }).start();
  };

  const closePlace = () => {
    Animated.timing(slideAnim, { toValue: 300, duration: 250, useNativeDriver: true }).start(() => setSelectedPlace(null));
  };

  // Get recommended route types for current mood
  const recommendedRoutes = currentMood
    ? ROUTE_TYPES.filter(r => r.best_for.includes(currentMood))
    : ROUTE_TYPES;

  const otherRoutes = ROUTE_TYPES.filter(r => !recommendedRoutes.includes(r));

  const stressColor = currentStress
    ? currentStress > 0.66 ? R : currentStress > 0.33 ? A : G
    : V;

  const places = lastResult?.place_recommendations || [];

  return (
    <Animated.View style={[s.root, { opacity: fadeAnim }]}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerGreet}>Recovery map</Text>
          <Text style={s.headerTitle}>Places for your mood</Text>
          {currentMood ? (
            <View style={s.headerMoodRow}>
              <View style={[s.moodDot, { backgroundColor: MOOD_COL[currentMood] || V }]} />
              <Text style={s.headerSub}>
                Showing routes for <Text style={{ color: MOOD_COL[currentMood] || V, fontWeight: '700' }}>{currentMood}</Text>
                {currentStress !== undefined && ` · stress ${Math.round(currentStress * 100)}/100`}
              </Text>
            </View>
          ) : (
            <Text style={s.headerSub}>Complete a check-in to get personalised routes</Text>
          )}
        </View>
        {currentStress !== undefined && (
          <View style={[s.stressBadge, { borderColor: stressColor + '55', backgroundColor: stressColor + '15' }]}>
            <Text style={[s.stressNum, { color: stressColor }]}>{Math.round(currentStress * 100)}</Text>
            <Text style={s.stressLbl}>stress</Text>
          </View>
        )}
      </View>

      {/* View toggle */}
      <View style={s.viewToggle}>
        <TouchableOpacity style={[s.toggleBtn, view === 'routes' && s.toggleBtnOn]} onPress={() => setView('routes')}>
          <Text style={[s.toggleTxt, view === 'routes' && s.toggleTxtOn]}>🗺 Route types</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.toggleBtn, view === 'map' && s.toggleBtnOn]} onPress={() => setView('map')}>
          <Text style={[s.toggleTxt, view === 'map' && s.toggleTxtOn]}>📍 Nearby places</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {view === 'routes' ? (
          <>
            {/* Recommended routes */}
            {currentMood && recommendedRoutes.length > 0 && (
              <>
                <SectionHead text={`Best for ${currentMood} mood`} color={MOOD_COL[currentMood] || V} />
                {recommendedRoutes.map(route => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    isSelected={selectedRoute === route.id}
                    onSelect={() => setSelectedRoute(route.id === selectedRoute ? null : route.id)}
                    onOpenMap={() => openGoogleMaps(route.place_types[0])}
                    isRecommended
                  />
                ))}
              </>
            )}

            {/* Other routes */}
            <SectionHead text="All route types" color={SUB} />
            {(currentMood ? otherRoutes : ROUTE_TYPES).map(route => (
              <RouteCard
                key={route.id}
                route={route}
                isSelected={selectedRoute === route.id}
                onSelect={() => setSelectedRoute(route.id === selectedRoute ? null : route.id)}
                onOpenMap={() => openGoogleMaps(route.place_types[0])}
                isRecommended={false}
              />
            ))}

            {/* Therapeutic map explanation */}
            <View style={s.explainCard}>
              <Text style={s.explainTitle}>Why these route types?</Text>
              <Text style={s.explainTxt}>ScreenSense matches each route type to your emotional state using environmental psychology research. Natural environments are prioritised for high stress (Ulrich's Stress Recovery Theory, 1984), social spaces for positive mood (Fredrickson's Broaden-and-Build Theory, 2001), and quiet indoor spaces for attentional fatigue (Kaplan's Attention Restoration Theory, 1995).</Text>
            </View>
          </>
        ) : (
          <>
            {/* Nearby places from last check-in */}
            <SectionHead text="From your last check-in" color={V} />

            {places.length > 0 ? (
              places.map((p: any, i: number) => (
                <TouchableOpacity key={i} style={s.placeCard} onPress={() => selectPlace(p)} activeOpacity={0.8}>
                  <View style={s.placeIconWrap}><Text style={{ fontSize: 26 }}>{p.icon}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.placeRow}>
                      <Text style={s.placeName}>{p.name}</Text>
                      {p.distance_m != null && <Text style={s.placeDist}>{p.distance_m}m</Text>}
                    </View>
                    <Text style={s.placeType}>{p.type}</Text>
                    <Text style={s.placeReason}>{p.reason}</Text>
                  </View>
                  <Text style={s.placeArrow}>›</Text>
                </TouchableOpacity>
              ))
            ) : (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 36, marginBottom: 10 }}>📍</Text>
                <Text style={s.emptyTitle}>No places yet</Text>
                <Text style={s.emptyTxt}>Complete a check-in to get AI-recommended places near you based on your mood and stress level.</Text>
              </View>
            )}

            {/* Stylised map */}
            <SectionHead text="Area overview" color={SUB} />
            <View style={s.mapWrap}>
              <StylisedMap places={places} mood={currentMood} />
            </View>

            <TouchableOpacity style={s.googleMapsBtn} onPress={() => openGoogleMaps('parks and quiet spaces')}>
              <Text style={s.googleMapsBtnTxt}>🗺 Open Google Maps nearby →</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Place detail sheet */}
      {selectedPlace && (
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity style={s.sheetClose} onPress={closePlace}>
            <View style={s.sheetHandle} />
          </TouchableOpacity>
          <Text style={{ fontSize: 32, marginBottom: 10 }}>{selectedPlace.icon}</Text>
          <Text style={s.sheetName}>{selectedPlace.name}</Text>
          <Text style={s.sheetType}>{selectedPlace.type}</Text>
          <Text style={s.sheetReason}>{selectedPlace.reason}</Text>
          {selectedPlace.address && <Text style={s.sheetAddr}>📍 {selectedPlace.address}</Text>}

          {/* Real AI confidence derived from the conformal prediction interval
              that was produced for the check-in this place was recommended from. */}
          <View style={s.sheetMeta}>
            <View style={s.sheetMetaItem}>
              {(() => {
                const pi = lastResult?.prediction_interval;
                const width = pi ? (pi.high - pi.low) : null;
                let level = '—', col = MUT as string;
                if (width != null) {
                  if (width < 0.20)      { level = 'High';   col = G; }
                  else if (width < 0.35) { level = 'Medium'; col = A; }
                  else                   { level = 'Low';    col = R; }
                }
                return <>
                  <Text style={[s.sheetMetaVal, { color: col }]}>{level}</Text>
                  <Text style={s.sheetMetaLbl}>AI confidence</Text>
                </>;
              })()}
            </View>
            <View style={s.sheetMetaItem}>
              <Text style={s.sheetMetaVal}>
                {selectedPlace.distance_m != null ? `${selectedPlace.distance_m}m` : '—'}
              </Text>
              <Text style={s.sheetMetaLbl}>Distance</Text>
            </View>
            <View style={s.sheetMetaItem}>
              <Text style={[s.sheetMetaVal, { color: MOOD_COL[currentMood || ''] || V }]}>
                {currentMood || '—'}
              </Text>
              <Text style={s.sheetMetaLbl}>Matched to mood</Text>
            </View>
          </View>

          <TouchableOpacity style={s.directionsBtn} onPress={() => openDirections(selectedPlace.name)}>
            <Text style={s.directionsBtnTxt}>Get directions →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.mapsBtn} onPress={() => openGoogleMaps(selectedPlace.name)}>
            <Text style={s.mapsBtnTxt}>View on Google Maps</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function SectionHead({ text, color }: { text: string; color: string }) {
  return <Text style={[sh.t, { color }]}>{text}</Text>;
}
const sh = StyleSheet.create({ t: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 } });

function RouteCard({ route, isSelected, onSelect, onOpenMap, isRecommended }: any) {
  const expandAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(expandAnim, { toValue: isSelected ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [isSelected]);

  return (
    <TouchableOpacity style={[rc.card, isSelected && { borderColor: route.color + '55', backgroundColor: route.color + '0a' }]}
      onPress={onSelect} activeOpacity={0.85}>
      {isRecommended && (
        <View style={[rc.recBadge, { backgroundColor: route.color + '20', borderColor: route.color + '40' }]}>
          <Text style={[rc.recBadgeTxt, { color: route.color }]}>✦ Recommended for you</Text>
        </View>
      )}
      <View style={rc.top}>
        <View style={[rc.iconWrap, { backgroundColor: route.color + '20' }]}>
          <Text style={{ fontSize: 22 }}>{route.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rc.label}>{route.label}</Text>
          <Text style={rc.desc}>{route.description}</Text>
          <View style={rc.meta}>
            <View style={[rc.chip, { borderColor: route.color + '40', backgroundColor: route.color + '14' }]}>
              <Text style={[rc.chipTxt, { color: route.color }]}>⏱ {route.duration}</Text>
            </View>
            <View style={[rc.chip, { borderColor: route.color + '40', backgroundColor: route.color + '14' }]}>
              <Text style={[rc.chipTxt, { color: route.color }]}>✦ {route.benefit}</Text>
            </View>
          </View>
        </View>
        <Text style={[rc.arrow, isSelected && { transform: [{ rotate: '90deg' }] }]}>›</Text>
      </View>

      {isSelected && (
        <View style={rc.expanded}>
          <View style={rc.divider} />
          <Text style={rc.theoryTxt}>📖 {route.theory}</Text>
          <Text style={rc.placeTypesTxt}>Best place types: {route.place_types.join(' · ')}</Text>
          <TouchableOpacity style={[rc.findBtn, { backgroundColor: route.color }]} onPress={onOpenMap}>
            <Text style={rc.findBtnTxt}>Find {route.label.toLowerCase()} nearby →</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}
const rc = StyleSheet.create({
  card: { backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: BOR },
  recBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' as any, marginBottom: 10 },
  recBadgeTxt: { fontSize: 10, fontWeight: '700' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { fontSize: 14, fontWeight: '700', color: TXT, marginBottom: 3 },
  desc: { fontSize: 12, color: MUT, lineHeight: 18, marginBottom: 8 },
  meta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  chipTxt: { fontSize: 10, fontWeight: '600' },
  arrow: { fontSize: 20, color: SUB, alignSelf: 'center' as any },
  expanded: { marginTop: 10 },
  divider: { height: 0.5, backgroundColor: BOR, marginBottom: 10 },
  theoryTxt: { fontSize: 11, color: VL, fontStyle: 'italic', marginBottom: 4 },
  placeTypesTxt: { fontSize: 11, color: MUT, marginBottom: 10 },
  findBtn: { borderRadius: 12, padding: 12, alignItems: 'center' },
  findBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

function StylisedMap({ places, mood }: { places: any[]; mood?: string }) {
  const stressColor = mood === 'anxious' || mood === 'stressed' ? R : mood === 'calm' || mood === 'content' ? G : C;
  return (
    <View style={sm.wrap}>
      <View style={sm.grid}>
        {[20, 40, 60, 80].map(p => <View key={`h${p}`} style={[sm.gridH, { top: `${p}%` as any }]} />)}
        {[25, 50, 75].map(p => <View key={`v${p}`} style={[sm.gridV, { left: `${p}%` as any }]} />)}
      </View>
      {/* You pin */}
      <View style={sm.youWrap}>
        <View style={sm.youDot} />
        <View style={sm.youRing} />
        <Text style={sm.youLbl}>You</Text>
      </View>
      {/* Place pins */}
      {places.slice(0, 3).map((p: any, i: number) => {
        const pos = [{ top: '30%', left: '62%' }, { top: '58%', left: '38%' }, { top: '42%', left: '72%' }][i];
        return (
          <View key={i} style={[sm.pin, { top: pos.top as any, left: pos.left as any }]}>
            <View style={[sm.pinBubble, { backgroundColor: stressColor }]}>
              <Text style={{ fontSize: 13 }}>{p.icon}</Text>
            </View>
            <Text style={sm.pinLbl}>{p.name?.split(' ')[0]}</Text>
          </View>
        );
      })}
      <View style={sm.areaLbl}>
        <Text style={sm.areaLblTxt}>Central London</Text>
      </View>
    </View>
  );
}
const sm = StyleSheet.create({
  wrap: { height: 200, backgroundColor: '#0D1829', borderRadius: 14, overflow: 'hidden', position: 'relative', marginBottom: 10 },
  grid: { position: 'absolute', inset: 0 },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  youWrap: { position: 'absolute', top: '48%', left: '48%', alignItems: 'center', transform: [{ translateX: -7 }, { translateY: -7 }] },
  youDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: V, borderWidth: 2, borderColor: '#fff' },
  youRing: { position: 'absolute', width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(108,99,255,0.4)', top: -7, left: -7 },
  youLbl: { fontSize: 8, color: '#fff', marginTop: 3, fontWeight: '700' },
  pin: { position: 'absolute', alignItems: 'center' },
  pinBubble: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  pinLbl: { fontSize: 7, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '600' },
  areaLbl: { position: 'absolute', bottom: 6, left: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  areaLblTxt: { fontSize: 8, color: 'rgba(255,255,255,0.4)' },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  header: { padding: 24, paddingTop: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerGreet: { fontSize: 11, color: SUB, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600', marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: TXT, letterSpacing: -0.8, marginBottom: 4 },
  headerMoodRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  moodDot: { width: 8, height: 8, borderRadius: 4 },
  headerSub: { fontSize: 13, color: MUT },
  stressBadge: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 60 },
  stressNum: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  stressLbl: { fontSize: 8, color: SUB, textTransform: 'uppercase', letterSpacing: 0.4 },

  viewToggle: { flexDirection: 'row', marginHorizontal: 24, backgroundColor: CARD, borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 0.5, borderColor: BOR },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  toggleBtnOn: { backgroundColor: V },
  toggleTxt: { fontSize: 12, color: MUT, fontWeight: '500' },
  toggleTxtOn: { color: TXT, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40, maxWidth: 680, alignSelf: 'center' as any, width: '100%' },

  placeCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: BOR, flexDirection: 'row', gap: 12, alignItems: 'center' },
  placeIconWrap: { width: 46, height: 46, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  placeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  placeName: { fontSize: 14, fontWeight: '700', color: TXT, flex: 1 },
  placeDist: { fontSize: 11, color: C, fontWeight: '600' },
  placeType: { fontSize: 10, color: V, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, fontWeight: '600' },
  placeReason: { fontSize: 12, color: MUT, lineHeight: 17 },
  placeArrow: { fontSize: 20, color: SUB },

  emptyCard: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 0.5, borderColor: BOR },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TXT, marginBottom: 6 },
  emptyTxt: { fontSize: 13, color: MUT, textAlign: 'center', lineHeight: 20 },

  mapWrap: { marginBottom: 10 },
  googleMapsBtn: { backgroundColor: 'rgba(108,99,255,0.12)', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(108,99,255,0.25)', marginBottom: 16 },
  googleMapsBtnTxt: { fontSize: 14, color: VL, fontWeight: '600' },

  explainCard: { backgroundColor: 'rgba(108,99,255,0.08)', borderRadius: 14, padding: 16, marginTop: 4, borderWidth: 1, borderColor: 'rgba(108,99,255,0.2)' },
  explainTitle: { fontSize: 13, fontWeight: '700', color: TXT, marginBottom: 6 },
  explainTxt: { fontSize: 12, color: MUT, lineHeight: 20 },

  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0F0F22', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 24, paddingTop: 12, borderTopWidth: 1, borderColor: BOR, maxHeight: '70%' },
  sheetClose: { alignItems: 'center', marginBottom: 14 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  sheetName: { fontSize: 20, fontWeight: '800', color: TXT, marginBottom: 4 },
  sheetType: { fontSize: 11, color: V, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, fontWeight: '600' },
  sheetReason: { fontSize: 14, color: MUT, lineHeight: 22, marginBottom: 8 },
  sheetAddr: { fontSize: 12, color: C, marginBottom: 14 },
  sheetMeta: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 0.5, borderColor: BOR },
  sheetMetaItem: { flex: 1, alignItems: 'center' },
  sheetMetaVal: { fontSize: 14, fontWeight: '700', color: TXT, marginBottom: 2 },
  sheetMetaLbl: { fontSize: 9, color: SUB, textTransform: 'uppercase', letterSpacing: 0.4 },
  directionsBtn: { backgroundColor: V, borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 8 },
  directionsBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  mapsBtn: { backgroundColor: CARD, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: BOR },
  mapsBtnTxt: { color: MUT, fontSize: 14, fontWeight: '600' },
});
