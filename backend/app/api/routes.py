"""
ScreenSense FastAPI Routes — Final Version
Includes: SHAP explainability, A/B baseline comparison,
weekly report, data export, full care pathway integration.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from collections import Counter
import csv, io, json

from app.models.database import get_db, MoodEntry, UserProfile
from app.models.schemas import (
    CheckInRequest, MLEvaluationResponse, PlaceRecommendation
)
from app.ml.inference import (
    build_feature_vector, predict_stress,
    analyse_sentiment, load_eval_report
)
from app.ml.nudge_engine import generate_nudge
from app.ml.care_pathway import assess_care_level, CRISIS_RESOURCES_UK, GROUNDING_STEPS
from app.ml.shap_explainer import compute_shap_explanation
from app.services.external_apis import get_weather, get_places, reverse_geocode

router = APIRouter(prefix="/api", tags=["ScreenSense"])

try:
    from app.ml.lstm_model import predict_next_mood
    LSTM_AVAILABLE = True
except Exception:
    LSTM_AVAILABLE = False
    def predict_next_mood(_): return None


# ── CHECKIN ────────────────────────────────────────────────────
@router.post("/checkin")
async def checkin(req: CheckInRequest, db: Session = Depends(get_db)):
    now = datetime.utcnow()

    # 1. Context
    weather = {"temp_c": None, "condition": None}
    neighbourhood = None
    if req.latitude and req.longitude:
        weather = await get_weather(req.latitude, req.longitude)
        neighbourhood = await reverse_geocode(req.latitude, req.longitude)

    # 2. ML stress prediction
    fv = build_feature_vector(
        screen_time_hours=req.screen_time_hours,
        sleep_hours=req.sleep_hours,
        energy_level=req.energy_level,
        hour_of_day=now.hour,
        day_of_week=now.weekday(),
        scroll_session_mins=req.scroll_session_mins,
        heart_rate_resting=req.heart_rate_resting or 68.0,
        mood_label=req.mood_label
    )
    ml_result   = predict_stress(fv)
    stress_score   = ml_result["stress_score"]
    stress_category = ml_result["stress_category"]

    # 3. SHAP explanation
    shap_explanation = compute_shap_explanation(fv)

    # 4. VADER
    sentiment = analyse_sentiment(req.journal_text or "")

    # 5. Care pathway
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
    care = assess_care_level(
        recent_entries=recent_dicts,
        current_stress_score=stress_score,
        current_mood=req.mood_label,
        journal_text=req.journal_text or "",
        manual_crisis_flag=getattr(req, 'crisis_flag', False),
    )

    # 6. Nudge
    nudge = generate_nudge(
        stress_category=stress_category,
        mood_label=req.mood_label,
        screen_time_hours=req.screen_time_hours,
        sleep_hours=req.sleep_hours,
        hour_of_day=now.hour
    )
    nudge_message = (
        "Right now the most important thing is that you're safe. Support resources are below."
        if care.care_level == 4 else nudge.message
    )

    # 7. Places (ML-informed)
    raw_places = []
    if req.latitude and req.longitude:
        raw_places = await get_places(
            lat=req.latitude, lon=req.longitude,
            categories=nudge.place_categories
        )
    places = [
        PlaceRecommendation(
            name=p["name"], type=p.get("type", "Place"),
            icon=p.get("icon", "📍"),
            reason=_place_reason(p.get("type", ""), stress_category, req.mood_label),
            distance_m=p.get("distance_m"), address=p.get("address"),
            foursquare_id=p.get("foursquare_id")
        )
        for p in raw_places[:3]
    ]

    # 8. A/B baseline comparison — naive always recommends park
    baseline_places = [
        PlaceRecommendation(
            name="Nearest park",
            type="Park", icon="🌳",
            reason="Generic recommendation (baseline — not personalised)",
            distance_m=None, address=None
        )
    ]
    # Score: ML recommendation is "better" if mood-type matches expected benefit
    ml_win = _score_recommendation_relevance(stress_category, req.mood_label, places)
    baseline_win = _score_recommendation_relevance(stress_category, req.mood_label, baseline_places)
    ab_result = {
        "ml_score": ml_win,
        "baseline_score": baseline_win,
        "ml_wins": ml_win > baseline_win,
        "explanation": "ML recommendation scored higher contextual relevance" if ml_win > baseline_win else "Baseline matched ML this time"
    }

    # 9. Persist
    entry = MoodEntry(
        user_id=req.user_id, created_at=now,
        mood_label=req.mood_label, mood_words=req.mood_words,
        screen_time_hours=req.screen_time_hours,
        scroll_session_mins=req.scroll_session_mins,
        sleep_hours=req.sleep_hours, energy_level=req.energy_level,
        heart_rate_resting=req.heart_rate_resting,
        latitude=req.latitude, longitude=req.longitude,
        neighbourhood=neighbourhood,
        weather_condition=weather.get("condition"),
        weather_temp_c=weather.get("temp_c"),
        hour_of_day=now.hour, day_of_week=now.weekday(),
        predicted_stress_score=stress_score, stress_category=stress_category,
        sentiment_score=sentiment, personalised_message=nudge_message,
        place_recommendations=[p.model_dump() for p in places],
        cbt_prompt=nudge.cbt_prompt, rationale=nudge.place_rationale,
        journal_text=req.journal_text
    )
    db.add(entry)

    profile = db.query(UserProfile).filter_by(user_id=req.user_id).first()
    if not profile:
        profile = UserProfile(user_id=req.user_id, avg_screen_time=0.0,
                              avg_sleep=0.0, total_entries=0, streak_days=0)
        db.add(profile)
    n = int(profile.total_entries or 0)
    profile.total_entries = n + 1
    profile.last_checkin = now
    profile.avg_screen_time = (float(profile.avg_screen_time or 0) * n + req.screen_time_hours) / (n + 1)
    profile.avg_sleep = (float(profile.avg_sleep or 0) * n + req.sleep_hours) / (n + 1)
    _update_streak(profile, db)
    db.commit()
    db.refresh(entry)

    return {
        "entry_id": entry.id,
        "predicted_stress_score": stress_score,
        "stress_category": stress_category,
        "personalised_message": nudge_message,
        "cbt_prompt": nudge.cbt_prompt,
        "rationale": nudge.place_rationale,
        "place_recommendations": [p.model_dump() for p in places],
        "weather_condition": weather.get("condition"),
        "weather_temp_c": weather.get("temp_c"),
        "neighbourhood": neighbourhood,
        # Explainability
        "shap_explanation": shap_explanation,
        # A/B comparison
        "ab_comparison": ab_result,
        # Care pathway
        "care_level": care.care_level,
        "care_label": care.care_label,
        "care_color": care.care_color,
        "care_description": care.care_description,
        "recommended_tools": care.recommended_tools,
        "show_crisis_resources": care.show_crisis_resources,
        "escalate_to_human": care.escalate_to_human,
        "risk_factors_detected": care.risk_factors_detected,
        "protective_factors": care.protective_factors,
        "clinical_note": care.clinical_note,
        "message_tone": care.message_tone,
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

    profile   = db.query(UserProfile).filter_by(user_id=user_id).first()
    moods     = [e.mood_label for e in entries]
    top_mood  = Counter(moods).most_common(1)[0][0]
    stress_scores = [e.predicted_stress_score for e in entries]
    avg_stress    = round(sum(stress_scores) / len(stress_scores), 3)
    recent_avg    = round(sum(stress_scores[:7]) / min(7, len(stress_scores)), 3)
    baseline_delta = round((recent_avg - avg_stress) * 100, 1)
    wellbeing_score = round((1 - avg_stress) * 100, 1)

    # PHQ-9 / GAD-7 correlation data
    try:
        clinical_raw = db.execute(
            "SELECT created_at, score, assessment_id FROM clinical_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            (user_id,)
        ).fetchall()
        clinical_correlation = [
            {"date": r[0], "score": r[1], "type": r[2]} for r in (clinical_raw or [])
        ]
    except Exception:
        clinical_correlation = []

    # A/B win rate
    ab_wins = sum(1 for e in entries if hasattr(e, 'ab_ml_wins') and e.ab_ml_wins)
    ab_win_rate = round(ab_wins / len(entries) * 100, 1) if entries else 0

    # Care level
    recent_dicts = [
        {'predicted_stress_score': e.predicted_stress_score, 'mood_label': e.mood_label,
         'sleep_hours': e.sleep_hours, 'screen_time_hours': e.screen_time_hours,
         'journal_text': e.journal_text or ''}
        for e in entries[:10]
    ]
    care = assess_care_level(recent_dicts, avg_stress, top_mood)

    # LSTM
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
        "user_id": user_id,
        "total_entries": len(entries),
        "streak_days": profile.streak_days if profile else 0,
        "avg_stress_score": avg_stress,
        "recent_stress_avg": recent_avg,
        "personal_baseline": avg_stress,
        "baseline_delta_pct": baseline_delta,
        "wellbeing_score": wellbeing_score,
        "top_mood": top_mood,
        "mood_frequency": dict(Counter(moods).most_common()),
        "avg_screen_time": round(sum(e.screen_time_hours for e in entries) / len(entries), 1),
        "avg_sleep": round(sum(e.sleep_hours for e in entries) / len(entries), 1),
        "pattern_summary": _pattern_summary(entries, avg_stress, top_mood, baseline_delta),
        "mood_by_day": {e.created_at.strftime("%Y-%m-%d"): e.mood_label for e in entries},
        "screen_vs_stress": [
            {"screen": e.screen_time_hours, "stress": e.predicted_stress_score,
             "mood": e.mood_label, "date": e.created_at.strftime("%Y-%m-%d")}
            for e in entries[:30]
        ],
        "sentiment_trend": [
            {"date": e.created_at.strftime("%Y-%m-%d"),
             "sentiment": e.sentiment_score or 0,
             "stress": e.predicted_stress_score}
            for e in reversed(entries[:20]) if e.sentiment_score is not None
        ],
        "lstm_prediction": lstm_prediction,
        "care_level": care.care_level,
        "care_label": care.care_label,
        "care_color": care.care_color,
        "recommended_tools": care.recommended_tools,
        "show_crisis_resources": care.show_crisis_resources,
        "clinical_correlation": clinical_correlation,
        "ab_win_rate": ab_win_rate,
    }


# ── WEEKLY REPORT ──────────────────────────────────────────────
@router.get("/weekly-report/{user_id}")
async def weekly_report(user_id: str, db: Session = Depends(get_db)):
    week_ago = datetime.utcnow() - timedelta(days=7)
    entries = (
        db.query(MoodEntry)
        .filter(MoodEntry.user_id == user_id, MoodEntry.created_at >= week_ago)
        .order_by(MoodEntry.created_at.asc()).all()
    )
    if not entries:
        raise HTTPException(status_code=404, detail="No entries this week")

    moods = [e.mood_label for e in entries]
    stress_scores = [e.predicted_stress_score for e in entries]
    avg_stress = round(sum(stress_scores) / len(stress_scores), 3)
    top_mood = Counter(moods).most_common(1)[0][0]
    best_day = min(entries, key=lambda e: e.predicted_stress_score)
    worst_day = max(entries, key=lambda e: e.predicted_stress_score)
    avg_sleep = round(sum(e.sleep_hours for e in entries) / len(entries), 1)
    avg_screen = round(sum(e.screen_time_hours for e in entries) / len(entries), 1)

    # Trend: is stress improving?
    if len(stress_scores) >= 4:
        first_half = sum(stress_scores[:len(stress_scores)//2]) / (len(stress_scores)//2)
        second_half = sum(stress_scores[len(stress_scores)//2:]) / (len(stress_scores) - len(stress_scores)//2)
        trend = "improving" if second_half < first_half else "worsening" if second_half > first_half + 0.05 else "stable"
    else:
        trend = "insufficient data"

    narrative = _generate_weekly_narrative(
        n=len(entries), top_mood=top_mood, avg_stress=avg_stress,
        trend=trend, avg_sleep=avg_sleep, avg_screen=avg_screen,
        best_day=best_day, worst_day=worst_day
    )

    return {
        "user_id": user_id,
        "week_of": week_ago.strftime("%Y-%m-%d"),
        "total_checkins": len(entries),
        "avg_stress_score": avg_stress,
        "stress_trend": trend,
        "top_mood": top_mood,
        "avg_sleep_hours": avg_sleep,
        "avg_screen_time": avg_screen,
        "best_day": {"date": best_day.created_at.strftime("%Y-%m-%d"), "score": best_day.predicted_stress_score, "mood": best_day.mood_label},
        "worst_day": {"date": worst_day.created_at.strftime("%Y-%m-%d"), "score": worst_day.predicted_stress_score, "mood": worst_day.mood_label},
        "daily_scores": [{"date": e.created_at.strftime("%Y-%m-%d"), "stress": e.predicted_stress_score, "mood": e.mood_label} for e in entries],
        "narrative": narrative,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ── DATA EXPORT ────────────────────────────────────────────────
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
        "sentiment_score", "neighbourhood", "weather",
        "personalised_message", "cbt_prompt"
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
    """GDPR right to erasure — delete all user data."""
    deleted = db.query(MoodEntry).filter_by(user_id=user_id).delete()
    db.query(UserProfile).filter_by(user_id=user_id).delete()
    db.commit()
    return {"deleted_entries": deleted, "message": "All data deleted. This cannot be undone."}


# ── OTHER ENDPOINTS ────────────────────────────────────────────
@router.get("/ml/evaluate", response_model=MLEvaluationResponse)
async def ml_evaluate():
    report = load_eval_report()
    if not report:
        raise HTTPException(status_code=503, detail="Run: python -m app.ml.train")
    return MLEvaluationResponse(
        accuracy=report["accuracy"], f1_weighted=report["f1_weighted"],
        confusion_matrix=report["confusion_matrix"],
        class_report=report["class_report"],
        feature_importances=report["feature_importances"],
        training_samples=report["training_samples"]
    )


@router.get("/crisis-resources")
async def crisis_resources():
    return {
        "resources": CRISIS_RESOURCES_UK,
        "grounding_steps": GROUNDING_STEPS,
        "disclaimer": "ScreenSense is not a clinical service. These resources connect you with trained professionals.",
        "emergency": "If you or someone else is in immediate danger, call 999.",
    }


@router.get("/entries/{user_id}")
async def get_entries(user_id: str, limit: int = 50, db: Session = Depends(get_db)):
    entries = (
        db.query(MoodEntry).filter_by(user_id=user_id)
        .order_by(MoodEntry.created_at.desc()).limit(limit).all()
    )
    return [
        {"id": e.id, "created_at": e.created_at.isoformat(),
         "mood_label": e.mood_label, "mood_words": e.mood_words,
         "stress_score": e.predicted_stress_score, "stress_category": e.stress_category,
         "screen_time_hours": e.screen_time_hours, "sleep_hours": e.sleep_hours,
         "energy_level": e.energy_level, "neighbourhood": e.neighbourhood,
         "weather_condition": e.weather_condition, "weather_temp_c": e.weather_temp_c,
         "personalised_message": e.personalised_message,
         "place_recommendations": e.place_recommendations,
         "cbt_prompt": e.cbt_prompt, "sentiment_score": e.sentiment_score,
         "hour_of_day": e.hour_of_day, "day_of_week": e.day_of_week}
        for e in entries
    ]


# ── Helpers ────────────────────────────────────────────────────
def _place_reason(place_type, stress, mood):
    reasons = {
        ("Park", "high"): "Natural environments lower cortisol — Ulrich (1984)",
        ("Library", "high"): "Quiet structured space for mental decompression",
        ("Café", "moderate"): "Mild social stimulation without pressure",
        ("Gallery", "moderate"): "Aesthetic engagement supports mood regulation",
        ("Market", "low"): "Exploratory space suits positive affect",
        ("Restaurant", "low"): "Social reward — good for positive mood",
    }
    return reasons.get((place_type, stress), "Recommended based on your current affect profile")


def _score_recommendation_relevance(stress_category, mood, places):
    """Score how contextually appropriate recommendations are (0-1)."""
    score = 0.5  # baseline
    if not places:
        return score
    place_types = [p.type for p in places]
    if stress_category == "high" and any(t in ["Park", "Library", "Garden"] for t in place_types):
        score = 0.9
    elif stress_category == "moderate" and any(t in ["Café", "Gallery"] for t in place_types):
        score = 0.8
    elif stress_category == "low" and any(t in ["Restaurant", "Market"] for t in place_types):
        score = 0.85
    return score


def _update_streak(profile, db):
    entries = db.query(MoodEntry).filter_by(user_id=profile.user_id).order_by(MoodEntry.created_at.desc()).limit(60).all()
    dates = sorted(set(e.created_at.date() for e in entries), reverse=True)
    streak = 1
    for i in range(len(dates) - 1):
        if (dates[i] - dates[i + 1]).days == 1:
            streak += 1
        else:
            break
    profile.streak_days = streak


def _pattern_summary(entries, avg_stress, top_mood, delta):
    n = len(entries)
    high_screen = sum(1 for e in entries if e.screen_time_hours > 7)
    poor_sleep = sum(1 for e in entries if e.sleep_hours < 6)
    parts = [f"Across {n} check-ins, your most frequent mood is {top_mood}"]
    if avg_stress > 0.6: parts.append(" with consistently elevated stress")
    elif avg_stress < 0.35: parts.append(" with generally low stress")
    if delta > 10: parts.append(f". Recent stress is {delta}% above your personal baseline")
    elif delta < -10: parts.append(f". Recent stress is {abs(delta)}% below baseline — a positive trend")
    if high_screen > n * 0.4: parts.append(f". High screen load appears in {high_screen} of {n} entries")
    if poor_sleep > n * 0.3: parts.append(". Poor sleep correlates with your higher-stress days")
    return "".join(parts) + "."


def _generate_weekly_narrative(n, top_mood, avg_stress, trend, avg_sleep, avg_screen, best_day, worst_day):
    stress_label = "high" if avg_stress > 0.6 else "moderate" if avg_stress > 0.35 else "low"
    sleep_label = "good" if avg_sleep >= 7 else "below recommended"
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
