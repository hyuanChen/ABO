from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from abo.creator_smart_groups import extract_signal_tokens, is_generic_group_signal, unique_strings
from abo.vault.unified_entry import first_non_empty, normalize_string_list, safe_load_frontmatter


DEFAULT_VAULT = Path.home() / "Documents" / "Obsidian Vault"
_ABO_METADATA_DIR = ".abo"
_VAULT_SIGNAL_DATABASE_FILENAME = "shared-tag-database.json"
_VAULT_SHARED_DATA_DIR = "data"
_VAULT_SHARED_TAG_INDEX_FILENAME = "shared_tag_index.json"
_VAULT_SHARED_GROUPS_FILENAME = "shared_smart_groups.json"
_VAULT_SHARED_CREATOR_PROFILES_FILENAME = "shared_creator_profiles.json"
_VAULT_SIGNAL_DATABASE_VERSION = 2
_SKIP_DIR_NAMES = {
    ".obsidian",
    ".trash",
    _ABO_METADATA_DIR,
    ".git",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
}
_INLINE_TAG_PATTERN = re.compile(r"(?<![\w/])#([\u4e00-\u9fffA-Za-z0-9_/\-]{2,32})")
_TITLE_PATTERN = re.compile(r"^#\s+(.+)$", re.MULTILINE)
_MARKDOWN_FIELD_LABELS = (
    "标签",
    "话题",
    "关键词",
    "分类",
    "收藏专辑",
    "收藏夹",
)


def _iter_vault_markdown_paths(vault_root: Path) -> list[Path]:
    paths: list[Path] = []
    for path in vault_root.rglob("*.md"):
        if any(part in _SKIP_DIR_NAMES or part.startswith(".") for part in path.parts):
            continue
        paths.append(path)
    return sorted(paths)


def _extract_markdown_field_values(text: str, label: str) -> list[str]:
    pattern = re.compile(
        rf"^\s*>?\s*-?\s*\*\*{re.escape(label)}\*\*:\s*(.+?)\s*$",
        re.MULTILINE,
    )
    return [match.group(1).strip() for match in pattern.finditer(text)]


def _extract_note_title(path: Path, meta: dict[str, Any], content: str, raw_text: str) -> str:
    title = first_non_empty(meta.get("title"))
    if title:
        return title
    title_match = _TITLE_PATTERN.search(content or raw_text)
    if title_match:
        return title_match.group(1).strip()
    return path.stem


def _extract_note_author(meta: dict[str, Any], raw_text: str) -> str:
    author = first_non_empty(meta.get("author"))
    if author:
        return author

    source_values = _extract_markdown_field_values(raw_text, "来源")
    for value in source_values:
        if "·" in value:
            return value.split("·", 1)[-1].strip()
    return ""


def _resolve_note_platform(path: Path, vault_root: Path, meta: dict[str, Any]) -> str:
    platform = first_non_empty(meta.get("source-platform"), meta.get("platform")).strip().lower()
    if platform in {"xiaohongshu", "xhs"}:
        return "xiaohongshu"
    if platform == "bilibili":
        return "bilibili"

    try:
        first_part = path.relative_to(vault_root).parts[0].lower()
    except Exception:
        first_part = path.parent.name.lower()

    if first_part in {"xhs", "专辑"}:
        return "xiaohongshu"
    if first_part == "bilibili":
        return "bilibili"
    return "vault"


