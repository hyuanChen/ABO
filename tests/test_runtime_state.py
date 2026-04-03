import json
from pathlib import Path
import pytest
from abo.runtime.state import ModuleStateStore


class FakeModule:
    def __init__(self, module_id, enabled=True, schedule="0 8 * * *"):
        self.id = module_id
        self.enabled = enabled
        self.schedule = schedule


class FakeRegistry:
    def __init__(self, modules):
        self._modules = {m.id: m for m in modules}

    def all(self):
        return list(self._modules.values())

    def get(self, module_id):
        return self._modules.get(module_id)


@pytest.fixture
def temp_state_path(tmp_path, monkeypatch):
    path = tmp_path / "module-runtime.json"
    monkeypatch.setattr("abo.runtime.state._STATE_PATH", path)
    return path


def test_load_returns_defaults_and_creates_file(temp_state_path):
    store = ModuleStateStore()
    registry = FakeRegistry([FakeModule("m1", enabled=True, schedule="0 9 * * *")])
    data = store.load(registry)
    assert data == {"m1": {"enabled": True, "schedule": "0 9 * * *"}}
    assert temp_state_path.exists()


def test_apply_to_registry_overrides_values(temp_state_path):
    temp_state_path.write_text(json.dumps({
        "m1": {"enabled": False, "schedule": "0 10 * * *"}
    }))
    store = ModuleStateStore()
    m1 = FakeModule("m1", enabled=True, schedule="0 9 * * *")
    registry = FakeRegistry([m1])
    store.apply_to_registry(registry)
    assert m1.enabled is False
    assert m1.schedule == "0 10 * * *"


def test_update_module_persists_and_returns_state(temp_state_path):
    store = ModuleStateStore()
    registry = FakeRegistry([FakeModule("m1")])
    store.load(registry)
    result = store.update_module("m1", enabled=False, schedule="0 12 * * *", registry=registry)
    assert result["enabled"] is False
    assert result["schedule"] == "0 12 * * *"
    saved = json.loads(temp_state_path.read_text())
    assert saved["m1"]["enabled"] is False
    assert saved["m1"]["schedule"] == "0 12 * * *"


def test_cleanup_removes_stale_modules(temp_state_path):
    temp_state_path.write_text(json.dumps({
        "old-module": {"enabled": True, "schedule": "0 8 * * *"},
        "m1": {"enabled": True, "schedule": "0 8 * * *"}
    }))
    store = ModuleStateStore()
    registry = FakeRegistry([FakeModule("m1")])
    store.apply_to_registry(registry)
    saved = json.loads(temp_state_path.read_text())
    assert "old-module" not in saved
    assert "m1" in saved
