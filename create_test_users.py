"""
ScreenSense — Create Test Users
=================================
Creates 4 demo accounts with realistic 2–3 week histories.

Each user has a distinct wellbeing profile:
  user1 — Recovering student: stress improving over time
  user2 — Struggling professional: consistently elevated stress
  user3 — Stable and balanced: generally positive data
  user4 — High-risk pattern: deteriorating sleep + mood (for care pathway demo)

Usage:
  python create_test_users.py
  python create_test_users.py --host 192.168.0.16 --port 8000
"""
import argparse
import random
import json
import math
import sys
from datetime import datetime, timedelta
from typing import List, Dict

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", default=8000, type=int)
args = parser.parse_args()

BASE = f"http://{args.host}:{args.port}"
SESSION = requests.Session()
SESSION.headers["Content-Type"] = "application/json"

STRESS_CAT = lambda s: "low" if s < 0.33 else "moderate" if s < 0.66 else "high"

USERS = [
    {
        "name": "Test User 1",
        "email": "user1@test.com",
        "password": "ScreenSense1!",
        "profile": "recovering",  # stress trending down
        "days": 21,
    },
    {
        "name": "Test User 2",
        "email": "user2@test.com",
        "password": "ScreenSense2!",
        "profile": "struggling",  # persistently high stress
        "days": 14,
    },
    {
        "name": "Test User 3",
        "email": "user3@test.com",
        "password": "ScreenSense3!",
        "profile": "stable",  # consistently well
        "days": 18,
    },
    {
        "name": "Test User 4",
        "email": "user4@test.com",
        "password": "ScreenSense4!",
        "profile": "deteriorating",  # for care pathway / crisis demo
        "days": 14,
    },
]

MOODS_POS  = ["calm", "content", "energised", "joyful"]
MOODS_NEG  = ["anxious", "stressed", "low", "numb"]
MOODS_ALL  = MOODS_POS + MOODS_NEG

VALENCE = {
    "anxious": -0.70, "stressed": -0.60, "low": -0.80, "numb": -0.40,
    "calm": 0.60, "content": 0.70, "energised": 0.50, "joyful": 0.90,
}

JOURNALS = {
    "anxious":  ["Can't stop my mind racing tonight.", "Felt really on edge today.", "Worrying about everything again."],
    "stressed": ["Deadline pressure is overwhelming.", "Too much on my plate today.", "Barely keeping up."],
    "low":      ["Just feeling flat and empty.", "Hard to find motivation.", "Everything feels heavy."],
    "numb":     ["Going through the motions.", "Disconnected today.", "Nothing feels real."],
    "calm":     ["Had a quiet morning, felt settled.", "Things feel manageable.", "Good energy overall."],
    "content":  ["Decent day, nothing major.", "Felt present and okay.", "Small wins today."],
    "energised":["Productive session this afternoon.", "Got a lot done, feeling good.", "Energy was there today."],
    "joyful":   ["Really lovely day.", "Felt genuinely happy today.", "Great mood, connected well."],
}


def _make_entry(profile: str, day_index: int, days_total: int) -> Dict:
    """Generate a single realistic mood entry based on user profile + day index."""
    progress = day_index / max(days_total - 1, 1)  # 0.0 (oldest) → 1.0 (today)

    if profile == "recovering":
        # Stress declines from ~0.72 to ~0.35 over the period
        base_stress = 0.72 - progress * 0.37 + random.gauss(0, 0.06)
        mood = random.choice(MOODS_NEG if progress < 0.4 else (MOODS_ALL if progress < 0.7 else MOODS_POS))
        sleep_h = 5.5 + progress * 1.8 + random.gauss(0, 0.4)
        screen_h = 6.5 - progress * 1.5 + random.gauss(0, 0.5)
        energy = int(3 + progress * 5 + random.gauss(0, 1))

    elif profile == "struggling":
        base_stress = 0.65 + random.gauss(0, 0.10)
        mood = random.choice(MOODS_NEG + MOODS_NEG + MOODS_ALL)  # heavily biased negative
        sleep_h = 5.2 + random.gauss(0, 0.7)
        screen_h = 7.0 + random.gauss(0, 1.0)
        energy = int(random.gauss(3.5, 1.5))

    elif profile == "stable":
        base_stress = 0.28 + random.gauss(0, 0.08)
        mood = random.choice(MOODS_POS + MOODS_POS + MOODS_ALL)  # heavily biased positive
        sleep_h = 7.5 + random.gauss(0, 0.5)
        screen_h = 3.0 + random.gauss(0, 0.8)
        energy = int(random.gauss(7.5, 1.0))

    elif profile == "deteriorating":
        # Stress rises sharply from ~0.40 to ~0.82 + sleep collapses
        base_stress = 0.40 + progress * 0.42 + random.gauss(0, 0.06)
        mood = random.choice(MOODS_POS if progress < 0.25 else (MOODS_NEG if progress > 0.6 else MOODS_ALL))
        sleep_h = 7.2 - progress * 2.5 + random.gauss(0, 0.4)
        screen_h = 3.5 + progress * 4.5 + random.gauss(0, 0.5)
        energy = int(8 - progress * 5 + random.gauss(0, 1))
    else:
        base_stress = 0.5
        mood = random.choice(MOODS_ALL)
        sleep_h = 7.0
        screen_h = 4.0
        energy = 5

    stress = round(min(max(base_stress, 0.02), 0.98), 4)
    sleep_h = round(min(max(sleep_h, 2.0), 12.0), 1)
    screen_h = round(min(max(screen_h, 0.5), 14.0), 1)
    energy = min(max(energy, 1), 10)

    journal = random.choice(JOURNALS.get(mood, [""]))
    if random.random() < 0.3:  # 30% chance no journal
        journal = ""

    scroll_mins = round(max(1, random.expovariate(1 / 18)), 1)
    hr = round(random.gauss(68 + stress * 20, 8), 1)

    return {
        "mood": mood,
        "stress": stress,
        "stress_cat": STRESS_CAT(stress),
        "sleep_h": sleep_h,
        "screen_h": screen_h,
        "scroll_mins": scroll_mins,
        "energy": energy,
        "hr": hr,
        "journal": journal,
    }


