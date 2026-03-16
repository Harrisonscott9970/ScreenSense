/**
 * ScreenSense API Service
 * =======================
 * Auto-detects whether running on web (localhost) or mobile device
 * and uses the correct backend URL.
 *
 * On mobile, you MUST set your computer's local IP address.
 * Find it with: ipconfig (Windows) → IPv4 Address
 * e.g. 192.168.1.45
 */

import { Platform } from 'react-native';

// ── CHANGE THIS to your computer's local IP address ──────────
// Run `ipconfig` in PowerShell and use your IPv4 address
const LOCAL_IP = '192.168.0.16'; // <-- UPDATE THIS
const PORT = 8000;
// ─────────────────────────────────────────────────────────────

function getBaseURL(): string {
  if (Platform.OS === 'web') {
    return 'http://localhost:8000/api';
  }
  // On physical device or simulator, use local network IP
  return `http://${LOCAL_IP}:${PORT}/api`;
}

export const BASE_URL = getBaseURL();

// Friendly error messages
const FRIENDLY_ERRORS: Record<string, string> = {
  'Failed to fetch':        'Could not connect. Check your internet connection.',
  'Network request failed': 'Connection lost. Please try again.',
  'TypeError':              'Something went wrong. Please try again.',
};

function friendlyError(err: any): string {
  const msg = err?.message || String(err);
  for (const [key, friendly] of Object.entries(FRIENDLY_ERRORS)) {
    if (msg.includes(key)) return friendly;
  }
  return 'Something went wrong. Please try again in a moment.';
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.detail || `Server error ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    throw new Error(friendlyError(err));
  }
}

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
};
