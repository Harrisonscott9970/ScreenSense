"""
ScreenSense FastAPI Application - Production Ready
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
from app.config import get_settings
from app.models.database import init_db
from app.api.routes import router
from app.api.auth_routes import auth_router

settings = get_settings()
logging.basicConfig(level=logging.INFO if settings.is_production else logging.DEBUG)
logger = logging.getLogger(__name__)

def _ensure_models_trained():
    """
    Auto-train ML models on first launch if they don't exist.
    Prevents the frustrating 'model not found' error on a fresh clone.
    Training takes ~20-30s and writes to data/models/.
    """
    from pathlib import Path
    model_dir = Path(__file__).parent.parent / "data" / "models"
    rf_path   = model_dir / "stress_classifier.joblib"
    lstm_path = model_dir / "lstm_mood.pt"
    bilstm_path = model_dir / "bilstm_distress.pt"

    if not rf_path.exists():
        logger.info("Random Forest model not found — auto-training (takes ~15s)...")
        try:
            from app.ml.train import train
            train(force_regenerate=True)   # regenerate CSV with improved generator
            logger.info("Random Forest trained successfully")
        except Exception as e:
            logger.warning(f"Auto-train RF failed: {e} — run: python -m app.ml.train")

    if not lstm_path.exists():
        logger.info("LSTM mood model not found — auto-training (takes ~10s)...")
        try:
            from app.ml.lstm_model import train_lstm
            train_lstm()
            logger.info("LSTM trained successfully")
        except Exception as e:
            logger.warning(f"Auto-train LSTM failed: {e} — run: python -m app.ml.lstm_model")

    if not bilstm_path.exists():
        logger.info("BiLSTM distress model not found — auto-training (takes ~30s)...")
        try:
            from app.ml.bilstm_distress import train_bilstm
            train_bilstm()
            logger.info("BiLSTM trained successfully")
        except Exception as e:
            logger.warning(f"Auto-train BiLSTM failed: {e} — run: python -m app.ml.bilstm_distress")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"ScreenSense API starting - {settings.environment}")
    init_db()
    logger.info("Database initialised")
    # Auto-train models if not present — crucial for zero-friction first launch
    import asyncio
    await asyncio.get_event_loop().run_in_executor(None, _ensure_models_trained)
    logger.info("ML models ready")
    yield
    logger.info("ScreenSense API shutting down")

app = FastAPI(
    title=settings.app_name,
    description=settings.app_description,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(auth_router)

@app.get("/api/places")
async def places_nearby(lat: float, lon: float, mood: str = "calm", stress_category: str = "moderate"):
    """Live nearby places — MapScreen calls this directly using GPS, no check-in required."""
    from datetime import datetime as _dt
    from app.ml.nudge_engine import generate_nudge
    from app.services.external_apis import get_places
    nudge = generate_nudge(
        stress_category=stress_category, mood_label=mood,
        screen_time_hours=0, sleep_hours=7, hour_of_day=_dt.utcnow().hour,
    )
    raw = await get_places(lat=lat, lon=lon, categories=nudge.place_categories)
    REASONS = {
        ("Park",       "high"):     "Natural environments lower cortisol — Ulrich SRT (1984)",
        ("Library",    "high"):     "Quiet structured space for mental decompression",
        ("Garden",     "high"):     "Green space activates Kaplan ART (1995)",
        ("Cafe",       "high"):     "Low-stimulation café for decompression",
        ("Café",       "moderate"): "Mild social stimulation without pressure",
        ("Gallery",    "moderate"): "Aesthetic engagement supports mood regulation",
        ("Bookshop",   "moderate"): "Low-stimulation browsing — Kaplan (1995)",
        ("Museum",     "moderate"): "Cultural engagement with attentional restoration",
        ("Market",     "low"):      "Exploratory environment — Fredrickson (2001)",
        ("Restaurant", "low"):      "Social reward aligns with positive mood state",
    }
    return {
        "places": [
            {
                "name":       p.get("name"),
                "type":       p.get("type", "Place"),
                "icon":       p.get("icon", "\U0001f4cd"),
                "reason":     REASONS.get((p.get("type", ""), stress_category),
                                         "Recommended for your current affect profile"),
                "address":    p.get("address"),
                "distance_m": p.get("distance_m"),
            }
            for p in raw[:4]
        ],
        "rationale":  nudge.place_rationale,
        "categories": nudge.place_categories,
    }


@app.get("/")
async def root():
    return {"app": settings.app_name, "version": settings.app_version, "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy", "version": settings.app_version}

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    # In development, surface the real error so the app can show it
    detail = str(exc) if not settings.is_production else "An unexpected error occurred."
    return JSONResponse(status_code=500, content={"detail": detail})
