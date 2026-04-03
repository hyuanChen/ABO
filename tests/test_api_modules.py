"""
API Module Endpoint Tests

Tests for FastAPI module endpoints:
- GET /api/modules
- POST /api/modules/{id}/run
- GET /api/status (scheduler info)

Note: Using TestClient instead of httpx.AsyncClient because TestClient
properly handles the FastAPI lifespan context manager, which initializes
the module registry and scheduler.
"""
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from abo.main import app


@pytest.fixture
def client():
    """Create a TestClient with lifespan support."""
    with TestClient(app) as c:
        yield c


def test_get_modules(client):
    """Test GET /api/modules returns module list with status."""
    response = client.get("/api/modules")

    assert response.status_code == 200
    data = response.json()

    # Assert response has "modules" list with >= 7 items
    assert "modules" in data
    assert isinstance(data["modules"], list)
    assert len(data["modules"]) >= 7, f"Expected at least 7 modules, got {len(data['modules'])}"

    # Assert each module has: id, name, schedule, enabled, next_run
    required_fields = {"id", "name", "schedule", "enabled", "next_run"}
    for module in data["modules"]:
        missing = required_fields - set(module.keys())
        assert not missing, f"Module {module.get('id', 'unknown')} missing fields: {missing}"

        # Verify field types
        assert isinstance(module["id"], str)
        assert isinstance(module["name"], str)
        assert isinstance(module["schedule"], str)
        assert isinstance(module["enabled"], bool)
        # next_run can be string (ISO datetime) or None
        assert module["next_run"] is None or isinstance(module["next_run"], str)


def test_run_module_endpoint(client):
    """Test POST /api/modules/{module_id}/run triggers execution."""
    # First GET /api/modules to get a real module_id
    modules_response = client.get("/api/modules")
    assert modules_response.status_code == 200
    modules_data = modules_response.json()

    # Get the first enabled module
    enabled_modules = [m for m in modules_data["modules"] if m.get("enabled", True)]
    if not enabled_modules:
        pytest.skip("No enabled modules found to test")

    module_id = enabled_modules[0]["id"]

    # Mock the scheduler's run_now to avoid making real network calls
    with patch("abo.main._scheduler.run_now") as mock_run_now:
        mock_run_now.return_value = True

        # POST /api/modules/{module_id}/run
        run_response = client.post(f"/api/modules/{module_id}/run")

        # Assert 200 status and {"ok": True}
        assert run_response.status_code == 200
        run_data = run_response.json()
        assert run_data == {"ok": True}

        # Verify run_now was called with correct arguments
        mock_run_now.assert_called_once()
        call_args = mock_run_now.call_args
        assert call_args[0][0] == module_id  # First positional argument


def test_run_module_not_found(client):
    """Test POST /api/modules/{id}/run returns 404 for unknown module."""
    # POST /api/modules/nonexistent-module/run
    response = client.post("/api/modules/nonexistent-module/run")

    # Assert 404 status
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "not found" in data["detail"].lower() or "Module" in data["detail"]


def test_status_includes_scheduler_info(client):
    """Test /api/status returns scheduler job information."""
    response = client.get("/api/status")

    # Assert 200 status
    assert response.status_code == 200
    data = response.json()

    # Assert response has "scheduler" with "active_jobs" and "jobs"
    assert "scheduler" in data
    scheduler = data["scheduler"]
    assert isinstance(scheduler, dict)

    assert "active_jobs" in scheduler
    assert isinstance(scheduler["active_jobs"], int)
    # active_jobs should be >= 0
    assert scheduler["active_jobs"] >= 0

    assert "jobs" in scheduler
    assert isinstance(scheduler["jobs"], list)

    # Assert each job has "id" and "next_run"
    for job in scheduler["jobs"]:
        assert "id" in job, "Job missing 'id' field"
        assert "next_run" in job, "Job missing 'next_run' field"
        assert isinstance(job["id"], str)
        # next_run can be string or None
        assert job["next_run"] is None or isinstance(job["next_run"], str)
