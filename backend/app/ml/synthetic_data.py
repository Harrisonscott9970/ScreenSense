"""
ScreenSense Synthetic Training Data Generator v2
=================================================
Generates 12,000 realistic check-in records across 6 distinct population
archetypes with expanded feature engineering and temporal autocorrelation.

Population archetypes (Morin et al., 2008; Biddle et al., 2019):
  1. student        — irregular sleep, high screen, evening/night check-ins
  2. professional   — structured schedule, moderate screen, weekday stress
  3. shift_worker   — variable sleep, disrupted circadian rhythms
  4. athlete        — low screen, high sleep quality, morning routines
  5. chronic_stress — persistently elevated stress, poor sleep, low energy
  6. recovering     — gradual improvement trajectory, moderate parameters

New in v2:
  - 4× larger dataset (12,000 vs 3,000) for better generalisation
  - 6 archetype-stratified user populations (120 users, 20 per archetype)
  - Cyclical time features sin/cos(hour) and sin/cos(day) encode the
    periodic structure that raw integers cannot capture (Waskom, 2018)
  - screen_sleep_interaction as an explicit engineered feature
    (Levenson et al., 2017 — synergistic amplification beyond additive)
  - weather_temp_c — mild correlation between temperature extremes and
    stress (Bouchama & Knochel, 2002; Tipton et al., 2017)
  - Three dataset variants generated with different seeds for ensemble
    diversity and to prevent overfitting to a single random sample

Academic references:
  Levenson, J.C. et al. (2017). The association between social media use
    and sleep disturbance among young adults. Preventive Medicine.
  Suls, J. & Martin, R. (2005). The daily life of the garden-variety
    neurotic. Journal of Personality, 73(6), 1485-1510.
  Pruessner, J.C. et al. (1997). Free cortisol levels after awakening.
    Life Sciences, 61(22), 2539-2549.
  Russell, J.A. (1980). A circumplex model of affect. Journal of
    Personality and Social Psychology, 39(6), 1161-1178.
  Thomée, S. et al. (2012). Mobile phone use and mental health.
    BMC Public Health, 11, 66.
  Walker, M. (2017). Why We Sleep. Scribner.
  Morin, C.M. et al. (2008). Epidemiology of insomnia. Sleep Medicine
    Reviews, 10(3), 193-216.
  Biddle, S.J.H. et al. (2019). Screen time, physical activity and
    mental health. British Journal of Sports Medicine, 53(8), 495-496.
  Bouchama, A. & Knochel, J.P. (2002). Heat stroke. NEJM, 346, 1978.
"""
import numpy as np
import pandas as pd
from pathlib import Path

N = 12_000   # samples per dataset

# ── Feature list (shared with train.py and inference.py) ──────────────
FEATURES = [
    'screen_time_hours',
    'sleep_hours',
    'energy_level',
    'hour_of_day',
    'day_of_week',
    'scroll_session_mins',
    'heart_rate_resting',
    'mood_valence',
    # Cyclical time encodings (Waskom, 2018)
    'hour_sin',
    'hour_cos',
    'day_sin',
    'day_cos',
    # Engineered interaction (Levenson et al., 2017)
    'screen_sleep_interaction',
    # Contextual environmental signal
    'weather_temp_c',
]

