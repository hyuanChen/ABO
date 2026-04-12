"""Rename Bilibili favorite Markdown files by their in-file favorite date."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


FAVORITE_TIME_RE = re.compile(r"\*\*收藏时间\*\*\s*:\s*(\d{4}-\d{2}-\d{2})\b")
OLD_PREFIX_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\s+收藏\s+")
LABELED_DATE_PREFIX_RE = re.compile(r"^收藏日期\d{4}-\d{2}-\d{2}\s+")
DATE_PREFIX_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\s+")
INVALID_NAME_CHARS_RE = re.compile(r"[\x00/]")


@dataclass(frozen=True)
class RenamePlan:
    source: Path
    target: Path


def find_favorite_date(path: Path) -> str | None:
    text = path.read_text(encoding="utf-8", errors="replace")
    match = FAVORITE_TIME_RE.search(text)
    if not match:
        return None
    return match.group(1)


def strip_known_prefix(filename_stem: str) -> str:
    stem = OLD_PREFIX_RE.sub("", filename_stem, count=1)
    stem = LABELED_DATE_PREFIX_RE.sub("", stem, count=1)
    stem = DATE_PREFIX_RE.sub("", stem, count=1)
    return stem.strip()


def sanitize_filename_part(value: str) -> str:
    value = INVALID_NAME_CHARS_RE.sub("_", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value or "未命名"


def unique_target(path: Path, planned_targets: set[Path], source: Path) -> Path:
    if (not path.exists() or path == source) and path not in planned_targets:
        return path

    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    counter = 2
    while True:
        candidate = parent / f"{stem} ({counter}){suffix}"
        if (not candidate.exists() or candidate == source) and candidate not in planned_targets:
            return candidate
        counter += 1


def build_plans_for_paths(paths: list[Path]) -> tuple[list[RenamePlan], list[Path]]:
    plans: list[RenamePlan] = []
    skipped: list[Path] = []
    planned_targets: set[Path] = set()

    for path in sorted({item.resolve() for item in paths}):
        if not path.exists() or path.suffix.lower() != ".md":
            skipped.append(path)
            continue

        favorite_date = find_favorite_date(path)
        if not favorite_date:
            skipped.append(path)
            continue

        title = sanitize_filename_part(strip_known_prefix(path.stem))
        target = path.with_name(f"{favorite_date} {title}{path.suffix}")
        target = unique_target(target, planned_targets, path)

        if target != path:
            plans.append(RenamePlan(source=path, target=target))
            planned_targets.add(target)

    return plans, skipped


def build_plans(root: Path) -> tuple[list[RenamePlan], list[Path]]:
    paths = [
        path
        for path in root.rglob("*.md")
        if not (path.parts and "scripts" in path.parts)
    ]
    return build_plans_for_paths(paths)


def apply_plans(plans: list[RenamePlan]) -> list[RenamePlan]:
    # Two-phase rename avoids collisions when a file's target is another file's source.
    temp_plans: list[RenamePlan] = []
    for index, plan in enumerate(plans):
        temp = plan.source.with_name(f".__rename_tmp_{index}_{plan.source.name}")
        plan.source.rename(temp)
        temp_plans.append(RenamePlan(source=temp, target=plan.target))

    applied: list[RenamePlan] = []
    for temp_plan, original_plan in zip(temp_plans, plans):
        temp_plan.source.rename(temp_plan.target)
        applied.append(original_plan)
    return applied


def rename_favorite_markdown_files(paths: list[str | Path]) -> dict:
    plans, skipped = build_plans_for_paths([Path(path) for path in paths])
    applied = apply_plans(plans) if plans else []
    renamed_files = [str(plan.target) for plan in applied]
    return {
        "renamed_count": len(applied),
        "renamed_sources": [str(plan.source) for plan in applied],
        "renamed_files": renamed_files,
        "skipped_count": len(skipped),
        "skipped_files": [str(path) for path in skipped],
    }
