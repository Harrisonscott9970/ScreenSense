"""
Nudge Engine — Fogg Behaviour Model Implementation
=====================================================
Generates personalised messages, CBT prompts, and place category
recommendations based on predicted stress + mood signals.

This is a rule-based expert system — deliberately transparent and
auditable, which is an academic strength (cite: Fogg, 2009).
Every decision path can be traced, unlike a black-box LLM.

Rules are structured as: Trigger → Behaviour → Motivation cue
"""
from dataclasses import dataclass
from typing import List, Tuple
import random


@dataclass
class NudgeOutput:
    message: str
    cbt_prompt: str
    place_categories: List[str]   # Foursquare category IDs / names
    place_rationale: str
    nudge_type: str               # log this for evaluation


# ── MESSAGE TEMPLATES ──────────────────────────────────────────────
# Indexed by (stress_category, mood_label)
# Written to be warm, non-preachy, and clinically-informed

MESSAGES = {
    ("high", "anxious"): [
        "Your signals suggest your nervous system is working overtime right now. That's okay — it's information, not a verdict. A change of physical environment can genuinely interrupt the anxiety loop.",
        "High screen load plus an anxious mood is a recognised pattern. Getting outside — even briefly — activates your parasympathetic nervous system in ways your phone screen simply can't.",
    ],
    ("high", "stressed"): [
        "You've been carrying a heavy load today. Stress is cumulative, and your data shows it's been building. A short walk somewhere green can lower cortisol measurably — this isn't a metaphor.",
        "The numbers add up to a demanding day. Before the evening gets away from you, a 20-minute break somewhere quiet could reset more than you'd expect.",
    ],
    ("high", "low"): [
        "When energy is low and the mood is heavy, the instinct to stay still is strong — but gentle movement and a change of scene have solid evidence behind them for low mood.",
        "Your check-in suggests you might be in a low patch. That's worth acknowledging. Somewhere calm and unhurried — a café, a park — gives your mind permission to soften a little.",
    ],
    ("moderate", "calm"): [
        "You're in a decent place right now. Your stress reading is moderate — manageable. A pleasant outing today isn't escapism; it's maintenance.",
        "Steady and calm — a good baseline. Your wellbeing score suggests now is a good time to do something enjoyable rather than waiting until you need it.",
    ],
    ("low", "joyful"): [
        "Good energy, low stress — make the most of it. Go somewhere that matches the mood.",
        "Your signals are genuinely positive today. This is the kind of day to do the thing you've been putting off for 'when I feel like it'.",
    ],
    ("low", "content"): [
        "Content and settled — a quieter kind of good. Somewhere to sit with a coffee and let that feeling land properly sounds about right.",
    ],
}

DEFAULT_MESSAGES = {
    "high": "Your wellbeing signals suggest today has been demanding. A deliberate break somewhere different from your usual environment could help more than it might seem.",
    "moderate": "Mixed signals today — some pressure, some resilience. Something gentle and purposeful would complement where you are.",
    "low": "Your signals look balanced. A good time to enjoy somewhere you like, just because.",
}

CBT_PROMPTS = {
    "high": [
        "What's one thing that felt manageable today, even if briefly?",
        "If a close friend described your day to you, what would they notice that you might be minimising?",
        "What does 'good enough' look like right now — not perfect, just enough?",
    ],
    "moderate": [
        "What would you tell yourself this morning if you could?",
        "On a scale of what actually matters, where does today's main stressor sit?",
        "What small thing could you do in the next hour that's just for you?",
    ],
    "low": [
        "What are you looking forward to, even something small?",
        "What went quietly well today that you haven't given yourself credit for?",
        "If this mood were a weather pattern, what would it be — and what usually follows it?",
    ],
}

# Place categories per stress level — mapped to Foursquare category names
# Grounded in Kaplan's ART and Ulrich's SRT
PLACE_CATEGORIES = {
    "high": {
        "primary": ["Park", "Garden", "Green Space", "Nature Reserve"],
        "secondary": ["Library", "Quiet Café", "Museum", "Gallery"],
        "rationale": (
            "High stress activates the sympathetic nervous system. "
            "Kaplan's Attention Restoration Theory (1995) identifies natural environments "
            "as uniquely restorative — they engage involuntary attention, giving directed "
            "attention systems time to recover. Quiet, low-stimulation spaces support the same effect."
        )
    },
    "moderate": {
        "primary": ["Café", "Bookshop", "Market", "Library"],
        "secondary": ["Park", "Riverside Walk", "Gallery"],
        "rationale": (
            "Moderate stress benefits from mild positive stimulation — "
            "environments that are engaging but not demanding. "
            "Ulrich's Stress Recovery Theory (1984) supports exposure to "
            "aesthetically pleasant, non-threatening environments for affect regulation."
        )
    },
    "low": {
        "primary": ["Café", "Restaurant", "Market", "Social Space"],
        "secondary": ["Gallery", "Park", "Bookshop", "Cinema"],
        "rationale": (
            "Low stress and positive affect support social and exploratory behaviour. "
            "Fredrickson's Broaden-and-Build theory (2001) suggests positive emotions "
            "expand the range of actions people consider — richer, more varied environments suit this state."
        )
    },
}


