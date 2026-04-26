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

from app.ml.synthetic_data import FEATURES as FEATURE_NAMES

FEATURE_LABELS = {
    'screen_time_hours':        'Screen time',
    'sleep_hours':              'Sleep duration',
    'energy_level':             'Energy level',
    'hour_of_day':              'Time of day',
    'day_of_week':              'Day of week',
    'scroll_session_mins':      'Scroll session',
    'heart_rate_resting':       'Resting heart rate',
    'mood_valence':             'Mood valence',
    'hour_sin':                 'Circadian phase (sin)',
    'hour_cos':                 'Circadian phase (cos)',
    'day_sin':                  'Weekly rhythm (sin)',
    'day_cos':                  'Weekly rhythm (cos)',
    'screen_sleep_interaction': 'Screen–sleep burden',
    'weather_temp_c':           'Weather temperature',
}

FEATURE_ICONS = {
    'screen_time_hours':        '📱',
    'sleep_hours':              '😴',
    'energy_level':             '🔋',
    'hour_of_day':              '🕐',
    'day_of_week':              '📅',
    'scroll_session_mins':      '👆',
    'heart_rate_resting':       '❤️',
    'mood_valence':             '🧠',
    'hour_sin':                 '🌀',
    'hour_cos':                 '🌀',
    'day_sin':                  '📆',
    'day_cos':                  '📆',
    'screen_sleep_interaction': '⚠️',
    'weather_temp_c':           '🌡',
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
    'hour_sin':            (
        "Your circadian phase is flagging elevated arousal at this time of day. "
        "Cortisol follows a sinusoidal pattern peaking around 8–9am (Pruessner et al., 1997)."
    ),
    'hour_cos':            (
        "The cosine component of your circadian rhythm is contributing to stress. "
        "Combined sin/cos encoding captures full periodic structure (Waskom, 2018)."
    ),
    'day_sin':             "Weekly rhythm patterns are increasing your stress reading.",
    'day_cos':             "Your position in the weekly cycle is a stress factor.",
    'screen_sleep_interaction': (
        "High screen time combined with poor sleep is amplifying stress synergistically. "
        "This interaction exceeds the additive effect — Levenson et al. (2017) found this "
        "combination is the strongest predictor of next-day psychological distress."
    ),
    'weather_temp_c':      (
        "Environmental temperature ({val:.0f}°C) is a mild stress contributor. "
        "Temperature extremes activate physiological stress responses "
        "(Bouchama & Knochel, 2002)."
    ),
}

NARRATIVE_DECREASE = {
    'screen_time_hours':        "Good screen time control ({val:.1f}h) is helping keep stress lower today.",
    'sleep_hours':              "Strong sleep ({val:.1f}h) is a key protective factor — this is the single biggest driver of next-day resilience.",
    'energy_level':             "Good energy levels (rated {val:.0f}/10) are buffering against stress today.",
    'scroll_session_mins':      "Short scroll sessions ({val:.0f} min) are limiting passive-consumption stress.",
    'heart_rate_resting':       "Healthy resting heart rate ({val:.0f}bpm) indicates low physiological arousal.",
    'mood_valence':             "Your mood is acting as a protective factor — positive affect reduces perceived stress.",
    'hour_of_day':              "The time of day is working in your favour — cortisol is lower at this point in the day.",
    'day_of_week':              "Weekend patterns tend to reduce occupational stress — this is reflected in your reading.",
    'hour_sin':                 "Circadian phase is protective at this time of day — cortisol is in a natural low.",
    'hour_cos':                 "The periodic phase of your day is contributing to lower stress.",
    'day_sin':                  "Weekly rhythm is working in your favour today.",
    'day_cos':                  "Your weekly cycle position is a protective factor.",
    'screen_sleep_interaction': "Good balance of screen time and sleep is preventing synergistic stress amplification.",
    'weather_temp_c':           "Comfortable temperature ({val:.0f}°C) is keeping physiological stress low.",
}


