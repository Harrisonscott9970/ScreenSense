import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, Animated, Linking, Dimensions, ActivityIndicator,
} from 'react-native';
import { BASE_URL } from '../services/api';
import { useDeviceData } from '../hooks/useDeviceData';
const V = '#6C63FF', VL = '#9B94FF', C = '#4FC3F7', A = '#FFB74D',
      G = '#4CAF82', R = '#F43F5E', TXT = '#EEF0FF',
      MUT = 'rgba(238,240,255,0.55)', SUB = 'rgba(238,240,255,0.32)',
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
  const [livePlaces, setLivePlaces]       = useState<any[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError]     = useState<string | null>(null);
  const [weatherCtx, setWeatherCtx]       = useState<{ condition?: string; temp_c?: number; time_of_day?: string } | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const { latitude, longitude, locationLabel, requestLocation } = useDeviceData();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const STRESS_CATEGORIES: Record<string, string[]> = {
    high:     ['Park', 'Garden', 'Library', 'Green Space'],
    moderate: ['Café', 'Bookshop', 'Gallery', 'Museum'],
    low:      ['Restaurant', 'Market', 'Social Space', 'Café'],
  };

  const REASONS: Record<string, Record<string, string>> = {
    Park:         { high:'Natural environments lower cortisol — Ulrich SRT (1984)', moderate:'Green space for gentle recovery', low:'Enjoy nature while your mood is positive' },
    Library:      { high:'Quiet structured space for mental decompression', moderate:'Low-stimulation reading space', low:'Calm enrichment activity' },
    Café:         { high:'Warm, low-pressure space to decompress', moderate:'Mild social stimulation — Ulrich (1984)', low:'Social reward for positive mood' },
    Gallery:      { high:'Aesthetic calm reduces arousal', moderate:'Aesthetic engagement supports mood regulation', low:'Cultural exploration — Fredrickson (2001)' },
    Restaurant:   { low:'Social reward aligns with positive mood state', moderate:'Warm social setting', high:'Grounding in a familiar environment' },
    Market:       { low:'Exploratory environment — Fredrickson Broaden-Build (2001)', moderate:'Light social stimulation', high:'Brief purposeful outing' },
    Bookshop:     { moderate:'Low-stimulation browsing — Kaplan ART (1995)', high:'Quiet refuge with attentional restoration', low:'Enrichment during positive state' },
    Museum:       { moderate:'Cultural engagement with attentional restoration', high:'Calm, structured indoor environment', low:'Exploratory cultural activity' },
  };

  const ICONS: Record<string, string> = {
    Park:'🌿', Garden:'🌸', Library:'📚', Museum:'🏛', Gallery:'🖼',
    Café:'☕', Bookshop:'📖', Cinema:'🎬', Restaurant:'🍽', Market:'🛍',
    'Social Space':'🤝', 'Green Space':'🍃', 'Nature Reserve':'🌲',
  };

  const fetchPlaces = useCallback(async (lat: number, lon: number) => {
    setPlacesLoading(true);
    setPlacesError(null);
    try {
      // Derive stress band for the nudge engine (low / moderate / high)
      const stressCat = currentStress && currentStress > 0.66 ? 'high'
                      : currentStress && currentStress > 0.33 ? 'moderate' : 'low';

      // Backend fetches live weather + time of day and adjusts place types accordingly
      const url = `${BASE_URL}/places?lat=${lat}&lon=${lon}&mood=${encodeURIComponent(currentMood || 'calm')}&stress_category=${stressCat}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`places ${res.status}`);
      const data = await res.json();

      // Store weather + time context from backend
      if (data.weather || data.time_of_day) {
        setWeatherCtx({ ...data.weather, time_of_day: data.time_of_day });
      }
      const raw: any[] = data.places || [];
      if (raw.length > 0) {
        // Backend already has reason text; enrich icon if missing
        setLivePlaces(raw.map((p: any) => ({
          ...p,
          icon: p.icon || ICONS[p.type] || '📍',
        })));
      } else {
        // Empty — show search-link cards for the target categories
        const targetCats = STRESS_CATEGORIES[stressCat] || STRESS_CATEGORIES.moderate;
        setLivePlaces(targetCats.slice(0, 3).map(cat => ({
          name: `${cat} near you`,
          type: cat,
          icon: ICONS[cat] || '📍',
          reason: (REASONS[cat] || {})[stressCat] || 'Recommended for your current affect profile',
          address: 'Tap to open Google Maps',
          distance_m: null,
        })));
      }
    } catch {
      setPlacesError('Could not load nearby places — tap retry.');
      const stored = lastResult?.place_recommendations;
      if (stored) {
        setLivePlaces(Array.isArray(stored) ? stored
          : (typeof stored === 'string' ? JSON.parse(stored) : []));
      }
    } finally {
      setPlacesLoading(false);
    }
  }, [currentMood, currentStress, lastResult]);

  useEffect(() => {
    if (latitude && longitude) {
      fetchPlaces(latitude, longitude);
    }
  }, [latitude, longitude, fetchPlaces]);

  const openGoogleMaps = (placeType: string) => {
    let url: string;
    if (latitude && longitude) {
      // Search for place type near the user's actual coordinates
      url = `https://www.google.com/maps/search/${encodeURIComponent(placeType)}/@${latitude},${longitude},15z`;
    } else {
      url = `https://www.google.com/maps/search/${encodeURIComponent(placeType)}`;
    }
    Linking.openURL(url).catch(() => {});
  };

  const openDirections = (placeNameOrAddress: string) => {
    let url: string;
    if (latitude && longitude) {
      // Navigate to place type search near user; fall back to address if it's a real one
      url = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${encodeURIComponent(placeNameOrAddress)}`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(placeNameOrAddress)}`;
    }
    Linking.openURL(url).catch(() => {});
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

  const places = livePlaces;

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
          <TouchableOpacity
            style={s.locationBar}
            onPress={!latitude ? requestLocation : undefined}
            activeOpacity={latitude ? 1 : 0.7}
          >
            <Text style={s.locationBarTxt}>
              {latitude
                ? `📍 ${locationLabel}`
                : locationLabel === 'Location permission denied'
                  ? '❌ Location denied — tap to retry'
                  : '⏳ Getting location… tap to retry'}
            </Text>
            {latitude && (
              <Text style={s.locationBarCoords}>{latitude.toFixed(4)}, {longitude?.toFixed(4)}</Text>
            )}
          </TouchableOpacity>
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
            {/* AI context banner — shows mood/stress/weather/time that drove recommendations */}
            {places.length > 0 && (
              <View style={s.aiContextBanner}>
                <Text style={s.aiContextTxt}>
                  {currentMood
                    ? <>AI matched to your <Text style={{ color: MOOD_COL[currentMood] || V, fontWeight: '700' }}>{currentMood}</Text> mood</>
                    : 'AI recommendations'}
                  {currentStress !== undefined && (
                    <Text style={{ color: stressColor }}> · stress {Math.round(currentStress * 100)}/100</Text>
                  )}
                  {weatherCtx?.condition ? <Text style={{ color: C }}> · {weatherCtx.condition}</Text> : null}
                  {weatherCtx?.temp_c != null ? <Text style={{ color: MUT }}> {Math.round(weatherCtx.temp_c)}°C</Text> : null}
                  {weatherCtx?.time_of_day ? <Text style={{ color: MUT }}> · {weatherCtx.time_of_day}</Text> : null}
                </Text>
                <Text style={s.aiContextSub}>Adapts to mood · stress · time of day · live weather (Ulrich, Kaplan, Fredrickson)</Text>
              </View>
            )}

            {/* Live nearby places — fetched fresh from GPS */}
            <SectionHead text="Nearby places for your mood" color={V} />

            {!latitude && !placesLoading && (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>📍</Text>
                <Text style={s.emptyTitle}>Location needed</Text>
                <Text style={s.emptyTxt}>Allow location access to see real places near you.</Text>
                <TouchableOpacity
                  style={[s.googleMapsBtn, { marginTop: 12, marginBottom: 0 }]}
                  onPress={requestLocation}
                >
                  <Text style={s.googleMapsBtnTxt}>Enable location →</Text>
                </TouchableOpacity>
              </View>
            )}

            {placesLoading && (
              <View style={[s.emptyCard, { paddingVertical: 32 }]}>
                <ActivityIndicator color={V} size="large" style={{ marginBottom: 12 }} />
                <Text style={s.emptyTxt}>Finding places near you…</Text>
              </View>
            )}

            {!placesLoading && placesError && places.length === 0 && (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 28, marginBottom: 8 }}>⚠️</Text>
                <Text style={s.emptyTitle}>Could not load places</Text>
                <Text style={s.emptyTxt}>{placesError}</Text>
                <TouchableOpacity
                  style={[s.googleMapsBtn, { marginTop: 12, marginBottom: 0 }]}
                  onPress={() => latitude && longitude && fetchPlaces(latitude, longitude)}
                >
                  <Text style={s.googleMapsBtnTxt}>Retry →</Text>
                </TouchableOpacity>
              </View>
            )}

            {!placesLoading && places.length > 0 ? (
              places.map((p: any, i: number) => (
                <TouchableOpacity key={i} style={s.placeCard} onPress={() => selectPlace(p)} activeOpacity={0.8}>
                  <View style={s.placeIconWrap}><Text style={{ fontSize: 26 }}>{p.icon}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.placeRow}>
                      <Text style={s.placeName}>{p.name}</Text>
                      {p.distance_m != null
                        ? <Text style={s.placeDist}>{p.distance_m}m</Text>
                        : <Text style={s.placeDistEst}>type match</Text>
                      }
                    </View>
                    <Text style={s.placeType}>{p.type}</Text>
                    <Text style={s.placeReason}>{p.reason}</Text>
                  </View>
                  <Text style={s.placeArrow}>›</Text>
                </TouchableOpacity>
              ))
            ) : null}

            {/* Stylised map */}
            <SectionHead text="Area overview" color={SUB} />
            <View style={s.mapWrap}>
              <StylisedMap places={places} mood={currentMood} locationLabel={locationLabel} latitude={latitude} longitude={longitude} />
            </View>

            {!placesLoading && latitude && (
              <TouchableOpacity style={s.googleMapsBtn}
                onPress={() => openGoogleMaps(
                  places.length > 0 ? places[0].type : 'parks and quiet spaces'
                )}>
                <Text style={s.googleMapsBtnTxt}>🗺 Find {places.length > 0 ? places[0].type : 'places'} near you →</Text>
              </TouchableOpacity>
            )}
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

