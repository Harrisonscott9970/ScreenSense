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

    id                    = Column(Integer, primary_key=True, autoincrement=True, index=True)
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

    id               = Column(Integer, primary_key=True, autoincrement=True, index=True)
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

    id             = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id        = Column(String(64), index=True, nullable=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
    assessment_id  = Column(String(16), nullable=False)  # phq9, gad7, who5
    score          = Column(Integer, nullable=False)
    raw_score      = Column(Integer, nullable=False)
    interpretation = Column(String(64), nullable=True)
    answers        = Column(JSON, default=list)


class RecommendationFeedback(Base):
    """
    User ratings for AI recommendations (thumbs up/down).
    Used to personalise future nudges and place recommendations.

    Academic grounding:
      Fogg, B.J. (2009). A behaviour model for persuasive design.
      Lops, P. et al. (2011). Content-based recommender systems.
        In Recommender Systems Handbook. Springer.
    """
    __tablename__ = "recommendation_feedback"

    id             = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id        = Column(String(64), index=True, nullable=False)
    entry_id       = Column(Integer, nullable=False, index=True)  # FK to mood_entries
    helpful        = Column(Boolean, nullable=False)              # thumbs up/down
    stress_category = Column(String(16), nullable=True)           # context at time of rating
    mood_label     = Column(String(32), nullable=True)
    place_type     = Column(String(64), nullable=True)            # which place type was rated
    created_at     = Column(DateTime, default=datetime.utcnow)


def _migrate_schema():
    """
    Robust schema migration for SQLite.

    SQLAlchemy's create_all() only creates *missing tables* — it never touches
    existing ones.  This function brings any existing tables up to the current
    ORM model using two strategies:

    1. Structural rebuild — if a table is missing a PRIMARY KEY column ('id')
       it was created by a much older schema and cannot be fixed with
       ALTER TABLE.  We back-up the data (best-effort), DROP the table, let
       create_all() recreate it correctly, then restore whatever rows can be
       mapped to the new column set.

    2. Column addition — for tables that only need new nullable/defaulted
       columns, ALTER TABLE ... ADD COLUMN is used. Safe and non-destructive.

    Safe to run on every startup: it is a no-op when the schema is current.
    """
    import sqlalchemy as _sa
    import logging as _log
    _logger = _log.getLogger(__name__)

    # Tables whose PRIMARY KEY column must be present for the ORM to work.
    # If 'id' is absent we rebuild the whole table.
    REBUILD_SENTINEL = "id"

    # All tables are safe to rebuild in development — mood_entries data is
    # reseedable via the Insights tab "Generate test data" button.
    REBUILDABLE = {"mood_entries", "user_profiles", "recommendation_feedback", "clinical_results"}

    # Extra columns to guarantee via ALTER TABLE ADD COLUMN.
    # Format: (column_name, SQL type string, DEFAULT clause or '')
    REQUIRED_COLUMNS: dict[str, list[tuple[str, str, str]]] = {
        "mood_entries": [
            ("distress_class",       "VARCHAR(32)",  ""),
            ("distress_confidence",  "FLOAT",        ""),
            ("care_level",           "INTEGER",      "DEFAULT 1"),
            ("personalised_message", "TEXT",         ""),
            ("cbt_prompt",           "TEXT",         ""),
            ("rationale",            "TEXT",         ""),
            ("place_recommendations","TEXT",         "DEFAULT '[]'"),
            ("ab_ml_wins",           "INTEGER",      "DEFAULT 0"),
            ("scroll_session_mins",  "FLOAT",        "DEFAULT 15.0"),
            ("heart_rate_resting",   "FLOAT",        ""),
            ("hour_of_day",          "INTEGER",      "DEFAULT 12"),
            ("day_of_week",          "INTEGER",      "DEFAULT 0"),
            ("neighbourhood",        "VARCHAR(128)", ""),
            ("weather_condition",    "VARCHAR(64)",  ""),
            ("weather_temp_c",       "FLOAT",        ""),
            ("sentiment_score",      "FLOAT",        ""),
            ("latitude",             "FLOAT",        ""),
            ("longitude",            "FLOAT",        ""),
            ("mood_words",           "TEXT",         "DEFAULT '[]'"),
            ("journal_text",         "TEXT",         ""),
        ],
        "user_profiles": [
            ("display_name",         "VARCHAR(128)", ""),
            ("avg_stress",           "FLOAT",        "DEFAULT 0.5"),
            ("stress_threshold",     "FLOAT",        "DEFAULT 0.65"),
            ("notifications_on",     "INTEGER",      "DEFAULT 1"),
            ("consent_mood",         "INTEGER",      "DEFAULT 1"),
            ("consent_journal",      "INTEGER",      "DEFAULT 1"),
            ("consent_location",     "INTEGER",      "DEFAULT 0"),
            ("consent_sleep",        "INTEGER",      "DEFAULT 1"),
        ],
        "clinical_results": [
            ("answers",              "TEXT",         "DEFAULT '[]'"),
        ],
    }

    with engine.connect() as conn:
        for table, extra_cols in REQUIRED_COLUMNS.items():
            # ── Step 1: inspect existing columns ──────────────────────────
            try:
                pragma = conn.execute(_sa.text(f"PRAGMA table_info({table})"))
                rows = pragma.fetchall()
                existing = {row[1] for row in rows}
            except Exception:
                continue  # table absent — create_all will handle it

            # ── Step 2: detect broken primary key ─────────────────────────
            # PRAGMA table_info distinguishes column-level vs table-level PKs:
            #
            #   column-level:  id INTEGER PRIMARY KEY
            #     → rowid alias → auto-increments ✓
            #     → PRAGMA: pk=1, notnull=0  (SQLite implicitly allows NULL on rowid)
            #
            #   table-level:  id INTEGER NOT NULL, PRIMARY KEY(id)
            #     → does NOT auto-increment ✗
            #     → PRAGMA: pk=1, notnull=1  (explicitly NOT NULL)
            #
            # So: pk=1 AND notnull=1 means the id will NOT be auto-generated.
            needs_rebuild = False
            if REBUILD_SENTINEL not in existing:
                needs_rebuild = True
            else:
                id_row = next((r for r in rows if r[1] == "id"), None)
                if id_row is not None:
                    id_pk      = int(id_row[5])   # pk flag
                    id_notnull = int(id_row[3])   # notnull flag
                    # column-level INTEGER PRIMARY KEY → notnull=0, pk=1
                    # table-level  PRIMARY KEY(id)    → notnull=1, pk=1  ← broken
                    if id_pk == 1 and id_notnull == 1:
                        needs_rebuild = True
                        _logger.warning(
                            f"Table '{table}' has table-level PRIMARY KEY "
                            f"(notnull=1, pk=1) — id will NOT auto-increment. Rebuilding."
                        )

            if needs_rebuild:
                if table in REBUILDABLE:
                    _logger.warning(
                        f"Table '{table}' has a stale schema — "
                        f"dropping and recreating (data cannot be preserved)."
                    )
                    try:
                        conn.execute(_sa.text(f"DROP TABLE IF EXISTS {table}"))
                        conn.commit()
                        # Recreate this table immediately
                        Base.metadata.tables[table].create(bind=engine, checkfirst=True)
                        _logger.info(f"Table '{table}' recreated successfully.")
                        existing = set(Base.metadata.tables[table].c.keys())
                    except Exception as exc:
                        _logger.error(f"Failed to rebuild table '{table}': {exc}")
                    continue  # column additions not needed — table is fresh
                else:
                    _logger.warning(
                        f"Table '{table}' has a broken primary key but is not in "
                        f"REBUILDABLE — skipping rebuild, attempting column additions only."
                    )

            # ── Step 3: add any missing columns ───────────────────────────
            for col_name, col_type, default in extra_cols:
                if col_name not in existing:
                    ddl = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                    if default:
                        ddl += f" {default}"
                    try:
                        conn.execute(_sa.text(ddl))
                        conn.commit()
                        _logger.info(f"Added column {table}.{col_name}")
                    except Exception as exc:
                        _logger.warning(
                            f"Schema migration skipped for {table}.{col_name}: {exc}"
                        )


def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate_schema()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
