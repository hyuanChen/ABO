from pathlib import Path
from typing import Any, Mapping

from .config import get_literature_path, get_vault_path


def _clean_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _get_literature_root() -> Path | None:
    return get_literature_path() or get_vault_path()


def _resolve_relative_path(root: Path | None, relative_path: str) -> Path | None:
    if root is None:
        return None

    normalized = _clean_str(relative_path).lstrip("/")
    if not normalized:
        return None

    candidate = root / normalized
    try:
        resolved_candidate = candidate.resolve()
        resolved_root = root.resolve()
    except Exception:
        return None

    if not str(resolved_candidate).startswith(str(resolved_root)):
        return None
    return resolved_candidate


def _relative_file_exists(root: Path | None, relative_path: str) -> bool:
    candidate = _resolve_relative_path(root, relative_path)
    return bool(candidate and candidate.exists() and candidate.is_file())


def _figure_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, Mapping)]


def _strip_local_paths(figures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    seen: set[str] = set()

    for index, figure in enumerate(figures):
        item = dict(figure)
        item.pop("local_path", None)

        remote_url = _clean_str(item.get("original_url")) or _clean_str(item.get("url"))
        if remote_url:
            item["url"] = remote_url
            item.setdefault("original_url", remote_url)
        elif "url" in item and not _clean_str(item.get("url")):
            item.pop("url", None)

        if not _clean_str(item.get("caption")):
            item["caption"] = f"Figure {index + 1}"

        key = (
            _clean_str(item.get("original_url"))
            or _clean_str(item.get("url"))
            or _clean_str(item.get("filename"))
            or _clean_str(item.get("caption"))
            or f"figure-{index}"
        ).casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(item)

    return cleaned


def _has_local_paths(figures: list[dict[str, Any]]) -> bool:
    return any(_clean_str(figure.get("local_path")) for figure in figures)


def _all_local_paths_exist(figures: list[dict[str, Any]], root: Path | None) -> bool:
    local_paths = [_clean_str(figure.get("local_path")) for figure in figures if _clean_str(figure.get("local_path"))]
    if not local_paths:
        return True
    if root is None:
        return False
    return all(_relative_file_exists(root, relative_path) for relative_path in local_paths)


def is_paper_tracking_payload(card_payload: Mapping[str, Any]) -> bool:
    metadata = card_payload.get("metadata")
    if not isinstance(metadata, Mapping):
        return False

    module_id = _clean_str(card_payload.get("module_id"))
    tracking_type = _clean_str(metadata.get("paper_tracking_type"))
    tracking_role = _clean_str(metadata.get("paper_tracking_role"))

    if tracking_type in {"keyword", "followup", "source"}:
        return True
    if tracking_role == "source":
        return True
    return module_id in {"arxiv-tracker", "semantic-scholar-tracker"}


def sanitize_feed_card_payload(
    card_payload: Mapping[str, Any],
    *,
    literature_root: Path | None = None,
) -> dict[str, Any]:
    payload = dict(card_payload)
    metadata_raw = payload.get("metadata")
    if not isinstance(metadata_raw, Mapping) or not is_paper_tracking_payload(payload):
        return payload

    metadata = dict(metadata_raw)
    root = literature_root or _get_literature_root()
    changed = False

    literature_path = _clean_str(metadata.get("literature_path"))
    note_exists = _relative_file_exists(root, literature_path) if literature_path else False

    if (metadata.get("saved_to_literature") or literature_path) and not note_exists:
        metadata["saved_to_literature"] = False
        for key in ("literature_path", "figures_dir", "source_paper_path", "source_paper_pdf_path", "pdf_path"):
            metadata.pop(key, None)
        changed = True
    elif bool(metadata.get("saved_to_literature")) and not literature_path:
        metadata["saved_to_literature"] = False
        changed = True

    figures = _figure_list(metadata.get("figures"))
    local_figures = _figure_list(metadata.get("local_figures"))
    figures_with_local_paths = local_figures or [figure for figure in figures if _clean_str(figure.get("local_path"))]

    if figures_with_local_paths and (not note_exists or not _all_local_paths_exist(figures_with_local_paths, root)):
        remote_figures = _strip_local_paths(figures_with_local_paths)
        metadata.pop("local_figures", None)
        metadata.pop("figures_dir", None)
        if remote_figures:
            metadata["figures"] = remote_figures
        else:
            metadata.pop("figures", None)
        changed = True

    if not changed:
        return payload

    payload["metadata"] = metadata
    return payload