# ── Population archetype definitions ──────────────────────────────────
# Each archetype shifts the base distributions to represent a distinct
# lifestyle profile. 20 users per archetype, 2000 samples per archetype.
ARCHETYPES: dict = {
    'student': {
        'n_users': 20,
        'sleep_mean': 6.1, 'sleep_sd': 1.5,
        'screen_base': 7.5, 'screen_scale': 1.8,
        'stress_alpha': 3, 'stress_beta': 2,    # right-skewed — higher baseline
        'hr_base': 68, 'energy_offset': -0.5,
        'check_hours': [10, 12, 14, 20, 21, 22, 23],
        'wknd_sleep_bonus': 2.2,                 # big weekend lie-in
    },
    'professional': {
        'n_users': 20,
        'sleep_mean': 6.7, 'sleep_sd': 0.9,
        'screen_base': 5.0, 'screen_scale': 1.0,
        'stress_alpha': 2, 'stress_beta': 3,    # mild weekday stress
        'hr_base': 70, 'energy_offset': 0.0,
        'check_hours': [7, 8, 12, 18, 19, 20],
        'wknd_sleep_bonus': 0.8,
    },
    'shift_worker': {
        'n_users': 20,
        'sleep_mean': 5.7, 'sleep_sd': 2.0,    # high variance — rotating shifts
        'screen_base': 5.5, 'screen_scale': 1.2,
        'stress_alpha': 3, 'stress_beta': 2,
        'hr_base': 72, 'energy_offset': -1.0,
        'check_hours': [6, 7, 14, 15, 22, 23],
        'wknd_sleep_bonus': 0.2,                 # weekends no different for shift workers
    },
    'athlete': {
        'n_users': 20,
        'sleep_mean': 8.1, 'sleep_sd': 0.7,    # prioritise recovery sleep
        'screen_base': 2.8, 'screen_scale': 0.5,
        'stress_alpha': 1, 'stress_beta': 4,    # low baseline stress
        'hr_base': 56, 'energy_offset': 1.5,    # athletic fitness → high energy, low HR
        'check_hours': [6, 7, 8, 12, 18, 19],
        'wknd_sleep_bonus': 0.5,
    },
    'chronic_stress': {
        'n_users': 20,
        'sleep_mean': 5.0, 'sleep_sd': 1.2,
        'screen_base': 8.5, 'screen_scale': 2.0,
        'stress_alpha': 4, 'stress_beta': 2,    # heavily right-skewed — high stress
        'hr_base': 77, 'energy_offset': -1.5,
        'check_hours': [9, 10, 13, 20, 21, 22],
        'wknd_sleep_bonus': 0.3,
    },
    'recovering': {
        'n_users': 20,
        'sleep_mean': 6.8, 'sleep_sd': 1.0,    # improving sleep
        'screen_base': 4.5, 'screen_scale': 0.9,
        'stress_alpha': 2, 'stress_beta': 3,    # improving — similar to professional
        'hr_base': 66, 'energy_offset': 0.3,
        'check_hours': [8, 9, 12, 19, 20, 21],
        'wknd_sleep_bonus': 0.9,
    },
}


