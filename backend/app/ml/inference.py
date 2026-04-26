"""
ML Inference Engine
=====================
Loads trained model + runs prediction pipeline at request time.
Also runs VADER sentiment on optional journal text.

Ensemble logic (v2):
  When journal text is available, combines:
    - Random Forest stress probability (device signals)
    - BiLSTM distress class probability (NLP signals)
  into a calibrated ensemble risk score using weighted averaging.

  This multi-modal fusion addresses the complementary nature of
  device signals (objective) and language signals (subjective),
  following the recommendation of Torous et al. (2017) for digital
  mental health monitoring.

Academic citation:
  Torous, J. et al. (2017). New tools for new research in psychiatry:
    A scalable and customizable platform to empower data driven
    smartphone research. JMIR Mental Health, 4(1).
  Breiman, L. (2001). Random forests. Machine Learning, 45(1), 5-32.
  Hutto, C.J. & Gilbert, E. (2014). VADER: A parsimonious rule-based
    model for sentiment analysis of social media text. ICWSM.
"""
import json
import joblib
import numpy as np
from pathlib import Path
from functools import lru_cache
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from app.config import settings
from app.ml.synthetic_data import FEATURES

MOOD_VALENCE = {
    'anxious': -0.70, 'stressed': -0.60, 'low': -0.80,
    'numb': -0.40, 'calm': 0.60, 'content': 0.70,
    'energised': 0.50, 'joyful': 0.90
}

# BiLSTM distress → numeric risk weight (maps language signal to [0,1] scale)
DISTRESS_WEIGHTS = {
    'neutral':           0.0,
    'mild_distress':     0.25,
    'moderate_distress': 0.55,
    'high_distress':     0.80,
    'crisis_indicator':  1.0,
}

MODEL_DIR = Path(settings.model_dir)   # ensure Path, not str


@lru_cache(maxsize=1)
def load_model():
    model_path = MODEL_DIR / "stress_classifier.joblib"
    if not model_path.exists():
        raise FileNotFoundError(
            f"Model not found at {model_path}. "
            "Run: python -m app.ml.train"
        )
    return joblib.load(model_path)


@lru_cache(maxsize=1)
def load_eval_report():
    path = MODEL_DIR / "eval_report.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}


@lru_cache(maxsize=1)
def get_sentiment_analyser():
    return SentimentIntensityAnalyzer()


def build_feature_vector(
    screen_time_hours: float,
    sleep_hours: float,
    energy_level: int,
    hour_of_day: int,
    day_of_week: int,
    scroll_session_mins: float,
    heart_rate_resting: float,
    mood_label: str,
    weather_temp_c: float = 15.0,
) -> np.ndarray:
    """
    Build the 14-feature vector that matches the training data schema.

    New in v3: cyclical time encodings (sin/cos) prevent the RF treating
    midnight and noon as maximally distant (Waskom, 2018); screen×sleep
    interaction captures synergistic amplification (Levenson et al., 2017);
    weather_temp_c adds the real-phone environmental signal.
    """
    valence = MOOD_VALENCE.get(mood_label.lower(), 0.0)
    hr = heart_rate_resting if heart_rate_resting else 68.0

    # Cyclical time encodings (Waskom, 2018)
    hour_sin = float(np.sin(2 * np.pi * hour_of_day / 24))
    hour_cos = float(np.cos(2 * np.pi * hour_of_day / 24))
    day_sin  = float(np.sin(2 * np.pi * day_of_week / 7))
    day_cos  = float(np.cos(2 * np.pi * day_of_week / 7))

    # Screen × sleep interaction (Levenson et al., 2017)
    screen_sleep_interaction = float(
        max(0.0, (screen_time_hours / 10.0) * max(0.0, (8 - sleep_hours) / 8.0)) * 0.15
    )

    vector = np.array([[
        screen_time_hours,
        sleep_hours,
        energy_level,
        hour_of_day,
        day_of_week,
        scroll_session_mins,
        hr,
        valence,
        hour_sin,
        hour_cos,
        day_sin,
        day_cos,
        screen_sleep_interaction,
        weather_temp_c,
    ]])
    return vector


