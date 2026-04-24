"""
Stress Classifier Training Pipeline
=====================================
Model: Random Forest (Breiman, 2001) with RandomizedSearchCV tuning,
       isotonic probability calibration, and split-conformal prediction
       intervals for distribution-free uncertainty quantification.

Task: Multi-class classification → stress_label ∈ {low, moderate, high}
Features: screen time, sleep, energy, HR, mood valence, temporal signals

Improvements over v2:
  - Isotonic probability calibration (Niculescu-Mizil & Caruana, 2005).
    Raw RF probabilities are poorly calibrated — they cluster near 0.5
    because of bagging averaging. Our continuous stress score is a
    weighted sum of class probabilities so calibration is essential
    for a statistically meaningful risk score.

  - Split-conformal prediction intervals (Vovk et al., 2005; Angelopoulos
    & Bates, 2023). Reserves a held-out calibration set, computes the
    empirical quantile of absolute residuals, and returns a distribution-
    free 90 % prediction interval with a guaranteed marginal coverage
    property. Goes beyond point estimates — the model now reports
    its own uncertainty in a mathematically rigorous way.

  - Permutation importance (Strobl et al., 2007). Replaces Gini-based
    feature_importances_ (which is biased toward high-cardinality
    features) with an unbiased, model-agnostic alternative computed on
    held-out data. Both are stored for comparison.

Existing features retained:
  - RandomizedSearchCV hyperparameter optimisation (Bergstra & Bengio, 2012)
  - Screen × sleep interaction feature (Levenson et al., 2017)
  - 3000 synthetic samples with temporal autocorrelation
  - OOB score tracking

Academic references:
  Breiman, L. (2001). Random forests. Machine Learning, 45(1), 5-32.
  Bergstra, J. & Bengio, Y. (2012). Random search for hyper-parameter
    optimization. Journal of Machine Learning Research, 13, 281-305.
  Niculescu-Mizil, A. & Caruana, R. (2005). Predicting good probabilities
    with supervised learning. ICML 2005, 625-632.
  Vovk, V., Gammerman, A. & Shafer, G. (2005). Algorithmic Learning in
    a Random World. Springer.
  Angelopoulos, A.N. & Bates, S. (2023). A gentle introduction to conformal
    prediction and distribution-free uncertainty quantification.
    Foundations and Trends in Machine Learning, 16(4), 494-591.
  Strobl, C. et al. (2007). Bias in random forest variable importance
    measures. BMC Bioinformatics, 8, 25.
  Levenson, J.C. et al. (2017). The association between social media use
    and sleep disturbance among young adults. Preventive Medicine.

Run once before starting the server:
    python -m app.ml.train

Outputs:
    data/models/stress_classifier.joblib  — calibrated Pipeline
    data/models/eval_report.json          — metrics + conformal q_hat
"""
import json
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.inspection import permutation_importance
from sklearn.model_selection import (
    train_test_split, cross_val_score, StratifiedKFold,
    RandomizedSearchCV
)
from sklearn.metrics import (
    classification_report, confusion_matrix,
    accuracy_score, f1_score, brier_score_loss
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


def train(force_regenerate: bool = False):
    print("=" * 60)
    print("ScreenSense — ML Training Pipeline v2")
    print("RandomForest + RandomizedSearchCV (Bergstra & Bengio, 2012)")
    print("=" * 60)

    # ── 1. Load or generate training data ──────────────────────────
    data_path = Path(__file__).parent.parent.parent / "data" / "synthetic_training.csv"
    if not data_path.exists() or force_regenerate:
        print("\nGenerating synthetic training data (N=3000, temporal autocorrelation)...")
        df = generate()
    else:
        df = pd.read_csv(data_path)
        print(f"Loaded {len(df)} training samples from {data_path}")

    X = df[FEATURES]
    y = df[TARGET]

    print(f"\nClass distribution:\n{y.value_counts()}")
    print(f"Class balance: {dict(y.value_counts(normalize=True).round(3))}")

    # ── 2. Train / test split (80/20, stratified) ──────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"\nTrain: {len(X_train)} | Test: {len(X_test)}")

    # ── 3. Hyperparameter search (Bergstra & Bengio, 2012) ─────────
    # RandomizedSearchCV is more efficient than GridSearch for high-dim spaces
    print("\nRunning RandomizedSearchCV (50 iterations, 5-fold CV)...")
    param_dist = {
        'clf__n_estimators':       [150, 200, 250, 300, 350, 400, 450, 500],
        'clf__max_depth':          [8, 10, 12, 15, 20, None],
        'clf__min_samples_split':  [2, 4, 5, 6, 8, 10],
        'clf__min_samples_leaf':   [1, 2, 3, 4, 6, 8],
        'clf__max_features':       ['sqrt', 'log2', None],
        'clf__bootstrap':          [True],
    }

    base_pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', RandomForestClassifier(
            class_weight='balanced',
            random_state=42,
            n_jobs=-1,
            oob_score=True,     # out-of-bag error for free
        ))
    ])

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    search = RandomizedSearchCV(
        base_pipeline,
        param_distributions=param_dist,
        n_iter=50,              # 50 random configurations
        cv=cv,
        scoring='f1_weighted',
        n_jobs=-1,
        random_state=42,
        verbose=1,
        refit=True,             # refit on full training set with best params
    )
    search.fit(X_train, y_train)

    best_params = search.best_params_
    best_cv_f1  = round(search.best_score_, 4)
    print(f"\nBest CV F1 (weighted): {best_cv_f1}")
    print(f"Best parameters:")
    for k, v in best_params.items():
        print(f"  {k}: {v}")

    pipeline = search.best_estimator_

    # ── 4. Full 5-fold CV on best pipeline ─────────────────────────
    print("\nFinal 5-fold cross-validation on best estimator...")
    cv_scores = cross_val_score(pipeline, X_train, y_train,
                                cv=cv, scoring='f1_weighted')
    print(f"CV F1 scores: {cv_scores.round(3)}")
    print(f"Mean CV F1:   {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")

    # ── 5. Evaluation on held-out test set ─────────────────────────
    y_pred = pipeline.predict(X_test)
    acc    = accuracy_score(y_test, y_pred)
    f1     = f1_score(y_test, y_pred, average='weighted')
    cm     = confusion_matrix(y_test, y_pred, labels=['low', 'moderate', 'high'])
    report = classification_report(y_test, y_pred, output_dict=True)

    print(f"\nTest Accuracy:      {acc:.3f}")
    print(f"Test F1 (weighted): {f1:.3f}")
    print(f"\nConfusion Matrix:\n{cm}")
    print(f"\nClassification Report:\n{classification_report(y_test, y_pred)}")

    # ── 6. Feature importances with std (Random Forest gives both) ──
    rf = pipeline.named_steps['clf']

    # OOB score — a free extra validation metric
    try:
        oob_score = round(float(rf.oob_score_), 4)
        print(f"\nOOB Score (extra free validation): {oob_score:.3f}")
    except Exception:
        oob_score = None

    importances_mean = rf.feature_importances_
    importances_std  = np.std([tree.feature_importances_
                               for tree in rf.estimators_], axis=0)

    importances = {
        feat: {
            'mean': round(float(m), 4),
            'std':  round(float(s), 4),
        }
        for feat, m, s in zip(FEATURES, importances_mean, importances_std)
    }
    importances_sorted = dict(
        sorted(importances.items(), key=lambda x: x[1]['mean'], reverse=True)
    )

    print(f"\nFeature importances (mean ± std across trees):")
    for feat, d in importances_sorted.items():
        bar = '█' * int(d['mean'] * 50)
        print(f"  {feat:24s}: {d['mean']:.4f} ± {d['std']:.4f}  {bar}")

    # Flat version for backward compat
    importances_flat = {k: v['mean'] for k, v in importances_sorted.items()}

    # ══════════════════════════════════════════════════════════════════
    # 7. Probability calibration (Niculescu-Mizil & Caruana, 2005)
    # ══════════════════════════════════════════════════════════════════
    # RF probabilities are pulled toward 0.5 by bagging. Isotonic
    # regression on a held-out set corrects this monotonically —
    # essential because our continuous stress score is a weighted sum
    # of P(low), P(mod), P(high).
    print("\n" + "=" * 60)
    print("Calibration & Conformal Prediction")
    print("=" * 60)

    # Reserve 15 % of the training set as a conformal calibration split.
    # (Split-conformal requires data never seen during model fitting.)
    X_fit, X_cal, y_fit, y_cal = train_test_split(
        X_train, y_train,
        test_size=0.15, random_state=17, stratify=y_train
    )
    best_rf_params = {
        k.replace('clf__', ''): v for k, v in best_params.items()
    }

    calibrated_pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', CalibratedClassifierCV(
            estimator=RandomForestClassifier(
                class_weight='balanced', random_state=42, n_jobs=-1,
                **best_rf_params,
            ),
            method='isotonic',
            cv=5,
        )),
    ])
    print(f"Fitting calibrated pipeline on {len(X_fit)} samples "
          f"(reserving {len(X_cal)} for conformal calibration)...")
    calibrated_pipeline.fit(X_fit, y_fit)

    # ── Evaluate calibrated model on held-out test ─────────────────
    y_pred_cal = calibrated_pipeline.predict(X_test)
    acc_cal    = accuracy_score(y_test, y_pred_cal)
    f1_cal     = f1_score(y_test, y_pred_cal, average='weighted')
    cm_cal     = confusion_matrix(y_test, y_pred_cal, labels=['low','moderate','high'])
    print(f"Calibrated Accuracy : {acc_cal:.3f}  (uncalibrated {acc:.3f})")
    print(f"Calibrated F1 wtd   : {f1_cal:.3f}  (uncalibrated {f1:.3f})")

    # ── Brier score (multi-class, one-vs-rest mean) ─────────────────
    proba_test = calibrated_pipeline.predict_proba(X_test)
    classes_cal = list(calibrated_pipeline.classes_)
    brier_parts = []
    for ci, cname in enumerate(classes_cal):
        y_true_bin = (y_test == cname).astype(int)
        brier_parts.append(brier_score_loss(y_true_bin, proba_test[:, ci]))
    brier = float(np.mean(brier_parts))
    print(f"Brier score (mean)  : {brier:.4f}   (lower is better, 0 = perfect)")

    # ══════════════════════════════════════════════════════════════════
    # 8. Split-conformal prediction intervals (Vovk et al., 2005)
    # ══════════════════════════════════════════════════════════════════
    # Compute the continuous stress score on the calibration set, then
    # the absolute residual vs the ordinal ground truth. The (1-alpha)
    # quantile of those residuals is q_hat — the margin that gives us
    # the formal coverage guarantee P(y ∈ [ŷ ± q_hat]) ≥ 1 − α.
    alpha   = 0.10            # 90 % coverage
    CLASS_WEIGHT = {'low': 0.0, 'moderate': 0.5, 'high': 1.0}

    proba_cal = calibrated_pipeline.predict_proba(X_cal)
    class_weights = np.array([CLASS_WEIGHT[c] for c in classes_cal])
    score_cal = proba_cal @ class_weights                       # continuous score

    y_cal_score = np.array([CLASS_WEIGHT[y] for y in y_cal])    # ordinal truth
    nonconformity = np.abs(score_cal - y_cal_score)

    n = len(nonconformity)
    # Finite-sample-corrected quantile (Angelopoulos & Bates, 2023, §2)
    q_level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
    q_hat   = float(np.quantile(nonconformity, q_level, method='higher'))

    # Empirical coverage on the test set (sanity-check)
    proba_test_arr = proba_test
    score_test = proba_test_arr @ class_weights
    y_test_score = np.array([CLASS_WEIGHT[y] for y in y_test])
    covered = np.abs(score_test - y_test_score) <= q_hat
    empirical_coverage = float(covered.mean())

    print(f"\nSplit-conformal q_hat : {q_hat:.4f}    (α = {alpha}, target {1-alpha:.0%})")
    print(f"Empirical coverage    : {empirical_coverage:.1%} on test set "
          f"({covered.sum()}/{len(covered)})")
    print(f"Interval width        : ±{q_hat:.3f} on stress score [0,1]")

    # ══════════════════════════════════════════════════════════════════
    # 9. Permutation importance (Strobl et al., 2007)
    # ══════════════════════════════════════════════════════════════════
    # Gini-based feature_importances_ is biased toward continuous /
    # high-cardinality features; permutation importance measures how
    # much test-set F1 drops when each feature is randomly shuffled.
    print("\nComputing permutation importance on test set (10 repeats)...")
    perm = permutation_importance(
        calibrated_pipeline, X_test, y_test,
        n_repeats=10, random_state=42, n_jobs=-1,
        scoring='f1_weighted',
    )
    perm_importances = {
        feat: {
            'mean': round(float(m), 4),
            'std':  round(float(s), 4),
        }
        for feat, m, s in zip(FEATURES, perm.importances_mean, perm.importances_std)
    }
    perm_sorted = dict(sorted(perm_importances.items(),
                              key=lambda x: x[1]['mean'], reverse=True))
    print(f"\nPermutation importances (Δ F1 when feature is shuffled):")
    for feat, d in perm_sorted.items():
        bar = '█' * int(max(0, d['mean']) * 200)
        print(f"  {feat:24s}: {d['mean']:+.4f} ± {d['std']:.4f}  {bar}")

    # ══════════════════════════════════════════════════════════════════
    # 10. Save model + evaluation report
    # ══════════════════════════════════════════════════════════════════
    # The saved pipeline is now the CALIBRATED one (used for inference).
    joblib.dump(calibrated_pipeline, MODEL_DIR / "stress_classifier.joblib")
    # Keep the uncalibrated RF too — retrain endpoint uses it to extract
    # Gini feature importances directly without re-computing.
    joblib.dump(pipeline, MODEL_DIR / "stress_classifier_uncalibrated.joblib")

    eval_report = {
        # ── core metrics (now from CALIBRATED model) ────────────────
        "accuracy":          round(acc_cal, 4),
        "f1_weighted":       round(f1_cal, 4),
        "cv_f1_mean":        round(float(cv_scores.mean()), 4),
        "cv_f1_std":         round(float(cv_scores.std()), 4),
        "best_search_cv_f1": best_cv_f1,
        "oob_score":         oob_score,
        "confusion_matrix":  cm_cal.tolist(),
        "class_report":      classification_report(y_test, y_pred_cal, output_dict=True),

        # ── calibration diagnostics (Niculescu-Mizil & Caruana, 2005) ─
        "calibrated":              True,
        "calibration_method":      "isotonic",
        "brier_score_mean":        round(brier, 4),
        "uncalibrated_accuracy":   round(acc, 4),
        "uncalibrated_f1":         round(f1, 4),

        # ── conformal prediction (Vovk 2005, Angelopoulos & Bates 2023) ─
        "conformal_alpha":          alpha,
        "conformal_target_coverage": round(1 - alpha, 2),
        "conformal_q_hat":          round(q_hat, 4),
        "conformal_empirical_coverage": round(empirical_coverage, 4),
        "conformal_cal_samples":    n,

        # ── importance: Gini (tree-based, biased) ───────────────────
        "feature_importances":          importances_flat,
        "feature_importances_with_std": importances,

        # ── importance: Permutation (unbiased, Strobl 2007) ─────────
        "permutation_importances":      perm_sorted,

        # ── hyperparameters and data ────────────────────────────────
        "best_params":       {k.replace('clf__', ''): str(v)
                              for k, v in best_params.items()},
        "training_samples":  len(X_fit),
        "calibration_samples": len(X_cal),
        "test_samples":      len(X_test),
        "model": (
            f"RandomForest + Isotonic Calibration + Split-Conformal  "
            f"(n_estimators={best_params.get('clf__n_estimators','?')}). "
            f"Calibrated via CalibratedClassifierCV(cv=5). "
            f"Conformal q_hat from {n} held-out samples."
        ),
        "n_estimators":      int(best_params.get('clf__n_estimators', 200)),
    }
    with open(MODEL_DIR / "eval_report.json", "w") as f:
        json.dump(eval_report, f, indent=2)

    print(f"\nCalibrated model → {MODEL_DIR}/stress_classifier.joblib")
    print(f"Uncalibrated     → {MODEL_DIR}/stress_classifier_uncalibrated.joblib")
    print(f"Eval report      → {MODEL_DIR}/eval_report.json")
    print("\nTraining complete.")
    return calibrated_pipeline, eval_report


if __name__ == "__main__":
    import sys
    regen = '--regen' in sys.argv
    train(force_regenerate=regen)
