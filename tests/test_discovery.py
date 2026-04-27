"""Tests for module discovery functionality."""
import sys
from pathlib import Path
import pytest

from abo.runtime.discovery import ModuleRegistry
from abo.sdk.base import Module


# Expected 7 default modules
EXPECTED_BUILTIN_MODULES = {
    "arxiv-tracker",
    "semantic-scholar-tracker",
    "xiaohongshu-tracker",
    "bilibili-tracker",
    "xiaoyuzhou-tracker",
    "zhihu-tracker",
    "folder-monitor",
}

# Expected order per MODULE_ORDER
EXPECTED_ORDER = [
    "arxiv-tracker",
    "semantic-scholar-tracker",
    "xiaohongshu-tracker",
    "bilibili-tracker",
    "xiaoyuzhou-tracker",
    "zhihu-tracker",
    "folder-monitor",
]


class TestBuiltinModuleLoading:
    """Test 1.1: Builtin module loading."""

    def test_load_all_builtin_modules(self):
        """Test that all 7 default modules are loaded from default_modules/."""
        registry = ModuleRegistry()
        registry.load_all()

        loaded_modules = {m.id for m in registry.all()}

        # Check all expected modules are loaded
        assert EXPECTED_BUILTIN_MODULES <= loaded_modules, (
            f"Missing modules: {EXPECTED_BUILTIN_MODULES - loaded_modules}"
        )

        # Check we have exactly the expected builtin modules (no extras from user dir in clean env)
        # Note: In a clean test environment, only builtin modules should be loaded
        builtin_only = loaded_modules & EXPECTED_BUILTIN_MODULES
        assert builtin_only == EXPECTED_BUILTIN_MODULES

    def test_all_modules_are_module_instances(self):
        """Test that loaded modules are instances of Module base class."""
        registry = ModuleRegistry()
        registry.load_all()

        for module in registry.all():
            assert isinstance(module, Module), f"{module.id} is not a Module instance"

    def test_modules_have_required_attributes(self):
        """Test that loaded modules have required attributes."""
        registry = ModuleRegistry()
        registry.load_all()

        for module in registry.all():
            assert module.id, f"Module missing id"
            assert module.name, f"Module {module.id} missing name"
            assert module.schedule, f"Module {module.id} missing schedule"
            assert hasattr(module, "enabled"), f"Module {module.id} missing enabled"
            assert hasattr(module, "output"), f"Module {module.id} missing output"

    def test_semantic_scholar_tracker_uses_current_builtin_package(self):
        """Test that discovery loads the maintained Semantic Scholar tracker implementation."""
        registry = ModuleRegistry()
        registry.load_all()

        module = registry.get("semantic-scholar-tracker")

        assert module is not None
        assert module.__class__.__module__ == "abo_module_semantic_scholar_tracker"


class TestModuleOrdering:
    """Test 1.2: Module ordering."""

    def test_module_ordering(self):
        """Test that modules are returned in MODULE_ORDER sequence."""
        registry = ModuleRegistry()
        registry.load_all()

        modules = registry.all()
        loaded_ids = [m.id for m in modules]

        # Filter to only the expected builtin modules for ordering check
        filtered_ids = [mid for mid in loaded_ids if mid in EXPECTED_ORDER]

        # Check order matches EXPECTED_ORDER
        assert filtered_ids == EXPECTED_ORDER, (
            f"Module order mismatch.\nExpected: {EXPECTED_ORDER}\nGot: {filtered_ids}"
        )

    def test_arxiv_comes_before_folder_monitor(self):
        """Specific check: arxiv-tracker should come before folder-monitor."""
        registry = ModuleRegistry()
        registry.load_all()

        modules = registry.all()
        loaded_ids = [m.id for m in modules]

        if "arxiv-tracker" in loaded_ids and "folder-monitor" in loaded_ids:
            arxiv_idx = loaded_ids.index("arxiv-tracker")
            folder_idx = loaded_ids.index("folder-monitor")
            assert arxiv_idx < folder_idx, (
                f"arxiv-tracker ({arxiv_idx}) should come before folder-monitor ({folder_idx})"
            )

    def test_unknown_modules_sorted_to_end(self):
        """Test that modules not in MODULE_ORDER are sorted to the end."""
        registry = ModuleRegistry()
        registry.load_all()

        modules = registry.all()
        loaded_ids = [m.id for m in modules]

        # Find where known modules end
        order_map = {name: idx for idx, name in enumerate(registry.MODULE_ORDER)}
        known_indices = []
        unknown_indices = []

        for idx, mid in enumerate(loaded_ids):
            if mid in order_map:
                known_indices.append(idx)
            else:
                unknown_indices.append(idx)

        # All known modules should come before unknown ones
        if known_indices and unknown_indices:
            max_known = max(known_indices)
            min_unknown = min(unknown_indices)
            assert max_known < min_unknown, (
                f"Unknown modules should be at end. Known max idx: {max_known}, Unknown min idx: {min_unknown}"
            )


