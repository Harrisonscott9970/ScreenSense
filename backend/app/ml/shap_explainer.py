"""
ScreenSense SHAP Explainability Module
=======================================
Uses SHAP (Lundberg & Lee, 2017) to explain individual stress predictions.

For each check-in, returns:
  - Feature contributions (how much each signal drove the score)
  - Direction (positive = increasing stress, negative = reducing)
  - Natural-language narrative (accessible explanation for the user)

Academic citations:
  Lundberg, S.M. & Lee, S.I. (2017). A unified approach to interpreting
    model predictions. Advances in Neural Information Processing Systems, 30.
  Ribeiro, M.T., Singh, S. & Guestrin, C. (2016). "Why should I trust you?"
    Explaining the predictions of any classifier. KDD.

Dissertation value:
  Explainability is a core requirement for clinical AI deployment.
  NICE (2023) and NHS AI Lab both emphasise that AI recommendations
  in health contexts must be interpretable and transparent.
  This module directly addresses that requirement by providing both
  numeric SHAP values and natural-language explanations.
"""

import numpy as np
import joblib
from pathlib import Path
from typing import List, Dict, Optional

MODEL_DIR = Path(__file__).parent.parent.parent / "data" / "models"

FEATURE_NAMES = [
    'screen_time_hours',
    'sleep_hours',
    'energy_level',
    'hour_of_day',
    'day_of_week',
    'scroll_session_mins',
    'heart_rate_resting',
    'mood_valence',
]

FEATURE_LABELS = {
    'screen_time_hours':   'Screen time',
    'sleep_hours':         'Sleep duration',
    'energy_level':        'Energy level',
    'hour_of_day':         'Time of day',
    'day_of_week':         'Day of week',
    'scroll_session_mins': 'Scroll session',
    'heart_rate_resting':  'Resting heart rate',
    'mood_valence':        'Mood valence',
}

FEATURE_ICONS = {
    'screen_time_hours':   '📱',
    'sleep_hours':         '😴',
    'energy_level':        '🔋',
    'hour_of_day':         '🕐',
    'day_of_week':         '📅',
    'scroll_session_mins': '👆',
    'heart_rate_resting':  '❤️',
    'mood_valence':        '🧠',
}

# ── Natural language templates for SHAP narratives ────────────────
NARRATIVE_INCREASE = {
    'screen_time_hours':   (
        "High screen time ({val:.1f}h) is the primary stress driver. "
        "Thomée et al. (2012) found r ≈ 0.35 between mobile use and psychological stress."
    ),
    'sleep_hours':         (
        "Poor sleep ({val:.1f}h, below the recommended 8h) is amplifying stress. "
        "Walker (2017) identifies sleep debt as the single most impactful wellbeing variable."
    ),
    'energy_level':        (
        "Low energy (rated {val:.0f}/10) is contributing to elevated stress. "
        "Fatigue reduces cognitive load capacity and emotional regulation."
    ),
    'scroll_session_mins': (
        "Extended scroll sessions ({val:.0f} min) are driving up stress. "
        "Passive scrolling activates comparison and FOMO mechanisms."
    ),
    'heart_rate_resting':  (
        "Elevated resting heart rate ({val:.0f}bpm) suggests physiological arousal. "
        "HR above 70bpm at rest is associated with sympathetic nervous system activation."
    ),
    'mood_valence':        (
        "Your current mood is contributing to the stress reading. "
        "Negative affect and stress share bidirectional causal pathways (Russell, 1980)."
    ),
    'hour_of_day':         (
        "The time of day ({val:.0f}:00) is influencing your stress profile. "
        "Cortisol follows a circadian pattern peaking around 8–9am (Pruessner et al., 1997)."
    ),
    'day_of_week':         (
        "Day-of-week patterns are contributing to your stress level. "
        "Weekday stress peaks on Mondays and Wednesdays in population data."
    ),
}

NARRATIVE_DECREASE = {
    'screen_time_hours':   "Good screen time control ({val:.1f}h) is helping keep stress lower today.",
    'sleep_hours':         "Strong sleep ({val:.1f}h) is a key protective factor — this is the single biggest driver of next-day resilience.",
    'energy_level':        "Good energy levels (rated {val:.0f}/10) are buffering against stress today.",
    'scroll_session_mins': "Short scroll sessions ({val:.0f} min) are limiting passive-consumption stress.",
    'heart_rate_resting':  "Healthy resting heart rate ({val:.0f}bpm) indicates low physiological arousal.",
    'mood_valence':        "Your mood is acting as a protective factor — positive affect reduces perceived stress.",
    'hour_of_day':         "The time of day is working in your favour — cortisol is lower at this point in the day.",
    'day_of_week':         "Weekend patterns tend to reduce occupational stress — this is reflected in your reading.",
}


