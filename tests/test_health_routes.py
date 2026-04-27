from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient

from abo.activity.timeline import ActivityTracker as RealActivityTracker
from abo.health import routes
from abo.health import store as health_store
from abo.main import app
from abo.profile import store as profile_store
from abo.profile.stats import calculate_stats
from abo.store.cards import CardStore


def _install_temp_health_state(monkeypatch, tmp_path: Path) -> Path:
    vault_path = tmp_path / "vault"
    vault_path.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(health_store, "get_abo_dir", lambda: tmp_path)
    monkeypatch.setattr(profile_store, "_ABO_DIR", tmp_path)
    monkeypatch.setattr(routes, "get_vault_path", lambda: vault_path)
    monkeypatch.setattr(routes, "ActivityTracker", lambda: RealActivityTracker(tmp_path / "activities"))
    return vault_path


def test_health_checkin_creates_journal_and_dashboard(monkeypatch, tmp_path: Path):
    vault_path = _install_temp_health_state(monkeypatch, tmp_path)

    with TestClient(app) as client:
        response = client.post("/api/health/checkin", json={
            "sleep_hours": 7.5,
            "mood": 4,
            "energy": 82,
            "san": 7,
            "happiness": 8,
            "exercise_minutes": 18,
            "focus_minutes": 95,
            "water_ml": 1600,
            "identity_focus": "今天先把最重要的问题收敛下来",
            "notes": "下午明显更容易分心，需要早点收口。",
            "work_mode": "deep",
        })

        assert response.status_code == 200
        payload = response.json()["dashboard"]
        assert payload["today"]["checkin_done"] is True
        assert payload["summary"]["streak_days"] >= 1
        assert payload["today"]["sleep_hours"] == 7.5
        assert payload["history"][-1]["water_ml"] == 1600

    journal_path = vault_path / "Journal" / f"{date.today().isoformat()}.md"
    assert journal_path.exists()
    content = journal_path.read_text(encoding="utf-8")
    assert "健康记录（ABO）" in content
    assert "下午明显更容易分心" in content
    assert "今天先把最重要的问题收敛下来" in content


def test_health_habit_toggle_updates_profile_health_score(monkeypatch, tmp_path: Path):
    _install_temp_health_state(monkeypatch, tmp_path)

    with TestClient(app) as client:
        dashboard = client.get("/api/health/dashboard").json()
        habit_id = dashboard["habits"][0]["id"]

        toggled = client.post(f"/api/health/habits/{habit_id}/toggle", json={"completed": True})
        assert toggled.status_code == 200
        assert toggled.json()["dashboard"]["today"]["completed_habits_count"] == 1

        saved = client.post("/api/health/checkin", json={
            "sleep_hours": 8.0,
            "mood": 4,
            "energy": 76,
            "san": 6,
            "happiness": 7,
            "exercise_minutes": 12,
            "water_ml": 1400,
            "focus_minutes": 80,
        })
        assert saved.status_code == 200

    stats = calculate_stats(None, CardStore(tmp_path / "cards.db"))
    assert stats["health"]["score"] > 0
    assert stats["health"]["raw"]["streak_days"] >= 1
    assert stats["health"]["raw"]["avg_sleep_7d"] >= 8.0


def test_health_preferences_and_weekly_review_routes(monkeypatch, tmp_path: Path):
    _install_temp_health_state(monkeypatch, tmp_path)

    with TestClient(app) as client:
        save = client.post("/api/health/preferences", json={
            "notifications_enabled": True,
            "hydration_reminder_enabled": False,
            "poll_interval_minutes": 20,
        })
        assert save.status_code == 200
        prefs = save.json()["preferences"]
        assert prefs["notifications_enabled"] is True
        assert prefs["hydration_reminder_enabled"] is False
        assert prefs["poll_interval_minutes"] == 20

        client.post("/api/health/checkin", json={
            "sleep_hours": 7.2,
            "mood": 4,
            "energy": 72,
            "exercise_minutes": 15,
            "water_ml": 1500,
            "focus_minutes": 90,
        })
        reminders = client.get("/api/health/reminders")
        review = client.get("/api/health/weekly-review")

    assert reminders.status_code == 200
    assert reminders.json()["preferences"]["notifications_enabled"] is True
    assert review.status_code == 200
    assert "headline" in review.json()
