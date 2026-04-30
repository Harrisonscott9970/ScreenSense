"""
Scout AI Engine — Bespoke Wellbeing Conversation System
========================================================
A fully self-contained conversational AI built on ScreenSense's own ML stack.
All three models run locally — no external AI services:
  · Random Forest  — stress score from device signals
  · BiLSTM         — distress classification from text
  · VADER          — sentiment analysis from journal / messages

Signal pipeline per turn:
  1. VADER sentiment analysis on user message
  2. Crisis keyword scan (care_pathway.CRISIS_KEYWORDS)
  3. BiLSTM distress classification on message text
  4. Fusion with user's DB context (stress score, care level, mood)
  5. Rule-based response selection from evidence-grounded template bank
  6. CBT / nudge engine enrichment for response body

Academic grounding:
  Fogg, B.J. (2009). A behaviour model for persuasive design.
  Beck, A.T. (1979). Cognitive Therapy of Depression. Guilford Press.
  Hutto, C.J. & Gilbert, E. (2014). VADER. ICWSM.
  NICE (2022). Common mental health problems: identification and pathways to care.
  Kabat-Zinn, J. (1990). Full Catastrophe Living. Dell Publishing.
  Fredrickson, B.L. (2001). Broaden-and-build theory. American Psychologist.
"""

import random
import re
from typing import Optional

from app.ml.care_pathway import CRISIS_KEYWORDS, DETERIORATION_KEYWORDS
from app.ml.inference import analyse_sentiment
from app.ml.nudge_engine import CBT_PROMPTS


# ── Response template bank ─────────────────────────────────────────────────
# Each category has multiple variants for conversational variety.
# All grounded in evidence-based techniques (CBT, MBSR, behavioural activation).

TEMPLATES: dict[str, list[str]] = {

    "crisis": [
        "What you're sharing sounds really serious, and I want you to know that it matters. "
        "Please reach out to Samaritans right now — 116 123, free and available 24/7. "
        "You don't have to figure this out alone. [CRISIS]",

        "That's a really difficult place to be, and I'm glad you told me. "
        "The most important thing right now is to speak to someone trained to help. "
        "Samaritans: 116 123 — no judgement, completely confidential. [CRISIS]",
    ],

    "high_distress": [
        "That sounds exhausting — carrying this level of pressure genuinely takes a toll. "
        "Before we go further, how's your body feeling right now? "
        "Sometimes slowing the breath first gives the mind a moment to settle. [BREATHING]",

        "You're dealing with a lot right now, and your check-in data reflects that. "
        "This is exactly the kind of moment where grounding can help — not as a fix, "
        "but as a way to create a small pause. Would you like to try a short exercise? [BREATHING]",
    ],

    "deterioration": [
        "It sounds like things have been building up. That pattern — where each day feels "
        "a little heavier — is worth taking seriously. What's felt most unmanageable recently?",

        "When you say things feel like they're getting worse, that's important information. "
        "You're not imagining it — your check-in patterns reflect that too. "
        "What's one small thing that helped, even briefly, in the last few days?",
    ],

    "negative_high": [
        "That sounds really hard. Difficult feelings deserve to be acknowledged before "
        "anything else — not fixed straight away, just noticed. What's been the heaviest part? [CBT]",

        "I hear that. Sometimes just naming what's going on is a first step. "
        "What would you say is the core of what you're feeling right now?",
    ],

    "negative_moderate": [
        "That makes sense given what you've shared. It sounds like there's real pressure there. "
        "What's been taking up the most mental space today? [CBT]",

        "Tough day. When things pile up like this, it can help to separate what's in your "
        "control from what isn't. What feels heaviest right now?",
    ],

    "negative_low": [
        "That's worth sitting with for a moment. Even milder lows are real. "
        "What do you think is underneath that feeling?",

        "Sometimes a quieter kind of 'not great' is harder to name than a crisis. "
        "What would feeling a bit better look like for you today?",
    ],

    "neutral": [
        "Tell me more about what's going on. I want to make sure I understand what you're "
        "experiencing before anything else.",

        "Thanks for sharing that. What's been on your mind most today?",
    ],

    "positive_low_stress": [
        "That's genuinely good to hear. Your check-in data lines up — things look more settled "
        "than they have been. What's been helping? [GRATITUDE]",

        "A positive moment is worth noticing — Fredrickson's research (2001) shows that "
        "actively recognising them builds emotional resilience over time. What made today different?",
    ],

    "positive_moderate": [
        "Good to hear something's going well, even with some pressure in the background. "
        "Noticing the bright spots when stress is moderate is actually a real skill. "
        "What's keeping you grounded?",
    ],

    "follow_on_cbt": [
        "That's a really honest observation. In CBT terms, what you're describing might be "
        "a '{cbt_pattern}' — worth examining gently. What would you say to a close friend "
        "who thought the same thing about themselves? [CBT]",
    ],

    "follow_on_mindfulness": [
        "When the mind is this busy, mindfulness isn't about emptying it — it's about "
        "changing your relationship to the noise. Even 5 minutes of focused attention "
        "can shift things measurably. [MINDFULNESS]",
    ],
}

