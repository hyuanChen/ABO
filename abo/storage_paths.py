"""Application-aware local storage paths."""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

APP_NAME = "ABO"
_APP_DATA_ENV_KEYS = ("ABO_APP_DATA_DIR", "ABO_DATA_DIR")


def get_app_storage_root() -> Path:
    for env_key in _APP_DATA_ENV_KEYS:
        override = os.environ.get(env_key, "").strip()
        if override:
            return Path(override).expanduser()

    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / APP_NAME
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "").strip()
        if appdata:
            return Path(appdata) / APP_NAME
        return home / "AppData" / "Roaming" / APP_NAME

    xdg_data_home = os.environ.get("XDG_DATA_HOME", "").strip()
    if xdg_data_home:
        return Path(xdg_data_home) / APP_NAME
    return home / ".local" / "share" / APP_NAME


def get_app_data_dir() -> Path:
    return get_app_storage_root() / "data"


def get_legacy_data_dir() -> Path:
    return Path.home() / ".abo" / "data"


def resolve_app_db_path(filename: str) -> str:
    target = get_app_data_dir() / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    migrate_legacy_db_if_needed(filename, target)
    return str(target)


def migrate_legacy_db_if_needed(filename: str, target: Path) -> None:
    legacy = get_legacy_data_dir() / filename
    if target.exists() or not legacy.exists():
        return

    if legacy.resolve() == target.resolve():
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(legacy, target)

    for suffix in ("-wal", "-shm"):
        legacy_sidecar = Path(f"{legacy}{suffix}")
        if legacy_sidecar.exists():
            shutil.copy2(legacy_sidecar, Path(f"{target}{suffix}"))
