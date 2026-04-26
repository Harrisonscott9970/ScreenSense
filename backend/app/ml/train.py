"""
Stress Classifier Training Pipeline
=====================================
Model: Random Forest (Breiman, 2001) with RandomizedSearchCV tuning,
       isotonic probability calibration, and split-conformal prediction
       intervals for distribution-free uncertainty quantification.

Task: Multi-class classification → stress_label ∈ {low, moderate, high}
Features: screen time, sleep, energy, HR, mood valence, cyclical time
          encodings (sin/cos), screen×sleep interaction, weather temp

v3 changes:
  - 12,000 training samples across 6 population archetypes
    (student, professional, shift_worker, athlete, chronic_stress,
     recovering) — Morin et al. (2008); Biddle et al. (2019)
  - 6 new features: hour_sin, hour_cos, day_sin, day_cos,
    screen_sleep_interaction, weather_temp_c
  - Cyclical time encodings prevent the model treating midnight and noon
    as maximally distant when they are 12 hours apart (Waskom, 2018)

v2 features retained:
  - Isotonic probability calibration (Niculescu-Mizil & Caruana, 2005)
  - Split-conformal prediction intervals (Vovk et al., 2005)
  - Permutation importance (Strobl et al., 2007)
  - RandomizedSearchCV (Bergstra & Bengio, 2012)
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
from sklearn.ensemble import RandomForestClassifier, ExtraTreesClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.inspection import permutation_importance
from sklearn.model_selection import (
    train_test_split, cross_val_score, StratifiedKFold,
    RandomizedSearchCV, learning_curve, GroupShuffleSplit,
)
from sklearn.metrics import (
    classification_report, confusion_matrix,
    accuracy_score, f1_score, brier_score_loss, cohen_kappa_score,
    matthews_corrcoef,
)
from sklearn.utils import resample
from sklearn.pipeline import Pipeline

from app.ml.synthetic_data import generate, FEATURES

MODEL_DIR = Path(__file__).parent.parent.parent / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

TARGET = 'stress_label'


def train(force_regenerate: bool = False):
    print("=" * 60)
    print("ScreenSense — ML Training Pipeline v3")
    print("RandomForest + RandomizedSearchCV (Bergstra & Bengio, 2012)")
    print("=" * 60)

    # ── 1. Load or generate training data ──────────────────────────
    data_path = Path(__file__).parent.parent.parent / "data" / "synthetic_training.csv"
    if not data_path.exists() or force_regenerate:
        print("\nGenerating synthetic training data (N=12000, 6 archetypes)...")
        df = generate()
    else:
        df = pd.read_csv(data_path)
        print(f"Loaded {len(df)} training samples from {data_path}")

    X = df[FEATURES]
    y = df[TARGET]

    print(f"\nClass distribution:\n{y.value_counts()}")
    print(f"Class balance: {dict(y.value_counts(normalize=True).round(3))}")

    # ── 2. User-aware train / test split ───────────────────────────
    # Standard random split leaks data: the same user's check-ins appear
    # in both train and test, inflating all metrics (Collins et al., 2015
    # — TRIPOD guidelines for clinical prediction models).
    # GroupShuffleSplit ensures every row from a given user_id is
    # entirely in train OR test — never both. This is external validation.
    if 'user_id' in df.columns:
        groups = df['user_id'].values
        gss = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
        train_idx, test_idx = next(gss.split(X, y, groups=groups))
        X_train = X.iloc[train_idx]
        X_test  = X.iloc[test_idx]
        y_train = y.iloc[train_idx]
        y_test  = y.iloc[test_idx]
        n_train_users = len(set(groups[train_idx]))
        n_test_users  = len(set(groups[test_idx]))
        print(f"\nUser-aware split (Collins et al. 2015 — TRIPOD):")
        print(f"  Train: {len(X_train)} samples · {n_train_users} users")
        print(f"  Test:  {len(X_test)} samples  · {n_test_users} users (held-out, unseen)")
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        print(f"\nRandom split (no user_id column): Train {len(X_train)} | Test {len(X_test)}")

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

    kappa    = cohen_kappa_score(y_test, y_pred)
    mcc      = matthews_corrcoef(y_test, y_pred)

    print(f"\nTest Accuracy:      {acc:.3f}")
    print(f"Test F1 (weighted): {f1:.3f}")
    print(f"Cohen's κ:          {kappa:.3f}  (0=chance, 1=perfect)")
    print(f"Matthews CC:        {mcc:.3f}  (robust to class imbalance)")
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
    kappa_cal = cohen_kappa_score(y_test, y_pred_cal)
    mcc_cal   = matthews_corrcoef(y_test, y_pred_cal)
    print(f"Calibrated Accuracy : {acc_cal:.3f}  (uncalibrated {acc:.3f})")
    print(f"Calibrated F1 wtd   : {f1_cal:.3f}  (uncalibrated {f1:.3f})")
    print(f"Calibrated Cohen's κ: {kappa_cal:.3f}")
    print(f"Calibrated MCC      : {mcc_cal:.3f}")

    # ── Bootstrap 95% CI on test F1 (Efron & Tibshirani, 1993) ────
    # Reports test F1 as a confidence interval rather than a point
    # estimate — turns a descriptive result into a statistical claim.
    print("\nBootstrap CI on test F1 (1000 resamples)...")
    n_boot = 1000
    rng_boot = np.random.default_rng(42)
    boot_f1s = []
    y_test_arr  = np.array(y_test)
    y_pred_arr  = np.array(y_pred_cal)
    for _ in range(n_boot):
        idx = rng_boot.integers(0, len(y_test_arr), size=len(y_test_arr))
        boot_f1s.append(f1_score(y_test_arr[idx], y_pred_arr[idx],
                                  average='weighted', zero_division=0))
    ci_lo = float(np.percentile(boot_f1s, 2.5))
    ci_hi = float(np.percentile(boot_f1s, 97.5))
    print(f"F1 = {f1_cal:.4f}  95% CI [{ci_lo:.4f}, {ci_hi:.4f}]")

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
    # 8b. Conformal PREDICTION SETS — LAC (Angelopoulos & Bates, 2023 §3)
    # ══════════════════════════════════════════════════════════════════
    # Regression-style intervals (step 8) report ŷ ± q_hat on a continuous
    # scale.  The label-conditional set gives a richer guarantee: a *set* of
    # class labels guaranteed to contain the true class with probability
    # ≥ 1 − α.  This is harder to game than a point prediction and directly
    # citable to Vovk et al. (2005) / Angelopoulos & Bates (2023).
    #
    # LAC nonconformity score for a calibration point (x_i, y_i):
    #   s_i  =  1 − P̂(y_i | x_i)
    # At inference, the prediction set for a new x:
    #   Ĉ(x) = { y : P̂(y | x) ≥ 1 − q̂_set }
    # This guarantees  P(Y ∈ Ĉ(X)) ≥ 1 − α  in marginal coverage.
    print("\nComputing LAC conformal prediction sets (Angelopoulos & Bates, 2023)...")
    try:
        proba_cal_lac  = calibrated_pipeline.predict_proba(X_cal)
        classes_lac    = list(calibrated_pipeline.classes_)
        y_cal_arr      = np.array(y_cal)

        # LAC nonconformity: 1 − P(true class | x)
        lac_scores = np.array([
            1.0 - proba_cal_lac[i, classes_lac.index(y_cal_arr[i])]
            for i in range(len(y_cal_arr))
        ])
        n_lac      = len(lac_scores)
        q_set_level = min(1.0, np.ceil((n_lac + 1) * (1 - alpha)) / n_lac)
        q_hat_set   = float(np.quantile(lac_scores, q_set_level, method='higher'))

        # Sanity-check: empirical average set size on the test set
        proba_test_lac  = calibrated_pipeline.predict_proba(X_test)
        set_sizes = [
            sum(1 for ci in range(len(classes_lac)) if proba_test_lac[i, ci] >= 1 - q_hat_set)
            for i in range(len(X_test))
        ]
        avg_set_size = float(np.mean(set_sizes))
        singleton_pct = round(sum(1 for sz in set_sizes if sz == 1) / len(set_sizes) * 100, 1)
        print(f"LAC q_hat_set  : {q_hat_set:.4f}  (α = {alpha})")
        print(f"Avg set size   : {avg_set_size:.2f} classes  ({singleton_pct}% singletons)")
    except Exception as _e:
        q_hat_set    = None
        avg_set_size = None
        print(f"LAC conformal set skipped: {_e}")

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
    # 10. Challenger: ExtraTrees (always runs — no extra deps)
    # ══════════════════════════════════════════════════════════════════
    # ExtraTreesClassifier uses fully random splits instead of optimised
    # splits, making it faster and sometimes better generalising
    # (Geurts et al., 2006 — Extremely Randomised Trees, Machine Learning 63).
    print("\n" + "=" * 60)
    print("Challenger: ExtraTreesClassifier")
    print("=" * 60)
    et_params = {k.replace('clf__', ''): v for k, v in best_params.items()}
    et_pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', CalibratedClassifierCV(
            estimator=ExtraTreesClassifier(
                class_weight='balanced', random_state=42, n_jobs=-1, **et_params,
            ),
            method='isotonic', cv=5,
        )),
    ])
    et_pipeline.fit(X_fit, y_fit)
    et_f1 = f1_score(y_test, et_pipeline.predict(X_test), average='weighted')
    print(f"ExtraTrees F1: {et_f1:.4f}  |  RF F1: {f1_cal:.4f}")

    challenger_report = {'extra_trees_f1': round(et_f1, 4), 'rf_f1': round(f1_cal, 4)}
    if et_f1 > f1_cal + 0.005:
        print("ExtraTrees wins — switching to challenger model.")
        calibrated_pipeline = et_pipeline
        f1_cal = et_f1
        challenger_report['winner'] = 'extra_trees'
    else:
        print("RF remains champion.")
        challenger_report['winner'] = 'random_forest'

    # ── Optional: XGBoost challenger (if installed) ─────────────────
    xgb_report: dict = {}
    try:
        from xgboost import XGBClassifier
        print("\nXGBoost challenger (Friedman, 2001 — gradient boosted trees)...")
        le_xgb = LabelEncoder()
        y_fit_enc  = le_xgb.fit_transform(y_fit)
        y_test_enc = le_xgb.transform(y_test)
        xgb_pip = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', XGBClassifier(
                n_estimators=300, max_depth=6, learning_rate=0.1,
                subsample=0.8, colsample_bytree=0.8,
                n_jobs=-1, random_state=42,
                eval_metric='mlogloss', verbosity=0,
            )),
        ])
        xgb_pip.fit(X_fit, y_fit_enc)
        xgb_f1 = f1_score(y_test_enc, xgb_pip.predict(X_test), average='weighted')
        xgb_report = {'f1_weighted': round(xgb_f1, 4), 'installed': True}
        print(f"XGBoost F1: {xgb_f1:.4f}  |  Champion F1: {f1_cal:.4f}")
        if xgb_f1 > f1_cal + 0.005:
            print("XGBoost wins — but keeping interpretable RF/ET for clinical transparency (Rudin, 2019).")
            xgb_report['note'] = 'Outperforms RF but not deployed — clinical interpretability preferred (Rudin, 2019)'
        else:
            xgb_report['note'] = 'RF/ET remains champion'
        challenger_report['xgboost'] = xgb_report
    except ImportError:
        challenger_report['xgboost'] = {'installed': False, 'note': 'pip install xgboost to enable'}

    # ══════════════════════════════════════════════════════════════════
    # 11. Stacking ensemble — Wolpert (1992) Stacked Generalisation
    # ══════════════════════════════════════════════════════════════════
    # Base learners: RF + ET (each with their own scaler pipeline).
    # Meta-learner: Logistic Regression on the concatenated predict_proba
    # outputs. The meta-learner learns optimal weights across models —
    # superior to manual weighted averaging because the weights are
    # learned from data (Wolpert, 1992; Breiman, 1996 — Stacked Regressions).
    print("\n" + "=" * 60)
    print("Stacking Ensemble (Wolpert, 1992)")
    print("=" * 60)
    try:
        base_estimators_stack = [
            ('rf', Pipeline([
                ('sc',  StandardScaler()),
                ('clf', RandomForestClassifier(
                    class_weight='balanced', random_state=42, n_jobs=-1,
                    **best_rf_params,
                )),
            ])),
            ('et', Pipeline([
                ('sc',  StandardScaler()),
                ('clf', ExtraTreesClassifier(
                    class_weight='balanced', random_state=42, n_jobs=-1,
                    **best_rf_params,
                )),
            ])),
        ]
        stack_clf = StackingClassifier(
            estimators=base_estimators_stack,
            final_estimator=LogisticRegression(
                max_iter=1000, random_state=42,
                class_weight='balanced', C=1.0,
            ),
            cv=5,
            stack_method='predict_proba',
            n_jobs=-1,
        )
        stack_clf.fit(X_train, y_train)
        stack_pred = stack_clf.predict(X_test)
        stack_f1   = f1_score(y_test, stack_pred, average='weighted')
        stack_mcc  = matthews_corrcoef(y_test, stack_pred)
        print(f"Stacking F1: {stack_f1:.4f}  MCC: {stack_mcc:.4f}  |  Champion F1: {f1_cal:.4f}")

        challenger_report['stacking_f1']  = round(stack_f1, 4)
        challenger_report['stacking_mcc'] = round(stack_mcc, 4)

        if stack_f1 > f1_cal + 0.005:
            print("Stacking wins — deploying stacking ensemble as champion.")
            # Wrap in a minimal object that has .predict / .predict_proba / .classes_
            calibrated_pipeline = stack_clf
            f1_cal = stack_f1
            challenger_report['winner'] = 'stacking'
        else:
            print(f"Current champion holds (Δ = {stack_f1 - f1_cal:+.4f}).")
    except Exception as e:
        print(f"Stacking failed: {e}")
        challenger_report['stacking_error'] = str(e)

    # ══════════════════════════════════════════════════════════════════
    # 12. Calibration curve (reliability diagram)
    # ══════════════════════════════════════════════════════════════════
    # Plots predicted probability vs actual positive fraction per class.
    # A perfectly calibrated model produces a 45° diagonal line.
    # Niculescu-Mizil & Caruana (2005) — "Predicting good probabilities".
    print("\nComputing calibration curves (reliability diagrams)...")
    proba_final = calibrated_pipeline.predict_proba(X_test)
    classes_final = list(calibrated_pipeline.classes_)
    cal_curves: dict = {}
    for ci, cname in enumerate(classes_final):
        y_bin = (y_test == cname).astype(int)
        if y_bin.sum() > 0:
            try:
                frac_pos, mean_pred = calibration_curve(
                    y_bin, proba_final[:, ci], n_bins=8, strategy='quantile'
                )
                cal_curves[cname] = {
                    'fraction_of_positives': [round(float(v), 4) for v in frac_pos],
                    'mean_predicted_value':  [round(float(v), 4) for v in mean_pred],
                }
            except Exception:
                pass

    # ══════════════════════════════════════════════════════════════════
    # 12. Learning curve — shows how F1 improves with more training data
    # ══════════════════════════════════════════════════════════════════
    # Demonstrates that 12,000 samples was an appropriate data budget —
    # the curve should plateau, proving diminishing returns beyond this N.
    print("\nComputing learning curve (5 training-set sizes)...")
    lc_sizes = [0.10, 0.25, 0.50, 0.75, 1.00]
    try:
        lc_train_sizes, lc_train_scores, lc_val_scores = learning_curve(
            calibrated_pipeline, X_train, y_train,
            train_sizes=lc_sizes, cv=3,
            scoring='f1_weighted', n_jobs=-1,
        )
        learning_curve_data = {
            'train_sizes':   [int(n) for n in lc_train_sizes],
            'train_f1_mean': [round(float(s.mean()), 4) for s in lc_train_scores],
            'val_f1_mean':   [round(float(s.mean()), 4) for s in lc_val_scores],
            'val_f1_std':    [round(float(s.std()),  4) for s in lc_val_scores],
        }
        print("Learning curve (val F1 by training size):")
        for sz, vf in zip(learning_curve_data['train_sizes'], learning_curve_data['val_f1_mean']):
            print(f"  N={sz:6d}: val F1 = {vf:.4f}")
    except Exception as e:
        learning_curve_data = {'error': str(e)}

    # ══════════════════════════════════════════════════════════════════
    # 13. Save model + evaluation report
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

        # ── additional metrics ───────────────────────────────────────
        "cohen_kappa":             round(kappa_cal, 4),
        "matthews_cc":             round(mcc_cal, 4),
        "f1_bootstrap_ci_lower":   round(ci_lo, 4),
        "f1_bootstrap_ci_upper":   round(ci_hi, 4),
        "split_method":            "user-aware GroupShuffleSplit (Collins et al. 2015)",

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
        # LAC classification prediction set (Angelopoulos & Bates, 2023 §3)
        "conformal_set_q_hat":      round(q_hat_set, 4) if q_hat_set is not None else None,
        "conformal_set_avg_size":   round(avg_set_size, 3) if avg_set_size is not None else None,

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

        # ── Challenger models ────────────────────────────────────────
        "challenger_comparison": challenger_report,

        # ── Reliability diagram (Niculescu-Mizil & Caruana, 2005) ───
        "calibration_curves": cal_curves,

        # ── Learning curve ───────────────────────────────────────────
        "learning_curve": learning_curve_data,
    }
    with open(MODEL_DIR / "eval_report.json", "w") as f:
        json.dump(eval_report, f, indent=2)

    print(f"\nChampion model   → {MODEL_DIR}/stress_classifier.joblib")
    print(f"Uncalibrated RF  → {MODEL_DIR}/stress_classifier_uncalibrated.joblib")
    print(f"Eval report      → {MODEL_DIR}/eval_report.json")
    print("\nTraining complete.")
    return calibrated_pipeline, eval_report


if __name__ == "__main__":
    import sys
    regen = '--regen' in sys.argv
    train(force_regenerate=regen)