// Live map preview using Google Static Maps API — tappable to open full Google Maps
function StylisedMap({ places, mood, locationLabel, latitude, longitude }: {
  places: any[]; mood?: string; locationLabel?: string; latitude?: number | null; longitude?: number | null;
}) {
  const MAPS_KEY = 'AIzaSyC2cdFRD96kGw4lfPHofy_IRixVNyTETcQ';

  // Build place markers string for up to 3 nearby places (not implemented client-side,
  // since we don't have their coordinates — just show the user's location pin)
  const openGoogleMaps = () => {
    if (latitude && longitude) {
      Linking.openURL(`https://www.google.com/maps/@${latitude},${longitude},15z`).catch(() => {});
    }
  };

  if (latitude && longitude) {
    // Real satellite + roadmap tile centred on the user's GPS position
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap`
      + `?center=${latitude},${longitude}`
      + `&zoom=15&size=600x220&scale=2&maptype=roadmap`
      + `&style=element:geometry%7Ccolor:0x0d1829`
      + `&style=element:labels.text.fill%7Ccolor:0xeef0ff`
      + `&style=element:labels.text.stroke%7Ccolor:0x0d1829`
      + `&style=feature:road%7Celement:geometry%7Ccolor:0x1e2d4d`
      + `&style=feature:water%7Ccolor:0x0a1020`
      + `&markers=color:0x6C63FF%7Clabel:●%7C${latitude},${longitude}`
      + `&key=${MAPS_KEY}`;

    return (
      <TouchableOpacity onPress={openGoogleMaps} activeOpacity={0.9}>
        <View style={sm.wrap}>
          <Image source={{ uri: mapUrl }} style={sm.mapImg} resizeMode="cover" />
          <View style={sm.overlay}>
            <Text style={sm.overlayTxt}>📍 {locationLabel || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}</Text>
            <Text style={sm.overlaySub}>Tap to open in Google Maps</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Fallback when location not yet available
  return (
    <View style={[sm.wrap, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontSize: 28, marginBottom: 8 }}>📍</Text>
      <Text style={{ color: MUT, fontSize: 13 }}>Enable location for live map preview</Text>
    </View>
  );
}
const sm = StyleSheet.create({
  wrap: { height: 200, backgroundColor: '#0D1829', borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  mapImg: { width: '100%' as any, height: '100%' as any },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(13,24,41,0.70)', paddingHorizontal: 12, paddingVertical: 8 },
  overlayTxt: { fontSize: 12, color: TXT, fontWeight: '600' },
  overlaySub: { fontSize: 10, color: MUT, marginTop: 1 },
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

  aiContextBanner: { backgroundColor: 'rgba(108,99,255,0.08)', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(108,99,255,0.2)' },
  aiContextTxt: { fontSize: 13, color: TXT, fontWeight: '500', marginBottom: 3 },
  aiContextSub: { fontSize: 10, color: MUT, fontStyle: 'italic' },

  placeCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: BOR, flexDirection: 'row', gap: 12, alignItems: 'center' },
  placeIconWrap: { width: 46, height: 46, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  placeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  placeName: { fontSize: 14, fontWeight: '700', color: TXT, flex: 1 },
  placeDist: { fontSize: 11, color: C, fontWeight: '600' },
  placeDistEst: { fontSize: 10, color: MUT, fontStyle: 'italic' },
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

  locationBar: { marginTop: 8, marginBottom: 2, backgroundColor: 'rgba(108,99,255,0.08)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(108,99,255,0.18)' },
  locationBarTxt: { fontSize: 12, color: VL, fontWeight: '600' },
  locationBarCoords: { fontSize: 10, color: MUT, marginTop: 1 },
});