def generate(seed: int = 42, n: int = N, suffix: str = '') -> pd.DataFrame:
    """
    Generate N synthetic check-in records across 6 population archetypes
    with temporal autocorrelation (Suls & Martin, 2005) and expanded
    feature engineering.

    Args:
        seed:   Random seed — change to produce a different dataset variant.
        n:      Total number of samples (evenly split across archetypes).
        suffix: Optional filename suffix, e.g. '_alt1' for alternate datasets.

    Returns:
        DataFrame saved to data/synthetic_training{suffix}.csv
    """
    rng = np.random.default_rng(seed)
    archetype_names = list(ARCHETYPES.keys())
    n_per_archetype = n // len(archetype_names)

    # Build a flat list of (archetype_name, archetype_cfg, user_local_id)
    user_pool: list[tuple[str, dict, int]] = []
    for arch_name, cfg in ARCHETYPES.items():
        for u in range(cfg['n_users']):
            user_pool.append((arch_name, cfg, u))

    records = []

    for arch_name, cfg in ARCHETYPES.items():
        n_users = cfg['n_users']

        # Per-user baseline parameters
        user_stress_bias   = rng.beta(cfg['stress_alpha'], cfg['stress_beta'], size=n_users) * 0.45
        user_sleep_quality = rng.normal(0, 0.4, size=n_users)
        user_screen_habit  = rng.gamma(2, 1.2, size=n_users)
        user_prev_stress: dict[int, float] = {}

        for _ in range(n_per_archetype):
            uid  = int(rng.integers(0, n_users))
            bias = float(user_stress_bias[uid])

            # ── Temporal context ──────────────────────────────────
            check_hours = cfg['check_hours']
            hour = int(rng.choice(check_hours))
            day  = int(rng.integers(0, 7))
            is_wknd = day >= 5

            # ── Weather (seasonal temperature variation) ──────────
            # Range covers typical UK climate for this dissertation context.
            # Temp extremes contribute mild stress (Bouchama & Knochel, 2002)
            temp_base = rng.choice([5.0, 12.0, 20.0, 14.0])  # seasonal baseline
            weather_temp_c = float(np.clip(rng.normal(temp_base, 5.0), -8.0, 35.0))
            temp_stress_adj = 0.0
            if weather_temp_c < 2.0:
                temp_stress_adj = 0.04    # cold → mild stress increase
            elif weather_temp_c > 28.0:
                temp_stress_adj = 0.03    # heat → mild stress increase

            # ── Sleep (Walker, 2017) ──────────────────────────────
            prev_stress = user_prev_stress.get(uid, 0.4)
            sleep_debt  = max(0.0, prev_stress - 0.4) * 1.1
            sleep_mean  = cfg['sleep_mean'] + (cfg['wknd_sleep_bonus'] if is_wknd else 0.0)
            sleep_mean -= sleep_debt + user_sleep_quality[uid] * 0.3
            sleep = float(np.clip(rng.normal(sleep_mean, cfg['sleep_sd']), 3.0, 11.5))

            # ── Screen time (Ofcom, 2023) ─────────────────────────
            screen_base = cfg['screen_base'] + (1.5 if is_wknd else 0.0)
            screen_base += float(user_screen_habit[uid]) * 0.25
            if hour >= 18: screen_base += 1.2
            if hour < 10:  screen_base -= 0.8
            screen = float(np.clip(
                rng.gamma(2, max(0.5, screen_base / 2)),
                0.3, 14.0
            ))

            # ── Scroll session ────────────────────────────────────
            scroll = float(np.clip(rng.exponential(screen * 4), 0.5, 120.0))

            # ── Energy ───────────────────────────────────────────
            energy_base = (sleep / 9.0) * 7 - (screen / 14.0) * 2 + cfg['energy_offset']
            energy_base += rng.normal(0, 1.0)
            energy = int(np.clip(round(energy_base), 1, 10))

            # ── Resting HR ────────────────────────────────────────
            hr_stress_adj = prev_stress * 9
            hr = float(np.clip(rng.normal(cfg['hr_base'] + hr_stress_adj, 8), 44, 115))

            # ── Circadian stress (Pruessner et al., 1997) ─────────
            circadian_stress = 0.0
            if 7  <= hour <= 9:  circadian_stress =  0.08
            if 14 <= hour <= 16: circadian_stress = -0.04
            if 20 <= hour:       circadian_stress = -0.06

            # ── Screen × sleep interaction (Levenson et al., 2017) ─
            screen_sleep_interaction = float(
                max(0.0, (screen / 10.0) * max(0.0, (8 - sleep) / 8.0)) * 0.15
            )

            # ── Temporal spillover (Suls & Martin, 2005) ─────────
            spillover = prev_stress * 0.18

            # ── Stress formula ────────────────────────────────────
            raw_stress = (
                0.26 * min(screen / 10.0, 1.0)        +
                0.20 * max(0, (8 - sleep) / 8.0)      +
                0.14 * (1 - energy / 10.0)              +
                0.11 * min(scroll / 60.0, 1.0)         +
                0.07 * max(0, (hr - 70) / 40.0)        +
                0.07 * bias                              +
                0.05 * circadian_stress                  +
                screen_sleep_interaction                 +
                spillover                                +
                temp_stress_adj
            )
            noise  = rng.normal(0, 0.06)
            stress = float(np.clip(raw_stress * 1.35 + noise, 0.02, 0.98))

            # ── Mood (Russell circumplex, 1980) ───────────────────
            mood   = _sample_mood(stress, rng)
            valence = _MOOD_VALENCE[mood]
            stress = float(np.clip(stress - valence * 0.08, 0.02, 0.98))

            user_prev_stress[uid] = stress

            # ── Cyclical time encodings (Waskom, 2018) ────────────
            hour_sin = float(np.sin(2 * np.pi * hour / 24))
            hour_cos = float(np.cos(2 * np.pi * hour / 24))
            day_sin  = float(np.sin(2 * np.pi * day  / 7))
            day_cos  = float(np.cos(2 * np.pi * day  / 7))

            # ── Stress label ──────────────────────────────────────
            if stress < 0.33:
                label = 'low'
            elif stress < 0.66:
                label = 'moderate'
            else:
                label = 'high'

            records.append({
                'screen_time_hours':       round(screen, 2),
                'sleep_hours':             round(sleep, 2),
                'energy_level':            energy,
                'hour_of_day':             hour,
                'day_of_week':             day,
                'scroll_session_mins':     round(scroll, 2),
                'heart_rate_resting':      round(hr, 1),
                'mood_valence':            round(valence, 2),
                'hour_sin':                round(hour_sin, 4),
                'hour_cos':                round(hour_cos, 4),
                'day_sin':                 round(day_sin, 4),
                'day_cos':                 round(day_cos, 4),
                'screen_sleep_interaction': round(screen_sleep_interaction, 4),
                'weather_temp_c':          round(weather_temp_c, 1),
                'stress_score':            round(stress, 4),
                'stress_label':            label,
                'archetype':               arch_name,
                'user_id':                 f"{arch_name}_{uid:02d}",
            })

    df = pd.DataFrame(records)
    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)  # shuffle

    # ── Diagnostics ───────────────────────────────────────────────────
    counts = df['stress_label'].value_counts()
    print(f"\n{'='*55}")
    print(f"ScreenSense Synthetic Data v2  (seed={seed}, N={len(df)})")
    print(f"{'='*55}")
    print(f"  low:      {counts.get('low',0):5d}  ({counts.get('low',0)/len(df)*100:.1f}%)")
    print(f"  moderate: {counts.get('moderate',0):5d}  ({counts.get('moderate',0)/len(df)*100:.1f}%)")
    print(f"  high:     {counts.get('high',0):5d}  ({counts.get('high',0)/len(df)*100:.1f}%)")
    print(f"\nArchetype distribution:")
    for arch, cnt in df['archetype'].value_counts().items():
        print(f"  {arch:18s}: {cnt}")
    corr = df[['screen_time_hours','sleep_hours','energy_level','stress_score']
              ].corr()['stress_score'].drop('stress_score')
    print(f"\nCorrelations with stress_score:")
    for feat, r in corr.items():
        print(f"  {feat:22s}: r = {r:+.3f}")

    # ── Save ──────────────────────────────────────────────────────────
    out = Path(__file__).parent.parent.parent / "data" / f"synthetic_training{suffix}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"\nSaved → {out}")
    return df


def generate_all() -> None:
    """
    Generate three dataset variants with different random seeds.
    The main dataset (seed=42) is used by train.py by default.
    Alt variants (seeds 1337, 9999) provide diversity for ensemble
    training or curriculum experiments.
    """
    generate(seed=42,   n=N, suffix='')       # primary → synthetic_training.csv
    generate(seed=1337, n=N, suffix='_alt1')  # alt 1   → synthetic_training_alt1.csv
    generate(seed=9999, n=N, suffix='_alt2')  # alt 2   → synthetic_training_alt2.csv
    print("\nAll three dataset variants generated.")


# ── Helpers ───────────────────────────────────────────────────────────

_MOOD_VALENCE: dict[str, float] = {
    'anxious': -0.70, 'stressed': -0.60, 'low': -0.80,
    'numb': -0.40, 'calm': 0.60, 'content': 0.70,
    'energised': 0.50, 'joyful': 0.90,
}


def _sample_mood(stress: float, rng: np.random.Generator) -> str:
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
    moods   = list(probs.keys())
    weights = np.array(list(probs.values()))
    return str(rng.choice(moods, p=weights / weights.sum()))


if __name__ == "__main__":
    import sys
    if '--all' in sys.argv:
        generate_all()
    else:
        generate()