def _extract_note_signals(meta: dict[str, Any], raw_text: str) -> list[str]:
    signals: list[str] = []

    for key in ("tags", "tag", "keywords", "keyword", "topics", "topic", "categories", "category"):
        raw_value = meta.get(key)
        if isinstance(raw_value, (list, tuple, set)):
            for item in normalize_string_list(raw_value):
                signals.extend(extract_signal_tokens(item))
        else:
            signals.extend(extract_signal_tokens(raw_value))

    for key in ("albums", "album", "folder-name", "folder_name"):
        raw_value = meta.get(key)
        if isinstance(raw_value, (list, tuple, set)):
            for item in normalize_string_list(raw_value):
                signals.extend(extract_signal_tokens(item))
        else:
            signals.extend(extract_signal_tokens(raw_value))

    for label in _MARKDOWN_FIELD_LABELS:
        for value in _extract_markdown_field_values(raw_text, label):
            signals.extend(extract_signal_tokens(value))

    for inline_tag in _INLINE_TAG_PATTERN.findall(raw_text):
        signals.extend(extract_signal_tokens(inline_tag))

    return unique_strings(
        [signal for signal in signals if signal and not is_generic_group_signal(signal)],
        limit=64,
    )


def vault_signal_database_path(vault_path: str | Path | None = None) -> Path:
    vault_root = Path(vault_path).expanduser() if vault_path else DEFAULT_VAULT
    return vault_root / _ABO_METADATA_DIR / _VAULT_SIGNAL_DATABASE_FILENAME


def vault_shared_data_dir(vault_path: str | Path | None = None) -> Path:
    vault_root = Path(vault_path).expanduser() if vault_path else DEFAULT_VAULT
    return vault_root / _VAULT_SHARED_DATA_DIR


def vault_shared_tag_index_path(vault_path: str | Path | None = None) -> Path:
    return vault_shared_data_dir(vault_path) / _VAULT_SHARED_TAG_INDEX_FILENAME


def vault_shared_groups_path(vault_path: str | Path | None = None) -> Path:
    return vault_shared_data_dir(vault_path) / _VAULT_SHARED_GROUPS_FILENAME


def vault_shared_creator_profiles_path(vault_path: str | Path | None = None) -> Path:
    return vault_shared_data_dir(vault_path) / _VAULT_SHARED_CREATOR_PROFILES_FILENAME