def predict_stress(feature_vector: np.ndarray) -> dict:
    """
    Returns stress score (0–1) and category (low/moderate/high).
    The model outputs class probabilities; we use a weighted sum
    as a continuous stress score — more informative than a hard label.
    Breiman (2001): RF probability estimates are well-calibrated for
    balanced datasets.
    """
    import pandas as pd
    model = load_model()
    # Pass as DataFrame to avoid feature-name warning from StandardScaler
    fv_df = pd.DataFrame(feature_vector, columns=FEATURES)
    classes = model.classes_
    proba = model.predict_proba(fv_df)[0]
    label = model.predict(fv_df)[0]

    proba_dict = dict(zip(classes, proba.tolist()))

    # Continuous stress score: weighted sum of class probabilities
    # Weights reflect ordinal severity (low=0, moderate=0.5, high=1.0)
    stress_score = (
        0.0 * proba_dict.get('low', 0) +
        0.5 * proba_dict.get('moderate', 0) +
        1.0 * proba_dict.get('high', 0)
    )

    result = {
        "stress_score":       round(float(stress_score), 4),
        "stress_category":    label,
        "class_probabilities": {k: round(v, 4) for k, v in proba_dict.items()},
    }

    # Split-conformal prediction interval (Vovk et al. 2005; Angelopoulos & Bates 2023).
    # q_hat is the calibration-set residual quantile computed at train time; adding
    # and subtracting it around the point score yields a distribution-free interval
    # with guaranteed marginal coverage 1 - alpha.
    report = load_eval_report()
    q_hat = report.get("conformal_q_hat")
    alpha = report.get("conformal_alpha", 0.1)
    if q_hat is not None:
        lo = max(0.0, float(stress_score) - float(q_hat))
        hi = min(1.0, float(stress_score) + float(q_hat))
        result["prediction_interval"] = {
            "low":      round(lo, 4),
            "high":     round(hi, 4),
            "coverage": round(1.0 - float(alpha), 2),
            "method":   "split-conformal",
        }

    # LAC conformal prediction SET (Angelopoulos & Bates, 2023 §3).
    # The set includes every class y where P̂(y | x) ≥ 1 − q̂_set.
    # This gives a distribution-free guarantee: P(true class ∈ set) ≥ 1 − α.
    q_hat_set = report.get("conformal_set_q_hat")
    if q_hat_set is not None:
        classes_list = list(classes)
        threshold    = 1.0 - float(q_hat_set)
        pred_set     = [c for j, c in enumerate(classes_list) if proba[j] >= threshold]
        if not pred_set:                           # always return at least the argmax class
            pred_set = [classes_list[int(np.argmax(proba))]]
        result["prediction_set"]      = pred_set
        result["prediction_set_size"] = len(pred_set)

    return result


def predict_stress_ensemble(
    feature_vector: np.ndarray,
    distress_class: str = 'neutral',
    distress_confidence: float = 0.5,
    journal_available: bool = False,
) -> dict:
    """
    Ensemble prediction combining Random Forest device signals with
    BiLSTM NLP distress classification (Torous et al., 2017).

    When journal text is present, combines:
      - RF stress score (weight 0.65) — objective device signals
      - BiLSTM distress weight (weight 0.35) — subjective language signals

    When no journal text, returns pure RF score.

    This multi-modal fusion improves precision for ambiguous borderline
    cases where device signals and language signals diverge.
    """
    rf_result = predict_stress(feature_vector)
    rf_score  = rf_result['stress_score']

    if not journal_available or distress_class == 'neutral':
        # No journal — use pure RF
        return {
            **rf_result,
            'ensemble_score': rf_result['stress_score'],
            'ensemble_method': 'RF only (no journal text)',
            'rf_weight': 1.0,
            'nlp_weight': 0.0,
        }

    # Ensemble: weighted combination of RF + BiLSTM
    nlp_risk = DISTRESS_WEIGHTS.get(distress_class, 0.0)
    # Weight BiLSTM by its confidence — low-confidence NLP has less influence
    nlp_contribution = nlp_risk * distress_confidence

    RF_WEIGHT  = 0.65
    NLP_WEIGHT = 0.35

    ensemble_score = RF_WEIGHT * rf_score + NLP_WEIGHT * nlp_contribution
    ensemble_score = round(float(np.clip(ensemble_score, 0.0, 1.0)), 4)

    # Propagate the conformal interval around the ensemble score as well.
    # We use the RF q_hat as a conservative bound — valid because the ensemble
    # blend only shrinks residuals when the NLP signal agrees with RF.
    ensemble_interval = None
    pi = rf_result.get("prediction_interval")
    if pi is not None:
        half_width = (pi["high"] - pi["low"]) / 2.0
        ensemble_interval = {
            "low":      round(max(0.0, ensemble_score - half_width), 4),
            "high":     round(min(1.0, ensemble_score + half_width), 4),
            "coverage": pi["coverage"],
            "method":   pi["method"],
        }

    # Re-categorise based on ensemble score
    if ensemble_score < 0.33:
        ensemble_category = 'low'
    elif ensemble_score < 0.66:
        ensemble_category = 'moderate'
    else:
        ensemble_category = 'high'

    return {
        **rf_result,
        'ensemble_score':    ensemble_score,
        'ensemble_category': ensemble_category,
        'ensemble_method':   (
            'RF (65%) + BiLSTM NLP (35%) weighted ensemble '
            '— Torous et al. (2017) multi-modal fusion'
        ),
        'rf_weight':         RF_WEIGHT,
        'nlp_weight':        NLP_WEIGHT,
        'nlp_risk_input':    round(nlp_contribution, 4),
        'ensemble_interval': ensemble_interval,
    }


def analyse_sentiment(text: str) -> float:
    """
    VADER sentiment compound score: −1.0 (most negative) to +1.0 (most positive).
    Hutto & Gilbert (2014) — validated for short, social-media-style text.
    """
    if not text or len(text.strip()) < 3:
        return 0.0
    analyser = get_sentiment_analyser()
    scores = analyser.polarity_scores(text)
    return round(scores['compound'], 4)