class TestUserModuleLoading:
    """Test 1.3: User module directory loading."""

    def test_load_user_modules(self, tmp_path, monkeypatch):
        """Test loading modules from ~/.abo/modules/."""
        # Create fake user module directory structure at ~/.abo/modules/
        modules_dir = tmp_path / ".abo" / "modules"
        test_module_dir = modules_dir / "test-module"
        test_module_dir.mkdir(parents=True)

        # Create __init__.py with a test module class
        init_py = test_module_dir / "__init__.py"
        init_py.write_text('''
from abo.sdk.base import Module
from abo.sdk.types import Item, Card

class TestModule(Module):
    id = "test-module"
    name = "Test Module"
    schedule = "0 12 * * *"
    icon = "test"

    async def fetch(self) -> list[Item]:
        return []

    async def process(self, items, prefs) -> list[Card]:
        return []
''')

        # Patch Path.home() to return tmp_path (so ~/.abo/modules resolves to tmp_path/.abo/modules)
        monkeypatch.setattr(Path, "home", lambda: tmp_path)

        # Create a fresh registry and load
        registry = ModuleRegistry()
        registry.load_all()

        # Verify the user module is loaded
        test_module = registry.get("test-module")
        assert test_module is not None, "User module 'test-module' was not loaded"
        assert test_module.id == "test-module"
        assert test_module.name == "Test Module"
        assert test_module.schedule == "0 12 * * *"

    def test_user_module_with_builtin_modules(self, tmp_path, monkeypatch):
        """Test that user modules load alongside builtin modules."""
        # Create fake user module at ~/.abo/modules/
        modules_dir = tmp_path / ".abo" / "modules"
        test_module_dir = modules_dir / "custom-tracker"
        test_module_dir.mkdir(parents=True)

        init_py = test_module_dir / "__init__.py"
        init_py.write_text('''
from abo.sdk.base import Module
from abo.sdk.types import Item, Card

class CustomTracker(Module):
    id = "custom-tracker"
    name = "Custom Tracker"
    schedule = "0 15 * * *"

    async def fetch(self) -> list[Item]:
        return []

    async def process(self, items, prefs) -> list[Card]:
        return []
''')

        monkeypatch.setattr(Path, "home", lambda: tmp_path)

        registry = ModuleRegistry()
        registry.load_all()

        # Should have builtin modules plus our custom one
        loaded_ids = {m.id for m in registry.all()}

        assert "custom-tracker" in loaded_ids, "Custom user module not loaded"
        # Should also have builtin modules
        assert "arxiv-tracker" in loaded_ids, "Builtin arxiv-tracker not loaded"

    def test_user_module_directory_created_if_missing(self, tmp_path, monkeypatch):
        """Test that user modules directory is created if it doesn't exist."""
        monkeypatch.setattr(Path, "home", lambda: tmp_path)

        registry = ModuleRegistry()
        registry.load_all()

        # Directory should have been created
        assert (tmp_path / ".abo" / "modules").exists()

    def test_broken_user_module_graceful_handling(self, tmp_path, monkeypatch, capsys):
        """Test that broken user modules don't crash the loading process."""
        modules_dir = tmp_path / ".abo" / "modules"
        broken_module_dir = modules_dir / "broken-module"
        broken_module_dir.mkdir(parents=True)

        # Create broken __init__.py
        init_py = broken_module_dir / "__init__.py"
        init_py.write_text('''
# This module has a syntax error
from abo.sdk.base import Module

class BrokenModule(Module)
    id = "broken-module"  # Missing colon above
''')

        monkeypatch.setattr(Path, "home", lambda: tmp_path)

        # Should not raise exception
        registry = ModuleRegistry()
        registry.load_all()

        # Broken module should not be loaded
        assert registry.get("broken-module") is None

        # Error should be printed
        captured = capsys.readouterr()
        assert "Failed to load" in captured.out or "Failed to load" in captured.err


class TestModuleRegistryGet:
    """Test registry.get() method."""

    def test_get_existing_module(self):
        """Test getting an existing module by id."""
        registry = ModuleRegistry()
        registry.load_all()

        module = registry.get("arxiv-tracker")
        assert module is not None
        assert module.id == "arxiv-tracker"

    def test_get_nonexistent_module(self):
        """Test getting a non-existent module returns None."""
        registry = ModuleRegistry()
        registry.load_all()

        module = registry.get("nonexistent-module")
        assert module is None

    def test_get_returns_same_instance(self):
        """Test that get returns the same module instance."""
        registry = ModuleRegistry()
        registry.load_all()

        module1 = registry.get("arxiv-tracker")
        module2 = registry.get("arxiv-tracker")
        assert module1 is module2