def compute_shap_explanation(feature_vector: List[float]) -> Optional[Dict]:
    """
    Compute SHAP values for a single prediction.
    Falls back to feature importance if SHAP not available.

    Returns dict with per-feature contributions, sorted by absolute impact,
    plus a natural-language narrative for the top-3 drivers.
    """
    model_path = MODEL_DIR / "stress_classifier.joblib"
    if not model_path.exists():
        return None

    try:
        import shap
        pipeline = joblib.load(model_path)
        # Pipeline: scaler → clf. SHAP needs the raw RF, but input must be scaled.
        scaler = pipeline.named_steps['scaler']
        clf    = pipeline.named_steps['clf']
        fv = np.array(feature_vector).reshape(1, -1)
        fv_scaled = scaler.transform(fv)

        # TreeExplainer — exact SHAP for Random Forest (Lundberg & Lee, 2017)
        explainer = shap.TreeExplainer(clf)
        shap_values = explainer.shap_values(fv_scaled)

        # For multi-class RF, shap_values is a list — take class 2 (high stress)
        if isinstance(shap_values, list) and len(shap_values) > 2:
            sv = shap_values[2][0]
            ev = (explainer.expected_value[2]
                  if hasattr(explainer.expected_value, '__len__')
                  else explainer.expected_value)
        elif isinstance(shap_values, list):
            sv = shap_values[-1][0]
            ev = (explainer.expected_value[-1]
                  if hasattr(explainer.expected_value, '__len__')
                  else explainer.expected_value)
        else:
            sv = shap_values[0]
            ev = (explainer.expected_value
                  if not hasattr(explainer.expected_value, '__len__')
                  else explainer.expected_value[0])

        base_value = float(ev)

        contributions = []
        for i, (name, value) in enumerate(zip(FEATURE_NAMES, sv)):
            contributions.append({
                'feature':       name,
                'label':         FEATURE_LABELS[name],
                'icon':          FEATURE_ICONS[name],
                'shap_value':    round(float(value), 4),
                'feature_value': round(float(feature_vector[i]), 2),
                'direction':     'increases_stress' if value > 0 else 'reduces_stress',
                'abs_impact':    abs(float(value)),
            })

        # Sort by absolute impact
        contributions.sort(key=lambda x: x['abs_impact'], reverse=True)

        # Normalise to percentages
        total = sum(c['abs_impact'] for c in contributions)
        for c in contributions:
            c['pct_contribution'] = (
                round((c['abs_impact'] / total * 100), 1) if total > 0 else 0
            )

        # Natural-language narrative for top drivers
        narrative = _build_narrative(contributions[:3])

        return {
            'method':          'SHAP TreeExplainer (Lundberg & Lee, 2017)',
            'base_value':      round(base_value, 4),
            'contributions':   contributions,
            'top_driver':      contributions[0]['label'] if contributions else None,
            'top_driver_pct':  contributions[0]['pct_contribution'] if contributions else 0,
            'narrative':       narrative,
        }

    except ImportError:
        return _fallback_explanation(feature_vector)
    except Exception:
        return _fallback_explanation(feature_vector)


def _build_narrative(top_contributions: List[Dict]) -> str:
    """
    Generate a plain-English narrative explaining the top SHAP drivers.
    Makes the ML explainability human-readable (NICE 2023 requirement).
    """
    parts = []
    for c in top_contributions:
        name      = c['feature']
        val       = c['feature_value']
        direction = c['direction']
        pct       = c['pct_contribution']

        if direction == 'increases_stress':
            template = NARRATIVE_INCREASE.get(name, f"{FEATURE_LABELS[name]} is raising stress.")
        else:
            template = NARRATIVE_DECREASE.get(name, f"{FEATURE_LABELS[name]} is reducing stress.")

        try:
            sentence = template.format(val=val)
        except (KeyError, ValueError):
            sentence = template

        parts.append(f"{FEATURE_ICONS[name]} **{FEATURE_LABELS[name]}** ({pct:.0f}%): {sentence}")

    return "\n\n".join(parts)


def _fallback_explanation(feature_vector: List[float]) -> Dict:
    """
    Fallback: use model feature importances when SHAP unavailable.
    Less precise but still explainable (Ribeiro et al., 2016 — LIME alternative).
    """
    try:
        pipeline = joblib.load(MODEL_DIR / "stress_classifier.joblib")
        clf = pipeline.named_steps['clf']
        importances = clf.feature_importances_

        contributions = []
        for i, (name, imp) in enumerate(zip(FEATURE_NAMES, importances)):
            direction = ('increases_stress'
                         if feature_vector[i] > _get_normal(name)
                         else 'reduces_stress')
            contributions.append({
                'feature':       name,
                'label':         FEATURE_LABELS[name],
                'icon':          FEATURE_ICONS[name],
                'shap_value':    round(float(imp), 4),
                'feature_value': round(float(feature_vector[i]), 2),
                'direction':     direction,
                'abs_impact':    float(imp),
                'pct_contribution': round(float(imp) * 100, 1),
            })

        contributions.sort(key=lambda x: x['abs_impact'], reverse=True)
        narrative = _build_narrative(contributions[:3])

        return {
            'method':         'Feature importance fallback (install shap for exact values)',
            'base_value':     0.5,
            'contributions':  contributions,
            'top_driver':     contributions[0]['label'] if contributions else None,
            'top_driver_pct': contributions[0]['pct_contribution'] if contributions else 0,
            'narrative':      narrative,
        }
    except Exception:
        return None


def _get_normal(feature: str) -> float:
    """Healthy reference values for direction calculation."""
    normals = {
        'screen_time_hours':   4.0,
        'sleep_hours':         7.5,
        'energy_level':        6.0,
        'hour_of_day':         12.0,
        'day_of_week':         2.0,
        'scroll_session_mins': 15.0,
        'heart_rate_resting':  65.0,
        'mood_valence':        0.2,
    }
    return normals.get(feature, 0.0)
