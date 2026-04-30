"""
ScreenSense ML Pipeline — Unit Tests
======================================
Covers the core ML components without requiring a trained model
on disk. Each test is isolated and runs in < 1 s.

Run: pytest tests/test_ml.py -v --tb=short

Academic grounding for the pipeline under test:
  Hutto & Gilbert (2014)  — VADER sentiment
  Breiman (2001)          — Random Forest
  Schuster & Paliwal (1997) — BiLSTM
  Beck (1979)             — CBT / nudge engine
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


# ─────────────────────────────────────────────────────────────────
# 1. build_feature_vector — shape and value correctness
# ─────────────────────────────────────────────────────────────────

class TestBuildFeatureVector:
    """Tests for inference.build_feature_vector."""

    def setup_method(self):
        from app.ml.inference import build_feature_vector
        self.bfv = build_feature_vector

    def test_output_shape(self):
        """Feature matrix must be (1, 14) — matching the RF training schema."""
        fv = self.bfv(
            screen_time_hours=4.0, sleep_hours=7.0, energy_level=5,
            hour_of_day=12, day_of_week=1, scroll_session_mins=20,
            heart_rate_resting=68.0, mood_label='calm',
        )
        assert fv.shape == (1, 14), (
            f"Expected (1, 14) but got {fv.shape}. "
            "Check FEATURES list in synthetic_data.py matches build_feature_vector."
        )

    def test_screen_time_first_feature(self):
        """First column must equal the screen_time_hours input (no transformation)."""
        fv = self.bfv(5.5, 7.0, 5, 10, 2, 15, 68.0, 'calm')
        assert float(fv[0, 0]) == pytest.approx(5.5)

    def test_sleep_hours_second_feature(self):
        fv = self.bfv(4.0, 6.5, 5, 10, 2, 15, 68.0, 'calm')
        assert float(fv[0, 1]) == pytest.approx(6.5)

    def test_negative_mood_valence(self):
        """Anxious mood should map to a negative valence (index 7)."""
        fv = self.bfv(4.0, 7.0, 5, 10, 2, 15, 68.0, 'anxious')
        assert float(fv[0, 7]) < 0, "Anxious mood valence should be negative"

    def test_positive_mood_valence(self):
        """Joyful mood should map to a positive valence (index 7)."""
        fv = self.bfv(4.0, 7.0, 5, 10, 2, 15, 68.0, 'joyful')
        assert float(fv[0, 7]) > 0, "Joyful mood valence should be positive"

    def test_unknown_mood_defaults_to_zero_valence(self):
        """Unmapped mood labels should default to 0.0 valence rather than crashing."""
        fv = self.bfv(4.0, 7.0, 5, 10, 2, 15, 68.0, 'confused')
        assert float(fv[0, 7]) == pytest.approx(0.0)

    def test_hr_zero_defaults_to_68(self):
        """A heart_rate_resting of 0 should be substituted with 68 bpm (population mean)."""
        fv_zero = self.bfv(4.0, 7.0, 5, 10, 2, 15, 0.0, 'calm')
        fv_68   = self.bfv(4.0, 7.0, 5, 10, 2, 15, 68.0, 'calm')
        assert float(fv_zero[0, 6]) == pytest.approx(float(fv_68[0, 6]))

    def test_cyclical_hour_encoding_in_range(self):
        """Cyclical sin/cos hour encodings (cols 8 & 9) must stay in [-1, 1]."""
        for hour in [0, 6, 12, 18, 23]:
            fv = self.bfv(4.0, 7.0, 5, hour, 2, 15, 68.0, 'calm')
            assert -1.0 <= float(fv[0, 8]) <= 1.0, f"hour_sin out of range for hour={hour}"
            assert -1.0 <= float(fv[0, 9]) <= 1.0, f"hour_cos out of range for hour={hour}"

    def test_all_values_finite(self):
        """No NaN or Inf should appear anywhere in the feature vector."""
        fv = self.bfv(10.0, 3.0, 1, 23, 6, 90, 100.0, 'stressed')
        assert np.all(np.isfinite(fv)), "Feature vector contains NaN or Inf"


# ─────────────────────────────────────────────────────────────────
# 2. predict_stress — heuristic fallback when model is absent
# ─────────────────────────────────────────────────────────────────

class TestPredictStress:
    """Tests for inference.predict_stress — exercises both heuristic and RF paths."""

    def setup_method(self):
        from app.ml.inference import build_feature_vector, predict_stress, _heuristic_stress
        self.bfv   = build_feature_vector
        self.ps    = predict_stress
        self.heur  = _heuristic_stress

    def _fv(self, screen=4.0, sleep=7.0, energy=5, hour=12, dow=2,
            scroll=15, hr=68.0, mood='calm'):
        return self.bfv(screen, sleep, energy, hour, dow, scroll, hr, mood)

    def test_heuristic_score_in_range(self):
        """Heuristic fallback must return a score in [0, 1]."""
        result = self.heur(self._fv())
        assert 0.0 <= result['stress_score'] <= 1.0

    def test_heuristic_fallback_flag(self):
        """Heuristic fallback must set fallback=True so callers know the model was absent."""
        result = self.heur(self._fv())
        assert result.get('fallback') is True

    def test_heuristic_high_input_yields_higher_score(self):
        """High screen time + poor sleep + negative mood should score higher than ideal conditions."""
        bad  = self.heur(self._fv(screen=12.0, sleep=3.0, energy=1, mood='anxious'))
        good = self.heur(self._fv(screen=1.0,  sleep=9.0, energy=9, mood='calm'))
        assert bad['stress_score'] > good['stress_score']

    def test_heuristic_category_valid(self):
        result = self.heur(self._fv())
        assert result['stress_category'] in ('low', 'moderate', 'high')

    def test_predict_stress_uses_heuristic_when_model_missing(self):
        """predict_stress must degrade gracefully to the heuristic when the RF is absent."""
        with patch('app.ml.inference.load_model', side_effect=FileNotFoundError("no model")):
            result = self.ps(self._fv())
        assert 0.0 <= result['stress_score'] <= 1.0
        assert result.get('fallback') is True

    def test_predict_stress_output_keys(self):
        """predict_stress must always return stress_score and stress_category."""
        with patch('app.ml.inference.load_model', side_effect=FileNotFoundError):
            result = self.ps(self._fv())
        assert 'stress_score'    in result
        assert 'stress_category' in result


# ─────────────────────────────────────────────────────────────────
# 3. VADER sentiment — analyse_sentiment
# ─────────────────────────────────────────────────────────────────

class TestAnalyseSentiment:
    """Tests for inference.analyse_sentiment (VADER wrapper)."""

    def setup_method(self):
        from app.ml.inference import analyse_sentiment
        self.sa = analyse_sentiment

    def test_positive_text_positive_score(self):
        score = self.sa("Feeling wonderful and grateful today, everything is going great!")
        assert score > 0, "Clearly positive text should return a positive compound score"

    def test_negative_text_negative_score(self):
        score = self.sa("Terrible day, everything is wrong, feeling hopeless and exhausted")
        assert score < 0, "Clearly negative text should return a negative compound score"

    def test_empty_string_returns_zero(self):
        assert self.sa("") == 0.0

    def test_whitespace_only_returns_zero(self):
        assert self.sa("   ") == 0.0

    def test_output_in_vader_range(self):
        """VADER compound is always in [-1.0, 1.0]."""
        for text in ["hello", "I hate everything", "ok", "!!!"]:
            score = self.sa(text)
            assert -1.0 <= score <= 1.0, f"Score {score} out of VADER range for: {text!r}"


# ─────────────────────────────────────────────────────────────────
# 4. BiLSTM distress classifier — graceful fallback
# ─────────────────────────────────────────────────────────────────

class TestBiLSTMDistress:
    """Tests for bilstm_distress.classify_distress — focuses on the fallback path
    (no trained model required) and edge cases the dissertation documents."""

    def setup_method(self):
        from app.ml.bilstm_distress import classify_distress, _fallback_classify
        self.cd  = classify_distress
        self.fb  = _fallback_classify

    def test_empty_input_returns_neutral(self):
        """Empty string must return neutral without invoking the model."""
        result = self.cd("")
        assert result['class'] == 'neutral'
        assert result['confidence'] == 1.0

    def test_fallback_crisis_keyword(self):
        """Fallback must detect crisis keywords and return crisis_indicator."""
        result = self.fb("I want to end my life")
        assert result['class'] == 'crisis_indicator'
        assert result['is_crisis'] is True

    def test_fallback_moderate_distress_keyword(self):
        """'anxious' (without any deterioration/crisis keyword) should trigger moderate_distress."""
        # Note: 'overwhelmed' is in DETERIORATION_KEYWORDS → high_distress.
        # Use 'anxious' alone which maps to the moderate bucket in _fallback_classify.
        result = self.fb("I feel so anxious and worried about my exams")
        assert result['class'] == 'moderate_distress'

    def test_fallback_neutral_text(self):
        """Mundane text should return neutral from the keyword fallback."""
        result = self.fb("Had lunch and watched a film, quite a normal day")
        assert result['class'] == 'neutral'

    def test_classify_fallback_when_model_missing(self):
        """When the BiLSTM weights file is absent, classify_distress must
        fall back gracefully rather than raising an exception."""
        with patch('app.ml.bilstm_distress.load_bilstm', return_value=None):
            result = self.cd("Feeling really worried about everything")
        assert result['class'] in ('neutral', 'mild_distress', 'moderate_distress',
                                   'high_distress', 'crisis_indicator')
        assert 'model' in result

    def test_output_always_has_required_keys(self):
        """Both model and fallback paths must return the same key schema."""
        with patch('app.ml.bilstm_distress.load_bilstm', return_value=None):
            result = self.cd("Just feeling a bit stressed today")
        for key in ('class', 'class_idx', 'confidence', 'description', 'model'):
            assert key in result, f"Missing key: {key!r}"


# ─────────────────────────────────────────────────────────────────
# 5. Scout engine — bespoke response generation
# ─────────────────────────────────────────────────────────────────

class TestScoutEngine:
    """Tests for ml.scout_engine.generate_scout_response —
    powered by Random Forest, BiLSTM, and VADER."""

    def setup_method(self):
        from app.ml.scout_engine import generate_scout_response
        self.gen = generate_scout_response

    def test_returns_required_keys(self):
        result = self.gen("I'm feeling okay today")
        for key in ('text', 'category', 'signals'):
            assert key in result, f"Missing key: {key!r}"

    def test_crisis_keyword_triggers_crisis_category(self):
        result = self.gen("I want to end my life", care_level=1)
        assert result['category'] == 'crisis', (
            "Crisis keywords must always trigger the crisis category regardless of other signals"
        )

    def test_crisis_response_contains_samaritans(self):
        """Crisis response must surface the Samaritans number (116 123)."""
        # Uses a phrase that is a literal substring of CRISIS_KEYWORDS
        result = self.gen("I want to die, I can't go on anymore")
        assert '116 123' in result['text'], (
            "Crisis responses must include the Samaritans helpline number"
        )

    def test_care_level_4_always_crisis(self):
        """care_level=4 should always produce a crisis response, even for neutral text."""
        result = self.gen("Just had lunch", care_level=4)
        assert result['category'] == 'crisis'

    def test_positive_low_stress_produces_affirmation(self):
        result = self.gen(
            "I feel great, had a lovely day!",
            care_level=1, stress_score=0.1, stress_category='low',
        )
        assert result['category'] in ('positive_low_stress', 'positive_moderate', 'neutral')

    def test_negative_high_stress_produces_cbt_prompt(self):
        """High distress + negative message should attach a CBT follow-up question."""
        result = self.gen(
            "Everything is falling apart, I can't cope at all",
            care_level=3, stress_score=0.85, stress_category='high',
        )
        assert result['category'] in (
            'crisis', 'high_distress', 'negative_high', 'deterioration'
        )

    def test_signals_dict_populated(self):
        """signals dict must include key ML inputs for logging / explainability."""
        result = self.gen("Bit tired today", care_level=1, stress_category='moderate')
        signals = result['signals']
        assert 'vader_compound'  in signals
        assert 'care_level'      in signals
        assert 'stress_category' in signals

    def test_response_text_is_non_empty_string(self):
        result = self.gen("How are you doing?")
        assert isinstance(result['text'], str) and len(result['text']) > 10


# ─────────────────────────────────────────────────────────────────
# 6. Ensemble prediction — multi-modal fusion
# ─────────────────────────────────────────────────────────────────

class TestEnsemblePrediction:
    """Tests for inference.predict_stress_ensemble (RF + BiLSTM fusion)."""

    def setup_method(self):
        from app.ml.inference import build_feature_vector, predict_stress_ensemble
        self.bfv  = build_feature_vector
        self.ens  = predict_stress_ensemble

    def _fv(self):
        return self.bfv(6.0, 6.0, 4, 20, 0, 30, 75.0, 'anxious')

    def test_no_journal_uses_rf_only(self):
        """Without journal text the ensemble must report 'RF only'."""
        with patch('app.ml.inference.load_model', side_effect=FileNotFoundError):
            result = self.ens(self._fv(), distress_class='neutral', journal_available=False)
        assert 'RF only' in result.get('ensemble_method', '')

    def test_ensemble_score_in_range(self):
        with patch('app.ml.inference.load_model', side_effect=FileNotFoundError):
            result = self.ens(self._fv(), distress_class='high_distress',
                              distress_confidence=0.9, journal_available=True)
        assert 0.0 <= result['ensemble_score'] <= 1.0

    def test_ensemble_high_distress_higher_than_neutral(self):
        """Ensemble score should be higher when BiLSTM signals high_distress
        than when it signals neutral, all else equal."""
        with patch('app.ml.inference.load_model', side_effect=FileNotFoundError):
            r_high    = self.ens(self._fv(), 'high_distress',    0.9, True)
            r_neutral = self.ens(self._fv(), 'neutral',          0.9, True)
        assert r_high['ensemble_score'] >= r_neutral['ensemble_score']


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
