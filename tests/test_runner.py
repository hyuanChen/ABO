import pytest
from pathlib import Path
from abo.runtime.runner import ModuleRunner
from abo.sdk.base import Module
from abo.sdk.types import Item, Card
from abo.store.cards import CardStore
from abo.preferences.engine import PreferenceEngine
from abo.runtime.broadcaster import Broadcaster


class TrackingModule(Module):
    """Test module that tracks fetch and process calls."""
    id = "test-module"
    name = "Test Module"
    schedule = "0 8 * * *"

    def __init__(self):
        self.fetch_calls = 0
        self.process_calls = 0

    async def fetch(self):
        self.fetch_calls += 1
        return [
            Item(id="item1", raw={"title": "Test Item 1"}),
            Item(id="item2", raw={"title": "Test Item 2"}),
        ]

    async def process(self, items, prefs):
        self.process_calls += 1
        return [
            Card(
                id="item1",
                title="Test Card 1",
                summary="Summary 1",
                score=0.8,
                tags=["test"],
                source_url="http://test.com/1",
                obsidian_path="Test/item1.md",
            ),
            Card(
                id="item2",
                title="Test Card 2",
                summary="Summary 2",
                score=0.7,
                tags=["test"],
                source_url="http://test.com/2",
                obsidian_path="Test/item2.md",
            ),
        ]


class ScoredModule(Module):
    """Module that returns cards with varying scores for threshold/max_cards testing."""
    id = "scored-module"
    name = "Scored Module"
    schedule = "0 8 * * *"

    async def fetch(self):
        return [
            Item(id="item1", raw={}),
            Item(id="item2", raw={}),
            Item(id="item3", raw={}),
        ]

    async def process(self, items, prefs):
        return [
            Card(
                id="item1",
                title="High Score Card",
                summary="Score 0.9",
                score=0.9,
                tags=["test"],
                source_url="http://test.com/1",
                obsidian_path="Test/item1.md",
            ),
            Card(
                id="item2",
                title="Medium Score Card",
                summary="Score 0.5",
                score=0.5,
                tags=["test"],
                source_url="http://test.com/2",
                obsidian_path="Test/item2.md",
            ),
            Card(
                id="item3",
                title="Low Score Card",
                summary="Score 0.3",
                score=0.3,
                tags=["test"],
                source_url="http://test.com/3",
                obsidian_path="Test/item3.md",
            ),
        ]


@pytest.mark.anyio
async def test_runner_executes_full_pipeline(tmp_path):
    """Test that runner calls fetch and process in sequence."""
    # Create dependencies with tmp_path for isolation
    db_path = tmp_path / "cards.db"
    vault_path = tmp_path / "vault"
    vault_path.mkdir()

    store = CardStore(db_path=db_path)
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=vault_path)

    # Create and run test module
    module = TrackingModule()
    count = await runner.run(module)

    # Assert fetch and process were called exactly once
    assert module.fetch_calls == 1, f"Expected fetch_calls=1, got {module.fetch_calls}"
    assert module.process_calls == 1, f"Expected process_calls=1, got {module.process_calls}"

    # Assert 2 cards were processed
    assert count == 2, f"Expected count=2, got {count}"

    # Verify cards were saved to store
    cards = store.list(module_id="test-module")
    assert len(cards) == 2, f"Expected 2 cards in store, got {len(cards)}"

    # Verify vault files were created
    assert (vault_path / "Test" / "item1.md").exists(), "Vault file for item1 not created"
    assert (vault_path / "Test" / "item2.md").exists(), "Vault file for item2 not created"


@pytest.mark.anyio
async def test_runner_respects_score_threshold(tmp_path, monkeypatch):
    """Test that cards below threshold are filtered out."""
    # Create dependencies with tmp_path for isolation
    db_path = tmp_path / "cards.db"
    vault_path = tmp_path / "vault"
    vault_path.mkdir()

    store = CardStore(db_path=db_path)
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    # Mock prefs.threshold to return 0.6 (only 0.9 score card should pass)
    monkeypatch.setattr(prefs, "threshold", lambda module_id: 0.6)
    # Mock prefs.max_cards to return 10 (high limit to not interfere)
    monkeypatch.setattr(prefs, "max_cards", lambda module_id: 10)

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=vault_path)

    # Run scored module
    module = ScoredModule()
    count = await runner.run(module)

    # Only the 0.9 score card should pass the 0.6 threshold
    assert count == 1, f"Expected count=1 (only 0.9 score card), got {count}"

    # Verify only the high score card was saved
    cards = store.list(module_id="scored-module")
    assert len(cards) == 1, f"Expected 1 card in store, got {len(cards)}"
    assert cards[0].score == 0.9, f"Expected score=0.9, got {cards[0].score}"
    assert cards[0].title == "High Score Card"

    # Verify only one vault file was created
    vault_files = list((vault_path / "Test").glob("*.md")) if (vault_path / "Test").exists() else []
    assert len(vault_files) == 1, f"Expected 1 vault file, got {len(vault_files)}"


@pytest.mark.anyio
async def test_runner_respects_max_cards(tmp_path, monkeypatch):
    """Test that only max_cards highest scored cards are kept."""
    # Create dependencies with tmp_path for isolation
    db_path = tmp_path / "cards.db"
    vault_path = tmp_path / "vault"
    vault_path.mkdir()

    store = CardStore(db_path=db_path)
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    # Mock prefs.threshold to return 0.0 (allow all cards)
    monkeypatch.setattr(prefs, "threshold", lambda module_id: 0.0)
    # Mock prefs.max_cards to return 2 (only top 2 cards should be kept)
    monkeypatch.setattr(prefs, "max_cards", lambda module_id: 2)

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=vault_path)

    # Run scored module (returns 3 cards: 0.9, 0.5, 0.3)
    module = ScoredModule()
    count = await runner.run(module)

    # Only top 2 cards should be kept (0.9 and 0.5)
    assert count == 2, f"Expected count=2, got {count}"

    # Verify only 2 cards were saved
    cards = store.list(module_id="scored-module")
    assert len(cards) == 2, f"Expected 2 cards in store, got {len(cards)}"

    # Verify the correct cards were kept (highest scores)
    scores = {card.score for card in cards}
    assert scores == {0.9, 0.5}, f"Expected scores {{0.9, 0.5}}, got {scores}"

    # Verify the 0.3 score card was filtered out
    assert 0.3 not in scores, "Low score card (0.3) should have been filtered by max_cards"

    # Verify only 2 vault files were created
    vault_files = list((vault_path / "Test").glob("*.md")) if (vault_path / "Test").exists() else []
    assert len(vault_files) == 2, f"Expected 2 vault files, got {len(vault_files)}"
