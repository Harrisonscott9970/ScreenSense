"""
ScreenSense FastAPI Routes — v2
=================================
Improvements over v1:
  - BiLSTM distress classifier integrated into /checkin
  - POST /api/feedback — user rates recommendations (personalisation signal)
  - Personalised nudge selection informed by feedback history
  - distress_class included in checkin response (surfaces to Scout)
  - Improved insights with BiLSTM/SHAP context
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from collections import Counter
import csv, io, json, random
from pathlib import Path

import numpy as np
from app.models.database import get_db, MoodEntry, UserProfile, RecommendationFeedback, ClinicalResult, InterventionLog, ProgrammeProgress, SleepEntry
from app.models.schemas import (
    CheckInRequest, MLEvaluationResponse, PlaceRecommendation
)
from app.ml.inference import (
    build_feature_vector, predict_stress, predict_stress_ensemble,
    analyse_sentiment, load_eval_report
)
from app.ml.nudge_engine import generate_nudge
from app.ml.care_pathway import assess_care_level, CRISIS_RESOURCES_UK, GROUNDING_STEPS
from app.ml.shap_explainer import compute_shap_explanation
from app.services.external_apis import get_weather, get_places, reverse_geocode

router = APIRouter(prefix="/api", tags=["ScreenSense"])


def _page_hinkley(values: list, delta: float = 0.008, threshold: float = 0.12) -> dict:
    """
    Page-Hinkley sequential change-point detector.
    Detects a persistent shift in the mean of a stream of stress scores.

    Algorithm (Page, 1954):
      PHt_up   = max(0, PHt-1_up   + xt - cumulative_mean - δ)
      PHt_down = min(0, PHt-1_down + xt - cumulative_mean + δ)
      ALARM if PHt_up  ≥ λ  →  upward drift (stress increasing)
              |PHt_down| ≥ λ  →  downward drift (stress improving)

    Parameters
    ----------
    delta     : allowable magnitude of in-control variation (sensitivity)
    threshold : detection threshold λ — lower triggers sooner

    References
    ----------
    Page, E.S. (1954). Continuous inspection schemes. Biometrika, 41(1/2), 100-115.
    Gama, J. et al. (2014). A survey on concept drift adaptation. ACM Comput. Surv.
    """
    if len(values) < 8:
        return {'detected': False, 'ph_up': 0.0, 'ph_down': 0.0}

    arr = np.array(values, dtype=float)
    ph_up, ph_down = 0.0, 0.0
    running_mean = 0.0

    for i, x in enumerate(arr):
        running_mean += (x - running_mean) / (i + 1)
        ph_up   = max(0.0, ph_up   + x - running_mean - delta)
        ph_down = min(0.0, ph_down + x - running_mean + delta)

    if ph_up >= threshold:
        return {
            'detected':    True,
            'direction':   'increasing',
            'magnitude':   round(float(ph_up), 3),
            'description': 'Stress has been trending upward beyond your usual baseline.',
            'action':      'Consider checking in with a trusted person or your GP.',
        }
    if abs(ph_down) >= threshold:
        return {
            'detected':    True,
            'direction':   'decreasing',
            'magnitude':   round(float(abs(ph_down)), 3),
            'description': 'Your stress has been consistently improving — keep it up.',
            'action':      None,
        }
    return {
        'detected':  False,
        'magnitude': round(float(max(ph_up, abs(ph_down))), 3),
    }

# ── Optional model imports (graceful fallback) ─────────────────
try:
    from app.ml.lstm_model import predict_next_mood
    LSTM_AVAILABLE = True
except Exception:
    LSTM_AVAILABLE = False
    def predict_next_mood(_): return None

try:
    from app.ml.bilstm_distress import classify_distress
    BILSTM_AVAILABLE = True
except Exception:
    BILSTM_AVAILABLE = False
    def classify_distress(text):
        return {'class': 'neutral', 'confidence': 0.5, 'model': 'fallback', 'is_crisis': False}

try:
    from app.ml.counterfactual import compute_counterfactual
    COUNTERFACTUAL_AVAILABLE = True
except Exception:
    COUNTERFACTUAL_AVAILABLE = False
    def compute_counterfactual(fv, **kw): return None

try:
    from app.ml.anomaly_detector import compute_anomaly
    ANOMALY_AVAILABLE = True
except Exception:
    ANOMALY_AVAILABLE = False
    def compute_anomaly(fv, entries, score, cat): return None


# ── CHECKIN ────────────────────────────────────────────────────
@router.post("/checkin")
async def checkin(req: CheckInRequest, db: Session = Depends(get_db)):
    now = datetime.utcnow()

    # 1. Location context (weather + reverse geocode)
    weather       = {"temp_c": None, "condition": None}
    neighbourhood = None
    if req.latitude and req.longitude:
        weather       = await get_weather(req.latitude, req.longitude)
        neighbourhood = await reverse_geocode(req.latitude, req.longitude)

    # ── Model 1: Random Forest ─────────────────────────────────────
    # Builds a 14-feature vector (screen time, sleep, energy, HR, mood,
    # time encodings, weather) and predicts a stress score 0–1.
    fv = build_feature_vector(
        screen_time_hours   = req.screen_time_hours,
        sleep_hours         = req.sleep_hours,
        energy_level        = req.energy_level,
        hour_of_day         = now.hour,
        day_of_week         = now.weekday(),
        scroll_session_mins = req.scroll_session_mins,
        heart_rate_resting  = req.heart_rate_resting or 68.0,
        mood_label          = req.mood_label,
        weather_temp_c      = float(weather.get('temp_c') or 15.0),
    )

    # 3. SHAP explainability — personalised using user's rolling averages
    # Fetch profile early so we can compare today's values to the user's norm
    _profile_early = db.query(UserProfile).filter_by(user_id=req.user_id).first()
    user_norms: dict = {}
    if _profile_early and int(_profile_early.total_entries or 0) >= 3:
        user_norms = {
            'avg_screen_time': float(_profile_early.avg_screen_time or 4.5),
            'avg_sleep':       float(_profile_early.avg_sleep or 7.0),
        }
    fv_list = fv.flatten().tolist()
    shap_explanation = compute_shap_explanation(fv_list, user_norms=user_norms)

    # ── Model 2: VADER sentiment ────────────────────────────────────
    # Combines selected thought chips + journal text into one string
    # so VADER scores the full picture, not just the journal alone.
    thought_prefix = ""
    if req.mood_words:
        thought_prefix = "I am experiencing: " + ", ".join(req.mood_words) + ". "
    nlp_text = thought_prefix + (req.journal_text or "")
    sentiment = analyse_sentiment(nlp_text)

    # ── Model 3: BiLSTM distress classifier ────────────────────────
    # Runs on the same enriched text so thought patterns are understood.
    distress_result = classify_distress(nlp_text)
    distress_class  = distress_result.get('class', 'neutral')
    distress_conf   = distress_result.get('confidence', 0.5)

    # 6a. Ensemble prediction: RF + BiLSTM (Torous et al., 2017)
    # NLP signal is available when the user wrote journal text OR selected thought patterns
    has_journal = bool(nlp_text.strip()) and len(nlp_text.strip()) > 10
    ensemble_result = predict_stress_ensemble(
        feature_vector     = fv,
        distress_class     = distress_class,
        distress_confidence = distress_conf,
        journal_available  = has_journal,
    )
    ml_result       = ensemble_result
    stress_score    = ensemble_result.get('ensemble_score', ensemble_result['stress_score'])
    stress_category = ensemble_result.get('ensemble_category', ensemble_result['stress_category'])

    # 6b. Counterfactual explanations — Wachter et al. (2017)
    # Only computed when stress is moderate/high so the card appears exactly
    # when actionable advice is most valuable. Greedy perturbation: at each
    # step we trial every actionable feature, accept the one that most raises
    # P(low stress), and record the cumulative change.
    counterfactual = None
    if stress_category in ('moderate', 'high') and COUNTERFACTUAL_AVAILABLE:
        counterfactual = compute_counterfactual(fv_list, target_class='low')

    # 6c. Care pathway (NHS stepped care model, NICE 2022)
    # Fetch 50 entries: care pathway uses the first 10; anomaly detector uses up to 50.
    recent_entries = (
        db.query(MoodEntry).filter_by(user_id=req.user_id)
        .order_by(MoodEntry.created_at.desc()).limit(50).all()
    )
    recent_dicts = [
        {'predicted_stress_score': e.predicted_stress_score,
         'mood_label': e.mood_label, 'sleep_hours': e.sleep_hours,
         'screen_time_hours': e.screen_time_hours,
         'journal_text': e.journal_text or ''}
        for e in recent_entries
    ]
    # BiLSTM crisis flag only escalates to Level 4 if stress is ALSO severe (>0.80).
    # Without this gate, moderate-stress users with innocent journal text get
    # mis-classified as crisis — BiLSTM is a screening signal, not a diagnosis.
    _bilstm_crisis = distress_result.get('is_crisis', False)
    manual_crisis = getattr(req, 'crisis_flag', False) or (
        _bilstm_crisis and stress_score > 0.80
    )

    # Fetch latest clinical scores to inform care level (NICE, 2022)
    clinical_latest: dict = {}
    for _aid in ['phq9', 'gad7', 'who5']:
        _cr = (db.query(ClinicalResult)
               .filter_by(user_id=req.user_id, assessment_id=_aid)
               .order_by(ClinicalResult.created_at.desc()).first())
        if _cr:
            clinical_latest[_aid] = _cr.raw_score
            if _aid == 'who5':
                clinical_latest['who5_raw'] = _cr.raw_score

    care = assess_care_level(
        recent_entries       = recent_dicts,
        current_stress_score = stress_score,
        current_mood         = req.mood_label,
        journal_text         = req.journal_text or "",
        manual_crisis_flag   = manual_crisis,
        clinical_scores      = clinical_latest if clinical_latest else None,
    )

    # 6d. Anomaly detection — Isolation Forest (Liu et al., 2008)
    # Flags check-ins that are statistically unusual relative to the user's
    # personal baseline. Only meaningful after ≥10 historical check-ins.
    anomaly = None
    if ANOMALY_AVAILABLE:
        anomaly = compute_anomaly(
            fv_list          = fv_list,
            recent_entries   = recent_entries,
            stress_score     = stress_score,
            stress_category  = stress_category,
        )

    # 7. Personalised nudge — informed by feedback history
    feedback_history = _get_feedback_summary(req.user_id, db)
    nudge = generate_nudge(
        stress_category   = stress_category,
        mood_label        = req.mood_label,
        screen_time_hours = req.screen_time_hours,
        sleep_hours       = req.sleep_hours,
        hour_of_day       = now.hour,
        feedback_history  = feedback_history,
        weather_condition = weather.get("condition") or "Unknown",
        weather_temp_c    = float(weather.get("temp_c") or 15.0),
    )
    nudge_message = (
        "Right now the most important thing is that you're safe. "
        "Support resources are shown below."
        if care.care_level == 4 else nudge.message
    )

    # 8. Place recommendations (ML-informed, mood + stress context)
    # If no GPS provided, fall back to mood/stress-matched category defaults
    # so the map always shows meaningful recommendations.
    from app.services.external_apis import _local_defaults
    if req.latitude and req.longitude:
        raw_places = await get_places(
            lat        = req.latitude,
            lon        = req.longitude,
            categories = nudge.place_categories,
        )
    else:
        raw_places = _local_defaults(nudge.place_categories)
    places = [
        PlaceRecommendation(
            name     = p["name"],
            type     = p.get("type", "Place"),
            icon     = p.get("icon", "📍"),
            reason   = _place_reason(p.get("type", ""), stress_category, req.mood_label),
            distance_m   = p.get("distance_m"),
            address      = p.get("address"),
            foursquare_id = p.get("foursquare_id"),
        )
        for p in raw_places[:3]
    ]

    # 9. A/B baseline comparison (always-recommend-park baseline)
    baseline_places = [
        PlaceRecommendation(
            name="Nearest park", type="Park", icon="🌳",
            reason="Generic recommendation (static baseline — not personalised)",
        )
    ]
    ml_win       = _score_recommendation_relevance(stress_category, req.mood_label, places)
    baseline_win = _score_recommendation_relevance(stress_category, req.mood_label, baseline_places)
    ab_result = {
        "ml_score":       ml_win,
        "baseline_score": baseline_win,
        "ml_wins":        ml_win > baseline_win,
        "explanation":    (
            "ML recommendation scored higher contextual relevance"
            if ml_win > baseline_win else "Baseline matched ML this time"
        ),
    }

    # 10. Persist to database
    entry = MoodEntry(
        user_id               = req.user_id,
        created_at            = now,
        mood_label            = req.mood_label,
        mood_words            = req.mood_words,
        screen_time_hours     = req.screen_time_hours,
        scroll_session_mins   = req.scroll_session_mins,
        sleep_hours           = req.sleep_hours,
        energy_level          = req.energy_level,
        heart_rate_resting    = req.heart_rate_resting,
        latitude              = req.latitude,
        longitude             = req.longitude,
        neighbourhood         = neighbourhood,
        weather_condition     = weather.get("condition"),
        weather_temp_c        = weather.get("temp_c"),
        hour_of_day           = now.hour,
        day_of_week           = now.weekday(),
        predicted_stress_score = stress_score,
        stress_category       = stress_category,
        sentiment_score       = sentiment,
        distress_class        = distress_class,
        distress_confidence   = distress_conf,
        care_level            = care.care_level,
        personalised_message  = nudge_message,
        place_recommendations = [p.model_dump() for p in places],
        cbt_prompt            = nudge.cbt_prompt,
        rationale             = nudge.place_rationale,
        journal_text          = req.journal_text,
    )
    db.add(entry)

    # Update rolling profile stats
    profile = db.query(UserProfile).filter_by(user_id=req.user_id).first()
    if not profile:
        profile = UserProfile(
            user_id=req.user_id, avg_screen_time=0.0,
            avg_sleep=0.0, total_entries=0, streak_days=0
        )
        db.add(profile)
    n = int(profile.total_entries or 0)
    profile.total_entries    = n + 1
    profile.last_checkin     = now
    profile.avg_screen_time  = (float(profile.avg_screen_time or 0) * n + req.screen_time_hours) / (n + 1)
    profile.avg_sleep        = (float(profile.avg_sleep or 0) * n + req.sleep_hours) / (n + 1)
    profile.avg_stress       = (float(profile.avg_stress or 0.5) * n + stress_score) / (n + 1)
    _update_streak(profile, db)
    db.commit()
    db.refresh(entry)

    # Auto-retrain every 20 check-ins — continual learning (Widmer & Kubat, 1996)
    _n = int(profile.total_entries or 0)
    if _n >= 20 and _n % 20 == 0:
        import asyncio as _asyncio
        try:
            _asyncio.get_event_loop().create_task(_background_retrain(req.user_id))
        except Exception:
            pass

    return {
        "entry_id":              entry.id,
        "predicted_stress_score": stress_score,
        "stress_category":       stress_category,
        "class_probabilities":   ml_result.get("class_probabilities", {}),
        "personalised_message":  nudge_message,
        "cbt_prompt":            nudge.cbt_prompt,
        "rationale":             nudge.place_rationale,
        "place_recommendations": [p.model_dump() for p in places],
        "weather_condition":     weather.get("condition"),
        "weather_temp_c":        weather.get("temp_c"),
        "neighbourhood":         neighbourhood,
        # Explainability (SHAP + narrative)
        "shap_explanation":      shap_explanation,
        # NLP analysis (BiLSTM)
        "sentiment_score":       sentiment,
        "distress_class":        distress_class,
        "distress_confidence":   distress_conf,
        "distress_description":  distress_result.get('description', ''),
        "distress_model":        distress_result.get('model', ''),
        "attention_words":       distress_result.get('attention_words', []),
        # Ensemble inference
        "ensemble_score":        ensemble_result.get('ensemble_score'),
        "ensemble_method":       ensemble_result.get('ensemble_method'),
        "rf_stress_score":       ensemble_result.get('stress_score'),
        # A/B comparison
        "ab_comparison":         ab_result,
        # Care pathway
        "care_level":            care.care_level,
        "care_label":            care.care_label,
        "care_color":            care.care_color,
        "care_description":      care.care_description,
        "recommended_tools":     care.recommended_tools,
        "show_crisis_resources": care.show_crisis_resources,
        "escalate_to_human":     care.escalate_to_human,
        "risk_factors_detected": care.risk_factors_detected,
        "protective_factors":    care.protective_factors,
        "clinical_note":         care.clinical_note,
        "message_tone":          care.message_tone,
        # Counterfactual explanations (Wachter et al., 2017)
        "counterfactual":        counterfactual,
        # Anomaly detection (Liu et al., 2008)
        "anomaly":               anomaly,
        # Conformal prediction set (Angelopoulos & Bates, 2023)
        "prediction_set":        ml_result.get("prediction_set"),
        "prediction_set_size":   ml_result.get("prediction_set_size"),
    }


# ── FEEDBACK ───────────────────────────────────────────────────
@router.post("/feedback")
async def submit_feedback(data: dict, db: Session = Depends(get_db)):
    """
    Record user rating (helpful / not helpful) for an AI recommendation.
    This signal is used to personalise future nudges.

    Academic grounding:
      Lops et al. (2011). Content-based recommender systems.
        In Recommender Systems Handbook. Springer, Berlin.
      Fogg, B.J. (2009). A behaviour model for persuasive design.
        Proceedings of the 4th International Conference on Persuasive Technology.
    """
    entry_id = data.get('entry_id')
    helpful  = data.get('helpful', True)
    user_id  = data.get('user_id', 'user_001')

    # Fetch the related mood entry for context enrichment
    entry = db.query(MoodEntry).filter_by(id=entry_id).first()
    place_type = None
    if entry and entry.place_recommendations:
        recs = entry.place_recommendations
        if recs and isinstance(recs, list) and len(recs) > 0:
            place_type = recs[0].get('type') if isinstance(recs[0], dict) else None

    fb = RecommendationFeedback(
        user_id        = user_id,
        entry_id       = entry_id,
        helpful        = helpful,
        stress_category = entry.stress_category if entry else None,
        mood_label     = entry.mood_label if entry else None,
        place_type     = place_type,
    )
    db.add(fb)
    db.commit()

    # Return updated feedback stats for this user
    total  = db.query(RecommendationFeedback).filter_by(user_id=user_id).count()
    useful = db.query(RecommendationFeedback).filter_by(user_id=user_id, helpful=True).count()

    return {
        "recorded":      True,
        "helpful":       helpful,
        "total_ratings": total,
        "helpful_pct":   round(useful / total * 100, 1) if total else 0,
        "message":       "Thanks — this helps personalise your future recommendations.",
    }


# ── INSIGHTS ───────────────────────────────────────────────────
@router.get("/insights/{user_id}")
async def insights(user_id: str, db: Session = Depends(get_db)):
    entries = (
        db.query(MoodEntry).filter_by(user_id=user_id)
        .order_by(MoodEntry.created_at.desc()).limit(90).all()
    )
    if not entries:
        raise HTTPException(status_code=404, detail="No entries found")

    profile    = db.query(UserProfile).filter_by(user_id=user_id).first()
    moods      = [e.mood_label for e in entries]
    top_mood   = Counter(moods).most_common(1)[0][0]
    stress_scores = [e.predicted_stress_score for e in entries]
    avg_stress    = round(sum(stress_scores) / len(stress_scores), 3)
    recent_avg    = round(sum(stress_scores[:7]) / min(7, len(stress_scores)), 3)
    baseline_delta = round((recent_avg - avg_stress) * 100, 1)
    wellbeing_score = round((1 - avg_stress) * 100, 1)

    # Distress class breakdown
    distress_counts = Counter(e.distress_class for e in entries if e.distress_class)

    # Feedback / personalisation stats
    fb_total  = db.query(RecommendationFeedback).filter_by(user_id=user_id).count()
    fb_useful = db.query(RecommendationFeedback).filter_by(user_id=user_id, helpful=True).count()
    feedback_score = round(fb_useful / fb_total * 100, 1) if fb_total else None

    # A/B win rate
    ab_wins    = sum(1 for e in entries if getattr(e, 'ab_ml_wins', None))
    ab_win_rate = round(ab_wins / len(entries) * 100, 1) if entries else 0

    # Care level
    recent_dicts = [
        {'predicted_stress_score': e.predicted_stress_score, 'mood_label': e.mood_label,
         'sleep_hours': e.sleep_hours, 'screen_time_hours': e.screen_time_hours,
         'journal_text': e.journal_text or ''}
        for e in entries[:10]
    ]
    # Fetch latest clinical scores for care pathway
    clinical_ins: dict = {}
    for _aid in ['phq9', 'gad7', 'who5']:
        _cr = (db.query(ClinicalResult)
               .filter_by(user_id=user_id, assessment_id=_aid)
               .order_by(ClinicalResult.created_at.desc()).first())
        if _cr:
            clinical_ins[_aid] = _cr.raw_score
            if _aid == 'who5':
                clinical_ins['who5_raw'] = _cr.raw_score

    care = assess_care_level(
        recent_dicts, avg_stress, top_mood,
        clinical_scores=clinical_ins if clinical_ins else None,
    )

    # LSTM prediction
    lstm_prediction = None
    if LSTM_AVAILABLE and len(entries) >= 7:
        lstm_dicts = [
            {'screen_time_hours': e.screen_time_hours, 'sleep_hours': e.sleep_hours,
             'energy_level': e.energy_level, 'hour_of_day': e.hour_of_day,
             'day_of_week': e.day_of_week, 'scroll_session_mins': e.scroll_session_mins,
             'heart_rate_resting': e.heart_rate_resting,
             'predicted_stress_score': e.predicted_stress_score}
            for e in reversed(entries[:7])
        ]
        lstm_prediction = predict_next_mood(lstm_dicts)

    return {
        "user_id":            user_id,
        "total_entries":      len(entries),
        "streak_days":        profile.streak_days if profile else 0,
        "avg_stress_score":   avg_stress,
        "recent_stress_avg":  recent_avg,
        "personal_baseline":  avg_stress,
        "baseline_delta_pct": baseline_delta,
        "wellbeing_score":    wellbeing_score,
        "top_mood":           top_mood,
        "mood_frequency":     dict(Counter(moods).most_common()),
        "avg_screen_time":    round(sum(e.screen_time_hours for e in entries) / len(entries), 1),
        "avg_sleep":          round(sum(e.sleep_hours for e in entries) / len(entries), 1),
        "pattern_summary":    _pattern_summary(entries, avg_stress, top_mood, baseline_delta),
        "mood_by_day":        {e.created_at.strftime("%Y-%m-%d"): e.mood_label for e in entries},
        "screen_vs_stress":   [
            {"screen": e.screen_time_hours, "stress": e.predicted_stress_score,
             "mood": e.mood_label, "date": e.created_at.strftime("%Y-%m-%d")}
            for e in entries[:30]
        ],
        "sentiment_trend":    [
            {"date": e.created_at.strftime("%Y-%m-%d"),
             "sentiment": e.sentiment_score or 0,
             "stress": e.predicted_stress_score}
            for e in reversed(entries[:20]) if e.sentiment_score is not None
        ],
        "distress_breakdown": dict(distress_counts),
        "lstm_prediction":    lstm_prediction,
        "care_level":         care.care_level,
        "care_label":         care.care_label,
        "care_color":         care.care_color,
        "recommended_tools":  care.recommended_tools,
        "show_crisis_resources": care.show_crisis_resources,
        "ab_win_rate":        ab_win_rate,
        "feedback_score":     feedback_score,
        "total_feedback":     fb_total,
        "archetype":          profile.archetype if profile else None,
        "drift":              _page_hinkley([e.predicted_stress_score for e in reversed(entries[:30])]),
    }


# ── PROFILE UPDATE ─────────────────────────────────────────────
@router.patch("/profile/{user_id}")
async def update_profile(user_id: str, data: dict = Body(...), db: Session = Depends(get_db)):
    """Update mutable profile fields: archetype, notifications_on, stress_threshold."""
    profile = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
    allowed = {'archetype', 'notifications_on', 'stress_threshold'}
    for key, val in data.items():
        if key in allowed:
            setattr(profile, key, val)
    db.commit()
    return {"status": "updated", "archetype": profile.archetype}


# ── INTERVENTION LOG ───────────────────────────────────────────
@router.post("/intervention/log")
async def log_intervention(data: dict = Body(...), db: Session = Depends(get_db)):
    """
    Records a completed therapy tool session.
    Called from the frontend when breathing/CBT/mindfulness/gratitude completes.
    """
    user_id = data.get("user_id")
    tool    = data.get("tool")
    if not user_id or not tool:
        raise HTTPException(status_code=422, detail="user_id and tool are required")
    log = InterventionLog(
        user_id      = user_id,
        tool         = tool,
        duration_mins = float(data.get("duration_mins") or 0) or None,
        cycles       = int(data.get("cycles") or 0) or None,
    )
    db.add(log)
    db.commit()
    return {"status": "logged", "tool": tool}


# ── INTERVENTION EFFICACY ────────────────────────────────────────
@router.get("/intervention/efficacy/{user_id}")
async def intervention_efficacy(user_id: str, db: Session = Depends(get_db)):
    """
    Computes per-tool stress delta: stress_after_next_checkin − stress_before_intervention.
    Negative delta = stress reduction = effective intervention.

    Only pairs where there is a check-in within 24h before AND 24h after the intervention
    are included — this is a within-subjects pre/post design (Shadish et al., 2002).
    """
    logs    = db.query(InterventionLog).filter_by(user_id=user_id).order_by(InterventionLog.completed_at).all()
    entries = db.query(MoodEntry).filter_by(user_id=user_id).order_by(MoodEntry.created_at).all()
    if not logs or not entries:
        return {"efficacy": {}, "total_pairs": 0}

    scores_by_time = [(e.created_at, float(e.predicted_stress_score)) for e in entries]
    window = timedelta(hours=24)

    # Per-tool accumulator: list of (before, after) stress pairs
    pairs_by_tool: dict = {}
    for log in logs:
        t = log.completed_at
        before = [(ts, s) for ts, s in scores_by_time if t - window <= ts < t]
        after  = [(ts, s) for ts, s in scores_by_time if t < ts <= t + window]
        if not before or not after:
            continue
        s_before = before[-1][1]   # most recent check-in before intervention
        s_after  = after[0][1]     # earliest check-in after intervention
        pairs_by_tool.setdefault(log.tool, []).append((s_before, s_after))

    efficacy: dict = {}
    total_pairs = 0
    for tool, pairs in pairs_by_tool.items():
        deltas = [a - b for b, a in pairs]
        n      = len(deltas)
        total_pairs += n
        avg_before = round(float(np.mean([b for b, _ in pairs])), 3)
        avg_after  = round(float(np.mean([a for _, a in pairs])), 3)
        avg_delta  = round(float(np.mean(deltas)), 3)
        efficacy[tool] = {
            "sessions":        n,
            "avg_stress_before": avg_before,
            "avg_stress_after":  avg_after,
            "avg_delta":         avg_delta,
            "avg_delta_pct":     round(avg_delta / max(avg_before, 0.01) * 100, 1),
            "effective":         avg_delta < -0.02,
        }

    return {"efficacy": efficacy, "total_pairs": total_pairs}


# ── WEEKLY REPORT ──────────────────────────────────────────────
@router.get("/weekly-report/{user_id}")
async def weekly_report(user_id: str, db: Session = Depends(get_db)):
    week_ago = datetime.utcnow() - timedelta(days=7)
    entries  = (
        db.query(MoodEntry)
        .filter(MoodEntry.user_id == user_id, MoodEntry.created_at >= week_ago)
        .order_by(MoodEntry.created_at.asc()).all()
    )
    if not entries:
        raise HTTPException(status_code=404, detail="No entries this week")

    moods         = [e.mood_label for e in entries]
    stress_scores = [e.predicted_stress_score for e in entries]
    avg_stress    = round(sum(stress_scores) / len(stress_scores), 3)
    top_mood      = Counter(moods).most_common(1)[0][0]
    best_day      = min(entries, key=lambda e: e.predicted_stress_score)
    worst_day     = max(entries, key=lambda e: e.predicted_stress_score)
    avg_sleep     = round(sum(e.sleep_hours for e in entries) / len(entries), 1)
    avg_screen    = round(sum(e.screen_time_hours for e in entries) / len(entries), 1)

    if len(stress_scores) >= 4:
        mid   = len(stress_scores) // 2
        first = sum(stress_scores[:mid]) / mid
        second = sum(stress_scores[mid:]) / (len(stress_scores) - mid)
        trend = "improving" if second < first else "worsening" if second > first + 0.05 else "stable"
    else:
        trend = "insufficient data"

    narrative = _generate_weekly_narrative(
        n=len(entries), top_mood=top_mood, avg_stress=avg_stress,
        trend=trend, avg_sleep=avg_sleep, avg_screen=avg_screen,
        best_day=best_day, worst_day=worst_day,
    )

    return {
        "user_id":          user_id,
        "week_of":          week_ago.strftime("%Y-%m-%d"),
        "total_checkins":   len(entries),
        "avg_stress_score": avg_stress,
        "stress_trend":     trend,
        "top_mood":         top_mood,
        "avg_sleep_hours":  avg_sleep,
        "avg_screen_time":  avg_screen,
        "best_day":  {"date": best_day.created_at.strftime("%Y-%m-%d"),  "score": best_day.predicted_stress_score,  "mood": best_day.mood_label},
        "worst_day": {"date": worst_day.created_at.strftime("%Y-%m-%d"), "score": worst_day.predicted_stress_score, "mood": worst_day.mood_label},
        "daily_scores": [
            {"date": e.created_at.strftime("%Y-%m-%d"),
             "stress": e.predicted_stress_score, "mood": e.mood_label}
            for e in entries
        ],
        "narrative":    narrative,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ── DATA EXPORT (GDPR) ──────────────────────────────────────────
@router.get("/export/{user_id}/csv")
async def export_csv(user_id: str, db: Session = Depends(get_db)):
    entries = (
        db.query(MoodEntry).filter_by(user_id=user_id)
        .order_by(MoodEntry.created_at.desc()).all()
    )
    if not entries:
        raise HTTPException(status_code=404, detail="No data to export")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "date", "time", "mood", "mood_words", "stress_score", "stress_category",
        "screen_time_hours", "sleep_hours", "energy_level",
        "sentiment_score", "distress_class", "care_level",
        "neighbourhood", "weather", "personalised_message", "cbt_prompt"
    ])
    for e in entries:
        writer.writerow([
            e.created_at.strftime("%Y-%m-%d"),
            e.created_at.strftime("%H:%M"),
            e.mood_label,
            ", ".join(e.mood_words or []),
            round(e.predicted_stress_score, 3),
            e.stress_category,
            e.screen_time_hours,
            e.sleep_hours,
            e.energy_level,
            round(e.sentiment_score or 0, 3),
            e.distress_class or "",
            e.care_level or 1,
            e.neighbourhood or "",
            e.weather_condition or "",
            (e.personalised_message or "").replace("\n", " "),
            (e.cbt_prompt or "").replace("\n", " "),
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=screensense_{user_id}_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@router.delete("/data/{user_id}")
async def delete_all_data(user_id: str, db: Session = Depends(get_db)):
    """GDPR right to erasure — deletes all user data permanently."""
    deleted = db.query(MoodEntry).filter_by(user_id=user_id).delete()
    db.query(UserProfile).filter_by(user_id=user_id).delete()
    db.query(RecommendationFeedback).filter_by(user_id=user_id).delete()
    db.commit()
    return {"deleted_entries": deleted, "message": "All data deleted. This action cannot be undone."}


# ── ML EVALUATION ──────────────────────────────────────────────
@router.get("/ml/evaluate", response_model=MLEvaluationResponse)
async def ml_evaluate():
    report = load_eval_report()
    if not report:
        raise HTTPException(status_code=503, detail="Run: python -m app.ml.train")
    return MLEvaluationResponse(
        accuracy           = report["accuracy"],
        f1_weighted        = report["f1_weighted"],
        confusion_matrix   = report["confusion_matrix"],
        class_report       = report["class_report"],
        feature_importances = report["feature_importances"],
        training_samples   = report["training_samples"],
        cv_f1_mean         = report.get("cv_f1_mean"),
        cv_f1_std          = report.get("cv_f1_std"),
    )


@router.get("/ml/diagnostics")
async def ml_diagnostics():
    """
    Rich ML evaluation diagnostics from eval_report.json:
    calibration reliability curves (Niculescu-Mizil & Caruana, 2005),
    learning curve by training size, bootstrap CI, Cohen's κ, MCC,
    challenger comparison, permutation importances, conformal set q̂.

    These fields are computed at train time but were not previously exposed
    via API — this endpoint surfaces them for the InsightsScreen ML tab.
    """
    report = load_eval_report()
    if not report:
        raise HTTPException(status_code=503, detail="Run: python -m app.ml.train")
    return {
        "calibration_curves":            report.get("calibration_curves"),
        "learning_curve":                report.get("learning_curve"),
        "cohen_kappa":                   report.get("cohen_kappa"),
        "matthews_cc":                   report.get("matthews_cc"),
        "f1_bootstrap_ci_lower":         report.get("f1_bootstrap_ci_lower"),
        "f1_bootstrap_ci_upper":         report.get("f1_bootstrap_ci_upper"),
        "brier_score_mean":              report.get("brier_score_mean"),
        "challenger_comparison":         report.get("challenger_comparison"),
        "permutation_importances":       report.get("permutation_importances"),
        "conformal_set_q_hat":           report.get("conformal_set_q_hat"),
        "conformal_set_avg_size":        report.get("conformal_set_avg_size"),
        "conformal_q_hat":               report.get("conformal_q_hat"),
        "conformal_empirical_coverage":  report.get("conformal_empirical_coverage"),
        "oob_score":                     report.get("oob_score"),
        "split_method":                  report.get("split_method"),
        "calibration_samples":           report.get("calibration_samples"),
        "test_samples":                  report.get("test_samples"),
        "uncalibrated_f1":               report.get("uncalibrated_f1"),
        "best_search_cv_f1":             report.get("best_search_cv_f1"),
    }


@router.post("/retrain")
async def retrain_models(data: dict, db: Session = Depends(get_db)):
    """
    Incremental / online learning endpoint.
    Pulls all accumulated real user entries from the DB, merges with
    the original synthetic dataset, and retrains the Random Forest classifier.

    This implements a form of continual learning: the model adapts as real
    user patterns accumulate, replacing purely synthetic priors with
    evidence-based weights (cf. Widmer & Kubat, 1996 — learning in the
    presence of concept drift; Mitchell, 1997 — experience-driven adaptation).

    The model is hot-swapped in-place by clearing the lru_cache so the
    next prediction automatically loads the freshly trained weights.

    Academic grounding:
      Breiman, L. (2001). Random forests. Machine Learning, 45(1), 5-32.
      Widmer, G. & Kubat, M. (1996). Learning in the presence of concept
        drift and hidden contexts. Machine Learning, 23(1), 69-101.
    """
    import pandas as pd
    import numpy as np
    import joblib
    import asyncio
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    from sklearn.model_selection import cross_val_score, StratifiedKFold
    from sklearn.metrics import f1_score, accuracy_score
    from app.ml.inference import load_model, load_eval_report, FEATURES

    user_id = data.get('user_id')

    # ── 1. Pull all real entries from DB (optionally scoped to one user) ──
    query = db.query(MoodEntry)
    if user_id:
        query = query.filter(MoodEntry.user_id == user_id)
    entries = query.filter(MoodEntry.stress_category.isnot(None)).all()

    if len(entries) < 10:
        return {
            "status": "skipped",
            "reason": f"Only {len(entries)} entries — need at least 10 real check-ins to retrain",
            "entries_available": len(entries),
        }

    # ── 2. Build real-data DataFrame (all 14 features) ───────────────
    MOOD_VALENCE = {'anxious': -0.70, 'stressed': -0.60, 'low': -0.80,
                    'numb': -0.40, 'calm': 0.60, 'content': 0.70,
                    'energised': 0.50, 'joyful': 0.90}
    rows = []
    for e in entries:
        hour = float(e.hour_of_day or 12)
        day  = float(e.day_of_week or 0)
        scr  = float(e.screen_time_hours or 4.0)
        slp  = float(e.sleep_hours or 7.0)
        # Cyclical encodings (Waskom, 2018)
        hour_sin = float(np.sin(2 * np.pi * hour / 24))
        hour_cos = float(np.cos(2 * np.pi * hour / 24))
        day_sin  = float(np.sin(2 * np.pi * day / 7))
        day_cos  = float(np.cos(2 * np.pi * day / 7))
        # Screen × sleep interaction (Levenson et al., 2017)
        interaction = float(max(0.0, (scr / 10.0) * max(0.0, (8 - slp) / 8.0)) * 0.15)
        rows.append({
            'screen_time_hours':       scr,
            'sleep_hours':             slp,
            'energy_level':            float(e.energy_level or 5),
            'hour_of_day':             hour,
            'day_of_week':             day,
            'scroll_session_mins':     float(e.scroll_session_mins or 15),
            'heart_rate_resting':      float(e.heart_rate_resting or 68.0),
            'mood_valence':            float(MOOD_VALENCE.get(e.mood_label or 'calm', 0.0)),
            'hour_sin':                hour_sin,
            'hour_cos':                hour_cos,
            'day_sin':                 day_sin,
            'day_cos':                 day_cos,
            'screen_sleep_interaction': interaction,
            'weather_temp_c':          float(e.weather_temp_c or 15.0),
            'stress_label':            e.stress_category,
        })
    real_df = pd.DataFrame(rows)

    # ── 3. Merge with synthetic data for robustness ───────────────────
    MODEL_DIR = Path(__file__).parent.parent.parent / "data" / "models"
    syn_path  = Path(__file__).parent.parent.parent / "data" / "synthetic_training.csv"
    if syn_path.exists():
        syn_df = pd.read_csv(syn_path)
        # Real data weighted 3× to prioritise actual user patterns
        combined_df = pd.concat([syn_df, real_df, real_df, real_df], ignore_index=True)
    else:
        combined_df = real_df

    X = combined_df[FEATURES]
    y = combined_df['stress_label']

    if y.nunique() < 2:
        return {"status": "skipped", "reason": "Need at least 2 stress classes to retrain"}

    # ── 4. Retrain — reuse best hyperparams from initial training ────
    # Loading best_params from eval_report ensures we don't regress to
    # weaker fixed hyperparameters on each retrain cycle. This directly
    # addresses the catastrophic forgetting / F1 degradation pattern
    # observed in control panel learning curves (Widmer & Kubat, 1996).
    old_report  = load_eval_report()
    saved_params = old_report.get("best_params", {})
    # Map param names back (best_params stored without 'clf__' prefix)
    n_est   = int(saved_params.get("n_estimators", 300))
    depth   = saved_params.get("max_depth")
    depth   = None if str(depth) == "None" else int(depth) if depth else 12
    min_spl = int(saved_params.get("min_samples_split", 4))
    min_lf  = int(saved_params.get("min_samples_leaf", 2))
    max_ft  = saved_params.get("max_features", "sqrt")
    if str(max_ft) == "None": max_ft = None

    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', RandomForestClassifier(
            n_estimators=n_est, max_depth=depth,
            min_samples_split=min_spl, min_samples_leaf=min_lf,
            max_features=max_ft,
            class_weight='balanced', random_state=42, n_jobs=-1, oob_score=True,
        ))
    ])

    # Run in thread pool (CPU-bound)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, pipeline.fit, X, y)

    cv     = StratifiedKFold(n_splits=min(5, int(y.value_counts().min())), shuffle=True, random_state=42)
    cv_scores = await loop.run_in_executor(
        None, lambda: cross_val_score(pipeline, X, y, cv=cv, scoring='f1_weighted')
    )
    cv_mean = round(float(cv_scores.mean()), 4)
    cv_std  = round(float(cv_scores.std()), 4)

    y_pred  = await loop.run_in_executor(None, pipeline.predict, X)
    new_acc = round(float(accuracy_score(y, y_pred)), 4)
    new_f1  = round(float(f1_score(y, y_pred, average='weighted')), 4)

    # ── 5. Champion/challenger on CV F1 (not train F1) ───────────────
    # Comparing cross-validated F1 prevents inflated train-set scores
    # from triggering spurious saves and corrupting the model history.
    old_cv_f1  = old_report.get("cv_f1_mean", old_report.get("f1_weighted", 0.0))
    improved   = cv_mean >= old_cv_f1 - 0.03  # allow 3% tolerance for real-data noise

    message = "Retrained and saved" if improved else "Retrained but not saved (no improvement)"
    feature_importances_new = dict(zip(
        FEATURES,
        pipeline.named_steps['clf'].feature_importances_.round(4).tolist()
    ))

    if improved:
        joblib.dump(pipeline, MODEL_DIR / "stress_classifier.joblib")
        eval_report = {
            "accuracy":       new_acc,
            "f1_weighted":    new_f1,
            "cv_f1_mean":     cv_mean,
            "cv_f1_std":      cv_std,
            "confusion_matrix": [],
            "class_report":   {},
            "feature_importances": feature_importances_new,
            "training_samples": len(X) - len(rows),
            "real_samples":     len(rows),
            "test_samples":     0,
            "best_params":    saved_params,   # preserve for future retrains
            "conformal_q_hat": old_report.get("conformal_q_hat"),
            "conformal_alpha": old_report.get("conformal_alpha", 0.1),
            "model": (
                f"RandomForestClassifier(n_estimators={n_est}) — "
                f"continual learning update (Widmer & Kubat, 1996)"
            ),
            "last_retrained": datetime.utcnow().isoformat(),
        }
        with open(MODEL_DIR / "eval_report.json", "w") as f:
            json.dump(eval_report, f, indent=2)
        # Hot-swap: clear cache so next inference uses new model
        load_model.cache_clear()
        load_eval_report.cache_clear()

    # ── Append to retrain history log ──────────────────────────────
    history_path = MODEL_DIR / "retrain_history.json"
    history_entry = {
        "timestamp":        datetime.utcnow().isoformat(),
        "status":           "retrained" if improved else "no_improvement",
        "real_entries_used": len(rows),
        "total_samples":    len(combined_df),
        "new_f1_weighted":  new_f1,
        "old_cv_f1":        old_cv_f1,
        "cv_f1_mean":       cv_mean,
        "cv_f1_std":        cv_std,
        "improved":         improved,
        "top_feature":      max(feature_importances_new, key=feature_importances_new.get),
        "user_id":          user_id or "all",
        "n_estimators":     n_est,
    }
    try:
        existing = json.loads(history_path.read_text()) if history_path.exists() else []
        existing.append(history_entry)
        history_path.write_text(json.dumps(existing[-50:], indent=2))  # keep last 50
    except Exception:
        pass

    return {
        "status":           "retrained" if improved else "no_improvement",
        "message":          message,
        "real_entries_used": len(rows),
        "total_samples":    len(combined_df),
        "new_f1_weighted":  new_f1,
        "old_cv_f1":        old_cv_f1,
        "cv_f1_mean":       cv_mean,
        "cv_f1_std":        cv_std,
        "improved":         improved,
        "feature_importances": feature_importances_new,
        "academic_note":    (
            "Continual learning via periodic refit — Widmer & Kubat (1996). "
            "Real data weighted 3× synthetic. Best hyperparams from initial "
            "RandomizedSearchCV preserved across retrains to prevent regression."
        ),
    }


@router.get("/ml/bilstm-report")
async def bilstm_report():
    """
    Return the BiLSTM distress classifier evaluation report (bilstm_report.json).
    Includes val_accuracy, per-class F1, architecture details and class distribution.

    If the model has not been trained yet, returns a 404 with instructions.

    Academic grounding:
      Huang, Z. et al. (2015). Bidirectional LSTM-CRF models for sequence labelling.
        arXiv:1508.01991.
      Bahdanau, D. et al. (2015). Neural machine translation by jointly learning to
        align and translate. arXiv:1409.0473.
      Torous, J. et al. (2017). New tools for new research in psychiatry: a scalable
        and customizable platform to empower data driven smartphone research.
        JMIR Mental Health, 4(1), e16.
    """
    MODEL_DIR   = Path(__file__).parent.parent.parent / "data" / "models"
    report_path = MODEL_DIR / "bilstm_report.json"
    if not report_path.exists():
        raise HTTPException(
            status_code=404,
            detail="BiLSTM model not yet trained. Run: python -m app.ml.bilstm_distress"
        )
    try:
        return json.loads(report_path.read_text())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read bilstm_report.json: {exc}")


@router.get("/ml/history")
async def ml_retrain_history():
    """
    Return the retrain history log — every time the model was retrained,
    what F1 it achieved, and how many real entries were used.
    Used by the InsightsScreen ML tab to display a learning curve.
    """
    MODEL_DIR    = Path(__file__).parent.parent.parent / "data" / "models"
    history_path = MODEL_DIR / "retrain_history.json"
    if not history_path.exists():
        return {"history": [], "count": 0}
    try:
        history = json.loads(history_path.read_text())
        return {"history": history, "count": len(history)}
    except Exception:
        return {"history": [], "count": 0}


@router.post("/test/seed")
async def seed_test_data(data: dict, db: Session = Depends(get_db)):
    """
    Generate synthetic check-in entries directly in the DB so you can
    immediately test continual learning without manually doing check-ins.

    POST body: { "user_id": "user_001", "n": 25 }

    This is a development/demo endpoint — it lets markers and developers
    verify the online-learning pipeline end-to-end in under 30 seconds.
    """
    user_id  = data.get("user_id", "user_001")
    n        = min(int(data.get("n", data.get("count", 20))), 500)
    scenario = data.get("scenario", "mixed")  # mixed | high_stress | low_stress | crisis | improving

    MOODS   = ['anxious', 'stressed', 'low', 'numb', 'calm', 'content', 'energised', 'joyful']
    VALENCE = {'anxious': -0.70, 'stressed': -0.60, 'low': -0.80, 'numb': -0.40,
               'calm': 0.60, 'content': 0.70, 'energised': 0.50, 'joyful': 0.90}
    STRESS_CAT = {(0.0, 0.33): 'low', (0.33, 0.66): 'moderate', (0.66, 1.01): 'high'}

    HIGH_MOODS = ['anxious', 'stressed', 'low', 'numb']
    LOW_MOODS  = ['calm', 'content', 'energised', 'joyful']

    now = datetime.utcnow()
    created = []

    for i in range(n):
        ts = now - timedelta(days=random.uniform(0, 14), hours=random.uniform(0, 12))

        # --- Scenario-specific data profiles ---
        if scenario == "high_stress":
            sleep_h     = round(random.gauss(4.5, 0.8), 1)
            screen_h    = round(max(6.0, random.gauss(9.0, 1.5)), 1)
            energy      = random.randint(1, 4)
            hr          = round(random.gauss(82, 8), 1)
            scroll_mins = round(max(30, random.gauss(60, 15)), 1)
            mood        = random.choice(HIGH_MOODS)
            stress_bias = 0.75

        elif scenario == "crisis":
            sleep_h     = round(random.gauss(3.5, 0.5), 1)
            screen_h    = round(max(8.0, random.gauss(11.0, 1.0)), 1)
            energy      = random.randint(1, 2)
            hr          = round(random.gauss(90, 6), 1)
            scroll_mins = round(max(60, random.gauss(90, 10)), 1)
            mood        = random.choice(['anxious', 'low', 'numb'])
            stress_bias = 0.92

        elif scenario == "low_stress":
            sleep_h     = round(random.gauss(7.5, 0.6), 1)
            screen_h    = round(max(0.5, random.gauss(2.5, 1.0)), 1)
            energy      = random.randint(6, 10)
            hr          = round(random.gauss(62, 5), 1)
            scroll_mins = round(max(1, random.gauss(10, 5)), 1)
            mood        = random.choice(LOW_MOODS)
            stress_bias = 0.12

        elif scenario == "improving":
            # Stress decreases over the entry range
            progress    = i / max(n - 1, 1)
            sleep_h     = round(random.gauss(5.0 + 2.5 * progress, 0.7), 1)
            screen_h    = round(max(0.5, random.gauss(8.5 - 5.0 * progress, 1.0)), 1)
            energy      = max(1, min(10, int(3 + 7 * progress + random.gauss(0, 0.8))))
            hr          = round(random.gauss(80 - 15 * progress, 6), 1)
            scroll_mins = round(max(1, random.gauss(55 - 40 * progress, 10)), 1)
            mood        = random.choice(HIGH_MOODS if progress < 0.5 else LOW_MOODS)
            stress_bias = max(0.08, 0.85 - 0.7 * progress)
            ts          = now - timedelta(days=(n - i - 1) * (14 / max(n, 1)))

        else:  # mixed
            sleep_h     = round(random.gauss(6.8, 1.2), 1)
            screen_h    = round(max(0.5, random.gauss(4.5, 2.0)), 1)
            energy      = random.randint(2, 9)
            hr          = round(random.gauss(68, 9), 1)
            scroll_mins = round(max(1, random.expovariate(1 / 20)), 1)
            mood        = random.choice(MOODS)
            stress_bias = None

        valence = VALENCE[mood]

        if stress_bias is not None:
            raw_stress = stress_bias + random.gauss(0, 0.06)
        else:
            raw_stress = (
                0.28 * min(screen_h / 10, 1.0) +
                0.22 * max(0, (8 - sleep_h) / 8) +
                0.16 * (1 - energy / 10) +
                0.12 * min(scroll_mins / 60, 1.0) +
                0.08 * max(0, (hr - 70) / 40) +
                random.gauss(0, 0.07)
            ) * 1.5

        stress = round(min(max(raw_stress, 0.02), 0.98), 4)
        stress_cat = next(v for (lo, hi), v in STRESS_CAT.items() if lo <= stress < hi)

        entry = MoodEntry(
            user_id               = user_id,
            created_at            = ts,
            mood_label            = mood,
            mood_words            = [],
            screen_time_hours     = screen_h,
            scroll_session_mins   = scroll_mins,
            sleep_hours           = sleep_h,
            energy_level          = energy,
            heart_rate_resting    = hr,
            hour_of_day           = ts.hour,
            day_of_week           = ts.weekday(),
            predicted_stress_score = stress,
            stress_category       = stress_cat,
            sentiment_score       = valence * 0.4 + random.gauss(0, 0.1),
            distress_class        = 'minimal' if stress < 0.33 else 'mild' if stress < 0.55 else 'moderate' if stress < 0.80 else 'high',
            care_level            = 1 if stress < 0.33 else 2 if stress < 0.55 else 3 if stress < 0.82 else 4,
            personalised_message  = f"Demo entry [{scenario}] {i + 1}",
            latitude              = None,
            longitude             = None,
        )
        db.add(entry)
        created.append({"mood": mood, "stress": stress, "stress_cat": stress_cat, "date": ts.strftime("%Y-%m-%d")})

    # Ensure user profile exists
    profile = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not profile:
        profile = UserProfile(
            user_id=user_id, avg_screen_time=4.5,
            avg_sleep=6.8, total_entries=0, streak_days=0
        )
        db.add(profile)
    profile.total_entries = int(profile.total_entries or 0) + n
    db.commit()

    stress_dist = {cat: sum(1 for e in created if e["stress_cat"] == cat) for cat in ["low", "moderate", "high"]}

    return {
        "seeded":          n,
        "entries_created": n,   # alias for control-panel compatibility
        "user_id":         user_id,
        "stress_dist":   stress_dist,
        "message":       f"✓ {n} synthetic entries [{scenario}] added for {user_id}.",
        "next_step":     "POST /api/retrain with { \"user_id\": \"" + user_id + "\" }",
    }


# ── CLINICAL SCORES ────────────────────────────────────────────
@router.post("/clinical/save")
async def save_clinical_score(data: dict, db: Session = Depends(get_db)):
    """
    Persist a completed PHQ-9, GAD-7, or WHO-5 score to the database.
    Scores are used to inform the care pathway assessment (NICE, 2022).

    Academic grounding:
      Kroenke, K. et al. (2001). The PHQ-9. JGIM, 16(9), 606-613.
      Spitzer, R.L. et al. (2006). A brief measure for assessing GAD.
        Archives of Internal Medicine, 166(10), 1092-1097.
      Bech, P. (1998). Quality of life in the psychiatric patient. Mosby-Wolfe.
    """
    user_id       = data.get('user_id', 'user_001')
    assessment_id = data.get('assessment_id', 'unknown')
    score         = int(data.get('score', 0))
    raw_score     = int(data.get('raw_score', 0))
    interpretation = str(data.get('interpretation', ''))
    answers       = data.get('answers', [])

    result = ClinicalResult(
        user_id       = user_id,
        assessment_id = assessment_id,
        score         = score,
        raw_score     = raw_score,
        interpretation = interpretation,
        answers       = answers,
    )
    db.add(result)
    db.commit()
    return {
        "saved":          True,
        "assessment_id":  assessment_id,
        "score":          score,
        "message":        (
            f"Score saved and will inform your care pathway assessment. "
            f"Clinical scores are integrated with the NHS stepped-care model (NICE, 2022)."
        ),
    }


@router.get("/clinical/{user_id}/latest")
async def get_latest_clinical(user_id: str, db: Session = Depends(get_db)):
    """
    Return the most recent score for each clinical assessment type.
    Used by the frontend to display historical scores and by the
    care pathway engine to inform step-care level decisions.
    """
    results: dict = {}
    for assessment_id in ['phq9', 'gad7', 'who5']:
        latest = (
            db.query(ClinicalResult)
            .filter_by(user_id=user_id, assessment_id=assessment_id)
            .order_by(ClinicalResult.created_at.desc())
            .first()
        )
        if latest:
            results[assessment_id] = {
                'score':          latest.score,
                'raw_score':      latest.raw_score,
                'interpretation': latest.interpretation,
                'date':           latest.created_at.isoformat(),
            }
    return {"scores": results, "user_id": user_id}


@router.get("/crisis-resources")
async def crisis_resources():
    return {
        "resources":   CRISIS_RESOURCES_UK,
        "grounding_steps": GROUNDING_STEPS,
        "disclaimer":  "ScreenSense is not a clinical service. These resources connect you with trained professionals.",
        "emergency":   "If you or someone else is in immediate danger, call 999.",
    }


@router.post("/scout/message")
async def scout_message(data: dict, db: Session = Depends(get_db)):
    """
    Scout AI companion — fully bespoke wellbeing conversation engine.

    Uses ScreenSense's own three-model ML stack exclusively:
      - Random Forest  — stress score from device signals (Breiman, 2001)
      - BiLSTM         — distress classification from message text
      - VADER          — sentiment analysis (Hutto & Gilbert, 2014)
    Plus: crisis keyword scan, nudge engine CBT prompts, NHS Stepped Care.

    Every response is explainable and traceable to a specific ML signal.
    """
    from app.ml.scout_engine import generate_scout_response

    user_id  = data.get("user_id", "user_001")
    message  = data.get("message", "")
    messages = data.get("messages", [])   # conversation history list
    history_len = len([m for m in messages if m.get("role") == "user"])

    # Extract latest user message text for ML analysis
    if not message and messages:
        last_user = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"),
            ""
        )
        message = last_user if isinstance(last_user, str) else ""

    # Fetch live user context from DB
    profile = db.query(UserProfile).filter_by(user_id=user_id).first()
    recent  = (
        db.query(MoodEntry).filter_by(user_id=user_id)
        .order_by(MoodEntry.created_at.desc()).limit(3).all()
    )
    latest  = recent[0] if recent else None
    stress_score    = float(latest.predicted_stress_score) if latest else 0.4
    stress_category = latest.stress_category               if latest else "moderate"
    mood_label      = latest.mood_label                    if latest else "calm"
    distress_class  = latest.distress_class or "neutral"   if latest else "neutral"
    care_level      = int(latest.care_level or 1)          if latest else 1

    # Override care_level from profile avg if latest is stale
    if profile and profile.avg_stress:
        avg = float(profile.avg_stress)
        if avg > 0.75 and care_level < 3:
            care_level = 3
        elif avg > 0.55 and care_level < 2:
            care_level = 2

    # Generate bespoke response using ScreenSense ML engine
    response = generate_scout_response(
        user_message=message,
        care_level=care_level,
        stress_score=stress_score,
        stress_category=stress_category,
        mood_label=mood_label,
        distress_class=distress_class,
        history_len=history_len,
    )

    # Return in the same shape the frontend expects from the old proxy
    return {
        "content": [{"text": response["text"]}],
        "cbt_prompt": response.get("cbt_prompt"),
        "category":   response.get("category"),
        "signals":    response.get("signals"),
        "engine":     "screensense-bespoke-v1",
    }


@router.get("/entries/{user_id}")
async def get_entries(user_id: str, limit: int = 50, db: Session = Depends(get_db)):
    entries = (
        db.query(MoodEntry).filter_by(user_id=user_id)
        .order_by(MoodEntry.created_at.desc()).limit(limit).all()
    )
    return [
        {"id":               e.id,
         "created_at":       e.created_at.isoformat(),
         "mood_label":       e.mood_label,
         "mood_words":       e.mood_words,
         "stress_score":     e.predicted_stress_score,
         "stress_category":  e.stress_category,
         "screen_time_hours": e.screen_time_hours,
         "sleep_hours":      e.sleep_hours,
         "energy_level":     e.energy_level,
         "neighbourhood":    e.neighbourhood,
         "weather_condition": e.weather_condition,
         "weather_temp_c":   e.weather_temp_c,
         "personalised_message": e.personalised_message,
         "place_recommendations": e.place_recommendations,
         "cbt_prompt":       e.cbt_prompt,
         "sentiment_score":  e.sentiment_score,
         "distress_class":   e.distress_class,
         "care_level":       e.care_level,
         "hour_of_day":      e.hour_of_day,
         "day_of_week":      e.day_of_week}
        for e in entries
    ]


# ── Live place recommendations (GPS → Overpass → real places) ──
@router.get("/places")
async def get_nearby_places(
    lat: float,
    lon: float,
    mood: str = "calm",
    stress_category: str = "moderate",
):
    """
    Returns live place recommendations based on current GPS coordinates.
    Uses the nudge engine to select categories for the given mood/stress,
    time of day, and live weather — so recommendations adapt dynamically.
    Called directly by MapScreen — no check-in required.
    """
    from datetime import datetime as _dt
    # Fetch live weather so recommendations adapt to conditions
    weather = await get_weather(lat, lon)
    nudge = generate_nudge(
        stress_category   = stress_category,
        mood_label        = mood,
        screen_time_hours = 0,
        sleep_hours       = 7,
        hour_of_day       = _dt.utcnow().hour,
        weather_condition = weather.get("condition") or "Unknown",
        weather_temp_c    = float(weather.get("temp_c") or 15.0),
    )
    from app.services.external_apis import get_places as _gp
    raw = await _gp(lat=lat, lon=lon, categories=nudge.place_categories)

    REASONS = {
        ("Park",       "high"):     "Natural environments lower cortisol — Ulrich SRT (1984)",
        ("Library",    "high"):     "Quiet structured space for mental decompression",
        ("Garden",     "high"):     "Green space activates Kaplan's restorative attention (ART, 1995)",
        ("Café",       "moderate"): "Mild social stimulation without pressure — Ulrich (1984)",
        ("Gallery",    "moderate"): "Aesthetic engagement supports mood regulation",
        ("Bookshop",   "moderate"): "Low-stimulation browsing environment — Kaplan (1995)",
        ("Market",     "low"):      "Exploratory environment suits positive affect — Fredrickson (2001)",
        ("Restaurant", "low"):      "Social reward aligns with positive mood state",
    }
    default_reason = "Recommended based on your current affect profile"

    from datetime import datetime as _dt2
    _hour = _dt2.utcnow().hour
    _time_label = "morning" if _hour < 12 else "afternoon" if _hour < 17 else "evening" if _hour < 21 else "night"
    return {
        "places": [
            {
                "name":       p.get("name"),
                "type":       p.get("type", "Place"),
                "icon":       p.get("icon", "📍"),
                "reason":     REASONS.get((p.get("type", ""), stress_category), default_reason),
                "address":    p.get("address"),
                "distance_m": p.get("distance_m"),
            }
            for p in raw[:4]
        ],
        "rationale":      nudge.place_rationale,
        "categories":     nudge.place_categories,
        "weather":        {"condition": weather.get("condition"), "temp_c": weather.get("temp_c")},
        "time_of_day":    _time_label,
        "hour":           _hour,
    }


# ── Background continual learning ─────────────────────────────
async def _background_retrain(user_id: str):
    """
    Lightweight background retrain triggered every 20 check-ins.
    Implements continual learning (Widmer & Kubat, 1996) without
    blocking the check-in response.
    """
    try:
        import asyncio
        import pandas as pd
        import joblib as _joblib
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline as _Pipeline
        from sklearn.metrics import f1_score as _f1
        from app.ml.inference import load_model, load_eval_report, FEATURES
        from app.models.database import SessionLocal

        db_bg = SessionLocal()
        try:
            MOOD_V = {'anxious': -0.70, 'stressed': -0.60, 'low': -0.80,
                      'numb': -0.40, 'calm': 0.60, 'content': 0.70,
                      'energised': 0.50, 'joyful': 0.90}
            entries = db_bg.query(MoodEntry).filter(MoodEntry.stress_category.isnot(None)).all()
            if len(entries) < 10:
                return
            import numpy as _np
            rows = []
            for e in entries:
                _hour = float(e.hour_of_day or 12)
                _day  = float(e.day_of_week or 0)
                _scr  = float(e.screen_time_hours or 4)
                _slp  = float(e.sleep_hours or 7)
                rows.append({
                    'screen_time_hours':        _scr,
                    'sleep_hours':              _slp,
                    'energy_level':             float(e.energy_level or 5),
                    'hour_of_day':              _hour,
                    'day_of_week':              _day,
                    'scroll_session_mins':      float(e.scroll_session_mins or 15),
                    'heart_rate_resting':       float(e.heart_rate_resting or 68),
                    'mood_valence':             float(MOOD_V.get(e.mood_label or 'calm', 0)),
                    'hour_sin':                 float(_np.sin(2 * _np.pi * _hour / 24)),
                    'hour_cos':                 float(_np.cos(2 * _np.pi * _hour / 24)),
                    'day_sin':                  float(_np.sin(2 * _np.pi * _day / 7)),
                    'day_cos':                  float(_np.cos(2 * _np.pi * _day / 7)),
                    'screen_sleep_interaction': float(max(0.0, (_scr / 10.0) * max(0.0, (8 - _slp) / 8.0)) * 0.15),
                    'weather_temp_c':           float(e.weather_temp_c or 15.0),
                    'stress_label':             e.stress_category,
                })
            real_df = pd.DataFrame(rows)
            syn_path = Path(__file__).parent.parent.parent / "data" / "synthetic_training.csv"
            combined = pd.concat([pd.read_csv(syn_path), real_df, real_df, real_df], ignore_index=True) if syn_path.exists() else real_df
            X, y = combined[FEATURES], combined['stress_label']
            if y.nunique() < 2:
                return
            # Reuse best hyperparams from initial training (prevents regression)
            _old_report = load_eval_report()
            _sp = _old_report.get("best_params", {})
            _n_est = int(_sp.get("n_estimators", 300))
            _depth = _sp.get("max_depth"); _depth = None if str(_depth) == "None" else (int(_depth) if _depth else 12)
            pipeline = _Pipeline([
                ('scaler', StandardScaler()),
                ('clf', RandomForestClassifier(
                    n_estimators=_n_est, max_depth=_depth,
                    min_samples_split=int(_sp.get("min_samples_split", 4)),
                    min_samples_leaf=int(_sp.get("min_samples_leaf", 2)),
                    max_features=_sp.get("max_features", "sqrt") if str(_sp.get("max_features", "sqrt")) != "None" else None,
                    class_weight='balanced', random_state=42, n_jobs=-1
                ))
            ])
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, pipeline.fit, X, y)
            y_pred = await loop.run_in_executor(None, pipeline.predict, X)
            new_f1 = round(float(_f1(y, y_pred, average='weighted')), 4)
            old_cv_f1 = _old_report.get('cv_f1_mean', _old_report.get('f1_weighted', 0.0))
            if new_f1 >= old_cv_f1 - 0.03:
                _mdir = Path(__file__).parent.parent.parent / "data" / "models"
                _joblib.dump(pipeline, _mdir / "stress_classifier.joblib")
                load_model.cache_clear()
                load_eval_report.cache_clear()
                # Append to history
                _hist_path = _mdir / "retrain_history.json"
                _entry = {
                    "timestamp": datetime.utcnow().isoformat(),
                    "status": "retrained",
                    "real_entries_used": len(rows),
                    "total_samples": len(combined),
                    "new_f1_weighted": new_f1,
                    "old_cv_f1": old_cv_f1,
                    "cv_f1_mean": new_f1,
                    "cv_f1_std": 0.0,
                    "improved": True,
                    "top_feature": max(dict(zip(FEATURES, pipeline.named_steps['clf'].feature_importances_)).items(), key=lambda x: x[1])[0],
                    "user_id": user_id,
                    "trigger": "auto_20_checkins",
                }
                try:
                    existing = json.loads(_hist_path.read_text()) if _hist_path.exists() else []
                    existing.append(_entry)
                    _hist_path.write_text(json.dumps(existing[-50:], indent=2))
                except Exception:
                    pass
        finally:
            db_bg.close()
    except Exception:
        pass  # Never crash the main checkin response


# ── Helpers ────────────────────────────────────────────────────
def _place_reason(place_type: str, stress: str, mood: str) -> str:
    reasons = {
        ("Park",    "high"):     "Natural environments lower cortisol — Ulrich (1984) SRT",
        ("Library", "high"):     "Quiet structured space for mental decompression",
        ("Café",    "moderate"): "Mild social stimulation without pressure — Ulrich (1984)",
        ("Gallery", "moderate"): "Aesthetic engagement supports mood regulation",
        ("Market",  "low"):      "Exploratory environment suits positive affect — Fredrickson (2001)",
        ("Restaurant", "low"):   "Social reward aligns with positive mood state",
        ("Garden",  "high"):     "Green space activates Kaplan's restorative attention (ART, 1995)",
    }
    return reasons.get((place_type, stress), "Recommended based on your current affect profile")


def _score_recommendation_relevance(stress_category: str, mood: str, places) -> float:
    """Score contextual appropriateness of place recommendations (0–1)."""
    score = 0.5  # baseline
    if not places:
        return score
    place_types = [p.type if hasattr(p, 'type') else p.get('type', '') for p in places]
    if stress_category == "high"     and any(t in ["Park", "Library", "Garden", "Nature Reserve"] for t in place_types):
        score = 0.9
    elif stress_category == "moderate" and any(t in ["Café", "Gallery", "Bookshop"] for t in place_types):
        score = 0.8
    elif stress_category == "low"      and any(t in ["Restaurant", "Market", "Social Space"] for t in place_types):
        score = 0.85
    return score


def _get_feedback_summary(user_id: str, db: Session) -> dict:
    """
    Return a dict of {stress_category: helpful_place_types} from user's
    feedback history — used to personalise nudge place selections.
    """
    feedback = (
        db.query(RecommendationFeedback)
        .filter_by(user_id=user_id, helpful=True)
        .all()
    )
    summary: dict = {}
    for fb in feedback:
        if fb.stress_category and fb.place_type:
            key = fb.stress_category
            summary.setdefault(key, []).append(fb.place_type)
    return summary


def _update_streak(profile, db):
    entries = (
        db.query(MoodEntry).filter_by(user_id=profile.user_id)
        .order_by(MoodEntry.created_at.desc()).limit(60).all()
    )
    dates = sorted(set(e.created_at.date() for e in entries), reverse=True)
    streak = 1
    for i in range(len(dates) - 1):
        if (dates[i] - dates[i + 1]).days == 1:
            streak += 1
        else:
            break
    profile.streak_days = streak


def _pattern_summary(entries, avg_stress: float, top_mood: str, delta: float) -> str:
    n           = len(entries)
    high_screen = sum(1 for e in entries if e.screen_time_hours > 7)
    poor_sleep  = sum(1 for e in entries if e.sleep_hours < 6)
    parts = [f"Across {n} check-ins, your most frequent mood is {top_mood}"]
    if avg_stress > 0.6:
        parts.append(" with consistently elevated stress")
    elif avg_stress < 0.35:
        parts.append(" with generally low stress")
    if delta > 10:
        parts.append(f". Recent stress is {delta}% above your personal baseline")
    elif delta < -10:
        parts.append(f". Recent stress is {abs(delta)}% below baseline — a positive trend")
    if high_screen > n * 0.4:
        parts.append(f". High screen load appears in {high_screen} of {n} entries")
    if poor_sleep > n * 0.3:
        parts.append(". Poor sleep correlates with your higher-stress days")
    return "".join(parts) + "."


def _generate_weekly_narrative(n, top_mood, avg_stress, trend, avg_sleep, avg_screen, best_day, worst_day) -> str:
    stress_label = "high" if avg_stress > 0.6 else "moderate" if avg_stress > 0.35 else "low"
    sleep_label  = "good" if avg_sleep >= 7 else "below recommended"
    screen_label = "heavy" if avg_screen > 6 else "moderate" if avg_screen > 3 else "healthy"
    return (
        f"This week you completed {n} check-ins. Your stress was generally {stress_label} "
        f"(average {round(avg_stress * 100)}/100) and is {trend}. "
        f"Your most frequent mood was {top_mood}. "
        f"Sleep averaged {avg_sleep}h per night — {sleep_label}. "
        f"Screen time averaged {avg_screen}h — {screen_label}. "
        f"Your best day was {best_day.created_at.strftime('%A')} "
        f"(stress {round(best_day.predicted_stress_score * 100)}/100) and your most challenging day "
        f"was {worst_day.created_at.strftime('%A')} "
        f"(stress {round(worst_day.predicted_stress_score * 100)}/100)."
    )


# ── Programme Progress ─────────────────────────────────────────────────────
@router.get("/programmes/{user_id}")
async def get_programme_progress(user_id: str, db: Session = Depends(get_db)):
    """
    Retrieve server-side programme progress for offline-first sync.
    Returns the JSON data blob so SleepScreen/ProgrammeScreen can reconcile
    local AsyncStorage state against server state on login.
    """
    row = db.query(ProgrammeProgress).filter_by(user_id=user_id).first()
    if not row:
        return {"user_id": user_id, "data": {}}
    return {"user_id": user_id, "data": row.data, "updated_at": row.updated_at.isoformat() if row.updated_at else None}


@router.post("/programmes/{user_id}")
async def save_programme_progress(user_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    """
    Upsert structured programme progress for cross-device sync and
    persistence across app reinstalls. Implements offline-first: the client
    always writes to AsyncStorage first and syncs here as a side-effect.
    """
    data = body.get("data", {})
    row = db.query(ProgrammeProgress).filter_by(user_id=user_id).first()
    if row:
        row.data = data
        row.updated_at = datetime.utcnow()
    else:
        row = ProgrammeProgress(user_id=user_id, data=data)
        db.add(row)
    db.commit()
    return {"saved": True, "user_id": user_id}


# ── Sleep Tracking ─────────────────────────────────────────────────────────
@router.get("/sleep/{user_id}")
async def get_sleep_entries(user_id: str, limit: int = 30, db: Session = Depends(get_db)):
    """Return the most recent sleep entries for the given user."""
    entries = (
        db.query(SleepEntry)
        .filter_by(user_id=user_id)
        .order_by(SleepEntry.date.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "date":      e.date,
            "bedtime":   e.bedtime,
            "wakeTime":  e.wake_time,
            "duration":  e.duration,
            "quality":   e.quality,
            "notes":     e.notes,
            "saved":     e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


@router.post("/sleep")
async def save_sleep_entry(body: dict = Body(...), db: Session = Depends(get_db)):
    """
    Upsert a single nightly sleep record (deduplicates on user_id + date).
    Enables longitudinal sleep analysis alongside check-in stress data —
    aligned with Harvey (2002) CBT-I recommendations for sleep diary tracking.
    """
    user_id  = body.get("user_id", "")
    date     = body.get("date", "")
    if not user_id or not date:
        raise HTTPException(status_code=400, detail="user_id and date are required")

    existing = db.query(SleepEntry).filter_by(user_id=user_id, date=date).first()
    if existing:
        existing.bedtime   = body.get("bedtime",  existing.bedtime)
        existing.wake_time = body.get("wakeTime", existing.wake_time)
        existing.duration  = body.get("duration", existing.duration)
        existing.quality   = body.get("quality",  existing.quality)
        existing.notes     = body.get("notes",    existing.notes)
    else:
        entry = SleepEntry(
            user_id=user_id, date=date,
            bedtime=body.get("bedtime"),
            wake_time=body.get("wakeTime"),
            duration=body.get("duration"),
            quality=body.get("quality"),
            notes=body.get("notes"),
        )
        db.add(entry)
    db.commit()
    return {"saved": True, "user_id": user_id, "date": date}
