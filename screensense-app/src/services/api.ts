/**
 * ScreenSense API Service
 * =======================
 * URL resolution priority (highest → lowest):
 *  1. EXPO_PUBLIC_API_URL env var  — written to .env.local by the control panel
 *                                    before Expo starts (localtunnel URL or LAN IP)
 *  2. AsyncStorage ss_api_url      — manual override saved by the user in settings
 *  3. app.json extra.apiUrl        — production cloud deploy
 *  4. localhost:8000               — browser on the same machine as the backend
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Priority 1: EXPO_PUBLIC_API_URL env var (written by control panel at launch)
let _envUrl: string | null = null;
try {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (raw && raw.startsWith('http')) _envUrl = raw;
} catch {}

// ── Priority 2: app.json extra.apiUrl (real http URL, non-null)
let _constantsUrl: string | null = null;
try {
  const Constants = require('expo-constants').default;
  const raw = Constants?.expoConfig?.extra?.apiUrl ?? null;
  if (raw && typeof raw === 'string' && raw.startsWith('http')) {
    _constantsUrl = raw;
  }
} catch {}

const LOCAL_API = 'http://localhost:8000/api';

// ── Priority 3: Web-only — ONLY apply when browser is at localhost/127.0.0.1.
// Do NOT guess the backend URL from a tunnel hostname (e.g. exp.direct) because
// the backend is not exposed at the same tunnel — that causes "network request failed".
let _webDefault: string | null = null;
try {
  if (typeof window !== 'undefined' && window.location) {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      _webDefault = 'http://localhost:8000/api';
    }
  }
} catch {}

// Starting URL priority:
//  1. EXPO_PUBLIC_API_URL env var (control panel backend tunnel URL)
//  2. app.json extra.apiUrl (cloud deploy)
//  3. Web localhost (browser on same machine)
//  4. localhost:8000 (final fallback)
let _baseUrl: string = _envUrl ?? _constantsUrl ?? _webDefault ?? LOCAL_API;

export const DEFAULT_LOCAL_IP = '192.168.0.16';
export function getBaseURL(): string { return _baseUrl; }
export let BASE_URL = _baseUrl;

/** Call once at app startup — loads any user-saved URL override */
export async function initApiUrl(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem('ss_api_url');
    if (saved) {
      _baseUrl = saved;
      BASE_URL = saved;
      return;
    }
    // Legacy: saved IP only (local network)
    const savedIp = await AsyncStorage.getItem('ss_server_ip');
    if (savedIp) {
      const url = `http://${savedIp.trim()}:8000/api`;
      _baseUrl = url;
      BASE_URL = url;
    }
  } catch {}
}

/** Persist a full API URL override (e.g. ngrok or cloud backend) */
export async function setApiUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/$/, '');
  await AsyncStorage.setItem('ss_api_url', clean);
  _baseUrl = clean;
  BASE_URL = clean;
}

/** Legacy: save just an IP (local network) */
export async function setServerIp(ip: string): Promise<void> {
  const url = `http://${ip.trim()}:8000/api`;
  await AsyncStorage.setItem('ss_server_ip', ip.trim());
  _baseUrl = url;
  BASE_URL = url;
}

// ── Friendly error messages ────────────────────────────────────
const FRIENDLY_ERRORS: Record<string, string> = {
  'Failed to fetch':        'Could not connect to server. Check the Server IP in Profile → Settings.',
  'Network request failed': 'Connection lost. Make sure the backend is running.',
  'TypeError':              'Something went wrong. Please try again.',
};

function friendlyError(err: any): string {
  const msg = err?.message || String(err);
  for (const [key, friendly] of Object.entries(FRIENDLY_ERRORS)) {
    if (msg.includes(key)) return friendly;
  }
  return 'Something went wrong. Please try again in a moment.';
}

