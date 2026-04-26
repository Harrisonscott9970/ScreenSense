"""
Counterfactual Explanation Engine
===================================
Answers the question: "What would I need to change to reach a lower stress class?"

Algorithm: greedy feature perturbation (Wachter et al., 2017).
At each step we trial every actionable feature at its next step value,
pick the one that most increases P(low stress), and accept it.
Continues until the target class is reached or the step budget is exhausted.

Actionable features are those the user can plausibly change between now
and their next check-in. Cyclical encodings, weather, and mood valence
are excluded — they are either derived or not directly controllable.

Academic references
--------------------
Wachter, S., Mittelstadt, B. & Russell, C. (2017). Counterfactual
  explanations without opening the black box. Harvard Journal of Law
  & Technology, 31(2).
Mothilal, R.K., Sharma, A. & Tan, C. (2020). Explaining machine learning
  classifiers through diverse counterfactual explanations. FAccT 2020.
Rudin, C. (2019). Stop explaining black box machine learning models for
  high stakes decisions. Nature Machine Intelligence, 1(5), 206-215.
"""

import numpy as np
import joblib
from pathlib import Path
from typing import List, Optional

from app.ml.synthetic_data import FEATURES

MODEL_DIR = Path(__file__).parent.parent.parent / "data" / "models"

# ── Actionable feature configuration ─────────────────────────────
# (step_size, direction, min_val, max_val, unit, friendly_name)
# direction: 'down' = reduce to lower stress, 'up' = increase to lower stress
ACTIONABLE = {
    'screen_time_hours':   (-0.5,  0.0,  14.0, 'h',   'Screen time'),
    'sleep_hours':         ( 0.5,  4.0,  10.0, 'h',   'Sleep'),
    'energy_level':        ( 1.0,  1.0,  10.0, '/10', 'Energy level'),
    'scroll_session_mins': (-5.0,  0.0, 120.0, 'min', 'Scroll session'),
    'heart_rate_resting':  (-2.0, 45.0, 110.0, 'bpm', 'Resting HR'),
}

# Indices of FEATURES so we can index into the vector
FEAT_IDX = {name: i for i, name in enumerate(FEATURES)}


def compute_counterfactual(
    feature_vector: List[float],
    max_steps: int = 20,
    target_class: str = 'low',
) -> Optional[dict]:
    """
    Greedy counterfactual search (Wachter et al., 2017).

    For each step:
      1. Trial every actionable feature at (current_value + step_size).
      2. Score by the increase in P(target_class).
      3. Accept the best-scoring trial; record the change.
      4. Stop when target_class is predicted or budget exhausted.

    Returns a dict with:
      changes      — list of {feature, label, from, to, delta, unit}
      achieved     — whether target class was reached
      final_class  — predicted class after counterfactual
      narrative    — one natural-language sentence per change
    """
    model_path = MODEL_DIR / "stress_classifier.joblib"
    if not model_path.exists():
        return None

    try:
        model = joblib.load(model_path)
        classes = list(model.classes_)
        if target_class not in classes:
            target_class = classes[0]          # fallback to first class
        target_idx = classes.index(target_class)

        fv      = list(feature_vector)
        orig_fv = list(feature_vector)
        changes: list = []

        def _proba_target(v: list) -> float:
            arr = np.array(v).reshape(1, -1)
            return float(model.predict_proba(arr)[0][target_idx])

        def _predict(v: list) -> str:
            arr = np.array(v).reshape(1, -1)
            return model.predict(arr)[0]

        current_class = _predict(fv)
        if current_class == target_class:
            return {
                'changes': [], 'achieved': True,
                'final_class': current_class,
                'narrative': 'Your stress is already in the target range.',
            }

        for _ in range(max_steps):
            best_gain  = -999.0
            best_feat  = None
            best_newval = None

            base_score = _proba_target(fv)

            for feat, (step, lo, hi, unit, label) in ACTIONABLE.items():
                idx = FEAT_IDX.get(feat)
                if idx is None:
                    continue
                trial = list(fv)
                new_val = float(np.clip(trial[idx] + step, lo, hi))
                if abs(new_val - trial[idx]) < 1e-6:
                    continue          # already at boundary
                trial[idx] = new_val
                gain = _proba_target(trial) - base_score
                if gain > best_gain:
                    best_gain  = gain
                    best_feat  = feat
                    best_newval = new_val

            if best_feat is None or best_gain <= 0:
                break                 # no actionable improvement found

            old_val = fv[FEAT_IDX[best_feat]]
            fv[FEAT_IDX[best_feat]] = best_newval

            # Recompute derived features that depend on changed features
            _sync_derived(fv)

            # Accumulate change (merge into existing change for same feature)
            existing = next((c for c in changes if c['feature'] == best_feat), None)
            if existing:
                existing['to']    = round(best_newval, 2)
                existing['delta'] = round(best_newval - existing['from'], 2)
            else:
                _, _, _, unit, label = ACTIONABLE[best_feat]
                changes.append({
                    'feature': best_feat,
                    'label':   label,
                    'from':    round(old_val, 2),
                    'to':      round(best_newval, 2),
                    'delta':   round(best_newval - old_val, 2),
                    'unit':    unit,
                })

            if _predict(fv) == target_class:
                break

        final_class = _predict(fv)
        narrative   = _build_narrative(changes, orig_fv)

        return {
            'changes':     changes,
            'achieved':    final_class == target_class,
            'final_class': final_class,
            'narrative':   narrative,
            'method':      'Greedy counterfactual — Wachter et al. (2017)',
        }

    except Exception:
        return None


def _sync_derived(fv: list) -> None:
    """Keep screen_sleep_interaction consistent when base features change."""
    screen_idx = FEAT_IDX.get('screen_time_hours')
    sleep_idx  = FEAT_IDX.get('sleep_hours')
    inter_idx  = FEAT_IDX.get('screen_sleep_interaction')
    if None in (screen_idx, sleep_idx, inter_idx):
        return
    screen = fv[screen_idx]
    sleep  = fv[sleep_idx]
    fv[inter_idx] = float(
        max(0.0, (screen / 10.0) * max(0.0, (8 - sleep) / 8.0)) * 0.15
    )


def _build_narrative(changes: list, orig_fv: list) -> str:
    """Convert change list to a natural-language sentence."""
    if not changes:
        return "No single actionable change was sufficient to shift the prediction."
    parts = []
    for c in changes:
        delta = c['delta']
        sign  = '+' if delta >= 0 else ''
        parts.append(
            f"{c['label']}: {sign}{delta:.1f}{c['unit']} "
            f"({c['from']}{c['unit']} → {c['to']}{c['unit']})"
        )
    return "To reach lower stress: " + "; ".join(parts) + "."
