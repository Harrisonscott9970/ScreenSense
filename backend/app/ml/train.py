"""
Stress Classifier Training Pipeline
=====================================
Model: Random Forest (Breiman, 2001)
Task: Multi-class classification → stress_label ∈ {low, moderate, high}
Features: screen time, sleep, energy, HR, mood valence, temporal signals

Run once before starting the server:
    python -m app.ml.train

Outputs:
    data/models/stress_classifier.joblib  — trained model
    data/models/scaler.joblib             — feature scaler
    data/models/eval_report.json          — metrics for dissertation
"""
import json
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import (
    classification_report, confusion_matrix,
    accuracy_score, f1_score
)
from sklearn.pipeline import Pipeline

from app.ml.synthetic_data import generate

MODEL_DIR = Path(__file__).parent.parent.parent / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

FEATURES = [
    'screen_time_hours',
    'sleep_hours',
    'energy_level',
    'hour_of_day',
    'day_of_week',
    'scroll_session_mins',
    'heart_rate_resting',
    'mood_valence'
]
TARGET = 'stress_label'


def train():
    print("=" * 50)
    print("ScreenSense — ML Training Pipeline")
    print("=" * 50)

    # 1. Load or generate training data
    data_path = Path(__file__).parent.parent.parent / "data" / "synthetic_training.csv"
    if not data_path.exists():
        print("Generating synthetic training data...")
        df = generate()
    else:
        df = pd.read_csv(data_path)
        print(f"Loaded {len(df)} training samples from {data_path}")

    X = df[FEATURES]
    y = df[TARGET]

    print(f"\nClass distribution:\n{y.value_counts()}")

    # 2. Train / test split (80/20, stratified)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # 3. Build pipeline: scaler + Random Forest
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', RandomForestClassifier(
            n_estimators=200,
            max_depth=12,
            min_samples_leaf=4,
            class_weight='balanced',    # handles class imbalance
            random_state=42,
            n_jobs=-1
        ))
    ])

    # 4. Cross-validation (5-fold, stratified) — report this in dissertation
    print("\nRunning 5-fold cross-validation...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(pipeline, X_train, y_train, cv=cv, scoring='f1_weighted')
    print(f"CV F1 scores: {cv_scores.round(3)}")
    print(f"Mean CV F1:   {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")

    # 5. Final fit on full training set
    pipeline.fit(X_train, y_train)

    # 6. Evaluation on held-out test set
    y_pred = pipeline.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average='weighted')
    cm = confusion_matrix(y_test, y_pred, labels=['low', 'moderate', 'high'])
    report = classification_report(y_test, y_pred, output_dict=True)

    print(f"\nTest Accuracy:     {acc:.3f}")
    print(f"Test F1 (weighted): {f1:.3f}")
    print(f"\nConfusion Matrix:\n{cm}")
    print(f"\nClassification Report:\n{classification_report(y_test, y_pred)}")

    # 7. Feature importances (Random Forest gives these for free)
    rf = pipeline.named_steps['clf']
    importances = dict(zip(FEATURES, rf.feature_importances_.round(4).tolist()))
    importances_sorted = dict(sorted(importances.items(), key=lambda x: x[1], reverse=True))
    print(f"\nFeature importances:\n{json.dumps(importances_sorted, indent=2)}")

    # 8. Save model + evaluation report
    joblib.dump(pipeline, MODEL_DIR / "stress_classifier.joblib")

    eval_report = {
        "accuracy": round(acc, 4),
        "f1_weighted": round(f1, 4),
        "cv_f1_mean": round(float(cv_scores.mean()), 4),
        "cv_f1_std": round(float(cv_scores.std()), 4),
        "confusion_matrix": cm.tolist(),
        "class_report": report,
        "feature_importances": importances_sorted,
        "training_samples": len(X_train),
        "test_samples": len(X_test),
        "model": "RandomForestClassifier(n_estimators=200)"
    }
    with open(MODEL_DIR / "eval_report.json", "w") as f:
        json.dump(eval_report, f, indent=2)

    print(f"\nModel saved → {MODEL_DIR}/stress_classifier.joblib")
    print(f"Eval report → {MODEL_DIR}/eval_report.json")
    print("\nTraining complete.")
    return pipeline, eval_report


if __name__ == "__main__":
    train()
