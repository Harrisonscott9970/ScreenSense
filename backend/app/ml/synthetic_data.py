"""
ScreenSense Synthetic Training Data Generator
==============================================
Generates 3000 realistic check-in records with empirically grounded
covariance structure and temporal autocorrelation.

Design decisions grounded in published evidence:
  - Circadian rhythms: cortisol peaks in morning, dips mid-afternoon
    (Pruessner et al., 1997)
  - Screen-stress correlation: r ≈ 0.35 (Thomée et al., 2012)
  - Sleep debt accumulates: poor sleep → elevated next-day stress
    (Walker, M., 2017. Why We Sleep. Scribner.)
  - Screen × sleep interaction: combined exposure amplifies stress
    beyond additive effects (Levenson et al., 2017)
  - Weekday vs weekend: screen time peaks Fri/Sat (Ofcom, 2023)
  - Mood valence: negative moods cluster with high-stress signals
    (Russell, 1980 — Circumplex model of affect)
  - Temporal autocorrelation: today's stress predicts tomorrow's
    (Suls & Martin, 2005 — stress spillover)

Additional references:
  Levenson, J.C. et al. (2017). The association between social media
    use and sleep disturbance among young adults. Preventive Medicine.
  Suls, J. & Martin, R. (2005). The daily life of the garden-variety
    neurotic. Journal of Personality, 73(6), 1485-1510.
  Pruessner, J.C. et al. (1997). Free cortisol levels after awakening.
    Life Sciences, 61(22), 2539-2549.
  Russell, J.A. (1980). A circumplex model of affect. Journal of
    Personality and Social Psychology, 39(6), 1161-1178.
  Thomée, S. et al. (2012). Mobile phone use and mental health.
    BMC Public Health, 11, 66.
  Walker, M. (2017). Why We Sleep. Scribner.
"""
import numpy as np
import pandas as pd
from pathlib import Path

np.random.seed(42)
N = 3000   # increased from 2000 — more data, better generalisation


