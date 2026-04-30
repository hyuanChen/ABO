#!/usr/bin/env python3
"""Rename Bilibili favorite Markdown files by their in-file favorite date.

Example:
  2026-04-12 收藏 视频标题 BVxxxx.md
becomes:
  2025-03-14 视频标题 BVxxxx.md

By default this script only prints a dry run. Use --apply to rename files.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from abo.tools.bilibili_favorite_renamer import apply_plans, build_plans, build_plans_for_paths


def format_path(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root))
    except ValueError:
        return str(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="Root directory to scan recursively. Defaults to current directory.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually rename files. Without this flag, only prints a dry run.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=30,
        help="How many planned renames to print. Use 0 to print all.",
    )
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="Optional Markdown files to rename. When provided, --root is only used for display.",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    plans, skipped = build_plans_for_paths(args.paths) if args.paths else build_plans(root)

    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"{mode}: {len(plans)} files to rename, {len(skipped)} files skipped.")

    display_plans = plans if args.limit == 0 else plans[: args.limit]
    for plan in display_plans:
        print(f"- {format_path(plan.source, root)}")
        print(f"  -> {format_path(plan.target, root)}")

    if args.limit and len(plans) > args.limit:
        print(f"... {len(plans) - args.limit} more not shown. Use --limit 0 to show all.")

    if skipped:
        print("Skipped files without a readable 收藏时间 field:")
        display_skipped = skipped if args.limit == 0 else skipped[: args.limit]
        for path in display_skipped:
            print(f"- {format_path(path, root)}")
        if args.limit and len(skipped) > args.limit:
            print(f"... {len(skipped) - args.limit} more skipped not shown.")

    if args.apply and plans:
        apply_plans(plans)
        print(f"Renamed {len(plans)} files.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
