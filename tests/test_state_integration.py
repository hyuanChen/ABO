"""
Integration tests for state persistence across restarts.

These tests verify that module state (enabled/disabled status and schedule)
persists correctly across simulated application restarts by creating new
ModuleStateStore instances pointing to the same state file.
"""

import json
from pathlib import Path
import pytest
from abo.runtime.state import ModuleStateStore


class FakeModule:
    """Fake module for testing."""
    def __init__(self, module_id, enabled=True, schedule="0 8 * * *"):
        self.id = module_id
        self.enabled = enabled
        self.schedule = schedule


class FakeRegistry:
    """Fake registry for testing."""
    def __init__(self, modules):
        self._modules = {m.id: m for m in modules}

    def all(self):
        return list(self._modules.values())

    def get(self, module_id):
        return self._modules.get(module_id)


def test_state_persists_enabled_changes(tmp_path):
    """Test that disabling a module persists and reloads correctly across restarts."""
    state_path = tmp_path / "state.json"

    # Initial setup: Create module with enabled=True (default)
    m1 = FakeModule("m1", enabled=True, schedule="0 8 * * *")
    registry = FakeRegistry([m1])

    # Create store and apply defaults
    store = ModuleStateStore(path=state_path)
    store.apply_to_registry(registry)

    # Verify initial state
    assert m1.enabled is True

    # Disable the module
    store.update_module("m1", enabled=False, registry=registry)

    # Verify module is disabled in registry
    assert m1.enabled is False

    # Verify state is persisted to file
    saved = json.loads(state_path.read_text())
    assert saved["m1"]["enabled"] is False

    # Simulate restart: Create new store instance pointing to same file
    store2 = ModuleStateStore(path=state_path)

    # Create new module with enabled=True (default on fresh start)
    m1_new = FakeModule("m1", enabled=True, schedule="0 8 * * *")
    registry2 = FakeRegistry([m1_new])

    # Apply persisted state to new registry
    store2.apply_to_registry(registry2)

    # Verify the disabled state was restored from persistence
    assert m1_new.enabled is False, "Module should remain disabled after restart"


def test_state_persists_schedule_changes(tmp_path):
    """Test that schedule changes persist across restarts."""
    state_path = tmp_path / "state.json"

    # Initial setup: Create module with default schedule
    m1 = FakeModule("m1", enabled=True, schedule="0 8 * * *")
    registry = FakeRegistry([m1])

    # Create store and apply defaults
    store = ModuleStateStore(path=state_path)
    store.apply_to_registry(registry)

    # Verify initial schedule
    assert m1.schedule == "0 8 * * *"

    # Update schedule
    store.update_module("m1", schedule="0 15 * * *", registry=registry)

    # Verify schedule changed in registry
    assert m1.schedule == "0 15 * * *"

    # Verify state is persisted to file
    saved = json.loads(state_path.read_text())
    assert saved["m1"]["schedule"] == "0 15 * * *"

    # Simulate restart: Create new store instance pointing to same file
    store2 = ModuleStateStore(path=state_path)

    # Create new module with original schedule (default on fresh start)
    m1_new = FakeModule("m1", enabled=True, schedule="0 8 * * *")
    registry2 = FakeRegistry([m1_new])

    # Apply persisted state to new registry
    store2.apply_to_registry(registry2)

    # Verify the updated schedule was restored from persistence
    assert m1_new.schedule == "0 15 * * *", "Schedule should be restored to 15:00 after restart"


def test_state_persists_both_enabled_and_schedule_changes(tmp_path):
    """Test that both enabled and schedule changes persist together across restarts."""
    state_path = tmp_path / "state.json"

    # Initial setup
    m1 = FakeModule("m1", enabled=True, schedule="0 8 * * *")
    registry = FakeRegistry([m1])

    store = ModuleStateStore(path=state_path)
    store.apply_to_registry(registry)

    # Update both enabled and schedule
    store.update_module("m1", enabled=False, schedule="0 20 * * *", registry=registry)

    # Verify changes in registry
    assert m1.enabled is False
    assert m1.schedule == "0 20 * * *"

    # Simulate restart
    store2 = ModuleStateStore(path=state_path)

    m1_new = FakeModule("m1", enabled=True, schedule="0 8 * * *")
    registry2 = FakeRegistry([m1_new])

    store2.apply_to_registry(registry2)

    # Verify both changes persisted
    assert m1_new.enabled is False
    assert m1_new.schedule == "0 20 * * *"


def test_multiple_modules_persist_independently(tmp_path):
    """Test that multiple modules can have independent state that persists."""
    state_path = tmp_path / "state.json"

    # Initial setup with multiple modules
    m1 = FakeModule("m1", enabled=True, schedule="0 8 * * *")
    m2 = FakeModule("m2", enabled=True, schedule="0 9 * * *")
    registry = FakeRegistry([m1, m2])

    store = ModuleStateStore(path=state_path)
    store.apply_to_registry(registry)

    # Update each module differently
    store.update_module("m1", enabled=False, registry=registry)
    store.update_module("m2", schedule="0 18 * * *", registry=registry)

    # Simulate restart
    store2 = ModuleStateStore(path=state_path)

    m1_new = FakeModule("m1", enabled=True, schedule="0 8 * * *")
    m2_new = FakeModule("m2", enabled=True, schedule="0 9 * * *")
    registry2 = FakeRegistry([m1_new, m2_new])

    store2.apply_to_registry(registry2)

    # Verify independent persistence
    assert m1_new.enabled is False  # m1 should be disabled
    assert m1_new.schedule == "0 8 * * *"  # m1 schedule unchanged
    assert m2_new.enabled is True  # m2 still enabled
    assert m2_new.schedule == "0 18 * * *"  # m2 schedule changed
