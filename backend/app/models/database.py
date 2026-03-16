"""
ScreenSense Database — Production Ready
=========================================
Supports both SQLite (development) and PostgreSQL (production).
Uses SQLAlchemy with proper connection pooling for production.
"""
from sqlalchemy import (
    create_engine, Column, Integer, Float, String,
    DateTime, JSON, Boolean, Text
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime
from typing import Generator

from app.config import get_settings

settings = get_settings()

# Connection pooling config differs between SQLite and PostgreSQL
if settings.is_production:
    engine = create_engine(
        settings.database_url_fixed,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=300,
    )
else:
    engine = create_engine(
        settings.database_url_fixed,
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class MoodEntry(Base):
    __tablename__ = "mood_entries"

    id                    = Column(Integer, primary_key=True, index=True)
    user_id               = Column(String(64), index=True, nullable=False)
    created_at            = Column(DateTime, default=datetime.utcnow, index=True)

    # Mood
    mood_label            = Column(String(32), nullable=False)
    mood_words            = Column(JSON, default=list)
    journal_text          = Column(Text, nullable=True)

    # Device signals
    screen_time_hours     = Column(Float, default=4.0)
    scroll_session_mins   = Column(Float, default=15.0)
    sleep_hours           = Column(Float, default=7.0)
    energy_level          = Column(Integer, default=5)
    heart_rate_resting    = Column(Float, nullable=True)

    # Location & context
    latitude              = Column(Float, nullable=True)
    longitude             = Column(Float, nullable=True)
    neighbourhood         = Column(String(128), nullable=True)
    weather_condition     = Column(String(64), nullable=True)
    weather_temp_c        = Column(Float, nullable=True)
    hour_of_day           = Column(Integer, default=12)
    day_of_week           = Column(Integer, default=0)

    # ML outputs
    predicted_stress_score = Column(Float, default=0.5)
    stress_category        = Column(String(16), default="moderate")
    sentiment_score        = Column(Float, nullable=True)

    # BiLSTM distress classification
    distress_class         = Column(String(32), nullable=True)
    distress_confidence    = Column(Float, nullable=True)

    # Care pathway
    care_level             = Column(Integer, default=1)

    # Recommendations
    personalised_message   = Column(Text, nullable=True)
    cbt_prompt             = Column(Text, nullable=True)
    rationale              = Column(Text, nullable=True)
    place_recommendations  = Column(JSON, default=list)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(String(64), unique=True, index=True, nullable=False)
    display_name     = Column(String(128), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    last_checkin     = Column(DateTime, nullable=True)

    # Rolling averages
    avg_screen_time  = Column(Float, default=0.0)
    avg_sleep        = Column(Float, default=0.0)
    avg_stress       = Column(Float, default=0.5)
    total_entries    = Column(Integer, default=0)
    streak_days      = Column(Integer, default=0)

    # Settings
    stress_threshold = Column(Float, default=0.65)
    notifications_on = Column(Boolean, default=True)
    consent_mood     = Column(Boolean, default=True)
    consent_journal  = Column(Boolean, default=True)
    consent_location = Column(Boolean, default=False)
    consent_sleep    = Column(Boolean, default=True)


class ClinicalResult(Base):
    __tablename__ = "clinical_results"

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(String(64), index=True, nullable=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
    assessment_id  = Column(String(16), nullable=False)  # phq9, gad7, who5
    score          = Column(Integer, nullable=False)
    raw_score      = Column(Integer, nullable=False)
    interpretation = Column(String(64), nullable=True)
    answers        = Column(JSON, default=list)


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
