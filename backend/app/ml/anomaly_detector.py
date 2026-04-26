"""
Isolation Forest Anomaly Detector
===================================
Detects statistically unusual check-ins relative to a user's personal baseline.

Algorithm (Liu et al., 2008):
  Builds a forest of random isolation trees on the user's historical feature
  vectors. Points isolated in fewer splits are anomalous. The decision function
  returns a score in [-1, +1] where more negative = more anomalous.

Features used: the 6 core behavioural raw features (screen time, sleep,
energy, scroll session, heart rate, weather temp). Derived and cyclical
features are excluded — they are perfectly correlated with the raw features
and would inflate detection sensitivity without adding information.

Academic references
--------------------
Liu, F.T., Ting, K.M. & Zhou, Z.H. (2008). Isolation forest.
  Proceedings of ICDM 2008, 413-422.
Breunig, M.M. et al. (2000). LOF: Identifying density-based local outliers.
  ACM SIGMOD Record, 29(2), 93-104.
"""
import numpy as np
from typing import Optional, List

from app.ml.synthetic_data import FEATURES

# The 6 raw behavioural feature names and their indices in FEATURES
_ANOMALY_FEATURES = [
    'screen_time_hours', 'sleep_hours', 'energy_level',
    'scroll_session_mins', 'heart_rate_resting', 'weather_temp_c',
]
_FEAT_IDX  = {name: i for i, name in enumerate(FEATURES)}
_ANOMALY_IDX = [_FEAT_IDX[f] for f in _ANOMALY_FEATURES]


def compute_anomaly(
    fv_list: List[float],
    recent_entries: list,
    stress_score: float,
    stress_category: str,
) -> Optional[dict]:
    """
    Fit IsolationForest on the user's last ≤50 check-ins, then score the
    current check-in as normal or anomalous.

    Returns None when the user has fewer than 10 historical entries
    (insufficient baseline for anomaly detection).

    Parameters
    ----------
    fv_list       : full 14-feature vector as a flat Python list
    recent_entries: MoodEntry ORM objects, ordered most-recent first
    stress_score  : ensemble stress score [0, 1]
    stress_category: 'low' | 'moderate' | 'high'
    """
    if len(recent_entries) < 10:
        return None

    try:
        from sklearn.ensemble import IsolationForest

        # Build (N × 6) history matrix from ORM objects
        hist_rows: List[List[float]] = []
        for e in recent_entries[:50]:
            hist_rows.append([
                float(e.screen_time_hours   or 4.0),
                float(e.sleep_hours         or 7.0),
                float(e.energy_level        or 5),
                float(e.scroll_session_mins or 15.0),
                float(e.heart_rate_resting  or 68.0),
                float(e.weather_temp_c      or 15.0),
            ])
        X_hist = np.array(hist_rows)

        # Extract the same 6 features from the full 14-feature vector
        fv      = np.array(fv_list)
        current = np.array([fv[_FEAT_IDX[f]] for f in _ANOMALY_FEATURES]).reshape(1, -1)

        # contamination=0.05 → expect ≤5% of historical points to be outliers
        # (conservative for wellbeing data — avoids over-alerting)
        iso = IsolationForest(contamination=0.05, random_state=42, n_jobs=-1)
        iso.fit(X_hist)

        decision   = float(iso.decision_function(current)[0])
        is_anomaly = bool(iso.predict(current)[0] == -1)

        message = _anomaly_message(
            current[0], X_hist.mean(axis=0), stress_score, recent_entries
        )

        return {
            'is_anomaly':     is_anomaly,
            'decision_score': round(decision, 4),   # lower → more anomalous
            'message':        message,
            'history_size':   len(hist_rows),
            'method':         'Isolation Forest — Liu et al. (2008)',
        }

    except Exception:
        return None


def _anomaly_message(
    current: np.ndarray,
    means: np.ndarray,
    stress_score: float,
    recent_entries: list,
) -> str:
    """
    Identify the single most deviant feature and build a contextual sentence.
    Falls back to a stress-percentile comparison if no feature deviates >20%.
    """
    labels = [
        ('screen_time_hours',   'Screen time',   'h',   True),
        ('sleep_hours',         'Sleep',          'h',   False),
        ('energy_level',        'Energy',         '/10', False),
        ('scroll_session_mins', 'Scroll session', 'min', True),
        ('heart_rate_resting',  'Resting HR',     'bpm', True),
        ('weather_temp_c',      'Temperature',    '°C',  False),
    ]

    best_idx  = None
    best_rel  = 0.0
    best_meta: tuple = ()

    for i, (feat, label, unit, high_bad) in enumerate(labels):
        if means[i] < 1e-3:
            continue
        rel = abs((current[i] - means[i]) / means[i])
        if rel > best_rel:
            best_rel  = rel
            best_idx  = i
            best_meta = (label, unit, high_bad, current[i] - means[i])

    if best_idx is None or best_rel < 0.20:
        # Fall back to stress-percentile comparison
        hist_scores = [float(getattr(e, 'predicted_stress_score', 0.5) or 0.5)
                       for e in recent_entries]
        rank = sum(1 for s in hist_scores if s < stress_score)
        pct  = round(rank / max(len(hist_scores), 1) * 100)
        return (
            f"Higher stress than {pct}% of your recent check-ins — "
            "an unusual reading compared to your personal baseline."
        )

    label, unit, high_bad, delta = best_meta
    direction = 'above' if delta > 0 else 'below'
    note = ''
    if high_bad and delta > 0:
        note = ' — worth keeping an eye on.'
    elif not high_bad and delta < 0:
        note = ' — this may be contributing to your stress.'

    return (
        f"{label} is {abs(delta):.1f}{unit} {direction} your usual average{note} "
        "This check-in looks unusual compared to your baseline."
    )
