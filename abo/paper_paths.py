import re
from collections.abc import Mapping
from pathlib import PurePosixPath
from typing import Any


def sanitize_paper_title_for_path(
    title: str,
    *,
    fallback: str = "untitled",
    max_length: int = 120,
) -> str:
    """Return a filesystem-safe paper title while keeping it human-readable."""
    cleaned = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", str(title or ""))
    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip(".")
    if not cleaned:
        cleaned = fallback
    cleaned = cleaned[:max_length].strip().strip(".")
    return cleaned or fallback


def sanitize_path_label(
    label: str,
    *,
    fallback: str = "General",
    max_length: int = 80,
) -> str:
    """Return a safe, human-readable folder label."""
    return sanitize_paper_title_for_path(label, fallback=fallback, max_length=max_length)


def derive_arxiv_tracking_label(
    paper: Mapping[str, Any],
    *,
    fallback: str = "General",
    max_length: int = 80,
) -> str:
    """Pick the best available arXiv tracking label for grouped storage."""
    metadata_raw = paper.get("metadata", {}) if isinstance(paper, Mapping) else {}
    metadata = metadata_raw if isinstance(metadata_raw, Mapping) else {}

    candidates: list[str] = []

    def add_candidate(value: Any) -> None:
        text = str(value or "").strip()
        if not text or text in candidates:
            return
        candidates.append(text)

    def add_many(values: Any) -> None:
        if not isinstance(values, list):
            return
        for value in values:
            add_candidate(value)

    add_candidate(metadata.get("paper_tracking_label"))
    add_candidate(paper.get("paper_tracking_label"))
    add_candidate(metadata.get("search_label"))
    add_many(metadata.get("paper_tracking_labels"))
    add_many(paper.get("paper_tracking_labels"))

    for matches_key in ("paper_tracking_matches", "monitor_matches"):
        matches = metadata.get(matches_key)
        if not isinstance(matches, list):
            continue
        for match in matches:
            if isinstance(match, Mapping):
                add_candidate(match.get("label"))

    for keywords_key in ("query_keywords", "keywords"):
        add_many(metadata.get(keywords_key))
    add_many(paper.get("keywords"))

    primary_category = str(metadata.get("primary_category") or paper.get("primary_category") or "").strip()
    if primary_category and not candidates:
        add_candidate(primary_category)

    label = candidates[0] if candidates else fallback
    return sanitize_path_label(label, fallback=fallback, max_length=max_length)


def build_arxiv_grouped_relative_dir(
    paper: Mapping[str, Any],
    *,
    root_folder: str = "arxiv",
    tracking_fallback: str = "General",
    paper_fallback: str = "untitled",
) -> PurePosixPath:
    """Return arXiv grouped directory like arxiv/<tracking>/<paper-title>/."""
    title = str(paper.get("title") or "").strip()
    arxiv_id = str(
        paper.get("id")
        or paper.get("arxiv_id")
        or ((paper.get("metadata") or {}) if isinstance(paper.get("metadata"), Mapping) else {}).get("arxiv_id")
        or ((paper.get("metadata") or {}) if isinstance(paper.get("metadata"), Mapping) else {}).get("arxiv-id")
        or ""
    ).strip()
    note_name = sanitize_paper_title_for_path(
        title,
        fallback=arxiv_id or paper_fallback,
        max_length=120,
    )
    tracking_label = derive_arxiv_tracking_label(
        paper,
        fallback=tracking_fallback,
        max_length=80,
    )
    return PurePosixPath(root_folder) / tracking_label / note_name
