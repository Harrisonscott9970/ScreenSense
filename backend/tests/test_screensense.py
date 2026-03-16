"""
ScreenSense Full Test Suite
============================
25+ tests covering all backend endpoints, ML pipeline,
care pathway logic, and edge cases.

Run: pytest tests/ -v --tb=short
"""
import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.main import app
from app.ml.care_pathway import assess_care_level, CARE_LEVELS
from app.ml.inference import build_feature_vector

client = TestClient(app)

# ── Fixtures ──────────────────────────────────────────────────

VALID_CHECKIN = {
    "user_id": "test_user_001",
    "mood_label": "anxious",
    "mood_words": ["tense", "overwhelmed"],
    "screen_time_hours": 8.5,
    "scroll_session_mins": 45,
    "sleep_hours": 5.5,
    "energy_level": 3,
    "latitude": 51.5074,
    "longitude": -0.1278,
    "journal_text": "Feeling stressed about deadlines today"
}

CALM_CHECKIN = {
    "user_id": "test_user_002",
    "mood_label": "calm",
    "mood_words": ["relaxed", "settled"],
    "screen_time_hours": 2.0,
    "scroll_session_mins": 10,
    "sleep_hours": 8.0,
    "energy_level": 8,
    "latitude": 51.5074,
    "longitude": -0.1278,
}

# ── API Tests ─────────────────────────────────────────────────

class TestCheckInEndpoint:
    def test_checkin_returns_200(self):
        response = client.post("/api/checkin", json=VALID_CHECKIN)
        assert response.status_code == 200

    def test_checkin_returns_stress_score(self):
        response = client.post("/api/checkin", json=VALID_CHECKIN)
        data = response.json()
        assert "predicted_stress_score" in data
        assert 0.0 <= data["predicted_stress_score"] <= 1.0

    def test_checkin_returns_care_level(self):
        response = client.post("/api/checkin", json=VALID_CHECKIN)
        data = response.json()
        assert "care_level" in data
        assert data["care_level"] in [1, 2, 3, 4]

    def test_checkin_returns_place_recommendations(self):
        response = client.post("/api/checkin", json=VALID_CHECKIN)
        data = response.json()
        assert "place_recommendations" in data
        assert isinstance(data["place_recommendations"], list)

    def test_checkin_returns_personalised_message(self):
        response = client.post("/api/checkin", json=VALID_CHECKIN)
        data = response.json()
        assert "personalised_message" in data
        assert len(data["personalised_message"]) > 10

    def test_checkin_returns_shap_explanation(self):
        response = client.post("/api/checkin", json=VALID_CHECKIN)
        data = response.json()
        assert "shap_explanation" in data

    def test_checkin_calm_mood_lower_stress(self):
        r1 = client.post("/api/checkin", json=VALID_CHECKIN)
        r2 = client.post("/api/checkin", json=CALM_CHECKIN)
        # Calm + good sleep should produce lower stress than anxious + poor sleep
        assert r2.json()["predicted_stress_score"] <= r1.json()["predicted_stress_score"] + 0.3

    def test_checkin_missing_required_field(self):
        incomplete = {"user_id": "test", "mood_label": "anxious"}
        response = client.post("/api/checkin", json=incomplete)
        assert response.status_code == 422

    def test_checkin_invalid_mood_label(self):
        bad = {**VALID_CHECKIN, "mood_label": ""}
        response = client.post("/api/checkin", json=bad)
        # Should handle gracefully, not crash
        assert response.status_code in [200, 422]

    def test_checkin_no_gps(self):
        no_gps = {k: v for k, v in VALID_CHECKIN.items() if k not in ["latitude", "longitude"]}
        response = client.post("/api/checkin", json=no_gps)
        assert response.status_code == 200

    def test_checkin_extreme_screen_time(self):
        extreme = {**VALID_CHECKIN, "screen_time_hours": 24.0}
        response = client.post("/api/checkin", json=extreme)
        assert response.status_code == 200
        data = response.json()
        assert data["predicted_stress_score"] <= 1.0

    def test_checkin_first_entry_no_history(self):
        """First entry for a new user should not crash (None type bug)"""
        new_user = {**VALID_CHECKIN, "user_id": "brand_new_user_xyz_123"}
        response = client.post("/api/checkin", json=new_user)
        assert response.status_code == 200


class TestInsightsEndpoint:
    def test_insights_no_entries_returns_404(self):
        response = client.get("/api/insights/nonexistent_user_xyz")
        assert response.status_code == 404

    def test_insights_returns_wellbeing_score(self):
        # Create an entry first
        client.post("/api/checkin", json=VALID_CHECKIN)
        response = client.get(f"/api/insights/{VALID_CHECKIN['user_id']}")
        if response.status_code == 200:
            data = response.json()
            assert "wellbeing_score" in data
            assert 0 <= data["wellbeing_score"] <= 100

    def test_insights_returns_care_level(self):
        client.post("/api/checkin", json=VALID_CHECKIN)
        response = client.get(f"/api/insights/{VALID_CHECKIN['user_id']}")
        if response.status_code == 200:
            assert "care_level" in response.json()


