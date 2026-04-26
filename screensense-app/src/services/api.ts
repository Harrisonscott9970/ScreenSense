/**
 * ScreenSense API Service
 * =======================
 * Auto-detects web vs mobile. On mobile, reads the server IP from
 * AsyncStorage (set in Profile → Settings) so it works without
 * hard-coding an IP address. Falls back to the bundled default.
 *
 * To change the server IP on mobile:
 *   Profile → Settings → Server IP
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Default IP — change this if needed, or set it in Profile → Settings
export const DEFAULT_LOCAL_IP = '192.168.0.16';
const PORT = 8000;

// Synchronous base URL used by most components
// (AsyncStorage is async so we expose a mutable ref + updater)
let _baseUrl = Platform.OS === 'web'
  ? 'http://localhost:8000/api'
  : `http://${DEFAULT_LOCAL_IP}:${PORT}/api`;

export function getBaseURL(): string { return _baseUrl; }
export let BASE_URL = _baseUrl;

/** Call once at app startup to load the user-saved IP */
export async function initApiUrl(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const savedIp = await AsyncStorage.getItem('ss_server_ip');
    if (savedIp) {
      _baseUrl  = `http://${savedIp}:${PORT}/api`;
      BASE_URL  = _baseUrl;
    }
  } catch {}
}

/** Save a new server IP and update the module-level URL */
export async function setServerIp(ip: string): Promise<void> {
  await AsyncStorage.setItem('ss_server_ip', ip.trim());
  _baseUrl = `http://${ip.trim()}:${PORT}/api`;
  BASE_URL  = _baseUrl;
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
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.detail || `Server error ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('The server took too long to respond. Please check your connection and try again.');
    }
    throw new Error(friendlyError(err));
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
};