OUTDOOR_CATEGORIES = {"Park", "Garden", "Green Space", "Nature Reserve", "Riverside Walk"}
INDOOR_CATEGORIES  = [
    "Library", "Museum", "Gallery", "Café", "Quiet Café",
    "Bookshop", "Cinema", "Social Space", "Restaurant", "Market",
]


def generate_nudge(
    stress_category: str,
    mood_label: str,
    screen_time_hours: float,
    sleep_hours: float,
    hour_of_day: int,
    feedback_history: dict = None,   # {stress_category: [place_types_rated_helpful]}
    weather_condition: str = "Unknown",
    weather_temp_c: float = 15.0,
) -> NudgeOutput:
    # Select message
    key = (stress_category, mood_label.lower())
    candidates = MESSAGES.get(key, [DEFAULT_MESSAGES.get(stress_category, "")])
    message = random.choice(candidates)

    # Augment with context-aware suffix
    if screen_time_hours > 7:
        message += f" You've had {screen_time_hours:.0f} hours of screen exposure today — your eyes and attention system will thank you for a real-world break."
    elif sleep_hours < 6:
        message += " Low sleep amplifies stress responses — be a little gentler with yourself today."

    if hour_of_day >= 20:
        message += " At this hour, somewhere calm and wind-down-friendly is ideal — your cortisol should be dropping now."
    elif hour_of_day < 10:
        message += " Morning is a good time to set the tone intentionally."

    # Weather-aware message suffix
    cond = weather_condition.lower()
    is_wet   = any(w in cond for w in ("rain", "drizzle", "shower", "thunder", "snow", "sleet"))
    is_hot   = weather_temp_c > 27
    is_cold  = weather_temp_c < 5
    if is_wet:
        message += f" The {weather_condition.lower()} makes indoor options especially worthwhile right now."
    elif is_hot:
        message += f" At {weather_temp_c:.0f}°C, somewhere air-conditioned or shaded will be welcome."
    elif is_cold:
        message += f" It's {weather_temp_c:.0f}°C outside — somewhere warm to settle into sounds ideal."

    # Select CBT prompt
    cbt = random.choice(CBT_PROMPTS.get(stress_category, CBT_PROMPTS["moderate"]))

    # Select place categories — personalised if feedback history available
    cats = PLACE_CATEGORIES.get(stress_category, PLACE_CATEGORIES["moderate"])
    rationale = cats["rationale"]

    primary   = cats["primary"][:2]
    secondary = cats["secondary"][:1]

    # Personalisation: if user has rated certain place types helpful for this
    # stress level, promote those to the front of the list (content-based filtering)
    if feedback_history and stress_category in feedback_history:
        preferred = feedback_history[stress_category]
        if preferred:
            place_cats = list(dict.fromkeys(preferred[:2] + primary + secondary))
            rationale += (
                f" Personalised based on your previous feedback — "
                f"you've found {', '.join(preferred[:2])} most helpful in similar situations."
            )
        else:
            place_cats = primary + secondary
    else:
        place_cats = primary + secondary

    # Weather/time adjustment — bias toward indoor when conditions are poor
    if is_wet or hour_of_day >= 21:
        indoor_first = [c for c in place_cats if c not in OUTDOOR_CATEGORIES]
        extras = [c for c in INDOOR_CATEGORIES if c not in indoor_first]
        place_cats = list(dict.fromkeys(indoor_first + extras))[:3]
        if is_wet:
            rationale += f" Indoor venues prioritised due to {weather_condition.lower()} conditions."
    elif is_hot:
        cool = ["Museum", "Library", "Gallery", "Café"]
        place_cats = list(dict.fromkeys(cool + place_cats))[:3]
        rationale += f" Cool indoor spaces recommended ({weather_temp_c:.0f}°C outside)."
    elif is_cold and not is_wet:
        warm = ["Café", "Library", "Bookshop"]
        place_cats = list(dict.fromkeys(warm + place_cats))[:3]
        rationale += f" Warm indoor venues prioritised ({weather_temp_c:.0f}°C outside)."

    return NudgeOutput(
        message=message,
        cbt_prompt=cbt,
        place_categories=place_cats,
        place_rationale=rationale,
        nudge_type=f"{stress_category}_{mood_label}"
    )