# CBT cognitive distortion patterns to name (makes the AI feel more specific)
CBT_PATTERNS = [
    "all-or-nothing thinking",
    "catastrophising",
    "mind-reading",
    "emotional reasoning",
    "should statements",
    "mental filtering",
    "discounting positives",
    "overgeneralisation",
]


# ── Crisis keyword scanner ─────────────────────────────────────────────────
def _has_crisis_signal(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in CRISIS_KEYWORDS)


def _has_deterioration_signal(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in DETERIORATION_KEYWORDS)


# ── BiLSTM distress on free text ──────────────────────────────────────────
def _bilstm_distress_class(text: str) -> str:
    """Run BiLSTM on user message. Returns distress class string."""
    try:
        from app.ml.bilstm_distress import classify_distress
        result = classify_distress(text)
        return result.get("distress_class", "neutral")
    except Exception:
        return "neutral"


# ── Main response generator ────────────────────────────────────────────────
def generate_scout_response(
    user_message: str,
    care_level: int = 1,
    stress_score: float = 0.4,
    stress_category: str = "moderate",
    mood_label: str = "calm",
    distress_class: str = "neutral",
    history_len: int = 0,
) -> dict:
    """
    Generate a context-aware Scout response using ScreenSense's own ML signals.

    Decision hierarchy (highest priority first):
      1. Crisis keywords / BiLSTM crisis_indicator → crisis response
      2. Deterioration keywords / high_distress BiLSTM → support escalation
      3. VADER compound sentiment × care level → response category
      4. Positive sentiment × low stress → affirmation + reflection

    Returns:
      text           — response text (may contain [TOOL] tags)
      category       — which branch fired (for logging/eval)
      cbt_prompt     — optional follow-up CBT question
      signals        — dict of ML signals that drove the decision
    """
    msg = user_message.strip()

    # ── Signal extraction ──────────────────────────────────────────
    vader_score   = analyse_sentiment(msg)
    crisis_kw     = _has_crisis_signal(msg)
    deterioration = _has_deterioration_signal(msg)

    # BiLSTM on user message (live, not cached)
    msg_distress  = _bilstm_distress_class(msg) if len(msg) > 10 else "neutral"

    signals = {
        "vader_compound":  vader_score,
        "crisis_keyword":  crisis_kw,
        "deterioration_kw": deterioration,
        "bilstm_msg":      msg_distress,
        "care_level":      care_level,
        "stress_category": stress_category,
    }

    # ── Decision tree ──────────────────────────────────────────────
    category = "neutral"

    # Priority 1: Crisis — always escalate immediately
    if crisis_kw or msg_distress == "crisis_indicator" or care_level == 4:
        category = "crisis"

    # Priority 2: High distress / deterioration signal
    elif deterioration or msg_distress == "high_distress" or (
        msg_distress == "moderate_distress" and care_level >= 3
    ):
        category = "high_distress" if vader_score < -0.3 else "deterioration"

    # Priority 3: Negative sentiment × stress level
    elif vader_score < -0.5:
        if stress_category == "high" or care_level >= 3:
            category = "negative_high"
        elif stress_category == "moderate":
            category = "negative_moderate"
        else:
            category = "negative_low"

    elif vader_score < -0.1:
        category = "negative_moderate" if stress_category != "low" else "negative_low"

    # Priority 4: Positive sentiment
    elif vader_score > 0.3:
        if stress_category == "low":
            category = "positive_low_stress"
        else:
            category = "positive_moderate"

    # Occasionally vary to mindfulness for long neutral conversations
    elif history_len > 4 and stress_category != "low":
        category = "follow_on_mindfulness" if random.random() < 0.35 else "neutral"

    # ── Template selection ─────────────────────────────────────────
    pool = TEMPLATES.get(category, TEMPLATES["neutral"])
    template = random.choice(pool)

    # Fill dynamic slots
    text = template.replace(
        "{cbt_pattern}", random.choice(CBT_PATTERNS)
    )

    # Append a CBT question as a follow-up for negative categories
    cbt_question = None
    if category in ("negative_high", "negative_moderate", "high_distress", "deterioration"):
        cbt_pool = CBT_PROMPTS.get(stress_category, CBT_PROMPTS["moderate"])
        cbt_question = random.choice(cbt_pool)

    return {
        "text":       text,
        "category":   category,
        "cbt_prompt": cbt_question,
        "signals":    signals,
    }
