"""
ML Inference Engine
Loads trained model + runs prediction pipeline at request time.
Also runs VADER sentiment on optional journal text.
"""
import json
import joblib
import numpy as np
from pathlib import Path
from functools import lru_cache
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from app.config import settings

FEATURES = [
    'screen_time_hours',
    'sleep_hours',
    'energy_level',
    'hour_of_day',
    'day_of_week',
    'scroll_session_mins',
    'heart_rate_resting',
    'mood_valence'
]

MOOD_VALENCE = {
    'anxious': -0.70, 'stressed': -0.60, 'low': -0.80,
    'numb': -0.40, 'calm': 0.60, 'content': 0.70,
    'energised': 0.50, 'joyful': 0.90
}


@lru_cache(maxsize=1)
def load_model():
    model_path = settings.model_dir / "stress_classifier.joblib"
    if not model_path.exists():
        raise FileNotFoundError(
            f"Model not found at {model_path}. "
            "Run: python -m app.ml.train"
        )
    return joblib.load(model_path)


@lru_cache(maxsize=1)
def load_eval_report():
    path = settings.model_dir / "eval_report.json"
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
    mood_label: str
) -> np.ndarray:
    valence = MOOD_VALENCE.get(mood_label.lower(), 0.0)
    hr = heart_rate_resting if heart_rate_resting else 68.0  # population mean fallback
    vector = np.array([[
        screen_time_hours,
        sleep_hours,
        energy_level,
        hour_of_day,
        day_of_week,
        scroll_session_mins,
        hr,
        valence
    ]])
    return vector


def predict_stress(feature_vector: np.ndarray) -> dict:
    """
    Returns stress score (0–1) and category (low/moderate/high).
    The model outputs class probabilities; we use the 'high' probability
    as a continuous stress score — more informative than a hard label.
    """
    model = load_model()
    classes = model.classes_
    proba = model.predict_proba(feature_vector)[0]
    label = model.predict(feature_vector)[0]

    proba_dict = dict(zip(classes, proba.tolist()))

    # Continuous stress score: weighted sum of class probabilities
    stress_score = (
        0.0 * proba_dict.get('low', 0) +
        0.5 * proba_dict.get('moderate', 0) +
        1.0 * proba_dict.get('high', 0)
    )

    return {
        "stress_score": round(float(stress_score), 4),
        "stress_category": label,
        "class_probabilities": {k: round(v, 4) for k, v in proba_dict.items()}
    }


def analyse_sentiment(text: str) -> float:
    """VADER sentiment compound score: -1.0 (most negative) to +1.0 (most positive)."""
    if not text or len(text.strip()) < 3:
        return 0.0
    analyser = get_sentiment_analyser()
    scores = analyser.polarity_scores(text)
    return round(scores['compound'], 4)
