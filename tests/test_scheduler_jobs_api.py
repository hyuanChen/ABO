import pytest
from fastapi.testclient import TestClient

from abo.main import app

client = TestClient(app)


def test_scheduler_jobs_returns_list():
    resp = client.get("/api/scheduler/jobs")
    assert resp.status_code == 200
    data = resp.json()
    assert "jobs" in data
    assert isinstance(data["jobs"], list)
