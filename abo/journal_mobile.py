"""Helpers for mobile journal storage inside the vault."""

from __future__ import annotations

import shutil
from pathlib import Path

MOBILE_JOURNAL_ROOT = "手记"
MOBILE_JOURNAL_FOLDERS = {
    "daily": "日记",
    "weekly": "周记",
    "monthly": "月记",
    "yearly": "年记",
}
LEGACY_JOURNAL_ROOTS = ("手机",)


def _as_vault_path(vault_path: str | Path) -> Path:
    return Path(vault_path).expanduser().resolve()


def get_mobile_journal_root(vault_path: str | Path) -> Path:
    return _as_vault_path(vault_path) / MOBILE_JOURNAL_ROOT


def get_mobile_journal_paths(vault_path: str | Path) -> dict[str, Path]:
    root = get_mobile_journal_root(vault_path)
    return {
        mode: root / folder_name
        for mode, folder_name in MOBILE_JOURNAL_FOLDERS.items()
    }


def ensure_mobile_journal_structure(vault_path: str | Path) -> dict[str, Path]:
    root = get_mobile_journal_root(vault_path)
    root.mkdir(parents=True, exist_ok=True)
    paths = get_mobile_journal_paths(vault_path)
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return {"root": root, **paths}


def describe_mobile_journal_paths(vault_path: str | Path) -> dict[str, object]:
    vault_root = _as_vault_path(vault_path)
    paths = ensure_mobile_journal_structure(vault_root)
    root = paths["root"]
    folders = {
        mode: str(path.relative_to(vault_root).as_posix())
        for mode, path in paths.items()
        if mode != "root"
    }
    return {
        "vault_path": str(vault_root),
        "root_path": str(root.relative_to(vault_root).as_posix()),
        "folders": folders,
    }


def _remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
        return
    if path.is_dir():
        shutil.rmtree(path)


def cleanup_mobile_journal_exports(vault_path: str | Path) -> dict[str, object]:
    vault_root = _as_vault_path(vault_path)
    ensure_mobile_journal_structure(vault_root)

    deleted: list[str] = []

    for path in get_mobile_journal_paths(vault_root).values():
        for child in list(path.iterdir()):
            deleted.append(str(child.relative_to(vault_root).as_posix()))
            _remove_path(child)

    for folder_name in MOBILE_JOURNAL_FOLDERS.values():
        legacy_path = vault_root / folder_name
        if not legacy_path.exists():
            continue
        deleted.append(str(legacy_path.relative_to(vault_root).as_posix()))
        _remove_path(legacy_path)

    for legacy_root in LEGACY_JOURNAL_ROOTS:
        legacy_root_path = vault_root / legacy_root
        if not legacy_root_path.exists():
            continue
        deleted.append(str(legacy_root_path.relative_to(vault_root).as_posix()))
        _remove_path(legacy_root_path)

    describe = describe_mobile_journal_paths(vault_root)
    describe["deleted"] = deleted
    describe["deleted_count"] = len(deleted)
    return describe
