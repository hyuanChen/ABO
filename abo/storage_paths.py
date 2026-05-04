"""Application-aware local storage paths and legacy migration helpers."""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

DEFAULT_APP_DIRNAME = "ABO Dev"
RELEASE_APP_DIRNAME = "ABO App"
_APP_DATA_ENV_KEYS = ("ABO_APP_DATA_DIR", "ABO_DATA_DIR")
_DISABLE_LEGACY_MIGRATION_ENV = "ABO_DISABLE_LEGACY_MIGRATION"
_LEGACY_APP_DIRNAME = ".abo"
_LEGACY_CONFIG_FILENAME = ".abo-config.json"
_LEGACY_APP_SUPPORT_DIRNAMES = ("ABO", "com.huanc.abo")


def _legacy_migration_enabled() -> bool:
    value = os.environ.get(_DISABLE_LEGACY_MIGRATION_ENV, "").strip().lower()
    return value not in {"1", "true", "yes", "on"}


def get_legacy_abo_dir() -> Path:
    return Path.home() / _LEGACY_APP_DIRNAME


def get_legacy_config_path() -> Path:
    return Path.home() / _LEGACY_CONFIG_FILENAME


def _platform_app_storage_root(app_dirname: str) -> Path:
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / app_dirname
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "").strip()
        if appdata:
            return Path(appdata) / app_dirname
        return home / "AppData" / "Roaming" / app_dirname

    xdg_data_home = os.environ.get("XDG_DATA_HOME", "").strip()
    if xdg_data_home:
        return Path(xdg_data_home) / app_dirname
    return home / ".local" / "share" / app_dirname


def get_default_dev_app_storage_root() -> Path:
    return _platform_app_storage_root(DEFAULT_APP_DIRNAME)


def get_default_release_app_storage_root() -> Path:
    return _platform_app_storage_root(RELEASE_APP_DIRNAME)


def _iter_legacy_root_candidates(target: Path) -> list[Path]:
    candidates: list[Path] = []
    if sys.platform == "darwin":
        candidates.extend(
            _platform_app_storage_root(dirname)
            for dirname in _LEGACY_APP_SUPPORT_DIRNAMES
        )
    candidates.append(get_legacy_abo_dir())

    unique: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        try:
            resolved = candidate.expanduser().resolve()
        except FileNotFoundError:
            resolved = candidate.expanduser()
        if resolved == target.resolve():
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(candidate)
    return unique


def _copy_legacy_root_if_needed(target: Path) -> None:
    if not _legacy_migration_enabled():
        return
    if target.exists():
        return
    for legacy in _iter_legacy_root_candidates(target):
        if not legacy.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(legacy, target)
        return


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


def _legacy_path_candidates(
    relative_path: str,
    *,
    target: Path,
    legacy_relative: str | None = None,
    legacy_path: Path | None = None,
) -> list[Path]:
    candidates: list[Path] = []
    if legacy_path is not None:
        candidates.append(legacy_path)
    elif legacy_relative:
        candidates.append(get_legacy_abo_dir() / legacy_relative)

    for legacy_root in _iter_legacy_root_candidates(target):
        candidates.append(legacy_root / relative_path)

    unique: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        try:
            resolved = candidate.expanduser().resolve()
        except FileNotFoundError:
            resolved = candidate.expanduser()
        if resolved == target.resolve():
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(candidate)
    return unique


def get_app_storage_root() -> Path:
    for env_key in _APP_DATA_ENV_KEYS:
        override = os.environ.get(env_key, "").strip()
        if override:
            target = Path(override).expanduser()
            target.mkdir(parents=True, exist_ok=True)
            return target

    target = get_default_dev_app_storage_root()
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
    for legacy in _legacy_path_candidates(
        relative_path,
        target=target,
        legacy_relative=legacy_relative,
        legacy_path=legacy_path,
    ):
        _copy_file_if_needed(target, legacy)
        if target.exists():
            break
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def resolve_app_dir(
    relative_path: str,
    *,
    legacy_relative: str | None = None,
    legacy_path: Path | None = None,
) -> Path:
    target = get_app_storage_root() / relative_path
    for legacy in _legacy_path_candidates(
        relative_path,
        target=target,
        legacy_relative=legacy_relative,
        legacy_path=legacy_path,
    ):
        _copy_dir_if_needed(target, legacy)
        if target.exists():
            break
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
