"""
LSTM Longitudinal Mood Predictor
==================================
Architecture: Many-to-one LSTM
Input:  Last 7 check-ins as feature sequences
Output: Predicted next mood valence (-1.0 to +1.0)

Academic citation:
  Hochreiter, S. & Schmidhuber, J. (1997). Long Short-Term Memory.
  Neural Computation, 9(8), 1735-1780.

Dissertation value:
  This forms the second layer of the hybrid AI ensemble:
  - Random Forest: real-time cross-sectional stress classification
  - LSTM: longitudinal within-person mood prediction
  Combined = novel contribution not seen in undergraduate HCI work.

Run: python -m app.ml.train_lstm
"""
import torch
import torch.nn as nn
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from typing import Optional, List

MODEL_DIR = Path(__file__).parent.parent.parent / "data" / "models"
SEQ_LEN = 7

LSTM_FEATURES = [
    'screen_time_hours',
    'sleep_hours',
    'energy_level',
    'hour_of_day',
    'day_of_week',
    'scroll_session_mins',
    'heart_rate_resting',
    'predicted_stress_score',
]
INPUT_SIZE = len(LSTM_FEATURES)

MOOD_VALENCE = {
    'anxious': -0.70, 'stressed': -0.60, 'low': -0.80,
    'numb': -0.40, 'calm': 0.60, 'content': 0.70,
    'energised': 0.50, 'joyful': 0.90
}

VALENCE_TO_MOOD = [
    (-1.0,  -0.55, 'low'),
    (-0.55, -0.35, 'anxious'),
    (-0.35, -0.15, 'numb'),
    (-0.15,  0.25, 'calm'),
    (0.25,   0.55, 'content'),
    (0.55,   0.72, 'energised'),
    (0.72,   1.01, 'joyful'),
]


class MoodLSTM(nn.Module):
    """
    Many-to-one LSTM predicting next mood valence.
    2 layers, hidden=64, dropout=0.3
    Output: tanh activation → [-1, 1] valence range
    """
    def __init__(self, input_size=INPUT_SIZE, hidden_size=64,
                 num_layers=2, dropout=0.3):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size, hidden_size=hidden_size,
            num_layers=num_layers, batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0
        )
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, 1)
        self.act = nn.Tanh()

    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.dropout(out[:, -1, :])
        return self.act(self.fc(out)).squeeze(-1)


def build_sequences(df: pd.DataFrame):
    """Convert flat DataFrame into overlapping sequences for LSTM training."""
    stress_map = {'low': 0.1, 'moderate': 0.5, 'high': 0.9}

    if 'predicted_stress_score' not in df.columns:
        df['predicted_stress_score'] = df['stress_label'].map(stress_map)
    if 'mood_valence' not in df.columns:
        df['mood_valence'] = df['stress_score'].apply(lambda x: float(x) * -1.4 + 0.7)

    values = df[LSTM_FEATURES].fillna(0).values.astype(np.float32)
    targets = df['mood_valence'].values.astype(np.float32)
    X, y = [], []
    for i in range(len(df) - SEQ_LEN):
        X.append(values[i:i + SEQ_LEN])
        y.append(targets[i + SEQ_LEN])
    return np.array(X), np.array(y)


def train_lstm(epochs=60, lr=1e-3, batch_size=32):
    """Full LSTM training pipeline."""
    print("=" * 50)
    print("ScreenSense — LSTM Training Pipeline")
    print("=" * 50)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    data_path = Path(__file__).parent.parent.parent / "data" / "synthetic_training.csv"
    if not data_path.exists():
        from app.ml.synthetic_data import generate
        df = generate()
    else:
        df = pd.read_csv(data_path)

    print(f"Loaded {len(df)} samples")
    X, y = build_sequences(df)
    print(f"Sequences: {X.shape}")

    split = int(len(X) * 0.8)
    X_tr, X_v = torch.tensor(X[:split]), torch.tensor(X[split:])
    y_tr, y_v = torch.tensor(y[:split]), torch.tensor(y[split:])

    mean = X_tr.mean(dim=(0, 1), keepdim=True)
    std  = X_tr.std(dim=(0, 1), keepdim=True) + 1e-8
    X_tr = (X_tr - mean) / std
    X_v  = (X_v  - mean) / std

    joblib.dump({'mean': mean.numpy(), 'std': std.numpy()},
                MODEL_DIR / "lstm_norm.joblib")

    model = MoodLSTM()
    opt   = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.StepLR(opt, step_size=20, gamma=0.5)
    loss_fn = nn.MSELoss()

    best_val = float('inf')
    for epoch in range(epochs):
        model.train()
        perm = torch.randperm(len(X_tr))
        for i in range(0, len(X_tr), batch_size):
            idx = perm[i:i+batch_size]
            opt.zero_grad()
            loss = loss_fn(model(X_tr[idx]), y_tr[idx])
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
        sched.step()

        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(model(X_v), y_v).item()

        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), MODEL_DIR / "lstm_mood.pt")

        if (epoch + 1) % 10 == 0:
            print(f"Epoch {epoch+1:3d}/{epochs} | Val MSE: {val_loss:.4f}")

    print(f"\nBest val MSE: {best_val:.4f}")
    print(f"Model saved → {MODEL_DIR}/lstm_mood.pt")
    return model, best_val


def load_lstm() -> Optional[MoodLSTM]:
    path = MODEL_DIR / "lstm_mood.pt"
    if not path.exists():
        return None
    model = MoodLSTM()
    model.load_state_dict(torch.load(path, map_location='cpu', weights_only=True))
    model.eval()
    return model


def predict_next_mood(recent_entries: List[dict]) -> Optional[dict]:
    """
    Given last N entries from SQLite, predict next mood valence.
    Returns None if < SEQ_LEN entries or model not trained.
    """
    if len(recent_entries) < SEQ_LEN:
        return None
    model = load_lstm()
    if model is None:
        return None

    norm_path = MODEL_DIR / "lstm_norm.joblib"
    if not norm_path.exists():
        return None
    norm = joblib.load(norm_path)
    mean = torch.tensor(norm['mean'])
    std  = torch.tensor(norm['std'])

    rows = []
    for e in recent_entries[-SEQ_LEN:]:
        rows.append([
            float(e.get('screen_time_hours') or 4.0),
            float(e.get('sleep_hours') or 7.0),
            float(e.get('energy_level') or 5),
            float(e.get('hour_of_day') or 12),
            float(e.get('day_of_week') or 0),
            float(e.get('scroll_session_mins') or 15),
            float(e.get('heart_rate_resting') or 68.0),
            float(e.get('predicted_stress_score') or 0.5),
        ])

    x = torch.tensor([rows], dtype=torch.float32)
    x = (x - mean) / std

    with torch.no_grad():
        valence = model(x).item()

    predicted_mood = 'calm'
    for lo, hi, label in VALENCE_TO_MOOD:
        if lo <= valence < hi:
            predicted_mood = label
            break

    return {
        'predicted_valence': round(float(valence), 4),
        'predicted_mood': predicted_mood,
        'confidence': round(min(abs(float(valence)), 1.0), 3),
        'model': 'LSTM (Hochreiter & Schmidhuber, 1997)',
        'sequence_length': SEQ_LEN,
        'based_on_entries': len(recent_entries),
    }


if __name__ == "__main__":
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    train_lstm()
