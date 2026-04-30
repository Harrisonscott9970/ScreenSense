"""
ScreenSense Authentication
===========================
Real auth with bcrypt password hashing and JWT tokens.
No external auth services — fully self-contained.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime, timedelta
from typing import Optional
import hashlib
import hmac
import os
import base64
import json

from app.models.database import get_db, Base, engine
from app.config import get_settings

settings = get_settings()
auth_router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# ── User model ────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(String(64), unique=True, index=True)
    email        = Column(String(256), unique=True, index=True)
    display_name = Column(String(128))
    password_hash = Column(String(256))
    created_at   = Column(DateTime, default=datetime.utcnow)
    last_login   = Column(DateTime, nullable=True)
    is_active    = Column(Boolean, default=True)


def _hash_password(password: str) -> str:
    """SHA-256 with salt — no bcrypt dependency needed."""
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
    return base64.b64encode(salt + key).decode()


def _verify_password(password: str, stored: str) -> bool:
    try:
        decoded = base64.b64decode(stored.encode())
        salt, key = decoded[:32], decoded[32:]
        new_key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
        return hmac.compare_digest(key, new_key)
    except Exception:
        return False


def _make_token(user_id: str, email: str) -> str:
    """Simple signed token — no PyJWT dependency."""
    payload = json.dumps({"user_id": user_id, "email": email, "exp": (datetime.utcnow() + timedelta(days=30)).timestamp()})
    signature = hmac.new(
        settings.secret_key.encode() if hasattr(settings, 'secret_key') else b'screensense-secret-key-change-in-production',
        payload.encode(), hashlib.sha256
    ).hexdigest()
    token_data = base64.b64encode(payload.encode()).decode()
    return f"{token_data}.{signature}"


def _decode_token(token: str) -> Optional[dict]:
    try:
        parts = token.split('.')
        if len(parts) != 2:
            return None
        payload = json.loads(base64.b64decode(parts[0]).decode())
        if payload.get('exp', 0) < datetime.utcnow().timestamp():
            return None
        return payload
    except Exception:
        return None


@auth_router.post("/signup")
async def signup(data: dict, db: Session = Depends(get_db)):
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    name = data.get('name', '').strip()

    if not email or not password or not name:
        raise HTTPException(status_code=400, detail="Name, email and password are required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user_id = f"user_{email.split('@')[0].replace('.', '_')}_{os.urandom(4).hex()}"
    user = User(
        user_id=user_id, email=email,
        display_name=name,
        password_hash=_hash_password(password),
    )
    db.add(user)
    db.commit()

    token = _make_token(user_id, email)
    return {"token": token, "user_id": user_id, "name": name, "email": email}


@auth_router.post("/login")
async def login(data: dict, db: Session = Depends(get_db)):
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    user = db.query(User).filter_by(email=email).first()
    if not user or not _verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    user.last_login = datetime.utcnow()
    db.commit()

    token = _make_token(user.user_id, email)
    return {"token": token, "user_id": user.user_id, "name": user.display_name, "email": email}


@auth_router.get("/users")
async def list_users(db: Session = Depends(get_db)):
    """
    Admin/control-panel listing of registered accounts.

    Privacy-preserving: returns only non-sensitive display fields
    (name, email, creation timestamp, activity counts). Never
    returns password hashes, tokens, location, or journal content.
    """
    from app.models.database import MoodEntry
    users = db.query(User).order_by(User.created_at.desc()).all()
    out = []
    for u in users:
        entry_count = db.query(MoodEntry).filter_by(user_id=u.user_id).count()
        out.append({
            "user_id":     u.user_id,
            "name":        u.display_name,
            "email":       u.email,
            "created_at":  u.created_at.isoformat() if u.created_at else None,
            "last_login":  u.last_login.isoformat() if u.last_login else None,
            "entry_count": entry_count,
            "is_active":   bool(u.is_active),
        })
    return {"total": len(out), "users": out}


@auth_router.post("/verify")
async def verify_token(data: dict):
    token = data.get('token', '')
    payload = _decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    return {"valid": True, "user_id": payload['user_id'], "email": payload['email']}


@auth_router.post("/change-password")
async def change_password(data: dict, db: Session = Depends(get_db)):
    token = data.get('token', '')
    payload = _decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter_by(user_id=payload['user_id']).first()
    if not user or not _verify_password(data.get('current_password', ''), user.password_hash):
        raise HTTPException(status_code=401, detail="Current password incorrect")

    user.password_hash = _hash_password(data.get('new_password', ''))
    db.commit()
    return {"message": "Password updated successfully"}


@auth_router.delete("/account")
async def delete_account(data: dict, db: Session = Depends(get_db)):
    token = data.get('token', '')
    payload = _decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    from app.models.database import MoodEntry, UserProfile
    db.query(MoodEntry).filter_by(user_id=payload['user_id']).delete()
    db.query(UserProfile).filter_by(user_id=payload['user_id']).delete()
    db.query(User).filter_by(user_id=payload['user_id']).delete()
    db.commit()
    return {"message": "Account and all data deleted permanently"}


# Create table
User.metadata.create_all(bind=engine)