def seed_user_directly(user_id: str, profile: str, days: int) -> int:
    """POST to /api/test/seed — but we need rich entries so we'll use a custom call."""
    entries_created = 0
    now = datetime.utcnow()

    payload_entries = []
    for i in range(days * 2):  # ~2 entries/day on average
        day_ago = random.uniform(0, days)
        ts = now - timedelta(days=day_ago, hours=random.uniform(6, 22))
        day_index = days - int(day_ago)  # 0 = oldest, days = today
        e = _make_entry(profile, day_index, days)
        payload_entries.append({
            "ts": ts.isoformat(),
            "mood": e["mood"],
            "stress": e["stress"],
            "sleep": e["sleep_h"],
            "screen": e["screen_h"],
            "energy": e["energy"],
            "journal": e["journal"],
        })

    # Use the seed endpoint with user_id and n
    r = SESSION.post(f"{BASE}/api/test/seed", json={"user_id": user_id, "n": days * 2})
    if r.ok:
        entries_created = days * 2
    return entries_created


def create_user(user: Dict) -> str | None:
    """Sign up user; if already exists, log in. Returns user_id."""
    # Try signup first
    r = SESSION.post(f"{BASE}/api/auth/signup", json={
        "email": user["email"],
        "password": user["password"],
        "name": user["name"],
    })
    if r.status_code == 200:
        data = r.json()
        print(f"  OK Created {user['email']} -> {data['user_id']}")
        return data["user_id"]

    if r.status_code == 409:
        # Already exists — log in
        r2 = SESSION.post(f"{BASE}/api/auth/login", json={
            "email": user["email"],
            "password": user["password"],
        })
        if r2.ok:
            data = r2.json()
            print(f"  -- Exists  {user['email']} -> {data['user_id']}")
            return data["user_id"]

    print(f"  FAIL {user['email']}: {r.text[:120]}")
    return None


def retrain(user_id: str):
    r = SESSION.post(f"{BASE}/api/retrain", json={"user_id": user_id})
    return r.ok


SEP = "-" * 50

def main():
    print(f"\nScreenSense Test User Setup - {BASE}\n{SEP}")

    # Health check
    try:
        r = SESSION.get(f"{BASE}/", timeout=5)
    except Exception:
        print(f"\nX Cannot reach {BASE} -- is the backend running?\n")
        sys.exit(1)

    total_entries = 0
    for user in USERS:
        print(f"\n[{user['profile'].upper()}] {user['name']} ({user['email']})")
        uid = create_user(user)
        if not uid:
            continue

        # Check if user already has entries
        try:
            r = SESSION.get(f"{BASE}/api/entries/{uid}?limit=5")
            existing = len(r.json()) if r.ok else 0
        except Exception:
            existing = 0

        if existing >= 5:
            print(f"  Already has {existing} entries -- skipping seed")
            continue

        n = seed_user_directly(uid, user["profile"], user["days"])
        total_entries += n
        print(f"  OK Seeded {n} entries ({user['days']} days, profile: {user['profile']})")

    # Retrain on all new data
    print(f"\n{SEP}\nRetraining ML models on new data...")
    if retrain(USERS[0]["email"]):
        print("  OK Retrain triggered")
    else:
        print("  -- Retrain skipped (model not ready)")

    print(f"""
{SEP}
Done! {len(USERS)} accounts ready.

Credentials:
  user1@test.com / ScreenSense1!  -- Recovering student (21 days, improving stress)
  user2@test.com / ScreenSense2!  -- Struggling (14 days, high stress)
  user3@test.com / ScreenSense3!  -- Stable & well (18 days, low stress)
  user4@test.com / ScreenSense4!  -- Deteriorating (14 days, care pathway demo)
{SEP}
""")


if __name__ == "__main__":
    main()