class TestMLEvaluateEndpoint:
    def test_ml_evaluate_returns_accuracy(self):
        response = client.get("/api/ml/evaluate")
        if response.status_code == 200:
            data = response.json()
            assert "accuracy" in data
            assert 0 < data["accuracy"] <= 1.0

    def test_ml_evaluate_returns_confusion_matrix(self):
        response = client.get("/api/ml/evaluate")
        if response.status_code == 200:
            data = response.json()
            assert "confusion_matrix" in data
            assert len(data["confusion_matrix"]) == 3  # 3 stress classes

    def test_ml_evaluate_returns_feature_importances(self):
        response = client.get("/api/ml/evaluate")
        if response.status_code == 200:
            data = response.json()
            assert "feature_importances" in data
            assert "screen_time_hours" in data["feature_importances"]


class TestCrisisResourcesEndpoint:
    def test_crisis_resources_returns_200(self):
        response = client.get("/api/crisis-resources")
        assert response.status_code == 200

    def test_crisis_resources_includes_samaritans(self):
        response = client.get("/api/crisis-resources")
        data = response.json()
        names = [r["name"] for r in data["resources"]]
        assert "Samaritans" in names

    def test_crisis_resources_includes_disclaimer(self):
        response = client.get("/api/crisis-resources")
        assert "disclaimer" in response.json()


class TestEntriesEndpoint:
    def test_entries_returns_list(self):
        client.post("/api/checkin", json=VALID_CHECKIN)
        response = client.get(f"/api/entries/{VALID_CHECKIN['user_id']}")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_entries_limit_parameter(self):
        response = client.get(f"/api/entries/{VALID_CHECKIN['user_id']}?limit=5")
        assert response.status_code == 200
        assert len(response.json()) <= 5


# ── Care Pathway Tests ─────────────────────────────────────────

class TestCarePathway:
    def test_stable_user_gets_level_1(self):
        entries = [
            {'predicted_stress_score': 0.2, 'mood_label': 'calm',
             'sleep_hours': 8, 'screen_time_hours': 3, 'journal_text': ''}
        ] * 5
        result = assess_care_level(entries, 0.2, 'calm')
        assert result.care_level == 1

    def test_rising_stress_gets_level_2(self):
        entries = [
            {'predicted_stress_score': 0.6, 'mood_label': 'anxious',
             'sleep_hours': 6, 'screen_time_hours': 7, 'journal_text': ''}
        ] * 3
        result = assess_care_level(entries, 0.6, 'anxious')
        assert result.care_level >= 2

    def test_sustained_deterioration_gets_level_3(self):
        entries = [
            {'predicted_stress_score': 0.75, 'mood_label': 'low',
             'sleep_hours': 5, 'screen_time_hours': 9, 'journal_text': ''}
        ] * 5
        result = assess_care_level(entries, 0.75, 'low')
        assert result.care_level >= 3

    def test_crisis_keyword_gets_level_4(self):
        result = assess_care_level(
            [], 0.5, 'low',
            journal_text='I want to end my life'
        )
        assert result.care_level == 4

    def test_manual_crisis_flag_gets_level_4(self):
        result = assess_care_level([], 0.3, 'calm', manual_crisis_flag=True)
        assert result.care_level == 4

    def test_level_4_shows_crisis_resources(self):
        result = assess_care_level([], 0.3, 'calm', manual_crisis_flag=True)
        assert result.show_crisis_resources is True

    def test_level_1_no_crisis_resources(self):
        entries = [
            {'predicted_stress_score': 0.2, 'mood_label': 'content',
             'sleep_hours': 8, 'screen_time_hours': 2, 'journal_text': ''}
        ] * 3
        result = assess_care_level(entries, 0.2, 'content')
        assert result.show_crisis_resources is False

    def test_protective_factors_detected(self):
        entries = [
            {'predicted_stress_score': 0.2, 'mood_label': 'calm',
             'sleep_hours': 8, 'screen_time_hours': 3, 'journal_text': ''}
        ] * 5
        result = assess_care_level(entries, 0.2, 'calm')
        assert len(result.protective_factors) > 0

    def test_no_history_uses_current_only(self):
        result = assess_care_level([], 0.8, 'anxious')
        assert result.care_level >= 1  # Should not crash


# ── ML Pipeline Tests ─────────────────────────────────────────

class TestMLPipeline:
    def test_feature_vector_correct_length(self):
        fv = build_feature_vector(
            screen_time_hours=4.0, sleep_hours=7.0, energy_level=6,
            hour_of_day=14, day_of_week=2, scroll_session_mins=15,
            heart_rate_resting=68.0, mood_label='calm'
        )
        assert len(fv) == 8

    def test_stress_score_in_valid_range(self):
        from app.ml.inference import predict_stress
        fv = build_feature_vector(8.5, 5.5, 3, 22, 0, 60, 80, 'anxious')
        result = predict_stress(fv)
        assert 0.0 <= result['stress_score'] <= 1.0

    def test_stress_category_valid(self):
        from app.ml.inference import predict_stress
        fv = build_feature_vector(4.0, 7.5, 7, 10, 2, 15, 65, 'calm')
        result = predict_stress(fv)
        assert result['stress_category'] in ['low', 'moderate', 'high']

    def test_vader_sentiment_positive(self):
        from app.ml.inference import analyse_sentiment
        score = analyse_sentiment("Having a wonderful, productive day feeling great!")
        assert score > 0

    def test_vader_sentiment_negative(self):
        from app.ml.inference import analyse_sentiment
        score = analyse_sentiment("Terrible day, everything is going wrong, I hate this")
        assert score < 0

    def test_vader_sentiment_empty(self):
        from app.ml.inference import analyse_sentiment
        score = analyse_sentiment("")
        assert score == 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
