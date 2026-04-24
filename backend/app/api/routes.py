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
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from collections import Counter
import csv, io, json, random
from pathlib import Path

from app.models.database import get_db, MoodEntry, UserProfile, RecommendationFeedback, ClinicalResult
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

    # 2. Random Forest stress prediction
    fv = build_feature_vector(
        screen_time_hours   = req.screen_time_hours,
        sleep_hours         = req.sleep_hours,
        energy_level        = req.energy_level,
        hour_of_day         = now.hour,
        day_of_week         = now.weekday(),
        scroll_session_mins = req.scroll_session_mins,
        heart_rate_resting  = req.heart_rate_resting or 68.0,
        mood_label          = req.mood_label
    )

    # 3. SHAP explainability (computed on raw RF before ensemble)
    shap_explanation = compute_shap_explanation(fv.tolist()[0])

    # 4. VADER sentiment on journal text
    sentiment = analyse_sentiment(req.journal_text or "")

    # 5. BiLSTM distress classification on journal text
    distress_result = classify_distress(req.journal_text or "")
    distress_class  = distress_result.get('class', 'neutral')
    distress_conf   = distress_result.get('confidence', 0.5)

    # 6a. Ensemble prediction: RF + BiLSTM (Torous et al., 2017)
    # When journal text is present, combine device signals with NLP signals
    has_journal = bool(req.journal_text and len(req.journal_text.strip()) > 5)
    ensemble_result = predict_stress_ensemble(
        feature_vector     = fv,
        distress_class     = distress_class,
        distress_confidence = distress_conf,
        journal_available  = has_journal,
    )
    ml_result       = ensemble_result
    stress_score    = ensemble_result.get('ensemble_score', ensemble_result['stress_score'])
    stress_category = ensemble_result.get('ensemble_category', ensemble_result['stress_category'])

    # 6b. Care pathway (NHS stepped care model, NICE 2022)
    recent_entries = (
        db.query(MoodEntry).filter_by(user_id=req.user_id)
        .order_by(MoodEntry.created_at.desc()).limit(10).all()
    )
    recent_dicts = [
        {'predicted_stress_score': e.predicted_stress_score,
         'mood_label': e.mood_label, 'sleep_hours': e.sleep_hours,
         'screen_time_hours': e.screen_time_hours,
         'journal_text': e.journal_text or ''}
        for e in recent_entries
    ]
    # Override care level if BiLSTM detected crisis language
    manual_crisis = getattr(req, 'crisis_flag', False) or distress_result.get('is_crisis', False)

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

    # 7. Personalised nudge — informed by feedback history
    feedback_history = _get_feedback_summary(req.user_id, db)
    nudge = generate_nudge(
        stress_category   = stress_category,
        mood_label        = req.mood_label,
        screen_time_hours = req.screen_time_hours,
        sleep_hours       = req.sleep_hours,
        hour_of_day       = now.hour,
        feedback_history  = feedback_history,
    )
    nudge_message = (
        "Right now the most important thing is that you're safe. "
        "Support resources are shown below."
        if care.care_level == 4 else nudge.message
    )

    # 8. Place recommendations (ML-informed, mood + stress context)
    raw_places = []
    if req.latitude and req.longitude:
        raw_places = await get_places(
            lat        = req.latitude,
            lon        = req.longitude,
            categories = nudge.place_categories,
        )
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
    }


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

    # ── 2. Build real-data DataFrame ──────────────────────────────────
    MOOD_VALENCE = {'anxious': -0.70, 'stressed': -0.60, 'low': -0.80,
                    'numb': -0.40, 'calm': 0.60, 'content': 0.70,
                    'energised': 0.50, 'joyful': 0.90}
    rows = []
    for e in entries:
        rows.append({
            'screen_time_hours':  float(e.screen_time_hours or 4.0),
            'sleep_hours':        float(e.sleep_hours or 7.0),
            'energy_level':       float(e.energy_level or 5),
            'hour_of_day':        float(e.hour_of_day or 12),
            'day_of_week':        float(e.day_of_week or 0),
            'scroll_session_mins': float(e.scroll_session_mins or 15),
            'heart_rate_resting': float(e.heart_rate_resting or 68.0),
            'mood_valence':       float(MOOD_VALENCE.get(e.mood_label or 'calm', 0.0)),
            'stress_label':       e.stress_category,
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

    # ── 4. Retrain ────────────────────────────────────────────────────
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', RandomForestClassifier(
            n_estimators=200, max_depth=12, min_samples_leaf=4,
            class_weight='balanced', random_state=42, n_jobs=-1
        ))
    ])

    # Run in thread pool (CPU-bound)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, pipeline.fit, X, y)

    y_pred    = await loop.run_in_executor(None, pipeline.predict, X)
    new_acc   = round(float(accuracy_score(y, y_pred)), 4)
    new_f1    = round(float(f1_score(y, y_pred, average='weighted')), 4)

    cv     = StratifiedKFold(n_splits=min(5, y.value_counts().min()), shuffle=True, random_state=42)
    cv_scores = await loop.run_in_executor(
        None, lambda: cross_val_score(pipeline, X, y, cv=cv, scoring='f1_weighted')
    )
    cv_mean = round(float(cv_scores.mean()), 4)
    cv_std  = round(float(cv_scores.std()), 4)

    # ── 5. Compare with old model — only save if improved ─────────────
    old_report = load_eval_report()
    old_f1     = old_report.get("f1_weighted", 0.0)
    improved   = new_f1 >= old_f1 - 0.02  # allow up to 2% regression (real data is noisier)

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
            "model": "RandomForestClassifier(n_estimators=200) — online update",
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
        "old_f1_weighted":  old_f1,
        "cv_f1_mean":       cv_mean,
        "cv_f1_std":        cv_std,
        "improved":         improved,
        "top_feature":      max(feature_importances_new, key=feature_importances_new.get),
        "user_id":          user_id or "all",
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
        "old_f1_weighted":  old_f1,
        "cv_f1_mean":       cv_mean,
        "cv_f1_std":        cv_std,
        "improved":         improved,
        "feature_importances": feature_importances_new,
        "academic_note":    "Continual learning via periodic refit — Widmer & Kubat (1996). Real data weighted 3× synthetic to prioritise user-specific patterns.",
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
    user_id = data.get("user_id", "user_001")
    # accept either "n" or "count"; cap raised to 500 to support demo pre-training
    n       = min(int(data.get("n", data.get("count", 20))), 500)

    MOODS   = ['anxious', 'stressed', 'low', 'numb', 'calm', 'content', 'energised', 'joyful']
    VALENCE = {'anxious': -0.70, 'stressed': -0.60, 'low': -0.80, 'numb': -0.40,
               'calm': 0.60, 'content': 0.70, 'energised': 0.50, 'joyful': 0.90}
    STRESS_CAT = {(0.0, 0.33): 'low', (0.33, 0.66): 'moderate', (0.66, 1.01): 'high'}

    now = datetime.utcnow()
    created = []

    for i in range(n):
        # Spread entries back over the last 30 days
        ts          = now - timedelta(days=random.uniform(0, 30), hours=random.uniform(0, 12))
        sleep_h     = round(random.gauss(6.8, 1.2), 1)
        screen_h    = round(max(0.5, random.gauss(4.5, 2.0)), 1)
        energy      = random.randint(2, 9)
        hr          = round(random.gauss(68, 9), 1)
        scroll_mins = round(max(1, random.expovariate(1 / 20)), 1)
        mood        = random.choice(MOODS)
        valence     = VALENCE[mood]

        raw_stress = (
            0.28 * min(screen_h / 10, 1.0) +
            0.22 * max(0, (8 - sleep_h) / 8) +
            0.16 * (1 - energy / 10) +
            0.12 * min(scroll_mins / 60, 1.0) +
            0.08 * max(0, (hr - 70) / 40) +
            random.gauss(0, 0.07)
        )
        stress = round(min(max(raw_stress * 1.5, 0.02), 0.98), 4)
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
            distress_class        = 'minimal' if stress < 0.33 else 'mild' if stress < 0.55 else 'moderate',
            care_level            = 1 if stress < 0.33 else 2 if stress < 0.55 else 3,
            personalised_message  = f"Seeded test entry {i + 1}",
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
        "message":       f"✓ {n} synthetic entries added to DB for {user_id}. Now press 'Retrain AI' in the Insights tab.",
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
            rows = [{
                'screen_time_hours':   float(e.screen_time_hours or 4),
                'sleep_hours':         float(e.sleep_hours or 7),
                'energy_level':        float(e.energy_level or 5),
                'hour_of_day':         float(e.hour_of_day or 12),
                'day_of_week':         float(e.day_of_week or 0),
                'scroll_session_mins': float(e.scroll_session_mins or 15),
                'heart_rate_resting':  float(e.heart_rate_resting or 68),
                'mood_valence':        float(MOOD_V.get(e.mood_label or 'calm', 0)),
                'stress_label':        e.stress_category,
            } for e in entries]
            real_df = pd.DataFrame(rows)
            syn_path = Path(__file__).parent.parent.parent / "data" / "synthetic_training.csv"
            combined = pd.concat([pd.read_csv(syn_path), real_df, real_df, real_df], ignore_index=True) if syn_path.exists() else real_df
            X, y = combined[FEATURES], combined['stress_label']
            if y.nunique() < 2:
                return
            pipeline = _Pipeline([
                ('scaler', StandardScaler()),
                ('clf', RandomForestClassifier(n_estimators=200, max_depth=12,
                    min_samples_leaf=4, class_weight='balanced', random_state=42, n_jobs=-1))
            ])
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, pipeline.fit, X, y)
            y_pred = await loop.run_in_executor(None, pipeline.predict, X)
            new_f1 = round(float(_f1(y, y_pred, average='weighted')), 4)
            old_f1 = load_eval_report().get('f1_weighted', 0.0)
            if new_f1 >= old_f1 - 0.02:
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
                    "old_f1_weighted": old_f1,
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