FEATURE_UNITS = {
    'screen_time_hours':        'h',
    'sleep_hours':              'h',
    'energy_level':             '/10',
    'hour_of_day':              ':00',
    'day_of_week':              '',
    'scroll_session_mins':      'min',
    'heart_rate_resting':       'bpm',
    'mood_valence':             '',
    'hour_sin':                 '',
    'hour_cos':                 '',
    'day_sin':                  '',
    'day_cos':                  '',
    'screen_sleep_interaction': '',
    'weather_temp_c':           '°C',
}

# Map feature names to UserProfile rolling-average fields
PROFILE_NORM_KEYS = {
    'screen_time_hours': 'avg_screen_time',
    'sleep_hours':       'avg_sleep',
}


def _annotate_deltas(contributions: List[Dict], feature_vector: List[float],
                     user_norms: Optional[Dict]) -> None:
    """Add delta_from_norm and delta_formatted to each contribution in-place."""
    for c in contributions:
        name = c['feature']
        val  = c['feature_value']
        # Use user's rolling average where available, else healthy reference
        if user_norms and name in PROFILE_NORM_KEYS:
            norm_key = PROFILE_NORM_KEYS[name]
            norm = user_norms.get(norm_key)
            norm_label = 'your norm'
        else:
            norm = None
            norm_label = 'norm'
        if norm is None:
            norm = _get_normal(name)
            norm_label = 'norm'

        delta = val - norm
        unit  = FEATURE_UNITS.get(name, '')
        sign  = '+' if delta >= 0 else ''
        c['norm_value']      = round(norm, 2)
        c['delta_from_norm'] = round(delta, 2)
        c['delta_formatted'] = f"{sign}{delta:.1f}{unit} vs {norm_label}"


def _build_summary_sentence(contributions: List[Dict]) -> str:
    """
    Build the human-readable 'driven by' sentence:
    'Your stress today was driven mostly by: sleep (-2.1h vs your norm), screen time (+3h vs norm).'
    """
    drivers = []
    for c in contributions:
        label   = c['label'].lower()
        delta_s = c.get('delta_formatted', '')
        if delta_s:
            drivers.append(f"{label} ({delta_s})")
        else:
            direction = 'elevated' if c['direction'] == 'increases_stress' else 'low'
            drivers.append(f"{direction} {label}")
    if not drivers:
        return ''
    return "Your stress today was driven mostly by: " + ", ".join(drivers) + "."


def compute_shap_explanation(feature_vector: List[float],
                             user_norms: Optional[Dict] = None) -> Optional[Dict]:
    """
    Compute SHAP values for a single prediction.
    Falls back to feature importance if SHAP not available.

    Args:
        feature_vector: 14-element list matching FEATURE_NAMES order (see synthetic_data.FEATURES).
        user_norms: optional dict with keys 'avg_screen_time', 'avg_sleep'
                    (from the user's UserProfile rolling averages).

    Returns dict with per-feature contributions sorted by absolute impact,
    plus a natural-language narrative and a human-readable summary sentence.
    """
    model_path = MODEL_DIR / "stress_classifier.joblib"
    if not model_path.exists():
        return None

    try:
        import shap
        pipeline = joblib.load(model_path)
        # Pipeline: scaler → clf. SHAP needs the raw tree model, input must be scaled.
        scaler = pipeline.named_steps['scaler']
        clf    = pipeline.named_steps['clf']
        import pandas as pd
        fv = np.array(feature_vector).reshape(1, -1)
        fv_df = pd.DataFrame(fv, columns=FEATURE_NAMES)
        fv_scaled = scaler.transform(fv_df)

        # Unwrap CalibratedClassifierCV to get the base tree estimator for SHAP.
        # CalibratedClassifierCV wraps the tree model — SHAP needs the raw estimator.
        if hasattr(clf, 'calibrated_classifiers_'):
            tree_clf = clf.calibrated_classifiers_[0].estimator
        elif hasattr(clf, 'estimator'):
            tree_clf = clf.estimator
        else:
            tree_clf = clf

        # TreeExplainer — exact SHAP for tree-based models (Lundberg & Lee, 2017)
        explainer = shap.TreeExplainer(tree_clf)
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

        # Add delta-from-norm annotations (personalised comparison)
        _annotate_deltas(contributions, feature_vector, user_norms)

        # Natural-language narrative for top drivers
        narrative = _build_narrative(contributions[:3])

        return {
            'method':           'SHAP TreeExplainer (Lundberg & Lee, 2017)',
            'base_value':       round(base_value, 4),
            'contributions':    contributions,
            'top_driver':       contributions[0]['label'] if contributions else None,
            'top_driver_pct':   contributions[0]['pct_contribution'] if contributions else 0,
            'narrative':        narrative,
            'summary_sentence': _build_summary_sentence(contributions[:3]),
        }

    except ImportError:
        return _fallback_explanation(feature_vector, user_norms)
    except Exception:
        return _fallback_explanation(feature_vector, user_norms)


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


