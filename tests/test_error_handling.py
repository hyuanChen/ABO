"""Tests for error handling and edge cases in module execution."""
import pytest
from pathlib import Path
from abo.runtime.runner import ModuleRunner
from abo.sdk.base import Module
from abo.sdk.types import Item, Card
from abo.store.cards import CardStore
from abo.preferences.engine import PreferenceEngine
from abo.runtime.broadcaster import Broadcaster


class FailingFetchModule(Module):
    """Module that raises an exception during fetch."""
    id = "fail-fetch"
    name = "Failing Fetch"
    schedule = "0 8 * * *"

    async def fetch(self):
        raise Exception("Network error")

    async def process(self, items, prefs):
        return []


class FailingProcessModule(Module):
    """Module that raises an exception during process."""
    id = "fail-process"
    name = "Failing Process"
    schedule = "0 8 * * *"

    async def fetch(self):
        return [Item(id="i1", raw={"title": "Test"})]

    async def process(self, items, prefs):
        raise Exception("Processing error")


class EmptyModule(Module):
    """Module that returns empty results from both fetch and process."""
    id = "empty"
    name = "Empty"
    schedule = "0 8 * * *"

    async def fetch(self):
        return []

    async def process(self, items, prefs):
        return []


@pytest.mark.anyio
async def test_runner_handles_fetch_failure_gracefully(tmp_path):
    """Test that runner handles fetch exceptions by propagating to caller."""
    db_path = tmp_path / "cards.db"
    vault_path = tmp_path / "vault"
    vault_path.mkdir()

    store = CardStore(db_path=db_path)
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=vault_path)

    module = FailingFetchModule()

    # Exception should propagate to caller
    with pytest.raises(Exception, match="Network error"):
        await runner.run(module)


@pytest.mark.anyio
async def test_runner_handles_process_failure_gracefully(tmp_path):
    """Test that runner handles process exceptions by propagating to caller."""
    db_path = tmp_path / "cards.db"
    vault_path = tmp_path / "vault"
    vault_path.mkdir()

    store = CardStore(db_path=db_path)
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=vault_path)

    module = FailingProcessModule()

    # Exception should propagate to caller
    with pytest.raises(Exception, match="Processing error"):
        await runner.run(module)


@pytest.mark.anyio
async def test_runner_handles_empty_results(tmp_path):
    """Test that runner handles modules returning empty results."""
    db_path = tmp_path / "cards.db"
    vault_path = tmp_path / "vault"
    vault_path.mkdir()

    store = CardStore(db_path=db_path)
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=vault_path)

    module = EmptyModule()

    # Should return 0 without raising any exceptions
    count = await runner.run(module)

    assert count == 0, f"Expected count=0 for empty results, got {count}"

    # Verify no cards were saved to store
    cards = store.list(module_id="empty")
    assert len(cards) == 0, f"Expected 0 cards in store, got {len(cards)}"