def _read_json_payload(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_json_payload(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def _empty_vault_signal_database(vault_root: Path | None = None) -> dict[str, Any]:
    root_text = str(vault_root) if vault_root else ""
    return {
        "version": _VAULT_SIGNAL_DATABASE_VERSION,
        "kind": "vault_signal_database",
        "vault_path": root_text,
        "database_path": str(vault_signal_database_path(vault_root)),
        "tag_index_path": str(vault_shared_tag_index_path(vault_root)),
        "saved_at": "",
        "build_mode": "incremental",
        "total_files": 0,
        "indexed_files": 0,
        "signal_count": 0,
        "signals": [],
        "new_files": 0,
        "updated_files": 0,
        "removed_files": 0,
        "reused_files": 0,
        "file_count": 0,
        "file_index": {},
    }


def _normalize_cached_file_index(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw_index = payload.get("file_index")
    if not isinstance(raw_index, dict):
        return {}

    normalized: dict[str, dict[str, Any]] = {}
    for raw_path, raw_entry in raw_index.items():
        if not isinstance(raw_entry, dict):
            continue
        relative_path = str(raw_path or raw_entry.get("relative_path") or "").strip().replace("\\", "/")
        if not relative_path:
            continue
        normalized[relative_path] = {
            "relative_path": relative_path,
            "mtime_ns": int(raw_entry.get("mtime_ns") or 0),
            "size": int(raw_entry.get("size") or 0),
            "indexed": bool(raw_entry.get("indexed")),
            "title": str(raw_entry.get("title") or "").strip(),
            "author": str(raw_entry.get("author") or "").strip(),
            "platform": str(raw_entry.get("platform") or "").strip(),
            "folder_label": str(raw_entry.get("folder_label") or "").strip(),
            "signals": unique_strings(raw_entry.get("signals") or [], limit=64),
        }
    return normalized


def _build_vault_file_entry(path: Path, vault_root: Path) -> dict[str, Any]:
    stat_result = path.stat()
    meta, content = safe_load_frontmatter(path)
    try:
        raw_text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        raw_text = content or ""

    signals = _extract_note_signals(meta, raw_text)
    relative_path = str(path.relative_to(vault_root)).replace("\\", "/")
    folder_label = relative_path.split("/", 1)[0] if "/" in relative_path else ""
    if not signals:
        return {
            "relative_path": relative_path,
            "mtime_ns": int(getattr(stat_result, "st_mtime_ns", 0) or 0),
            "size": int(getattr(stat_result, "st_size", 0) or 0),
            "indexed": False,
            "title": "",
            "author": "",
            "platform": "",
            "folder_label": folder_label,
            "signals": [],
        }

    return {
        "relative_path": relative_path,
        "mtime_ns": int(getattr(stat_result, "st_mtime_ns", 0) or 0),
        "size": int(getattr(stat_result, "st_size", 0) or 0),
        "indexed": True,
        "title": _extract_note_title(path, meta, content, raw_text),
        "author": _extract_note_author(meta, raw_text),
        "platform": _resolve_note_platform(path, vault_root, meta),
        "folder_label": folder_label,
        "signals": signals,
    }


def _aggregate_signal_entries(file_index: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    aggregated: dict[str, dict[str, Any]] = {}
    for relative_path, entry in file_index.items():
        if not bool(entry.get("indexed")):
            continue
        title = str(entry.get("title") or "").strip()
        author = str(entry.get("author") or "").strip()
        platform = str(entry.get("platform") or "").strip()
        folder_label = str(entry.get("folder_label") or "").strip()
        for signal in unique_strings(entry.get("signals") or [], limit=64):
            signal_entry = aggregated.setdefault(
                signal,
                {
                    "signal": signal,
                    "count": 0,
                    "platforms": [],
                    "sample_titles": [],
                    "sample_paths": [],
                    "sample_authors": [],
                    "sample_folders": [],
                },
            )
            signal_entry["count"] = int(signal_entry.get("count") or 0) + 1
            signal_entry["platforms"] = unique_strings([*(signal_entry.get("platforms") or []), platform], limit=6)
            signal_entry["sample_titles"] = unique_strings([*(signal_entry.get("sample_titles") or []), title], limit=5)
            signal_entry["sample_paths"] = unique_strings([*(signal_entry.get("sample_paths") or []), relative_path], limit=5)
            signal_entry["sample_authors"] = unique_strings([*(signal_entry.get("sample_authors") or []), author], limit=5)
            signal_entry["sample_folders"] = unique_strings([*(signal_entry.get("sample_folders") or []), folder_label], limit=4)

    return sorted(
        aggregated.values(),
        key=lambda item: (-int(item.get("count") or 0), str(item.get("signal") or "")),
    )


def _public_vault_signal_database_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in dict(payload or {}).items()
        if key != "file_index"
    }


def save_vault_signal_database(
    vault_path: str | Path | None,
    database: dict[str, Any],
) -> dict[str, Any]:
    target_path = vault_signal_database_path(vault_path)
    shared_tag_index_path = vault_shared_tag_index_path(vault_path)
    internal_payload = {
        **dict(database or {}),
        "vault_path": str(target_path.parent.parent),
        "database_path": str(target_path),
        "tag_index_path": str(shared_tag_index_path),
        "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    public_payload = _public_vault_signal_database_payload(internal_payload)
    _write_json_payload(target_path, internal_payload)
    _write_json_payload(shared_tag_index_path, public_payload)
    return public_payload


def load_vault_shared_groups(vault_path: str | Path | None = None) -> dict[str, Any]:
    return _read_json_payload(vault_shared_groups_path(vault_path))


def load_vault_shared_creator_profiles(vault_path: str | Path | None = None) -> dict[str, Any]:
    return _read_json_payload(vault_shared_creator_profiles_path(vault_path))


def save_vault_shared_group_artifacts(
    vault_path: str | Path | None,
    *,
    group_options: list[dict[str, Any]] | None,
    signal_group_labels: dict[str, str] | None,
    creator_profiles: dict[str, Any] | None,
    creator_catalog: dict[str, Any] | None = None,
) -> dict[str, str]:
    groups_path = vault_shared_groups_path(vault_path)
    creator_profiles_path = vault_shared_creator_profiles_path(vault_path)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    vault_root = Path(vault_path).expanduser() if vault_path else DEFAULT_VAULT

    groups_payload = {
        "version": 1,
        "kind": "shared_smart_groups",
        "vault_path": str(vault_root),
        "generated_at": generated_at,
        "group_count": len(group_options or []),
        "signal_group_labels": dict(signal_group_labels or {}),
        "groups": list(group_options or []),
    }
    creator_profiles_payload = {
        "version": 1,
        "kind": "shared_creator_profiles",
        "vault_path": str(vault_root),
        "generated_at": generated_at,
        "platform_counts": {
            "xiaohongshu": len(((creator_profiles or {}).get("xiaohongshu") or {})),
            "bilibili": len(((creator_profiles or {}).get("bilibili") or {})),
        },
        "profiles": dict(creator_profiles or {}),
        "creator_catalog": dict(creator_catalog or {}),
    }

    _write_json_payload(groups_path, groups_payload)
    _write_json_payload(creator_profiles_path, creator_profiles_payload)
    return {
        "tag_index_path": str(vault_shared_tag_index_path(vault_path)),
        "shared_groups_path": str(groups_path),
        "creator_profiles_path": str(creator_profiles_path),
    }


def build_vault_signal_database(vault_path: str | Path | None = None) -> dict[str, Any]:
    if not vault_path:
        return _empty_vault_signal_database()

    vault_root = Path(vault_path).expanduser()
    if not vault_root.exists():
        return _empty_vault_signal_database(vault_root)

    previous_payload = _read_json_payload(vault_signal_database_path(vault_root))
    previous_file_index = _normalize_cached_file_index(previous_payload)
    markdown_paths = _iter_vault_markdown_paths(vault_root)
    next_file_index: dict[str, dict[str, Any]] = {}
    new_files = 0
    updated_files = 0
    reused_files = 0

    current_relative_paths: set[str] = set()
    for path in markdown_paths:
        relative_path = str(path.relative_to(vault_root)).replace("\\", "/")
        current_relative_paths.add(relative_path)
        stat_result = path.stat()
        cached_entry = previous_file_index.get(relative_path)
        if (
            cached_entry
            and int(cached_entry.get("mtime_ns") or 0) == int(getattr(stat_result, "st_mtime_ns", 0) or 0)
            and int(cached_entry.get("size") or -1) == int(getattr(stat_result, "st_size", 0) or 0)
        ):
            next_file_index[relative_path] = cached_entry
            reused_files += 1
            continue

        next_file_index[relative_path] = _build_vault_file_entry(path, vault_root)
        if cached_entry:
            updated_files += 1
        else:
            new_files += 1

    removed_files = len(set(previous_file_index) - current_relative_paths)
    signals = _aggregate_signal_entries(next_file_index)
    indexed_files = sum(1 for entry in next_file_index.values() if bool(entry.get("indexed")))

    return {
        "version": _VAULT_SIGNAL_DATABASE_VERSION,
        "kind": "vault_signal_database",
        "vault_path": str(vault_root),
        "database_path": str(vault_signal_database_path(vault_root)),
        "tag_index_path": str(vault_shared_tag_index_path(vault_root)),
        "saved_at": "",
        "build_mode": "incremental" if previous_file_index else "full",
        "total_files": len(markdown_paths),
        "indexed_files": indexed_files,
        "signal_count": len(signals),
        "signals": signals,
        "new_files": new_files,
        "updated_files": updated_files,
        "removed_files": removed_files,
        "reused_files": reused_files,
        "file_count": len(next_file_index),
        "file_index": next_file_index,
    }