const REQUEST_TIMEOUT_MS = 20000;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Bypass-Tunnel-Reminder': 'true',  // skip localtunnel HTML gateway page
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // Pass the server's own error message through — don't obscure it
      throw new Error(body?.detail || `Server error ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('The server took too long to respond. Please check your connection and try again.');
    }
    const msg = err?.message || String(err);
    // Only apply friendly network-error wording for connection-level failures
    if (msg.includes('Failed to fetch') || msg.includes('Network request failed')) {
      throw new Error('Could not connect to server. Check the Server IP in Profile → Settings.');
    }
    // All other errors (server errors, validation errors) pass through as-is
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Type definitions ───────────────────────────────────────────
export interface CheckInRequest {
  user_id: string;
  mood_label: string;
  mood_words?: string[];
  screen_time_hours: number;
  scroll_session_mins: number;
  sleep_hours: number;
  energy_level: number;
  latitude?: number;
  longitude?: number;
  journal_text?: string;
  heart_rate_resting?: number;
}

export interface PlaceRecommendation {
  name: string;
  type: string;
  icon: string;
  reason: string;
  distance_m?: number;
  address?: string;
}

export interface CheckInResponse {
  entry_id: number;
  predicted_stress_score: number;
  stress_category: string;
  personalised_message: string;
  cbt_prompt: string;
  rationale: string;
  place_recommendations: PlaceRecommendation[];
  weather_condition?: string;
  weather_temp_c?: number;
  neighbourhood?: string;
  shap_explanation?: any;
  distress_class?: string;
  distress_confidence?: number;
  care_level: number;
  care_label: string;
  care_color: string;
  care_description: string;
  recommended_tools: string[];
  show_crisis_resources: boolean;
  risk_factors_detected: string[];
  protective_factors: string[];
  clinical_note: string;
  ab_comparison?: any;
}

// ── API methods ────────────────────────────────────────────────
export const api = {
  checkin: (data: CheckInRequest) =>
    request<CheckInResponse>('/checkin', { method: 'POST', body: JSON.stringify(data) }),

  insights: (userId: string) =>
    request<any>(`/insights/${userId}`),

  entries: (userId: string, limit = 50) =>
    request<any[]>(`/entries/${userId}?limit=${limit}`),

  mlEvaluate: () =>
    request<any>('/ml/evaluate'),

  weeklyReport: (userId: string) =>
    request<any>(`/weekly-report/${userId}`),

  crisisResources: () =>
    request<any>('/crisis-resources'),

  exportCSV: (userId: string) =>
    `${BASE_URL}/export/${userId}/csv`,

  deleteData: (userId: string) =>
    request<any>(`/data/${userId}`, { method: 'DELETE' }),

  /** Rate a recommendation — feeds the personalisation engine */
  feedback: (entryId: number, helpful: boolean, userId: string) =>
    request<any>('/feedback', {
      method: 'POST',
      body: JSON.stringify({ entry_id: entryId, helpful, user_id: userId }),
    }),

  /** Scout message endpoint */
  scoutMessage: (payload: object) =>
    request<any>('/scout/message', { method: 'POST', body: JSON.stringify(payload) }),

  /**
   * Trigger online / incremental retraining of the Random Forest
   * using accumulated real user entries from the database.
   * Implements continual learning — Widmer & Kubat (1996).
   */
  retrain: (userId?: string) =>
    request<any>('/retrain', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),

  /** Update mutable profile fields (archetype, notifications_on, stress_threshold) */
  updateProfile: (userId: string, data: Record<string, any>) =>
    request<any>(`/profile/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /** Log a completed therapy tool session for efficacy tracking */
  logIntervention: (userId: string, tool: string, extra?: Record<string, any>) =>
    request<any>('/intervention/log', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, tool, ...extra }),
    }),

  /** Get per-tool stress delta stats */
  interventionEfficacy: (userId: string) =>
    request<any>(`/intervention/efficacy/${userId}`),

  /** Retrain history log (used by InsightsScreen ML tab) */
  mlHistory: () =>
    request<any>('/ml/history'),

  /** BiLSTM distress model evaluation report */
  mlBilstmReport: () =>
    request<any>('/ml/bilstm-report'),

  /** Rich ML diagnostics: calibration curves, learning curve, kappa, MCC, CI, etc. */
  mlDiagnostics: () =>
    request<any>('/ml/diagnostics'),

  /** Get server-side programme progress (cross-device sync) */
  getProgrammes: (userId: string) =>
    request<any>(`/programmes/${userId}`),

  /** Save programme progress to backend (offline-first: AsyncStorage is primary) */
  saveProgrammes: (userId: string, data: Record<string, any>) =>
    request<any>(`/programmes/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),

  /** Get sleep history from backend */
  getSleep: (userId: string, limit = 30) =>
    request<any[]>(`/sleep/${userId}?limit=${limit}`),

  /** Save a single sleep entry to backend */
  saveSleep: (userId: string, entry: Record<string, any>) =>
    request<any>('/sleep', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, ...entry }),
    }),
};
