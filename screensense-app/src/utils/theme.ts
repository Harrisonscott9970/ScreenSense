/**
 * ScreenSense Design System v2
 * ==============================
 * Inspired by Fitbit / Calm / Headspace
 * Dark theme — but with discipline and breathing room
 *
 * Rules:
 * - 8px base grid — all spacing multiples of 8
 * - Two accent colours only: violet + teal
 * - No borders on cards — use layered backgrounds
 * - Numbers are always large and bold
 * - Section labels always 11px, uppercase, tracked
 * - Body copy always 15-16px, 1.6 line height
 * - Shadows replace borders for depth
 */

export const C = {
  // Backgrounds — layered like Calm
  bg:        '#07090F',   // deepest layer
  surface:   '#0D0F1A',   // main content bg
  card:      '#131628',   // card bg
  cardHover: '#181C30',   // pressed state
  elevated:  '#1E2238',   // elevated card / modal

  // Accent — violet only, used sparingly
  violet:    '#7C6EFA',
  violetSoft:'#9B8FFC',
  violetDim: 'rgba(124,110,250,0.15)',
  violetGlow:'rgba(124,110,250,0.08)',

  // Second accent — teal (not cyan, warmer)
  teal:      '#2DD4BF',
  tealDim:   'rgba(45,212,191,0.12)',

  // Semantic
  success:   '#34D399',
  warning:   '#FBBF24',
  danger:    '#F87171',
  info:      '#60A5FA',

  // Stress levels — muted, clinical
  stressHigh:'#F87171',
  stressMid: '#FBBF24',
  stressLow: '#34D399',

  // Mood palette — desaturated, harmonious
  moods: {
    anxious:   '#FB923C',
    stressed:  '#F97316',
    low:       '#818CF8',
    numb:      '#94A3B8',
    calm:      '#2DD4BF',
    content:   '#34D399',
    energised: '#FBBF24',
    joyful:    '#A3E635',
  },

  // Text — 4 levels only
  text:    '#F1F3FF',       // primary
  textSub: 'rgba(241,243,255,0.65)',  // secondary
  textDim: 'rgba(241,243,255,0.42)',  // tertiary
  textGhost:'rgba(241,243,255,0.28)', // disabled / placeholder

  // Dividers
  line:    'rgba(255,255,255,0.06)',
  lineHard:'rgba(255,255,255,0.10)',
};

// 8px grid
export const Space = {
  '1':  4,
  '2':  8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10':40,
  '12':48,
  '16':64,
};

export const Radius = {
  sm:  8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
};

export const Font = {
  // Display — hero numbers and titles
  display: { fontSize: 48, fontWeight: '800' as const, letterSpacing: -1.5, color: C.text, lineHeight: 52 },
  h1:      { fontSize: 34, fontWeight: '800' as const, letterSpacing: -1.0, color: C.text, lineHeight: 38 },
  h2:      { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.5, color: C.text, lineHeight: 30 },
  h3:      { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.2, color: C.text, lineHeight: 24 },

  // Body
  body:    { fontSize: 15, fontWeight: '400' as const, color: C.textSub, lineHeight: 24 },
  bodyMd:  { fontSize: 15, fontWeight: '500' as const, color: C.text,    lineHeight: 24 },

  // Labels
  label:   { fontSize: 11, fontWeight: '600' as const, color: C.textDim, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  caption: { fontSize: 12, fontWeight: '400' as const, color: C.textDim, lineHeight: 18 },
  micro:   { fontSize: 10, fontWeight: '500' as const, color: C.textGhost, letterSpacing: 0.5 },

  // Numbers — always monospaced feel
  numLg:   { fontSize: 42, fontWeight: '800' as const, color: C.text,    letterSpacing: -1, lineHeight: 46 },
  numMd:   { fontSize: 28, fontWeight: '700' as const, color: C.text,    letterSpacing: -0.5, lineHeight: 32 },
  numSm:   { fontSize: 18, fontWeight: '700' as const, color: C.text,    lineHeight: 22 },
};

// Shadow presets — replaces borders
export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 12,
  },
  violet: {
    shadowColor: '#7C6EFA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.40,
    shadowRadius: 24,
    elevation: 12,
  },
};
