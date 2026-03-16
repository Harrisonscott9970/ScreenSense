from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class CheckInRequest(BaseModel):
    """
    What the app sends to the backend on each check-in.
    Real device data comes from iOS APIs via the React Native bridge.
    """
    user_id: str
    mood_label: str = Field(..., description="Self-reported mood from circumplex grid")
    mood_words: List[str] = Field(default=[], description="Descriptive chips chosen")
    screen_time_hours: float = Field(..., ge=0, le=24, description="From iOS Screen Time API")
    scroll_session_mins: float = Field(default=0, ge=0)
    sleep_hours: float = Field(default=7.0, ge=0, le=24, description="From HealthKit")
    energy_level: int = Field(default=5, ge=1, le=10)
    heart_rate_resting: Optional[float] = Field(default=None, description="HealthKit, bpm")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    journal_text: Optional[str] = Field(default=None, max_length=1000)


class PlaceRecommendation(BaseModel):
    name: str
    type: str
    icon: str
    reason: str
    distance_m: Optional[int] = None
    address: Optional[str] = None
    foursquare_id: Optional[str] = None


class CheckInResponse(BaseModel):
    entry_id: str
    predicted_stress_score: float
    stress_category: str
    personalised_message: str
    cbt_prompt: str
    rationale: str
    place_recommendations: List[PlaceRecommendation]
    weather_condition: Optional[str]
    weather_temp_c: Optional[float]
    neighbourhood: Optional[str]


class InsightResponse(BaseModel):
    user_id: str
    total_entries: int
    streak_days: int
    avg_stress_score: float
    top_mood: str
    avg_screen_time: float
    avg_sleep: float
    pattern_summary: str
    mood_by_day: dict
    screen_vs_stress: List[dict]


class MLEvaluationResponse(BaseModel):
    """Returned by /api/ml/evaluate — use this in your dissertation."""
    accuracy: float
    f1_weighted: float
    confusion_matrix: List[List[int]]
    class_report: dict
    feature_importances: dict
    training_samples: int