def generate() -> pd.DataFrame:
    """
    Generate N synthetic check-in records with realistic covariance
    and temporal autocorrelation (stress spillover across days).
    Returns DataFrame and saves to data/synthetic_training.csv.
    """
    records = []

    # ── Individual-level parameters (simulate 60 different users) ──
    n_users   = 60
    user_ids  = np.random.choice(n_users, size=N)

    # Per-user baseline stress proneness (Beta distribution, 0–0.4 range)
    user_stress_bias = np.random.beta(2, 3, size=n_users) * 0.4

    # Per-user baseline sleep quality (some people are naturally better sleepers)
    user_sleep_quality = np.random.normal(0, 0.5, size=n_users)

    # Per-user screen time habits
    user_screen_habit = np.random.gamma(2, 1.5, size=n_users)

    # Track previous-day stress for temporal autocorrelation (Suls & Martin, 2005)
    user_prev_stress: dict = {}

    # ── Simulate each entry ────────────────────────────────────────
    for i in range(N):
        uid  = user_ids[i]
        bias = float(user_stress_bias[uid])

        # ── Temporal context ──────────────────────────────────────
        hour    = np.random.choice(range(7, 24), p=_hour_prob())
        day     = np.random.randint(0, 7)
        is_wknd = day >= 5  # Saturday/Sunday

        # ── Sleep (Walker, 2017) ──────────────────────────────────
        # Weekends slightly better; individual quality offset; sleep debt
        # from previous-day high stress (r ≈ −0.30, Walker 2017)
        prev_stress = user_prev_stress.get(int(uid), 0.4)
        sleep_debt_penalty = max(0, prev_stress - 0.4) * 1.2
        sleep_mean = 7.3 if is_wknd else 6.6
        sleep_mean -= sleep_debt_penalty + user_sleep_quality[uid] * 0.3
        sleep = float(np.clip(np.random.normal(sleep_mean, 1.2), 3, 11))

        # ── Screen time (Ofcom, 2023) ─────────────────────────────
        screen_base = 5.5 if is_wknd else 4.0
        screen_base += float(user_screen_habit[uid]) * 0.3
        if hour >= 18: screen_base += 1.5   # evening peak
        if hour < 10:  screen_base -= 1.0   # low morning screen
        screen = float(np.clip(
            np.random.gamma(2, max(0.5, screen_base / 2)),
            0.5, 14.0
        ))

        # ── Scroll session ────────────────────────────────────────
        scroll = float(np.clip(
            np.random.exponential(screen * 4),
            0.5, 120.0
        ))

        # ── Energy: correlated with sleep, anti-correlated with screen
        energy_base = (sleep / 9.0) * 7 - (screen / 14.0) * 2 + np.random.normal(0, 1.1)
        energy = int(np.clip(round(energy_base), 1, 10))

        # ── Resting HR: mildly elevated under stress ──────────────
        hr_stress_adj = prev_stress * 8   # high stress → elevated HR
        hr = float(np.clip(np.random.normal(68 + hr_stress_adj, 9), 48, 110))

        # ── Cortisol-derived stress score ─────────────────────────
        # Pruessner et al. (1997): peaks early morning, drops after lunch
        circadian_stress = 0.0
        if 7  <= hour <= 9:  circadian_stress =  0.08   # cortisol awakening response
        if 14 <= hour <= 16: circadian_stress = -0.04   # post-lunch dip
        if 20 <= hour:       circadian_stress = -0.06   # wind-down

        # ── Screen × Sleep interaction term (Levenson et al., 2017) ──
        # High screen + low sleep is WORSE than either alone (synergistic)
        screen_sleep_interaction = max(0, (screen / 10.0) * max(0, (8 - sleep) / 8.0)) * 0.15

        # ── Temporal stress spillover (Suls & Martin, 2005) ──────
        spillover = prev_stress * 0.18   # ~18% of yesterday's stress carries over

        # Core stress formula (weighted sum of risk factors + interaction + spillover)
        raw_stress = (
            0.26 * min(screen / 10.0, 1.0)             +   # screen load
            0.20 * max(0, (8 - sleep) / 8.0)           +   # sleep debt
            0.14 * (1 - energy / 10.0)                  +   # fatigue
            0.11 * min(scroll / 60.0, 1.0)             +   # scroll behaviour
            0.07 * max(0, (hr - 70) / 40.0)            +   # physiological arousal
            0.07 * bias                                  +   # individual proneness
            0.05 * circadian_stress                      +   # time of day
            screen_sleep_interaction                     +   # synergistic effect
            spillover                                        # temporal carry-over
        )
        noise = np.random.normal(0, 0.06)
        stress = float(np.clip(raw_stress * 1.4 + noise, 0.02, 0.98))

        # ── Mood: probabilistically linked to stress ──────────────
        mood = _sample_mood(stress)
        mood_map = {
            'anxious': -0.70, 'stressed': -0.60, 'low': -0.80,
            'numb': -0.40,   'calm': 0.60,      'content': 0.70,
            'energised': 0.50, 'joyful': 0.90,
        }
        valence = float(mood_map[mood])

        # Add valence → stress feedback (hopeless = extra stress)
        stress = float(np.clip(stress - valence * 0.08, 0.02, 0.98))

        # Update temporal state
        user_prev_stress[int(uid)] = stress

        # Label
        if stress < 0.33:
            label = 'low'
        elif stress < 0.66:
            label = 'moderate'
        else:
            label = 'high'

        records.append({
            'screen_time_hours':  round(screen, 2),
            'sleep_hours':        round(sleep, 2),
            'energy_level':       energy,
            'hour_of_day':        hour,
            'day_of_week':        day,
            'scroll_session_mins': round(scroll, 2),
            'heart_rate_resting': round(hr, 1),
            'mood_valence':       round(valence, 2),
            'stress_score':       round(stress, 4),
            'stress_label':       label,
        })

    df = pd.DataFrame(records)

    # ── Verify class balance ───────────────────────────────────────
    counts = df['stress_label'].value_counts()
    print(f"Generated {N} synthetic training samples")
    print(f"  low:      {counts.get('low',0):5d} ({counts.get('low',0)/N*100:.1f}%)")
    print(f"  moderate: {counts.get('moderate',0):5d} ({counts.get('moderate',0)/N*100:.1f}%)")
    print(f"  high:     {counts.get('high',0):5d} ({counts.get('high',0)/N*100:.1f}%)")

    # ── Feature correlation summary ────────────────────────────────
    corr = df[['screen_time_hours', 'sleep_hours', 'energy_level',
               'stress_score']].corr()['stress_score'].drop('stress_score')
    print(f"\nFeature correlations with stress score:")
    for feat, r in corr.items():
        print(f"  {feat:22s}: r = {r:+.3f}")

    out = Path(__file__).parent.parent.parent / "data" / "synthetic_training.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"\nSaved → {out}")
    return df


def _hour_prob() -> list:
    """
    Probability distribution over check-in hours (7–23).
    Peaks at morning (8am), lunch (1pm), and evening (9pm).
    Based on self-reporting literature (Mikulincer et al., 2007).
    """
    hours = list(range(7, 24))  # 17 values
    weights = np.array([
        2, 4, 3, 2, 2, 3, 4, 3, 2, 2, 3, 5, 4, 3, 2, 2, 2
    ], dtype=float)
    return list(weights / weights.sum())


def _sample_mood(stress: float) -> str:
    """
    Sample mood label probabilistically from stress score.
    High stress → anxious/stressed/low more likely.
    Low stress → calm/content/joyful more likely.
    (Russell circumplex model, 1980)
    """
    if stress > 0.70:
        probs = {'anxious': 0.28, 'stressed': 0.28, 'low': 0.22,
                 'numb': 0.12, 'calm': 0.05, 'content': 0.02,
                 'energised': 0.02, 'joyful': 0.01}
    elif stress > 0.45:
        probs = {'anxious': 0.18, 'stressed': 0.20, 'low': 0.12,
                 'numb': 0.12, 'calm': 0.18, 'content': 0.10,
                 'energised': 0.06, 'joyful': 0.04}
    else:
        probs = {'anxious': 0.05, 'stressed': 0.05, 'low': 0.05,
                 'numb': 0.07, 'calm': 0.26, 'content': 0.25,
                 'energised': 0.16, 'joyful': 0.11}

    moods  = list(probs.keys())
    weights = np.array(list(probs.values()))
    return str(np.random.choice(moods, p=weights / weights.sum()))


if __name__ == "__main__":
    generate()
