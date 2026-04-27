from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import frontmatter


UNIFIED_ENTRY_SCHEMA = "abo.unified-entry/v1"


def clean_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def first_non_empty(*values: Any) -> str:
    for value in values:
        text = clean_str(value)
        if text:
            return text
    return ""


def normalize_string_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, (list, tuple, set)):
        raw_items = list(value)
    else:
        raw_items = [value]

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        text = clean_str(item)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(text)
    return normalized


def safe_load_frontmatter(path) -> tuple[dict[str, Any], str]:
    try:
        post = frontmatter.load(str(path))
    except Exception:
        return {}, ""
    metadata = post.metadata if isinstance(post.metadata, dict) else {}
    return dict(metadata), post.content or ""


@dataclass
class UnifiedVaultEntry:
    entry_id: str
    entry_type: str
    title: str
    summary: str = ""
    source_url: str = ""
    source_platform: str = ""
    source_module: str = ""
    author: str = ""
    author_id: str = ""
    authors: list[str] = field(default_factory=list)
    published: str = ""
    tags: list[str] = field(default_factory=list)
    score: float | None = None
    obsidian_path: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_metadata(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "abo-schema": UNIFIED_ENTRY_SCHEMA,
            "entry-id": clean_str(self.entry_id),
            "entry-type": clean_str(self.entry_type),
            "title": clean_str(self.title),
            "summary": clean_str(self.summary),
            "source-url": clean_str(self.source_url),
            "source-platform": clean_str(self.source_platform),
            "source-module": clean_str(self.source_module),
            "author": clean_str(self.author),
            "author-id": clean_str(self.author_id),
            "authors": normalize_string_list(self.authors),
            "published": clean_str(self.published),
            "tags": normalize_string_list(self.tags),
            "obsidian-path": clean_str(self.obsidian_path),
        }
        if self.score is not None:
            try:
                data["score"] = round(float(self.score), 3)
            except (TypeError, ValueError):
                pass
        return {key: value for key, value in data.items() if value not in ("", None, [])}

    def to_frontmatter(self, extra_metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        merged = dict(self.metadata or {})
        if extra_metadata:
            merged.update(extra_metadata)
        merged.update(self.to_metadata())
        return merged


def entry_type_from_metadata(metadata: dict[str, Any] | None, *, default: str = "intelligence-card") -> str:
    meta = metadata or {}
    explicit = first_non_empty(meta.get("entry-type"))
    if explicit:
        return explicit

    abo_type = first_non_empty(meta.get("abo-type")).lower()
    platform = first_non_empty(meta.get("platform"), meta.get("source-platform")).lower()
    dynamic_type = first_non_empty(meta.get("dynamic_type"), meta.get("item_type")).lower()

    if "paper" in abo_type or "arxiv" in abo_type or "semantic" in abo_type:
        return "paper"
    if platform == "xiaohongshu":
        return "social-note"
    if platform == "bilibili":
        if dynamic_type in {"video", "article"}:
            return f"social-{dynamic_type}"
        return "social-dynamic"
    if platform:
        return "social-entry"
    return default
