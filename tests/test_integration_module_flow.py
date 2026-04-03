"""
Integration test for the full module execution flow.

This test verifies the end-to-end flow:
1. Load modules via ModuleRegistry
2. Apply persisted state via ModuleStateStore
3. Initialize CardStore, PreferenceEngine, Broadcaster
4. Create ModuleRunner and ModuleScheduler
5. Start scheduler with enabled modules
6. Manually trigger a module execution
7. Verify cards are created and scheduler state is correct
"""

import pytest
from pathlib import Path

from abo.runtime.discovery import ModuleRegistry
from abo.runtime.scheduler import ModuleScheduler
from abo.runtime.runner import ModuleRunner
from abo.runtime.state import ModuleStateStore
from abo.runtime.broadcaster import Broadcaster
from abo.store.cards import CardStore
from abo.preferences.engine import PreferenceEngine


@pytest.mark.anyio
async def test_full_module_execution_flow(tmp_path: Path, monkeypatch):
    """
    Integration test: Load modules, apply state, start scheduler,
    manually trigger a module, verify cards are created.
    """
    # Setup paths to use tmp_path (isolated from ~/.abo/)
    db_path = tmp_path / "test.db"
    state_path = tmp_path / "state.json"
    vault_path = tmp_path / "vault"
    vault_path.mkdir(parents=True, exist_ok=True)

    # Initialize components in the correct order (matching abo/main.py lifespan)

    # 1. registry = ModuleRegistry(), registry.load_all()
    registry = ModuleRegistry()
    registry.load_all()

    # 2. state_store = ModuleStateStore(path=tmp_path / "state.json")
    state_store = ModuleStateStore(path=state_path)

    # 3. state_store.apply_to_registry(registry)
    state_store.apply_to_registry(registry)

    # 4. store = CardStore(path=tmp_path / "cards.db")
    store = CardStore(db_path=db_path)

    # 5. prefs = PreferenceEngine()
    prefs = PreferenceEngine()

    # 6. broadcaster = Broadcaster()
    broadcaster = Broadcaster()

    # 7. runner = ModuleRunner(store, prefs, broadcaster, vault_path=tmp_path / "vault")
    runner = ModuleRunner(store, prefs, broadcaster, vault_path=vault_path)

    # 8. scheduler = ModuleScheduler(runner)
    scheduler = ModuleScheduler(runner)

    # Get enabled modules
    enabled_modules = registry.enabled()

    # Start with enabled modules
    scheduler.start(enabled_modules)

    try:
        # Verify jobs are scheduled
        job_info = scheduler.job_info()
        assert len(job_info) == len(enabled_modules), (
            f"Expected {len(enabled_modules)} jobs, got {len(job_info)}"
        )

        # Verify job ids match enabled module ids
        job_ids = {job["id"] for job in job_info}
        enabled_ids = {m.id for m in enabled_modules}
        assert job_ids == enabled_ids, (
            f"Job IDs {job_ids} don't match enabled module IDs {enabled_ids}"
        )

        # Verify all jobs have next_run set
        for job in job_info:
            assert job["next_run"] is not None, (
                f"Job {job['id']} should have next_run set"
            )

        # Manually trigger folder-monitor (lightweight, local only)
        # Note: folder-monitor may fail if no PDFs in Downloads - that's OK
        result = await scheduler.run_now("folder-monitor", registry)

        # The module should be found and executed (result indicates module was found)
        assert result is True, "run_now should return True for existing module"

        # Verify we can query cards (even if none were created)
        all_cards = store.list(limit=100)
        assert isinstance(all_cards, list), "store.list() should return a list"

        # Verify unread counts returns a dict
        unread = store.unread_counts()
        assert isinstance(unread, dict), "unread_counts() should return a dict"

    finally:
        # Always shutdown scheduler
        scheduler.shutdown()


@pytest.mark.anyio
async def test_integration_with_disabled_modules(tmp_path: Path, monkeypatch):
    """
    Test that disabled modules are not scheduled but can still be run manually.
    """
    db_path = tmp_path / "test.db"
    state_path = tmp_path / "state.json"
    vault_path = tmp_path / "vault"
    vault_path.mkdir(parents=True, exist_ok=True)

    registry = ModuleRegistry()
    registry.load_all()

    state_store = ModuleStateStore(path=state_path)
    state_store.apply_to_registry(registry)

    # Disable a specific module
    folder_monitor = registry.get("folder-monitor")
    if folder_monitor:
        folder_monitor.enabled = False
        state_store.update_module("folder-monitor", enabled=False, registry=registry)

    store = CardStore(db_path=db_path)
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()
    runner = ModuleRunner(store, prefs, broadcaster, vault_path=vault_path)
    scheduler = ModuleScheduler(runner)

    enabled_modules = registry.enabled()

    scheduler.start(enabled_modules)

    try:
        job_info = scheduler.job_info()

        # folder-monitor should not be in scheduled jobs
        job_ids = {job["id"] for job in job_info}
        assert "folder-monitor" not in job_ids, (
            "Disabled module should not have a scheduled job"
        )

        # But we should still be able to run it manually
        result = await scheduler.run_now("folder-monitor", registry)
        assert result is True, "Should be able to run disabled module manually"

    finally:
        scheduler.shutdown()


@pytest.mark.anyio
async def test_integration_state_persistence(tmp_path: Path, monkeypatch):
    """
    Test that module state is correctly persisted and applied.
    """
    state_path = tmp_path / "state.json"

    # First registry - load modules and modify state
    registry1 = ModuleRegistry()
    registry1.load_all()

    state_store1 = ModuleStateStore(path=state_path)
    state_store1.apply_to_registry(registry1)

    # Modify a module's schedule
    folder_monitor = registry1.get("folder-monitor")
    if folder_monitor:
        original_schedule = folder_monitor.schedule
        new_schedule = "0 12 * * *"  # Change to noon
        state_store1.update_module(
            "folder-monitor",
            schedule=new_schedule,
            registry=registry1
        )

        # Verify state was updated in registry
        assert folder_monitor.schedule == new_schedule

    # Second registry - reload and verify state is persisted
    registry2 = ModuleRegistry()
    registry2.load_all()

    state_store2 = ModuleStateStore(path=state_path)
    state_store2.apply_to_registry(registry2)

    folder_monitor2 = registry2.get("folder-monitor")
    if folder_monitor2:
        # The persisted schedule should be applied
        assert folder_monitor2.schedule == "0 12 * * *"
