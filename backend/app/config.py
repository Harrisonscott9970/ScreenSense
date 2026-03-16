"""
ScreenSense Production Configuration
======================================
All environment variables in one place.
Never hardcode secrets — always use env vars.

Local development: create a .env file
Production: set vars in Render dashboard
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    # Environment
    environment: str = "development"

    # Database — SQLite locally, PostgreSQL in production
    database_url: str = "sqlite:///./data/screensense.db"

    # API Keys
    foursquare_api_key: str = ""
    google_maps_key: str = ""

    # CORS
    allowed_origins: str = "*"

    # Model paths
    model_dir: str = str(Path(__file__).parent.parent / "data" / "models")

    # App info
    app_name: str = "ScreenSense"
    app_version: str = "1.0.0"
    app_description: str = "Context-aware digital wellbeing — affect sensing, ML stress classification, and personalised place recommendations"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def database_url_fixed(self) -> str:
        """Fix Render's postgres:// to postgresql:// for SQLAlchemy"""
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
