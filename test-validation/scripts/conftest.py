"""Shared pytest fixtures for ABO test suite."""
import asyncio
import json
import os
import tempfile
import sqlite3
from pathlib import Path
from typing import AsyncGenerator, Generator
import pytest
import httpx

# Add project root to path
import sys
sys.path.insert(0, '/Users/huanc/Desktop/ABO')

# Test data directory
TEST_DATA_DIR = Path.home() / ".abo" / "test_data"
TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)


@pytest.fixture
def temp_config_file() -> Generator[Path, None, None]:
    """Create a temporary config file for testing."""
    config = {
        "vault_path": str(TEST_DATA_DIR / "vault"),
        "literature_path": str(TEST_DATA_DIR / "literature"),
        "version": "1.0.0-test"
    }
    config_path = TEST_DATA_DIR / "test_config.json"
    config_path.write_text(json.dumps(config))
    yield config_path
    # Cleanup
    if config_path.exists():
        config_path.unlink()


@pytest.fixture
def temp_db_path() -> Generator[Path, None, None]:
    """Create a temporary database for testing."""
    db_path = TEST_DATA_DIR / "test_cards.db"
    yield db_path
    # Cleanup
    if db_path.exists():
        db_path.unlink()


@pytest.fixture
def mock_vault_dir() -> Generator[Path, None, None]:
    """Create a mock Obsidian vault for testing."""
    vault_path = TEST_DATA_DIR / "vault"
    vault_path.mkdir(parents=True, exist_ok=True)

    # Create some test markdown files
    (vault_path / "Literature").mkdir(exist_ok=True)
    (vault_path / "SocialMedia").mkdir(exist_ok=True)

    test_file = vault_path / "Literature" / "test_paper.md"
    test_file.write_text("""---
title: Test Paper
author: Test Author
---

# Test Paper

This is a test paper for ABO.
""")

    yield vault_path

    # Cleanup
    import shutil
    if vault_path.exists():
        shutil.rmtree(vault_path)


@pytest.fixture
def sample_item_data() -> dict:
    """Return sample item data for testing."""
    return {
        "id": "test-item-001",
        "raw": {
            "title": "Test Item Title",
            "content": "Test content for the item",
            "url": "https://example.com/test",
            "author": "Test Author",
            "published": "2024-01-01T00:00:00Z"
        }
    }


@pytest.fixture
def sample_card_data() -> dict:
    """Return sample card data for testing."""
    return {
        "id": "test-card-001",
        "module_id": "test-module",
        "title": "Test Card Title",
        "summary": "Test summary for the card",
        "score": 0.85,
        "tags": ["test", "example"],
        "source_url": "https://example.com/test",
        "obsidian_path": "Test/TestCard.md",
        "metadata": {"test_key": "test_value"},
        "created_at": 1704067200.0
    }


@pytest.fixture
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def http_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """Create an async HTTP client for API testing."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        yield client