def _fallback_explanation(feature_vector: List[float],
                          user_norms: Optional[Dict] = None) -> Dict:
    """
    Fallback: use model feature importances when SHAP unavailable.
    Less precise but still explainable (Ribeiro et al., 2016 — LIME alternative).
    """
    try:
        pipeline = joblib.load(MODEL_DIR / "stress_classifier.joblib")
        clf = pipeline.named_steps['clf']
        # Unwrap CalibratedClassifierCV to access feature importances
        if hasattr(clf, 'calibrated_classifiers_'):
            clf = clf.calibrated_classifiers_[0].estimator
        elif hasattr(clf, 'estimator'):
            clf = clf.estimator
        importances = clf.feature_importances_

        contributions = []
        for i, (name, imp) in enumerate(zip(FEATURE_NAMES, importances)):
            direction = ('increases_stress'
                         if feature_vector[i] > _get_normal(name)
                         else 'reduces_stress')
            contributions.append({
                'feature':          name,
                'label':            FEATURE_LABELS[name],
                'icon':             FEATURE_ICONS[name],
                'shap_value':       round(float(imp), 4),
                'feature_value':    round(float(feature_vector[i]), 2),
                'direction':        direction,
                'abs_impact':       float(imp),
                'pct_contribution': round(float(imp) * 100, 1),
            })

        contributions.sort(key=lambda x: x['abs_impact'], reverse=True)
        _annotate_deltas(contributions, feature_vector, user_norms)
        narrative = _build_narrative(contributions[:3])

        return {
            'method':           'Feature importance fallback (install shap for exact values)',
            'base_value':       0.5,
            'contributions':    contributions,
            'top_driver':       contributions[0]['label'] if contributions else None,
            'top_driver_pct':   contributions[0]['pct_contribution'] if contributions else 0,
            'narrative':        narrative,
            'summary_sentence': _build_summary_sentence(contributions[:3]),
        }
    except Exception:
        return None


def _get_normal(feature: str) -> float:
    """Healthy reference values for direction calculation."""
    import numpy as np
    normals = {
        'screen_time_hours':        4.0,
        'sleep_hours':              7.5,
        'energy_level':             6.0,
        'hour_of_day':              12.0,
        'day_of_week':              2.0,
        'scroll_session_mins':      15.0,
        'heart_rate_resting':       65.0,
        'mood_valence':             0.2,
        # Cyclical features — midday reference (hour=12)
        'hour_sin':                 float(np.sin(2 * np.pi * 12 / 24)),
        'hour_cos':                 float(np.cos(2 * np.pi * 12 / 24)),
        # Midweek reference (day=2, Wednesday)
        'day_sin':                  float(np.sin(2 * np.pi * 2 / 7)),
        'day_cos':                  float(np.cos(2 * np.pi * 2 / 7)),
        'screen_sleep_interaction': 0.03,  # normal: 4h screen, 7.5h sleep
        'weather_temp_c':           15.0,
    }
    return normals.get(feature, 0.0)
