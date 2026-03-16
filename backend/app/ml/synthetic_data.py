import numpy as np
import pandas as pd
from pathlib import Path

np.random.seed(42)
N = 2000

def generate():
    data = []
    for _ in range(N):
        screen = np.random.beta(2, 3) * 12
        sleep = np.clip(np.random.normal(6.8, 1.5), 2, 12)
        energy = np.random.randint(1, 11)
        hour = np.random.randint(0, 24)
        day = np.random.randint(0, 7)
        scroll = np.random.exponential(20)
        hr = np.random.normal(68, 12)
        mood_valence = np.random.choice(
            ['anxious','stressed','low','numb','calm','content','energised','joyful'],
            p=[0.12,0.13,0.12,0.08,0.15,0.15,0.13,0.12]
        )
        mood_map = {'anxious':-0.70,'stressed':-0.60,'low':-0.80,'numb':-0.40,'calm':0.60,'content':0.70,'energised':0.50,'joyful':0.90}
        valence = mood_map[mood_valence]
        stress = (
            0.30 * min(screen / 10.0, 1.0) +
            0.20 * max(0, (8 - sleep) / 8.0) +
            0.15 * (1 - energy / 10.0) +
            0.15 * min(scroll / 60.0, 1.0) +
            0.10 * max(0, (hr - 70) / 40.0) +
            0.10 * max(0, -valence)
        )
        stress = float(np.clip(stress * 1.6 + np.random.normal(0, 0.08), 0, 1))
        if stress < 0.33:
            label = 'low'
        elif stress < 0.66:
            label = 'moderate'
        else:
            label = 'high'
        data.append({'screen_time_hours':round(screen,2),'sleep_hours':round(sleep,2),'energy_level':energy,'hour_of_day':hour,'day_of_week':day,'scroll_session_mins':round(scroll,2),'heart_rate_resting':round(hr,1),'mood_valence':round(valence,2),'stress_score':round(stress,4),'stress_label':label})
    df = pd.DataFrame(data)
    out = Path(__file__).parent.parent.parent / "data" / "synthetic_training.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"Generated {N} samples")
    print(df['stress_label'].value_counts())
    return df

if __name__ == "__main__":
    generate()
