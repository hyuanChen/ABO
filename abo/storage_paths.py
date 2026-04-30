"""Application-aware local storage paths and legacy migration helpers."""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

APP_NAME = "ABO"
_APP_DATA_ENV_KEYS = ("ABO_APP_DATA_DIR", "ABO_DATA_DIR")
_DISABLE_LEGACY_MIGRATION_ENV = "ABO_DISABLE_LEGACY_MIGRATION"
_LEGACY_APP_DIRNAME = ".abo"
_LEGACY_CONFIG_FILENAME = ".abo-config.json"


def _legacy_migration_enabled() -> bool:
    value = os.environ.get(_DISABLE_LEGACY_MIGRATION_ENV, "").strip().lower()
    return value not in {"1", "true", "yes", "on"}


def get_legacy_abo_dir() -> Path:
    return Path.home() / _LEGACY_APP_DIRNAME


def get_legacy_config_path() -> Path:
    return Path.home() / _LEGACY_CONFIG_FILENAME


def _copy_legacy_root_if_needed(target: Path) -> None:
    if not _legacy_migration_enabled():
        return
    legacy = get_legacy_abo_dir()
    if target.exists() or not legacy.exists():
        return
    if legacy.resolve() == target.resolve():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(legacy, target)


def _copy_file_if_needed(target: Path, legacy: Path) -> None:
    if not _legacy_migration_enabled():
        return
    if target.exists() or not legacy.exists():
        return
    if legacy.resolve() == target.resolve():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(legacy, target)


def _copy_dir_if_needed(target: Path, legacy: Path) -> None:
    if not _legacy_migration_enabled():
        return
    if target.exists() or not legacy.exists():
        return
    if legacy.resolve() == target.resolve():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(legacy, target)


def get_app_storage_root() -> Path:
    for env_key in _APP_DATA_ENV_KEYS:
        override = os.environ.get(env_key, "").strip()
        if override:
            target = Path(override).expanduser()
            target.mkdir(parents=True, exist_ok=True)
            return target

    home = Path.home()
    if sys.platform == "darwin":
        target = home / "Library" / "Application Support" / APP_NAME
    elif sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "").strip()
        if appdata:
            target = Path(appdata) / APP_NAME
        else:
            target = home / "AppData" / "Roaming" / APP_NAME
    else:
        xdg_data_home = os.environ.get("XDG_DATA_HOME", "").strip()
        if xdg_data_home:
            target = Path(xdg_data_home) / APP_NAME
        else:
            target = home / ".local" / "share" / APP_NAME

    _copy_legacy_root_if_needed(target)
    target.mkdir(parents=True, exist_ok=True)
    return target


def resolve_app_file(
    relative_path: str,
    *,
    legacy_relative: str | None = None,
    legacy_path: Path | None = None,
) -> Path:
    target = get_app_storage_root() / relative_path
    legacy = legacy_path
    if legacy is None and legacy_relative:
        legacy = get_legacy_abo_dir() / legacy_relative
    if legacy is not None:
        _copy_file_if_needed(target, legacy)
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def resolve_app_dir(
    relative_path: str,
    *,
    legacy_relative: str | None = None,
    legacy_path: Path | None = None,
) -> Path:
    target = get_app_storage_root() / relative_path
    legacy = legacy_path
    if legacy is None and legacy_relative:
        legacy = get_legacy_abo_dir() / legacy_relative
    if legacy is not None:
        _copy_dir_if_needed(target, legacy)
    target.mkdir(parents=True, exist_ok=True)
    return target


def get_config_path() -> Path:
    return resolve_app_file("config.json", legacy_path=get_legacy_config_path())


def get_app_data_dir() -> Path:
    return resolve_app_dir("data", legacy_relative="data")


def get_legacy_data_dir() -> Path:
    return get_legacy_abo_dir() / "data"


def resolve_app_data_file(filename: str) -> Path:
    return resolve_app_file(f"data/{filename}", legacy_relative=f"data/{filename}")


def resolve_app_root_file(filename: str) -> Path:
    return resolve_app_file(filename, legacy_relative=filename)


def get_preferences_path() -> Path:
    return resolve_app_root_file("preferences.json")


def get_keyword_preferences_path() -> Path:
    return resolve_app_root_file("keyword_preferences.json")


def get_user_modules_dir() -> Path:
    return resolve_app_dir("modules", legacy_relative="modules")


def get_sdk_dir() -> Path:
    return resolve_app_dir("sdk", legacy_relative="sdk")


def get_tmp_dir() -> Path:
    return resolve_app_dir("tmp", legacy_relative="tmp")


def get_audio_tmp_dir() -> Path:
    return resolve_app_dir("tmp/audio", legacy_relative="tmp/audio")


def get_liked_dir() -> Path:
    return resolve_app_dir("liked", legacy_relative="liked")


def get_activities_dir() -> Path:
    return resolve_app_dir("activities", legacy_relative="activities")


def get_module_runtime_path() -> Path:
    return resolve_app_root_file("module-runtime.json")


def get_subscription_store_path() -> Path:
    return resolve_app_root_file("subscriptions.json")


def resolve_app_db_path(filename: str) -> str:
    target = get_app_data_dir() / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    migrate_legacy_db_if_needed(filename, target)
    return str(target)


def migrate_legacy_db_if_needed(filename: str, target: Path) -> None:
    if not _legacy_migration_enabled():
        return
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
