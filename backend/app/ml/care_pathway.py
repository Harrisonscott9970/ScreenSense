"""
ScreenSense Care Pathway Engine
================================
Implements NHS Talking Therapies / NICE stepped-care model.

Stepped Care Levels:
  Level 1 — Universal wellbeing support (low risk, stable)
  Level 2 — Guided self-help (mild symptoms, rising stress)
  Level 3 — Structured intervention (moderate, deteriorating)
  Level 4 — Crisis / escalation (severe, risk flags present)

Academic grounding:
  NICE (2022) Common Mental Health Problems: Identification and Pathways to Care
  Clark, D.M. (2011). Implementing NICE guidelines for the psychological
    treatment of depression and anxiety disorders. International Review of
    Psychiatry, 23(4), 318-327.
  Bower, P. & Gilbody, S. (2005). Stepped care in psychological therapies.
    British Journal of Psychiatry, 186(1), 11-17.

This module is purely a decision-support tool.
It does NOT diagnose, treat, or replace clinical assessment.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import re


# ── Risk keyword lists ─────────────────────────────────────────
# These trigger escalation to crisis flow
CRISIS_KEYWORDS = [
    'suicide', 'suicidal', 'kill myself', 'end my life', 'not want to be here',
    'want to die', 'better off dead', 'no reason to live', 'self harm',
    'self-harm', 'cutting', 'hurt myself', 'overdose', 'hopeless',
    'worthless', 'nothing matters', 'give up', "can't go on", 'cannot go on',
]

DETERIORATION_KEYWORDS = [
    'really struggling', 'worse every day', 'cannot cope', "can't cope",
    'falling apart', 'breaking down', 'exhausted', 'overwhelmed',
    'trapped', 'numb', 'empty', 'disconnected', 'no point',
]


@dataclass
class CareLevel:
    level: int                          # 1-4
    label: str                          # human readable
    color: str                          # UI colour
    description: str                    # why this level
    primary_actions: List[str]          # what the app does
    recommended_tools: List[str]        # therapy tools to surface
    check_in_frequency: str             # how often to prompt
    message_tone: str                   # how AI messages should sound
    show_crisis_resources: bool = False
    escalate_to_human: bool = False


CARE_LEVELS = {
    1: CareLevel(
        level=1, label="Stable", color="#4CAF82",
        description="Wellbeing looks balanced. Focus on maintenance and positive habits.",
        primary_actions=["place_recommendation", "gratitude_prompt", "weekly_reflection"],
        recommended_tools=["gratitude", "mindfulness"],
        check_in_frequency="daily",
        message_tone="warm_encouraging",
        show_crisis_resources=False,
    ),
    2: CareLevel(
        level=2, label="Monitor", color="#FFB74D",
        description="Stress is rising or mood has been lower than usual. Guided self-help recommended.",
        primary_actions=["cbt_micro_session", "breathing_exercise", "place_recommendation"],
        recommended_tools=["breathing", "cbt", "gratitude"],
        check_in_frequency="daily",
        message_tone="supportive_structured",
        show_crisis_resources=False,
    ),
    3: CareLevel(
        level=3, label="Intervention", color="#FF8A65",
        description="Sustained deterioration detected. Structured intervention recommended.",
        primary_actions=["structured_cbt", "sleep_review", "professional_signpost"],
        recommended_tools=["cbt", "breathing", "mindfulness"],
        check_in_frequency="twice_daily",
        message_tone="clinical_calm",
        show_crisis_resources=True,
    ),
    4: CareLevel(
        level=4, label="Crisis", color="#F43F5E",
        description="Crisis indicators detected. Immediate support resources provided.",
        primary_actions=["crisis_resources", "grounding_exercise", "trusted_contact"],
        recommended_tools=["breathing"],
        check_in_frequency="as_needed",
        message_tone="calm_grounding_only",
        show_crisis_resources=True,
        escalate_to_human=True,
    ),
}


@dataclass
class CareAssessment:
    care_level: int
    care_label: str
    care_color: str
    care_description: str
    recommended_tools: List[str]
    primary_actions: List[str]
    check_in_frequency: str
    show_crisis_resources: bool
    escalate_to_human: bool
    risk_factors_detected: List[str]
    protective_factors: List[str]
    message_tone: str
    clinical_note: str


def assess_care_level(
    recent_entries: List[dict],
    current_stress_score: float,
    current_mood: str,
    journal_text: str = "",
    manual_crisis_flag: bool = False,
    clinical_scores: dict = None,
) -> CareAssessment:
    """
    Core stepped-care decision engine.
    Now integrates PHQ-9, GAD-7, and WHO-5 clinical scores alongside
    device signals (NICE, 2022 stepped care thresholds).

    clinical_scores dict keys: 'phq9' (0-27), 'gad7' (0-21), 'who5_raw' (0-25)
    """
    risk_factors = []
    protective_factors = []
    level = 1  # default: stable

    # ── CLINICAL ASSESSMENT SCORES (NICE, 2022) ─────────────────
    # PHQ-9: Kroenke et al. (2001). Journal of General Internal Medicine.
    # GAD-7: Spitzer et al. (2006). Archives of Internal Medicine.
    # WHO-5: Bech (1998). WHO Wellbeing Index. NICE threshold < 50.
    if clinical_scores:
        phq9     = clinical_scores.get('phq9', -1)
        gad7     = clinical_scores.get('gad7', -1)
        who5_raw = clinical_scores.get('who5_raw', -1)
        who5_pct = who5_raw * 4 if who5_raw >= 0 else -1

        if phq9 >= 0:
            if phq9 >= 20:
                risk_factors.append(f"PHQ-9 severe depression (score {phq9}/27) — NICE stepped-care Level 4")
                level = max(level, 4)
            elif phq9 >= 15:
                risk_factors.append(f"PHQ-9 moderately severe depression (score {phq9}/27)")
                level = max(level, 3)
            elif phq9 >= 10:
                risk_factors.append(f"PHQ-9 moderate depression (score {phq9}/27)")
                level = max(level, 3)
            elif phq9 >= 5:
                risk_factors.append(f"PHQ-9 mild depression (score {phq9}/27)")
                level = max(level, 2)
            else:
                protective_factors.append(f"PHQ-9 minimal symptoms (score {phq9}/27)")

        if gad7 >= 0:
            if gad7 >= 15:
                risk_factors.append(f"GAD-7 severe anxiety (score {gad7}/21)")
                level = max(level, 3)
            elif gad7 >= 10:
                risk_factors.append(f"GAD-7 moderate anxiety (score {gad7}/21)")
                level = max(level, 3)
            elif gad7 >= 5:
                risk_factors.append(f"GAD-7 mild anxiety (score {gad7}/21)")
                level = max(level, 2)
            else:
                protective_factors.append(f"GAD-7 minimal anxiety (score {gad7}/21)")

        if who5_pct >= 0:
            if who5_pct < 28:
                risk_factors.append(f"WHO-5 critically low wellbeing ({who5_pct}/100) — below NICE depression screening threshold")
                level = max(level, 3)
            elif who5_pct < 50:
                risk_factors.append(f"WHO-5 below average wellbeing ({who5_pct}/100)")
                level = max(level, 2)
            elif who5_pct >= 72:
                protective_factors.append(f"WHO-5 good wellbeing ({who5_pct}/100)")

    # ── LEVEL 4: Crisis flags ────────────────────────────────
    if manual_crisis_flag:
        risk_factors.append("User manually indicated crisis")
        level = 4

    if journal_text:
        journal_lower = journal_text.lower()
        for kw in CRISIS_KEYWORDS:
            if kw in journal_lower:
                risk_factors.append(f"Crisis language detected in journal: '{kw}'")
                level = 4
                break

    # ── Check recent history (last 7 entries) ────────────────
    if recent_entries:
        n = min(len(recent_entries), 7)
        recent = recent_entries[:n]

        stress_scores = [e.get('predicted_stress_score', 0.5) for e in recent]
        moods = [e.get('mood_label', '') for e in recent]
        sleep_values = [e.get('sleep_hours', 7) for e in recent]
        screen_values = [e.get('screen_time_hours', 4) for e in recent]
        journals = [e.get('journal_text') or '' for e in recent]

        avg_stress = sum(stress_scores) / len(stress_scores)
        avg_sleep = sum(sleep_values) / len(sleep_values)
        avg_screen = sum(screen_values) / len(screen_values)

        negative_moods = ['anxious', 'stressed', 'low', 'numb']
        negative_count = sum(1 for m in moods if m in negative_moods)
        negative_ratio = negative_count / len(moods)

        # Check all recent journals for crisis language
        if level < 4:
            for j in journals:
                j_lower = j.lower()
                for kw in CRISIS_KEYWORDS:
                    if kw in j_lower:
                        risk_factors.append("Crisis language in recent journal history")
                        level = 4
                        break

        # Deterioration detection: stress trending up
        if len(stress_scores) >= 3:
            recent_3 = stress_scores[:3]
            older_3  = stress_scores[3:6] if len(stress_scores) >= 6 else stress_scores
            if sum(recent_3) / 3 > sum(older_3) / len(older_3) + 0.15:
                risk_factors.append("Stress score trending upward over recent check-ins")
                level = max(level, 2)

        # ── LEVEL 4: Multiple risk factors ──────────────────
        if level < 4:
            crisis_combo = (
                avg_stress > 0.75 and
                avg_sleep < 5.5 and
                negative_ratio >= 0.85 and
                len(recent) >= 5
            )
            if crisis_combo:
                risk_factors.append("Sustained high stress + sleep collapse + persistent low mood")
                level = 4

        # ── LEVEL 3: Sustained deterioration ────────────────
        if level < 3:
            sustained_deterioration = (
                avg_stress > 0.65 and
                negative_ratio >= 0.7 and
                len(recent) >= 3
            )
            sleep_collapse = avg_sleep < 5.5
            screen_spike = avg_screen > 8

            if sustained_deterioration:
                risk_factors.append(f"Sustained negative mood ({int(negative_ratio*100)}% of recent check-ins)")
                level = max(level, 3)
            if sleep_collapse:
                risk_factors.append(f"Consistently poor sleep (avg {avg_sleep:.1f}h)")
                level = max(level, 3)
            if screen_spike and sustained_deterioration:
                risk_factors.append(f"Screen time spike ({avg_screen:.1f}h avg) during deterioration")
                level = max(level, 3)

            # Deterioration keywords in journals
            for j in journals:
                j_lower = j.lower()
                for kw in DETERIORATION_KEYWORDS:
                    if kw in j_lower:
                        risk_factors.append(f"Deterioration language: '{kw}'")
                        level = max(level, 2)
                        break

        # ── LEVEL 2: Rising stress / mild concern ────────────
        if level < 2:
            if avg_stress > 0.5 or negative_ratio >= 0.5 or current_stress_score > 0.55:
                risk_factors.append("Stress above personal average")
                level = 2
            if avg_sleep < 6.5:
                risk_factors.append(f"Sleep below recommended (avg {avg_sleep:.1f}h)")
                level = max(level, 2)

        # ── Protective factors ───────────────────────────────
        positive_moods = ['calm', 'content', 'energised', 'joyful']
        if sum(1 for m in moods if m in positive_moods) / len(moods) >= 0.5:
            protective_factors.append("Majority of recent check-ins show positive mood")
        if avg_sleep >= 7:
            protective_factors.append(f"Good sleep (avg {avg_sleep:.1f}h)")
        if avg_screen <= 4:
            protective_factors.append("Healthy screen time")
        if avg_stress < 0.4:
            protective_factors.append("Stress scores consistently low")

    else:
        # No history — base level on current reading only.
        # Keep thresholds conservative: a single data point is not enough to
        # escalate beyond Level 2 (NICE, 2022 — pattern needed for Level 3+).
        if current_stress_score > 0.75:
            level = max(level, 2)
            risk_factors.append("High stress on first check-in")
        elif current_stress_score > 0.55:
            level = max(level, 1)  # stay stable; flag it for monitoring only

    # Current mood override
    if current_mood in ['low', 'numb'] and current_stress_score > 0.6:
        level = max(level, 2)

    cl = CARE_LEVELS[level]

    # Clinical note for transparency
    clinical_note = _build_clinical_note(level, risk_factors, protective_factors)

    return CareAssessment(
        care_level=level,
        care_label=cl.label,
        care_color=cl.color,
        care_description=cl.description,
        recommended_tools=cl.recommended_tools,
        primary_actions=cl.primary_actions,
        check_in_frequency=cl.check_in_frequency,
        show_crisis_resources=cl.show_crisis_resources,
        escalate_to_human=cl.escalate_to_human,
        risk_factors_detected=risk_factors,
        protective_factors=protective_factors,
        message_tone=cl.message_tone,
        clinical_note=clinical_note,
    )


def _build_clinical_note(level: int, risks: List[str], protectives: List[str]) -> str:
    if level == 4:
        return "Crisis indicators detected. Crisis resources are being displayed. This is not a clinical assessment — please contact a professional if needed."
    if level == 3:
        return f"Sustained deterioration pattern detected across {len(risks)} indicators. Structured support recommended. This app is not a substitute for professional care."
    if level == 2:
        return "Mild-to-moderate stress signals present. Guided self-help tools have been prioritised."
    return "Wellbeing indicators appear stable. Maintenance and positive habit reinforcement recommended."


# ── UK Crisis Resources ────────────────────────────────────────
CRISIS_RESOURCES_UK = [
    {
        "name": "Samaritans",
        "description": "Free, confidential support 24/7",
        "phone": "116 123",
        "url": "https://www.samaritans.org",
        "available": "24/7",
        "icon": "📞",
    },
    {
        "name": "Crisis Text Line",
        "description": "Text SHOUT to 85258 for free crisis support",
        "phone": "Text SHOUT to 85258",
        "url": "https://giveusashout.org",
        "available": "24/7",
        "icon": "💬",
    },
    {
        "name": "NHS 111",
        "description": "Mental health urgent care line",
        "phone": "111 (select mental health option)",
        "url": "https://111.nhs.uk",
        "available": "24/7",
        "icon": "🏥",
    },
    {
        "name": "Mind",
        "description": "Mental health support and information",
        "phone": "0300 123 3393",
        "url": "https://www.mind.org.uk",
        "available": "Mon–Fri 9am–6pm",
        "icon": "🌿",
    },
    {
        "name": "Student Minds",
        "description": "UK student mental health charity",
        "phone": None,
        "url": "https://www.studentminds.org.uk",
        "available": "Online resources",
        "icon": "🎓",
    },
]

GROUNDING_STEPS = [
    {
        "step": 1,
        "title": "5 things you can see",
        "instruction": "Look around and name 5 things you can see right now. Take your time.",
        "duration_seconds": 30,
    },
    {
        "step": 2,
        "title": "4 things you can touch",
        "instruction": "Notice 4 things you can physically touch. Feel their texture.",
        "duration_seconds": 30,
    },
    {
        "step": 3,
        "title": "3 things you can hear",
        "instruction": "Close your eyes and listen for 3 distinct sounds around you.",
        "duration_seconds": 30,
    },
    {
        "step": 4,
        "title": "2 things you can smell",
        "instruction": "Notice 2 scents — from your environment or your own breath.",
        "duration_seconds": 20,
    },
    {
        "step": 5,
        "title": "1 thing you can taste",
        "instruction": "Notice 1 taste in your mouth. Breathe slowly.",
        "duration_seconds": 20,
    },
]
