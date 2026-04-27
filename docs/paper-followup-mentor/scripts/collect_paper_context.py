#!/usr/bin/env python3
"""
Collect abstract and introduction context from a folder of paper markdown notes.

The script prefers `ABO_DIGEST` blocks and falls back to markdown sections when the
digest is missing. If a root-level markdown file matches the folder name, it is
treated as the source paper and listed first.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ABO_START = "<!-- ABO_DIGEST_START -->"
ABO_END = "<!-- ABO_DIGEST_END -->"
HEADING_RE = re.compile(r"^\s*(#{1,6})\s+(.*?)\s*$")


@dataclass
class PaperContext:
    title: str
    path: str
    role: str
    extraction: str
    abstract: str
    introduction: str


def split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---"):
        return "", text

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?", text, re.DOTALL)
    if not match:
        return "", text

    return match.group(1), text[match.end() :]


def normalize_heading(text: str) -> str:
    lowered = text.strip().lower()
    lowered = lowered.replace(":", " ")
    lowered = re.sub(r"[^\w\u4e00-\u9fff\s-]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered)
    return lowered.strip()


def clip(text: str, limit: int) -> str:
    if limit <= 0 or len(text) <= limit:
        return text.strip()
    clipped = text[:limit].rstrip()
    last_break = max(clipped.rfind("\n\n"), clipped.rfind(". "), clipped.rfind("。"))
    if last_break > max(400, int(limit * 0.55)):
        clipped = clipped[:last_break].rstrip()
    return clipped + "\n\n[Truncated]"


def clean_text(text: str) -> str:
    lines = [line.rstrip() for line in text.strip().splitlines()]
    cleaned: list[str] = []
    blank = False
    for line in lines:
        if not line.strip():
            if not blank:
                cleaned.append("")
            blank = True
            continue
        cleaned.append(line.strip())
        blank = False
    return "\n".join(cleaned).strip()


def parse_sections(markdown: str) -> list[tuple[int, str, str]]:
    sections: list[tuple[int, str, str]] = []
    current_level: int | None = None
    current_title: str | None = None
    current_lines: list[str] = []

    for line in markdown.splitlines():
        match = HEADING_RE.match(line)
        if match:
            if current_title is not None:
                sections.append((current_level or 0, current_title, clean_text("\n".join(current_lines))))
            current_level = len(match.group(1))
            current_title = match.group(2).strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_title is not None:
        sections.append((current_level or 0, current_title, clean_text("\n".join(current_lines))))

    return sections


def find_section_text(markdown: str, names: Iterable[str]) -> str:
    wanted = {normalize_heading(name) for name in names}
    for _level, title, content in parse_sections(markdown):
        if normalize_heading(title) in wanted and content:
            return content
    return ""


def extract_abo_block(body: str, full_text: str) -> str:
    for source in (body, full_text):
        start = source.rfind(ABO_START)
        if start == -1:
            continue
        end = source.find(ABO_END, start)
        if end == -1:
            continue
        block = source[start + len(ABO_START) : end]
        block = clean_text(block)
        if block:
            return block
    return ""


def extract_from_markdown(full_text: str) -> tuple[str, str, str]:
    _frontmatter, body = split_frontmatter(full_text)

    abo_block = extract_abo_block(body, full_text)
    if abo_block:
        abstract = find_section_text(abo_block, ["Abstract", "摘要", "原文摘要"])
        introduction = find_section_text(abo_block, ["Introduction", "Intro", "引言"])
        if abstract or introduction:
            return abstract, introduction, "abo-digest"

    abstract = find_section_text(body, ["原文摘要", "Abstract", "摘要", "AI 摘要"])
    introduction = find_section_text(body, ["Introduction", "Intro", "引言"])
    if abstract or introduction:
        return abstract, introduction, "markdown-sections"

    abstract = find_section_text(full_text, ["原文摘要", "Abstract", "摘要"])
    introduction = find_section_text(full_text, ["Introduction", "Intro", "引言"])
    if abstract or introduction:
        return abstract, introduction, "full-text-fallback"

    return "", "", "missing"


def detect_source_markdown(root: Path) -> Path | None:
    candidate = root / f"{root.name}.md"
    if candidate.is_file():
        return candidate
    return None


def choose_markdown_files(root: Path) -> list[Path]:
    source_markdown = detect_source_markdown(root)
    all_markdown: list[Path] = []
    for path in root.rglob("*.md"):
        relative_parts = path.relative_to(root).parts
        if any(part.startswith(".") for part in relative_parts):
            continue
        if path.name.startswith("."):
            continue
        all_markdown.append(path)

    preferred: list[Path] = []
    for path in all_markdown:
        try:
            if any(child.suffix.lower() == ".pdf" for child in path.parent.iterdir()):
                preferred.append(path)
        except OSError:
            continue

    selected = preferred if preferred else all_markdown
    if source_markdown is not None and source_markdown not in selected:
        selected = [source_markdown, *selected]

    deduped = list(dict.fromkeys(selected))
    return sorted(
        deduped,
        key=lambda p: (
            0 if source_markdown is not None and p == source_markdown else 1,
            str(p.parent.relative_to(root)).lower(),
            p.name.lower(),
        ),
    )


def build_markdown_output(root: Path, papers: list[PaperContext], skipped: list[str]) -> str:
    lines: list[str] = []
    source_paper = next((paper for paper in papers if paper.role == "source-paper"), None)
    lines.append("# Paper Follow-up Corpus")
    lines.append("")
    lines.append(f"- Root: `{root}`")
    lines.append(
        f"- Source paper: `{source_paper.title}`" if source_paper is not None else "- Source paper: `[Not detected]`"
    )
    lines.append(f"- Papers collected: {len(papers)}")
    lines.append(
        f"- Generated at: {datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')}"
    )
    lines.append("")
    lines.append("## Index")
    lines.append("")
    for idx, paper in enumerate(papers, start=1):
        lines.append(f"{idx}. {paper.title} [{paper.role}]")
    lines.append("")

    for idx, paper in enumerate(papers, start=1):
        lines.append(f"## {idx}. {paper.title}")
        lines.append("")
        lines.append(f"- File: `{paper.path}`")
        lines.append(f"- Role: `{paper.role}`")
        lines.append(f"- Extraction: `{paper.extraction}`")
        lines.append("")
        lines.append("### Abstract")
        lines.append("")
        lines.append(paper.abstract or "[Missing]")
        lines.append("")
        lines.append("### Introduction")
        lines.append("")
        lines.append(paper.introduction or "[Missing]")
        lines.append("")

    if skipped:
        lines.append("## Skipped")
        lines.append("")
        for item in skipped:
            lines.append(f"- {item}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Root directory containing paper folders.")
    parser.add_argument("--output", help="Optional output file path.")
    parser.add_argument(
        "--format",
        choices=("markdown", "json"),
        default="markdown",
        help="Output format.",
    )
    parser.add_argument(
        "--max-papers",
        type=int,
        default=0,
        help="Optional limit on the number of paper markdown files to collect.",
    )
    parser.add_argument(
        "--max-abstract-chars",
        type=int,
        default=0,
        help="Clip each abstract to at most this many characters. 0 means no clipping.",
    )
    parser.add_argument(
        "--max-intro-chars",
        type=int,
        default=0,
        help="Clip each introduction to at most this many characters. 0 means no clipping.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).expanduser().resolve()

    if not root.exists():
        print(f"[ERROR] Root does not exist: {root}", file=sys.stderr)
        return 1
    if not root.is_dir():
        print(f"[ERROR] Root is not a directory: {root}", file=sys.stderr)
        return 1

    source_markdown = detect_source_markdown(root)
    markdown_files = choose_markdown_files(root)
    if args.max_papers > 0:
        markdown_files = markdown_files[: args.max_papers]

    papers: list[PaperContext] = []
    skipped: list[str] = []

    for md_path in markdown_files:
        try:
            text = md_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = md_path.read_text(encoding="utf-8", errors="ignore")
        except OSError as exc:
            skipped.append(f"{md_path}: read error ({exc})")
            continue

        abstract, introduction, extraction = extract_from_markdown(text)
        abstract = clip(abstract, args.max_abstract_chars)
        introduction = clip(introduction, args.max_intro_chars)

        if not abstract and not introduction:
            skipped.append(f"{md_path}: no digest, abstract, or introduction found")
            continue

        papers.append(
            PaperContext(
                title=md_path.stem,
                path=str(md_path.relative_to(root)),
                role="source-paper" if source_markdown is not None and md_path == source_markdown else "follow-up",
                extraction=extraction,
                abstract=abstract,
                introduction=introduction,
            )
        )

    if args.format == "json":
        output = json.dumps(
            {
                "root": str(root),
                "generated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
                "papers": [asdict(paper) for paper in papers],
                "skipped": skipped,
            },
            ensure_ascii=False,
            indent=2,
        )
    else:
        output = build_markdown_output(root, papers, skipped)

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        output_path.write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
