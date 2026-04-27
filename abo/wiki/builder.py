"""
Wiki 摘录构建器 — 使用 Agent CLI 将源材料提炼到 Wiki 知识库。
"""
import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Optional, Union
from urllib.parse import quote

import frontmatter

from ..config import get_literature_path, get_vault_path
from .store import WikiStore
from ..sdk.tools import agent


def _slugify(text: str) -> str:
    """将标题转为 URL-safe slug。"""
    text = text.lower().strip()
    text = re.sub(r"[\s\-/\\]+", "-", text)
    text = re.sub(r"[^\w\-]", "", text)
    return text[:64].strip("-")


def _extract_json(text: str) -> Optional[Union[dict, list]]:
    """从 Agent 响应中提取 JSON（兼容 markdown 代码块）。"""
    m = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    try:
        return json.loads(text.strip())
    except Exception:
        pass
    m2 = re.search(r"(\{[\s\S]+\}|\[[\s\S]+\])", text)
    if m2:
        try:
            return json.loads(m2.group(1))
        except Exception:
            pass
    return None


def _read_text_excerpt(path: Path, max_chars: int = 900) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return ""

    if text.startswith("---"):
        try:
            post = frontmatter.loads(text)
            text = post.content
        except Exception:
            pass

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if lines and lines[0].startswith("#"):
        lines = lines[1:]
    return "\n".join(lines)[:max_chars]


def _read_markdown_body(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return ""

    if text.startswith("---"):
        try:
            post = frontmatter.loads(text)
            return post.content
        except Exception:
            pass
    return text


def _extract_title(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return path.stem

    if text.startswith("---"):
        try:
            post = frontmatter.loads(text)
            title = str(post.metadata.get("title", "")).strip()
            if title:
                return title
            text = post.content
        except Exception:
            pass

    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return path.stem


_TAG_BLACKLIST = {
    "无",
    "none",
    "null",
    "暂无",
    "未分类",
    "其他",
    "其它",
    "unknown",
    "s2-引用",
    "bootstrap",
    "research-map",
    "vki",
    "follow-up",
    "computer science",
    "artificial intelligence",
    "machine learning",
    "cs",
    "cs.ai",
    "cs.ro",
    "arxiv",
    "paper",
}


def _clean_tags(tags: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        tag = str(raw).strip().strip("#")
        if not tag:
            continue
        key = tag.casefold()
        if key in _TAG_BLACKLIST or key.startswith("s2-"):
            continue
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(tag)
    return cleaned


def _extract_tags(path: Path) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return []

    if text.startswith("---"):
        try:
            post = frontmatter.loads(text)
            tags = post.metadata.get("tags", [])
            if isinstance(tags, list):
                return _clean_tags([str(tag).strip() for tag in tags if str(tag).strip()])
        except Exception:
            pass

    match = re.search(r"\*\*标签\*\*:\s*(.+)", text)
    if not match:
        return []

    raw = match.group(1)
    tags: list[str] = []
    for part in re.split(r"[、,/，/]| / ", raw):
        item = part.strip()
        if item:
            tags.append(item)
    return _clean_tags(tags)


def _clean_inline_text(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", "", text)
    cleaned = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", cleaned)
    cleaned = re.sub(r"\[\[([^\]]+)\]\]", r"\1", cleaned)
    cleaned = cleaned.replace("**", "").replace("*", "").replace("`", "")
    cleaned = re.sub(r"^\s*[-*]\s*\[[ xX]\]\s*", "", cleaned)
    cleaned = re.sub(r"^\s*[-*]\s*", "", cleaned)
    cleaned = re.sub(r"^\s*\d+\.\s*", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


_HEADING_NOISE_SNIPPETS = (
    "quick nav",
    "导航",
    "目录",
    "table of contents",
    "created:",
    "updated:",
)

_GUIDANCE_NOISE_PREFIXES = (
    "created:",
    "updated:",
    "date:",
    "tags:",
    "title:",
    "评分:",
    "理由:",
    "_理由",
)

_GUIDANCE_DIALOGUE_NOISE = (
    "我不太能理解",
    "我以为你理解了",
)

_GUIDANCE_SIGNAL_WEIGHTS = {
    "方向": 3,
    "实验": 3,
    "验证": 3,
    "下一步": 3,
    "debug": 3,
    "pipeline": 3,
    "问题": 2,
    "目标": 2,
    "稳定": 2,
    "泛化": 2,
    "控制": 2,
    "数据": 2,
    "模型": 2,
    "学习": 2,
    "尝试": 2,
    "试试": 2,
    "可以": 2,
    "应该": 2,
    "不要": 2,
    "目的": 2,
    "简单": 1,
    "效率": 1,
    "先": 1,
    "复杂": 1,
    "work": 2,
}


def _pick_meaningful_headings(headings: list[str], limit: int = 3) -> list[str]:
    selected: list[str] = []
    for heading in headings:
        cleaned = _clean_inline_text(heading)
        lowered = cleaned.casefold()
        if not cleaned:
            continue
        if cleaned in {"-", "--"}:
            continue
        if any(snippet in lowered for snippet in _HEADING_NOISE_SNIPPETS):
            continue
        selected.append(cleaned)
        if len(selected) >= limit:
            break
    return selected


def _is_noise_guidance_line(raw: str, cleaned: str) -> bool:
    lowered = cleaned.casefold()
    if not cleaned or cleaned in {"-", "--"}:
        return True
    if raw.lstrip().startswith("#"):
        return True
    if cleaned.startswith("![["):
        return True
    if lowered.startswith(_GUIDANCE_NOISE_PREFIXES):
        return True
    if any(snippet in cleaned for snippet in _GUIDANCE_DIALOGUE_NOISE):
        return True
    if cleaned.endswith(("：", ":")):
        return True
    if re.fullmatch(r"[0-9.\-_/\\]+", cleaned):
        return True
    if "http://" in lowered or "https://" in lowered:
        stripped = re.sub(r"https?://\S+", "", lowered).strip(" -")
        if len(stripped) < 8:
            return True
    return False


def _guidance_line_score(raw: str, cleaned: str) -> int:
    if _is_noise_guidance_line(raw, cleaned):
        return 0
    if len(cleaned) < 8 or len(cleaned) > 180:
        return 0

    lowered = cleaned.casefold()
    signal_score = 0
    for keyword, weight in _GUIDANCE_SIGNAL_WEIGHTS.items():
        if keyword in lowered:
            signal_score += weight
    if signal_score <= 0:
        return 0

    score = signal_score + 1
    if any(mark in cleaned for mark in ("。", "，", ";", "；")) or " " in cleaned:
        score += 1
    return score


def _safe_markdown_label(text: str) -> str:
    return text.replace("[", "（").replace("]", "）").replace("\n", " ").strip()


def _obsidian_note_uri(vault_path: Path, note_path: Path) -> str:
    relative = str(note_path.relative_to(vault_path)).replace("\\", "/")
    return f"obsidian://open?vault={quote(vault_path.name)}&file={quote(relative)}"


def _note_link(vault_path: Path, note_path: Path, label: Optional[str] = None) -> str:
    return f"[{_safe_markdown_label(label or _extract_title(note_path))}]({_obsidian_note_uri(vault_path, note_path)})"


def _dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = item.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


_MARKDOWN_LINK_RE = re.compile(r"(!?\[[^\]]*\])\(([^)]+)\)")


def _is_external_markdown_target(target: str) -> bool:
    lowered = target.casefold()
    return (
        lowered.startswith(("http://", "https://", "obsidian://", "mailto:", "data:", "file://"))
        or lowered.startswith("#")
    )


def _rewrite_markdown_relative_links(markdown: str, source_path: Path, target_path: Path) -> str:
    def replace(match: re.Match[str]) -> str:
        label = match.group(1)
        raw_target = match.group(2).strip()
        clean_target = raw_target.strip("<>").strip()

        if not clean_target or _is_external_markdown_target(clean_target):
            return match.group(0)

        resolved_target = source_path.parent / clean_target
        try:
            relative_target = Path(os.path.relpath(resolved_target, start=target_path.parent))
        except Exception:
            return match.group(0)

        return f"{label}({relative_target.as_posix()})"

    result_parts: list[str] = []
    last_index = 0
    for match in _MARKDOWN_LINK_RE.finditer(markdown):
        result_parts.append(markdown[last_index:match.start()])
        result_parts.append(replace(match))
        last_index = match.end()
    result_parts.append(markdown[last_index:])
    return "".join(result_parts)


class WikiBuilder:
    """使用 Agent CLI 将源材料摘录到 Wiki 知识库。"""

    @staticmethod
    def resolve_wiki_vault() -> Optional[Path]:
        candidates = [get_literature_path(), get_vault_path()]
        for candidate in candidates:
            if candidate and candidate.exists():
                if (candidate / ".obsidian").exists() or (candidate / "Wiki").exists():
                    return candidate
        for candidate in candidates:
            if candidate and candidate.exists():
                return candidate
        return None

    @staticmethod
    def resolve_intel_source_root() -> Optional[Path]:
        root = get_vault_path()
        if root and root.exists():
            return root
        return None

    @staticmethod
    def resolve_literature_source_root() -> Optional[Path]:
        root = get_literature_path() or get_vault_path()
        if not root or not root.exists():
            return None
        literature_dir = root / "Literature"
        if literature_dir.exists():
            return literature_dir
        return root

    @staticmethod
    def _scan_roots(wiki_type: str, root: Optional[Path]) -> list[str]:
        if not root:
            return []
        if wiki_type == "intel":
            candidates = [root / "bilibili", root / "xhs", root / "专辑"]
        else:
            candidates = [
                root / "FollowUps",
                root / "robot",
                root / "动态4D重建",
                root / "其他过去分组",
                root / "talks",
                root / "---Idea book---",
            ]
        return [str(path) for path in candidates if path.exists()]

    @staticmethod
    def _source_collection_page_slug(folder_id: str) -> str:
        return f"collection-{_slugify(folder_id)}"

    @staticmethod
    def _candidate_source_roots(wiki_type: str) -> list[Path]:
        candidates = [
            WikiBuilder.resolve_wiki_vault(),
            WikiBuilder.resolve_intel_source_root() if wiki_type == "intel" else WikiBuilder.resolve_literature_source_root(),
            WikiBuilder.resolve_literature_source_root(),
            WikiBuilder.resolve_intel_source_root(),
        ]
        roots: list[Path] = []
        seen: set[str] = set()
        for candidate in candidates:
            if not candidate:
                continue
            key = str(candidate.resolve())
            if key in seen:
                continue
            seen.add(key)
            roots.append(candidate)
        return roots

    @staticmethod
    def _resolve_source_note_path(payload: dict[str, Any], wiki_type: str) -> Optional[Path]:
        candidate_values = [
            str(payload.get("literature_path") or "").strip(),
            str(payload.get("obsidian_path") or "").strip(),
            str(payload.get("path") or "").strip(),
        ]
        metadata = payload.get("metadata", {}) or {}
        if isinstance(metadata, dict):
            candidate_values.extend([
                str(metadata.get("literature_path") or "").strip(),
                str(metadata.get("obsidian_path") or "").strip(),
                str(metadata.get("path") or "").strip(),
            ])

        candidates = [value for value in candidate_values if value]
        if not candidates:
            return None

        roots = WikiBuilder._candidate_source_roots(wiki_type)
        for raw_path in candidates:
            raw_candidate = Path(raw_path)
            variants = [raw_candidate]
            if raw_candidate.is_absolute() and raw_candidate.exists():
                return raw_candidate
            if raw_candidate.parts and raw_candidate.parts[0] == "Literature":
                variants.append(Path(*raw_candidate.parts[1:]))

            for root in roots:
                for variant in variants:
                    resolved = (root / variant).resolve()
                    if resolved.exists() and resolved.is_file():
                        return resolved

        return None

    @staticmethod
    def _build_intel_collection_content(card_data: dict[str, Any]) -> str:
        title = str(card_data.get("title", "未命名情报")).strip() or "未命名情报"
        summary = str(card_data.get("summary", "")).strip()
        source_url = str(card_data.get("source_url", "")).strip()
        tags = [str(tag).strip() for tag in card_data.get("tags", []) if str(tag).strip()]
        meta = card_data.get("metadata", {}) or {}
        if not isinstance(meta, dict):
            meta = {}

        author = str(
            meta.get("author")
            or meta.get("up_name")
            or meta.get("intelligence_author_label")
            or ""
        ).strip()
        published = str(meta.get("published_at") or meta.get("published") or "").strip()
        body = str(meta.get("content") or meta.get("description") or "").strip()
        matched_keywords = [str(item).strip() for item in meta.get("matched_keywords", []) if str(item).strip()]
        matched_tags = [str(item).strip() for item in meta.get("matched_tags", []) if str(item).strip()]
        images = [str(item).strip() for item in meta.get("images", []) if str(item).strip()]
        monitor_label = str(meta.get("monitor_label") or meta.get("monitor_source_label") or "").strip()

        parts = [f"# {title}\n"]
        meta_line = " / ".join([segment for segment in [author, published, monitor_label] if segment])
        if meta_line:
            parts.append(f"> {meta_line}\n")
        if summary:
            parts.append("## AI 摘要\n")
            parts.append(f"{summary}\n")
        if body and body != summary:
            parts.append("## 正文摘录\n")
            parts.append(f"{body}\n")
        if tags:
            parts.append("## 标签\n")
            parts.append(", ".join(tags) + "\n")
        if matched_keywords:
            parts.append("## 命中关键词\n")
            parts.append(", ".join(matched_keywords) + "\n")
        if matched_tags:
            parts.append("## 命中标签\n")
            parts.append(", ".join(matched_tags) + "\n")
        if images:
            parts.append("## 图片\n")
            parts.extend(f"- {url}\n" for url in images[:8])
        if source_url:
            parts.append(f"[原文链接]({source_url})\n")
        return "\n".join(parts).strip() + "\n"

    @staticmethod
    def _build_paper_mirror_content(paper_data: dict[str, Any]) -> str:
        title = str(paper_data.get("title", "未命名论文")).strip() or "未命名论文"
        summary = str(paper_data.get("summary", "")).strip()
        source_url = str(paper_data.get("source_url", "")).strip()
        meta = paper_data.get("metadata", {}) or {}
        if not isinstance(meta, dict):
            meta = {}

        abstract = str(meta.get("abstract", "")).strip()
        introduction = str(meta.get("introduction", "")).strip()
        formatted_digest = str(meta.get("formatted-digest") or meta.get("formatted_digest") or "").strip()
        contribution = str(meta.get("contribution", "")).strip()

        parts = [f"# {title}\n"]
        if contribution:
            parts.append(f"**核心创新**: {contribution}\n")
        if summary:
            parts.append("## AI 摘要\n")
            parts.append(f"{summary}\n")
        if abstract:
            parts.append("## 摘要\n")
            parts.append(f"{abstract}\n")
        if introduction:
            parts.append("## Introduction\n")
            parts.append(f"{introduction}\n")
        if formatted_digest:
            parts.append(f"{formatted_digest}\n")
        if source_url:
            parts.append(f"[原文链接]({source_url})\n")
        return "\n".join(parts).strip() + "\n"

    @staticmethod
    def _build_mirrored_wiki_content(
        *,
        payload: dict[str, Any],
        wiki_type: str,
        target_path: Path,
    ) -> str:
        source_note_path = WikiBuilder._resolve_source_note_path(payload, wiki_type)
        if source_note_path:
            mirrored = _read_markdown_body(source_note_path).strip()
            if mirrored:
                return _rewrite_markdown_relative_links(
                    mirrored if mirrored.endswith("\n") else f"{mirrored}\n",
                    source_note_path,
                    target_path,
                )

        if wiki_type == "lit":
            return WikiBuilder._build_paper_mirror_content(payload)
        return WikiBuilder._build_intel_collection_content(payload)

    @staticmethod
    def _source_folder_meta_for_path(path: Path, wiki_type: str, root: Path) -> Optional[dict[str, str]]:
        try:
            rel = path.relative_to(root)
        except ValueError:
            return None

        if not rel.parts:
            return None

        folder_rel: Path
        label: str
        if wiki_type == "intel":
            if len(rel.parts) >= 3 and rel.parts[0] == "bilibili" and rel.parts[1] == "favorites":
                folder_rel = Path(*rel.parts[:3])
                label = f"Bilibili / {rel.parts[2]}"
            elif len(rel.parts) >= 2 and rel.parts[0] == "bilibili" and rel.parts[1] == "watch_later":
                folder_rel = Path(*rel.parts[:2])
                label = "Bilibili / 稍后再看"
            elif rel.parts[0] in {"xhs", "专辑"}:
                if len(rel.parts) >= 2 and not rel.parts[1].endswith(".md"):
                    folder_rel = Path(*rel.parts[:2])
                    label = f"小红书 / {rel.parts[1]}"
                else:
                    folder_rel = Path(rel.parts[0])
                    label = "小红书"
            else:
                folder_rel = Path(rel.parts[0])
                label = rel.parts[0]
        else:
            if rel.parts[0] == "FollowUps":
                if len(rel.parts) >= 2 and not rel.parts[1].endswith(".md"):
                    folder_rel = Path(*rel.parts[:2])
                    label = f"FollowUps / {rel.parts[1]}"
                else:
                    folder_rel = Path(rel.parts[0])
                    label = "FollowUps"
            elif rel.parts[0] == "robot":
                if len(rel.parts) >= 2 and not rel.parts[1].endswith(".md"):
                    folder_rel = Path(*rel.parts[:2])
                    label = f"robot / {rel.parts[1]}"
                else:
                    folder_rel = Path(rel.parts[0])
                    label = "robot"
            elif rel.parts[0] == "其他过去分组":
                if len(rel.parts) >= 2 and not rel.parts[1].endswith(".md"):
                    folder_rel = Path(*rel.parts[:2])
                    label = f"其他过去分组 / {rel.parts[1]}"
                else:
                    folder_rel = Path(rel.parts[0])
                    label = "其他过去分组"
            elif rel.parts[0] in {"动态4D重建", "talks", "---Idea book---"}:
                folder_rel = Path(rel.parts[0])
                label = rel.parts[0]
            else:
                folder_rel = Path(rel.parts[0])
                label = rel.parts[0]

        folder_id = str(folder_rel).replace("\\", "/")
        folder_path = (root / folder_rel).resolve()
        return {
            "id": folder_id,
            "label": label,
            "relative_path": folder_id,
            "folder_path": str(folder_path),
        }

    @staticmethod
    def _build_source_folder_groups(
        files: list[Path],
        wiki_type: str,
        root: Optional[Path],
        folder_states: dict[str, bool],
        vault_path: Optional[Path] = None,
    ) -> list[dict]:
        if not root:
            return []

        grouped: dict[str, dict] = {}
        for path in files:
            meta = WikiBuilder._source_folder_meta_for_path(path, wiki_type, root)
            if not meta:
                continue
            group = grouped.setdefault(
                meta["id"],
                {
                    **meta,
                    "note_count": 0,
                    "_paths": [],
                    "_tag_counter": Counter(),
                    "_highlights": [],
                },
            )
            group["note_count"] += 1
            group["_paths"].append(path)
            for tag in _extract_tags(path)[:8]:
                group["_tag_counter"][tag] += 1
            group["_highlights"].extend(
                _pick_meaningful_headings(WikiBuilder._extract_headings(path), limit=2)
            )

        groups: list[dict] = []
        for group in grouped.values():
            paths = sorted(group.pop("_paths"), key=lambda item: item.stat().st_mtime, reverse=True)
            tag_counter = group.pop("_tag_counter")
            highlights = group.pop("_highlights")
            page_slug = WikiBuilder._source_collection_page_slug(group["id"])
            groups.append({
                **group,
                "enabled": folder_states.get(group["id"], True),
                "page_slug": page_slug,
                "has_page": bool(vault_path and WikiStore.get_page_path(vault_path, wiki_type, page_slug)),
                "top_tags": [tag for tag, _count in tag_counter.most_common(6)],
                "highlights": _dedupe_keep_order(highlights)[:6],
                "recent_notes": [WikiBuilder._note_record(path) for path in paths[:4]],
                "updated": max((path.stat().st_mtime for path in paths), default=0),
            })

        groups.sort(
            key=lambda item: (
                0 if item["enabled"] else 1,
                -item["note_count"],
                item["label"],
            ),
        )
        return groups

    @staticmethod
    def _should_skip_markdown(path: Path) -> bool:
        return any(
            part in {
                ".obsidian",
                ".trash",
                "Wiki",
                "img",
                "video",
                "attachments",
                "arxiv_pdf",
                "__pycache__",
                "模板",
            }
            or part.startswith(".")
            for part in path.parts
        )

    @staticmethod
    def _list_markdown_files(root: Path) -> list[Path]:
        files = [
            path for path in root.rglob("*.md")
            if not WikiBuilder._should_skip_markdown(path.relative_to(root))
        ]
        files.sort(key=lambda item: item.stat().st_mtime, reverse=True)
        return files

    @staticmethod
    def _scan_intel_source_files(limit: int = 80) -> list[Path]:
        root = WikiBuilder.resolve_intel_source_root()
        if not root:
            return []

        files: list[Path] = []
        bilibili_root = root / "bilibili"
        xhs_root = root / "xhs"
        album_root = root / "专辑"
        if bilibili_root.exists():
            files.extend(
                path for path in bilibili_root.rglob("*.md")
                if not WikiBuilder._should_skip_markdown(path.relative_to(root))
            )
        if xhs_root.exists():
            files.extend(
                path for path in xhs_root.rglob("*.md")
                if not WikiBuilder._should_skip_markdown(path.relative_to(root))
                and "test" not in {part.casefold() for part in path.relative_to(root).parts}
            )
        if album_root.exists():
            files.extend(
                path for path in album_root.rglob("*.md")
                if not WikiBuilder._should_skip_markdown(path.relative_to(root))
                and "test" not in {part.casefold() for part in path.relative_to(root).parts}
            )
        files.sort(key=lambda item: item.stat().st_mtime, reverse=True)
        return files[:limit]

    @staticmethod
    def _scan_literature_source_files(limit: int = 120) -> list[Path]:
        root = WikiBuilder.resolve_literature_source_root()
        if not root:
            return []

        prioritized_dirs = [
            root / "FollowUps",
            root / "robot",
            root / "动态4D重建",
            root / "其他过去分组",
            root / "talks",
            root / "---Idea book---",
        ]
        files: list[Path] = []
        seen: set[Path] = set()
        for directory in prioritized_dirs:
            if not directory.exists():
                continue
            for path in WikiBuilder._list_markdown_files(directory):
                if path not in seen:
                    seen.add(path)
                    files.append(path)
        if not files:
            files = WikiBuilder._list_markdown_files(root)
        return files[:limit]

    @staticmethod
    def _extract_headings(path: Path, limit: int = 4) -> list[str]:
        headings: list[str] = []
        for line in _read_markdown_body(path).splitlines():
            stripped = line.strip()
            cleaned = ""
            if stripped.startswith("## "):
                cleaned = stripped[3:].strip()
            else:
                match = re.search(r"<h\d[^>]*>(.*?)</h\d>", stripped)
                if match:
                    cleaned = _clean_inline_text(match.group(1))
            if cleaned:
                headings.append(cleaned)
            if len(headings) >= limit:
                break
        return headings

    @staticmethod
    def _note_record(note_path: Path) -> dict:
        vault_path = WikiBuilder.resolve_wiki_vault() or WikiBuilder.resolve_literature_source_root()
        relative_path = ""
        uri = ""
        if vault_path and note_path.is_relative_to(vault_path):
            relative_path = str(note_path.relative_to(vault_path)).replace("\\", "/")
            uri = _obsidian_note_uri(vault_path, note_path)
        return {
            "title": _extract_title(note_path),
            "path": str(note_path),
            "relative_path": relative_path,
            "uri": uri,
            "excerpt": _read_text_excerpt(note_path, 220),
            "headings": WikiBuilder._extract_headings(note_path),
        }

    @staticmethod
    def _extract_guidance_points(path: Path, limit: int = 4) -> list[str]:
        text = _read_markdown_body(path)
        raw_lines = text.splitlines()
        section_keywords = ("个人问题", "值得思考的问题", "讨论话题", "任务分配", "下一步")

        def pick_best(candidates: list[tuple[int, int, str]]) -> list[str]:
            if not candidates:
                return []
            top = sorted(candidates, key=lambda item: (-item[0], item[1]))[:limit]
            top.sort(key=lambda item: item[1])
            return [item[2] for item in top]

        def collect_from(index: int) -> list[tuple[int, int, str]]:
            candidates: list[tuple[int, int, str]] = []
            for offset, raw in enumerate(raw_lines[index + 1:index + 24], start=1):
                cleaned = _clean_inline_text(raw)
                if not cleaned:
                    if candidates:
                        break
                    continue
                score = _guidance_line_score(raw, cleaned)
                if score > 0:
                    candidates.append((score, index + offset, cleaned))
            return candidates

        collected_candidates: list[tuple[int, int, str]] = []
        for idx, raw in enumerate(raw_lines):
            cleaned = _clean_inline_text(raw)
            if any(keyword in cleaned for keyword in section_keywords):
                collected_candidates.extend(collect_from(idx))
            if len(collected_candidates) >= limit * 2:
                break

        collected = pick_best(collected_candidates)
        if not collected:
            all_candidates: list[tuple[int, int, str]] = []
            for idx, raw in enumerate(raw_lines):
                cleaned = _clean_inline_text(raw)
                if not cleaned:
                    continue
                score = _guidance_line_score(raw, cleaned)
                if score > 0:
                    all_candidates.append((score, idx, cleaned))
            collected = pick_best(all_candidates)

        if not collected:
            excerpt_candidates: list[tuple[int, int, str]] = []
            excerpt = _read_text_excerpt(path, 260)
            for idx, chunk in enumerate(re.split(r"[\n。！？]", excerpt)):
                cleaned = _clean_inline_text(chunk)
                score = _guidance_line_score(chunk, cleaned)
                if score > 0:
                    excerpt_candidates.append((score, idx, cleaned))
            collected = pick_best(excerpt_candidates)

        return _dedupe_keep_order(collected)[:limit]

    @staticmethod
    def _lit_archive_group_label(root: Path, path: Path) -> str:
        rel = path.relative_to(root)
        if rel.parts[0] == "robot" and len(rel.parts) >= 2:
            return f"robot / {rel.parts[1]}"
        if rel.parts[0] == "其他过去分组" and len(rel.parts) >= 2:
            return f"其他过去分组 / {rel.parts[1]}"
        return rel.parts[0]

    @staticmethod
    def _lit_archive_group_priority(label: str) -> tuple[int, str]:
        priorities = {
            "robot / VLA&WM": 100,
            "robot / Feature4policy": 95,
            "robot / blog": 88,
            "动态4D重建": 84,
            "其他过去分组 / 1toRead": 82,
            "其他过去分组 / 积累方向": 80,
            "其他过去分组 / 积累有用": 78,
            "其他过去分组 / 组会素材": 76,
            "其他过去分组 / 经典论文": 74,
            "talks": 72,
            "---Idea book---": 68,
        }
        return (priorities.get(label, 40), label)

    @staticmethod
    def _collect_lit_followup_groups(
        limit_groups: int = 4,
        limit_notes_per_group: int = 32,
        allowed_folder_ids: Optional[set[str]] = None,
    ) -> list[dict]:
        root = WikiBuilder.resolve_literature_source_root()
        if not root:
            return []
        followups_root = root / "FollowUps"
        if not followups_root.exists():
            return []

        groups: list[dict] = []
        group_dirs = [path for path in followups_root.iterdir() if path.is_dir() and not path.name.startswith(".")]
        group_dirs.sort(
            key=lambda item: max((child.stat().st_mtime for child in item.rglob("*.md")), default=item.stat().st_mtime),
            reverse=True,
        )

        for group_dir in group_dirs:
            folder_id = f"FollowUps/{group_dir.name}"
            if allowed_folder_ids is not None and folder_id not in allowed_folder_ids:
                continue
            note_files = [
                path for path in group_dir.rglob("*.md")
                if not path.name.startswith(".") and not WikiBuilder._should_skip_markdown(path.relative_to(root))
            ]
            note_files.sort(key=lambda item: item.stat().st_mtime, reverse=True)
            root_note = group_dir / f"{group_dir.name}.md"
            if not root_note.exists():
                root_note = next((path for path in note_files if path.parent == group_dir), None)
            context_note = group_dir / ".paper_followup_context.md"
            child_notes = [path for path in note_files if path != root_note][:limit_notes_per_group]
            groups.append({
                "id": folder_id,
                "title": group_dir.name,
                "path": str(group_dir),
                "note_count": len(child_notes),
                "root_note": WikiBuilder._note_record(root_note) if root_note else None,
                "context_note": WikiBuilder._note_record(context_note) if context_note.exists() else None,
                "notes": [WikiBuilder._note_record(path) for path in child_notes],
            })
            if len(groups) >= limit_groups:
                break
        return groups

    @staticmethod
    def _collect_lit_archive_groups(
        limit_groups: int = 6,
        limit_notes_per_group: int = 10,
        allowed_folder_ids: Optional[set[str]] = None,
    ) -> list[dict]:
        root = WikiBuilder.resolve_literature_source_root()
        if not root:
            return []

        candidate_dirs = [
            root / "robot",
            root / "动态4D重建",
            root / "其他过去分组",
            root / "talks",
            root / "---Idea book---",
        ]
        grouped: dict[str, dict] = {}
        for directory in candidate_dirs:
            if not directory.exists():
                continue
            for path in WikiBuilder._list_markdown_files(directory):
                meta = WikiBuilder._source_folder_meta_for_path(path, "lit", root)
                if not meta:
                    continue
                if allowed_folder_ids is not None and meta["id"] not in allowed_folder_ids:
                    continue
                group = grouped.setdefault(
                    meta["id"],
                    {
                        "id": meta["id"],
                        "label": meta["label"],
                        "files": [],
                    },
                )
                group["files"].append(path)

        groups: list[dict] = []
        for group_info in grouped.values():
            label = group_info["label"]
            files = group_info["files"]
            files = sorted(
                files,
                key=lambda path: (
                    1 if path.name == "_organized_summary.md" else 0,
                    path.stat().st_mtime,
                ),
                reverse=True,
            )
            groups.append({
                "id": group_info["id"],
                "label": label,
                "count": len(files),
                "notes": [WikiBuilder._note_record(path) for path in files[:limit_notes_per_group]],
            })

        groups.sort(
            key=lambda item: (
                WikiBuilder._lit_archive_group_priority(item["label"])[0],
                item["count"],
            ),
            reverse=True,
        )
        return groups[:limit_groups]

    @staticmethod
    def _collect_lit_mentor_notes(
        limit: int = 6,
        allowed_folder_ids: Optional[set[str]] = None,
    ) -> list[dict]:
        root = WikiBuilder.resolve_literature_source_root()
        if not root:
            return []

        candidate_dirs = [
            root / "FollowUps",
            root / "talks",
            root / "---Idea book---",
            root / "其他过去分组" / "组会素材",
            root / "robot",
            root / "动态4D重建",
            root / "其他过去分组",
        ]
        guidance_path_weights = {
            "导师式指导": 12,
            "followups": 6,
            "talks": 8,
            "---idea book---": 7,
            "组会素材": 8,
            "robot/blog": 5,
            "robot/vla&wm": 4,
            "动态4d重建": 4,
        }
        guidance_keywords = ("个人问题", "值得思考的问题", "讨论话题", "任务分配", "方向", "实验", "验证", "下一步")

        scored: list[tuple[int, float, Path, list[str]]] = []
        seen: set[Path] = set()
        for directory in candidate_dirs:
            if not directory.exists():
                continue
            for path in WikiBuilder._list_markdown_files(directory):
                if path in seen:
                    continue
                seen.add(path)
                meta = WikiBuilder._source_folder_meta_for_path(path, "lit", root)
                if meta and allowed_folder_ids is not None and meta["id"] not in allowed_folder_ids:
                    continue
                rel_lower = str(path.relative_to(root)).replace("\\", "/").lower()
                score = 0
                for key, weight in guidance_path_weights.items():
                    if key in rel_lower:
                        score += weight
                body = _read_markdown_body(path)
                score += sum(3 for keyword in guidance_keywords if keyword in body)
                guidance_points = WikiBuilder._extract_guidance_points(path)
                score += min(sum(_guidance_line_score(point, point) for point in guidance_points), 16)
                if score <= 0 or not guidance_points:
                    continue
                scored.append((score, path.stat().st_mtime, path, guidance_points))

        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        results: list[dict] = []
        for _score, _mtime, path, guidance_points in scored[:limit]:
            record = WikiBuilder._note_record(path)
            record["guidance_points"] = guidance_points
            results.append(record)
        return results

    @staticmethod
    def _collection_label(path: Path, wiki_type: str) -> str:
        if wiki_type == "intel":
            root = WikiBuilder.resolve_intel_source_root()
            if not root:
                return path.parent.name
            rel = path.relative_to(root)
            if len(rel.parts) >= 3 and rel.parts[0] == "bilibili" and rel.parts[1] == "favorites":
                return f"Bilibili / {rel.parts[2]}"
            if len(rel.parts) >= 2 and rel.parts[0] in {"xhs", "专辑"}:
                return f"小红书 / {rel.parts[1]}"
            return rel.parts[0]

        root = WikiBuilder.resolve_literature_source_root()
        if not root:
            return path.parent.name
        rel = path.relative_to(root)
        if len(rel.parts) >= 2 and rel.parts[1].endswith(".md"):
            return rel.parts[0]
        if len(rel.parts) >= 2:
            return f"{rel.parts[0]} / {rel.parts[1]}"
        if rel.parts:
            return rel.parts[0]
        return path.parent.name

    @staticmethod
    def _discover_reference_notes(wiki_type: str, limit: int = 3) -> list[dict]:
        wiki_vault = WikiBuilder.resolve_wiki_vault()
        intel_root = WikiBuilder.resolve_intel_source_root()
        if wiki_type == "intel":
            keywords = ["llm wiki", "知识库", "ai大脑", "obsidian", "karpathy", "claude code"]
            roots = [
                wiki_vault,
                intel_root / "xhs" if intel_root and (intel_root / "xhs").exists() else None,
                intel_root / "专辑" if intel_root and (intel_root / "专辑").exists() else None,
            ]
        else:
            keywords = ["读论文", "obsidian", "claude code", "科研", "知识库", "研究"]
            roots = [
                wiki_vault,
                intel_root / "xhs" / "学术"
                if intel_root and (intel_root / "xhs" / "学术").exists()
                else None,
                intel_root / "专辑" / "学术"
                if intel_root and (intel_root / "专辑" / "学术").exists()
                else None,
            ]

        scored: list[tuple[int, float, Path]] = []
        seen: set[Path] = set()
        for root in roots:
            if not root or not root.exists():
                continue
            candidates = sorted(root.rglob("*.md"), key=lambda item: item.stat().st_mtime, reverse=True)
            for path in candidates[:200]:
                if path in seen:
                    continue
                seen.add(path)
                relative = path.relative_to(root)
                if WikiBuilder._should_skip_markdown(relative):
                    continue
                if relative.parts and relative.parts[0] in {"Wiki", "Literature", "arxiv", "FollowUps"}:
                    continue
                rel_text = str(relative).lower()
                title = _extract_title(path)
                excerpt = _read_text_excerpt(path, 500).lower()
                score = sum(4 for keyword in keywords if keyword in title.lower())
                score += sum(2 for keyword in keywords if keyword in rel_text)
                score += sum(1 for keyword in keywords if keyword in excerpt)
                if score > 0:
                    scored.append((score, path.stat().st_mtime, path))

        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        references: list[dict] = []
        for score, _mtime, path in scored[:limit]:
            references.append({
                "title": _extract_title(path),
                "path": str(path),
                "excerpt": _read_text_excerpt(path, 260),
                "score": score,
            })
        return references

    @staticmethod
    def describe_workspace(wiki_type: str, vault_path: Optional[Path] = None) -> dict:
        source_root = (
            WikiBuilder.resolve_intel_source_root()
            if wiki_type == "intel"
            else WikiBuilder.resolve_literature_source_root()
        )
        files = (
            WikiBuilder._scan_intel_source_files()
            if wiki_type == "intel"
            else WikiBuilder._scan_literature_source_files()
        )
        wiki_vault = vault_path or WikiBuilder.resolve_wiki_vault()
        if wiki_vault:
            WikiStore.ensure_structure(wiki_vault, wiki_type)
        source_config = (
            WikiStore.load_source_config(wiki_vault, wiki_type)
            if wiki_vault
            else {"folder_states": {}, "updated": ""}
        )
        folder_states = source_config.get("folder_states", {})
        source_folders = WikiBuilder._build_source_folder_groups(
            files,
            wiki_type,
            source_root,
            folder_states,
            wiki_vault,
        )
        enabled_folder_ids = {item["id"] for item in source_folders if item["enabled"]}

        enabled_files: list[Path] = []
        if source_root:
            for path in files:
                meta = WikiBuilder._source_folder_meta_for_path(path, wiki_type, source_root)
                if not meta:
                    continue
                if meta["id"] in enabled_folder_ids:
                    enabled_files.append(path)
        else:
            enabled_files = files[:]

        tag_counter: Counter[str] = Counter()
        collection_counter: Counter[str] = Counter()
        recent_sources: list[dict] = []

        for path in enabled_files[:60]:
            meta = WikiBuilder._source_folder_meta_for_path(path, wiki_type, source_root) if source_root else None
            collection = meta["label"] if meta else path.parent.name
            collection_counter[collection] += 1
            for tag in _extract_tags(path)[:8]:
                tag_counter[tag] += 1

        for path in enabled_files[:6]:
            meta = WikiBuilder._source_folder_meta_for_path(path, wiki_type, source_root) if source_root else None
            recent_sources.append({
                "title": _extract_title(path),
                "collection": meta["label"] if meta else path.parent.name,
                "path": str(path),
                "excerpt": _read_text_excerpt(path, 220),
                "updated": path.stat().st_mtime,
            })

        has_overview = False
        if wiki_vault:
            has_overview = (WikiStore.get_wiki_root(wiki_vault, wiki_type) / "overview.md").exists()

        workspace = {
            "wiki_type": wiki_type,
            "wiki_title": "Internet Wiki" if wiki_type == "intel" else "Literature Wiki",
            "has_overview": has_overview,
            "primary_action_label": (
                "刷新 Internet Wiki 总览" if has_overview and wiki_type == "intel"
                else "刷新 Literature Wiki 总览" if has_overview
                else "生成 Internet Wiki 总览" if wiki_type == "intel"
                else "生成 Literature Wiki 总览"
            ),
            "workflow_hint": (
                "先勾选要纳入的素材文件夹，再生成全局页和每个文件夹自己的 VKI。以后在今日情报里点“写入 Internet Wiki”，就会继续补充这些分层页面。"
                if wiki_type == "intel"
                else "先勾选要纳入的素材文件夹，再生成全局研究地图和每个文件夹自己的 VKI。以后在论文卡片里点“保存到文献库”或写入 Literature Wiki，新论文会继续补进来。"
            ),
            "source_summary": {
                "total_sources": len(enabled_files),
                "total_discovered_sources": len(files),
                "collections": [
                    {"label": label, "count": count}
                    for label, count in collection_counter.most_common(6)
                ],
                "top_tags": [tag for tag, _count in tag_counter.most_common(8)],
                "recent_sources": recent_sources,
                "enabled_folder_count": sum(1 for item in source_folders if item["enabled"]),
                "disabled_folder_count": sum(1 for item in source_folders if not item["enabled"]),
            },
            "source_folders": source_folders,
            "scan_roots": WikiBuilder._scan_roots(wiki_type, source_root),
            "source_config_updated": source_config.get("updated", ""),
            "reference_notes": WikiBuilder._discover_reference_notes(wiki_type),
        }
        if wiki_type == "lit":
            workspace["followup_groups"] = WikiBuilder._collect_lit_followup_groups(allowed_folder_ids=enabled_folder_ids)
            workspace["archive_groups"] = WikiBuilder._collect_lit_archive_groups(allowed_folder_ids=enabled_folder_ids)
            workspace["mentor_notes"] = WikiBuilder._collect_lit_mentor_notes(allowed_folder_ids=enabled_folder_ids)
        return workspace

    @staticmethod
    def _build_lit_bootstrap_pages(vault_path: Path, workspace: dict) -> list[dict]:
        source_summary = workspace.get("source_summary", {})
        collections = source_summary.get("collections", [])
        followup_groups = workspace.get("followup_groups", [])
        archive_groups = workspace.get("archive_groups", [])
        mentor_notes = workspace.get("mentor_notes", [])

        def record_link(record: Optional[dict]) -> str:
            if not record:
                return ""
            return _note_link(vault_path, Path(record["path"]), record["title"])

        def note_headings(record: Optional[dict], limit: int = 3) -> list[str]:
            if not record:
                return []
            headings = _pick_meaningful_headings(record.get("headings", []), limit=limit)
            if headings:
                return headings
            return record.get("headings", [])[:limit]

        overview_detail_links: list[str] = []
        for group in followup_groups[:2]:
            if group.get("root_note"):
                overview_detail_links.append(f"- {record_link(group['root_note'])}")
            for note in group.get("notes", [])[:3]:
                overview_detail_links.append(f"- {record_link(note)}")
        for group in archive_groups[:3]:
            for note in group.get("notes", [])[:2]:
                overview_detail_links.append(f"- {record_link(note)}")
        for note in mentor_notes[:2]:
            overview_detail_links.append(f"- {record_link(note)}")
        overview_detail_links = _dedupe_keep_order(overview_detail_links)[:14]

        map_lines: list[str] = []
        if followup_groups:
            lead_group = followup_groups[0]
            root_link = record_link(lead_group.get("root_note"))
            if root_link:
                map_lines.append(
                    f"- 前沿追踪：以 {root_link} 为起点，后面已经挂了 {lead_group['note_count']} 篇 follow up。"
                )
        for group in archive_groups[:3]:
            first_note = group.get("notes", [None])[0] if group.get("notes") else None
            headings = note_headings(first_note, limit=2)
            detail = f"，你在这里主要积累了 {' / '.join(headings)}" if headings else ""
            map_lines.append(f"- 长期沉淀：{group['label']}（{group['count']} 条）{detail}。")

        mentor_highlights: list[str] = []
        for note in mentor_notes[:3]:
            mentor_highlights.extend(note.get("guidance_points", [])[:2])
        mentor_highlights = _dedupe_keep_order(mentor_highlights)[:6]

        collection_lines = "\n".join(
            f"- {item['label']}：{item['count']} 条"
            for item in collections[:6]
        ) or "- 暂无已整理来源"
        map_block = "\n".join(map_lines) or "- 还没扫出足够清晰的研究骨架"
        detail_link_block = "\n".join(overview_detail_links) or "- 还没有可直达的细节入口"
        mentor_highlight_block = "\n".join(f"- {line}" for line in mentor_highlights) or "- 暂时还没有提炼出稳定的推进提醒"

        overview_content = (
            "# 全局文献 VKI\n\n"
            "> 这是一张把你的 Follow Up、旧 archive / 分组笔记、研究沉淀和组会/指导提醒串在一起的文献脉络图。\n\n"
            "## 这张图怎么读\n\n"
            "- [[research-mainlines|研究主线]]：现在长期在积累什么，已经长出了哪些主题。\n"
            "- [[followup-trails|Follow Up 追踪链]]：一篇主 paper 下面继续追了哪些后续工作。\n"
            "- [[archive-details|细节笔记入口]]：回到原始 markdown 看具体细节。\n"
            "- [[mentor-guidance|指导与下一步]]：把组会/提醒/方向建议放在一起看。\n\n"
            "- 想看内部页之间怎么互相串起来，切到上方“脑图”。\n\n"
            "## 当前文献版图\n\n"
            f"{collection_lines}\n\n"
            "## 当前知识骨架\n\n"
            f"{map_block}\n\n"
            "## 我会反复回看的细节\n\n"
            f"{detail_link_block}\n\n"
            "## 现在最值得记住的指导\n\n"
            f"{mentor_highlight_block}\n\n"
            "## 怎么维护\n\n"
            "- 新搜到或新看完的论文先点“保存到文献库”。\n"
            "- 回看某条主线时，优先从这页进入，再顺着内部链接走到主题页和细节页。\n"
            "- 需要回原文时，直接点外部链接打开对应 markdown。\n"
        )

        pages: list[dict] = [{
            "slug": "overview",
            "title": "全局文献 VKI",
            "category": "overview",
            "tags": ["research-map", "bootstrap"],
            "content": overview_content,
        }]

        research_sections: list[str] = []
        for group in archive_groups[:5]:
            lines: list[str] = []
            for note in group.get("notes", [])[:8]:
                link = record_link(note)
                headings = note_headings(note)
                if headings:
                    lines.append(f"- {link}：{headings[0]}")
                else:
                    lines.append(f"- {link}")
            if not lines:
                continue
            research_sections.append(f"### {group['label']}\n\n" + "\n".join(lines))

        research_content = (
            "# 研究主线\n\n"
            "> 返回 [[overview|总览]] · 对应页 [[followup-trails|Follow Up 追踪链]] · [[archive-details|细节笔记入口]] · [[mentor-guidance|指导与下一步]]\n\n"
            "## 我现在在积累什么\n\n"
            + ("\n\n".join(research_sections) if research_sections else "- 暂无主线笔记") +
            "\n\n## 我已经学到的东西\n\n"
        )

        learned_lines: list[str] = []
        for group in archive_groups[:4]:
            for note in group.get("notes", [])[:3]:
                headings = note_headings(note)
                if headings:
                    learned_lines.append(f"- {record_link(note)}：{' / '.join(headings[:3])}")
        research_content += "\n".join(_dedupe_keep_order(learned_lines)[:12]) or "- 暂无已整理出的学习条目"
        pages.append({
            "slug": "research-mainlines",
            "title": "研究主线",
            "category": "topic",
            "tags": ["mainline", "archive"],
            "content": research_content,
        })

        followup_sections: list[str] = []
        for group in followup_groups:
            section_lines: list[str] = []
            if group.get("root_note"):
                section_lines.append(f"- 主线起点：{record_link(group['root_note'])}")
            if group.get("context_note"):
                section_lines.append(f"- 追踪上下文：{record_link(group['context_note'])}")
            for note in group.get("notes", [])[:32]:
                section_lines.append(f"- {record_link(note)}")
            if not section_lines:
                continue
            followup_sections.append(
                f"## {group['title']}（{group['note_count']} 篇）\n\n" + "\n".join(section_lines)
            )

        followup_onboarding_lines: list[str] = []
        if followup_groups:
            first_group = followup_groups[0]
            if first_group.get("root_note"):
                followup_onboarding_lines.append(f"- 先读 {record_link(first_group['root_note'])}，确认主问题。")
            if first_group.get("context_note"):
                followup_onboarding_lines.append(f"- 再读 {record_link(first_group['context_note'])}，看当前追踪逻辑。")
            if first_group.get("notes"):
                followup_onboarding_lines.append(f"- 然后从 {record_link(first_group['notes'][0])} 开始往后串。")
        followup_onboarding_block = "\n".join(followup_onboarding_lines) or "- 先从主线起点和 context note 开始"

        pages.append({
            "slug": "followup-trails",
            "title": "Follow Up 追踪链",
            "category": "topic",
            "tags": ["follow-up", "papers"],
            "content": (
                "# Follow Up 追踪链\n\n"
                "> 返回 [[overview|总览]] · 对应页 [[research-mainlines|研究主线]] · [[archive-details|细节笔记入口]] · [[mentor-guidance|指导与下一步]]\n\n"
                "## 第一次从这页怎么读\n\n"
                f"{followup_onboarding_block}\n\n"
                + ("\n\n".join(followup_sections) if followup_sections else "- 暂无 Follow Up 追踪链")
            ),
        })

        archive_sections: list[str] = []
        for group in archive_groups:
            lines = [f"- {record_link(note)}" for note in group.get("notes", [])]
            if not lines:
                continue
            archive_sections.append(f"## {group['label']}（{group['count']} 条）\n\n" + "\n".join(lines))
        pages.append({
            "slug": "archive-details",
            "title": "细节笔记入口",
            "category": "topic",
            "tags": ["archive", "details"],
            "content": (
                "# 细节笔记入口\n\n"
                "> 返回 [[overview|总览]] · 对应页 [[research-mainlines|研究主线]] · [[followup-trails|Follow Up 追踪链]] · [[mentor-guidance|指导与下一步]]\n\n"
                "## 原始 markdown 直达\n\n"
                "点开就是你在 Obsidian 里的原始笔记，不需要再自己去翻目录。\n\n"
                + ("\n\n".join(archive_sections) if archive_sections else "- 暂无可整理的 archive 笔记")
            ),
        })

        mentor_lines: list[str] = []
        for note in mentor_notes:
            points = note.get("guidance_points", [])
            mentor_lines.append(f"- {record_link(note)}")
            mentor_lines.extend(f"  - {point}" for point in points[:4])
        mentor_summary_block = "\n".join(f"- {point}" for point in mentor_highlights) or "- 暂无已提炼的推进原则"
        pages.append({
            "slug": "mentor-guidance",
            "title": "指导与下一步",
            "category": "topic",
            "tags": ["guidance", "next-step"],
            "content": (
                "# 指导与下一步\n\n"
                "> 返回 [[overview|总览]] · 对应页 [[research-mainlines|研究主线]] · [[followup-trails|Follow Up 追踪链]] · [[archive-details|细节笔记入口]]\n\n"
                "## 先抓住的推进原则\n\n"
                f"{mentor_summary_block}\n\n"
                "## 当前能直接回看的指导 / 提醒\n\n"
                + ("\n".join(mentor_lines) if mentor_lines else "- 暂无已识别的指导笔记")
            ),
        })
        return pages

    @staticmethod
    def _collection_note_link(record: dict) -> str:
        title = _safe_markdown_label(record.get("title", "未命名素材"))
        uri = str(record.get("uri", "")).strip()
        path_label = record.get("relative_path") or record.get("path", "")
        if uri:
            return f"[{title}]({uri})"
        if path_label:
            return f"{title} (`{path_label}`)"
        return title

    @staticmethod
    def _build_collection_pages(wiki_type: str, workspace: dict) -> list[dict]:
        pages: list[dict] = []
        enabled_groups = [item for item in workspace.get("source_folders", []) if item.get("enabled")]
        for group in enabled_groups:
            recent_notes = group.get("recent_notes", [])
            recent_note_lines = "\n".join(
                f"- {WikiBuilder._collection_note_link(note)}"
                for note in recent_notes[:8]
            ) or "- 这个文件夹里暂时还没有可展示的素材"
            top_tag_line = "、".join(group.get("top_tags", [])[:8]) or "暂时还没有稳定高频标签"
            highlight_lines = "\n".join(
                f"- {line}"
                for line in group.get("highlights", [])[:6]
            ) or "- 还没有从这个文件夹里提炼出稳定线索"
            title = f"{group['label']} VKI"
            intro = (
                "只整理这个文件夹内部的素材，用来避免和其他收藏主线耦合。"
                if wiki_type == "intel"
                else "只整理这个文件夹内部的论文/笔记，方便单独回看这一条研究分支。"
            )
            content = (
                f"# {title}\n\n"
                "> 返回 [[overview|全局总览]]\n\n"
                "## 这个文件夹在看什么\n\n"
                f"- 来源文件夹：`{group['relative_path']}`\n"
                f"- 当前纳入素材：{group['note_count']} 条\n"
                f"- {intro}\n\n"
                "## 高频标签\n\n"
                f"{top_tag_line}\n\n"
                "## 这个文件夹里反复出现的线索\n\n"
                f"{highlight_lines}\n\n"
                "## 最近素材入口\n\n"
                f"{recent_note_lines}\n\n"
                "## 原始文件夹路径\n\n"
                f"- `{group['folder_path']}`\n"
            )
            pages.append({
                "slug": group["page_slug"],
                "title": title,
                "category": "collection",
                "tags": group.get("top_tags", [])[:4],
                "sources": [f"folder:{group['relative_path']}", "bootstrap:collections"],
                "content": content,
            })
        return pages

    @staticmethod
    def _append_collection_section(pages: list[dict], workspace: dict) -> None:
        overview = next((page for page in pages if page.get("slug") == "overview"), None)
        if not overview:
            return
        enabled_groups = [item for item in workspace.get("source_folders", []) if item.get("enabled")]
        if not enabled_groups:
            return
        lines = [
            f"- [[{item['page_slug']}|{item['label']} VKI]]：{item['note_count']} 条 · `{item['relative_path']}`"
            for item in enabled_groups[:12]
        ]
        section = (
            "## 分层文件夹 VKI\n\n"
            "下面这些页只整理各自文件夹内部的素材，适合单独看一条收藏/研究分支。\n\n"
            + "\n".join(lines)
        )
        content = str(overview.get("content", "")).rstrip()
        if "## 分层文件夹 VKI" not in content:
            overview["content"] = f"{content}\n\n{section}\n"

    @staticmethod
    def _sync_collection_pages(vault_path: Path, wiki_type: str) -> list[dict]:
        workspace = WikiBuilder.describe_workspace(wiki_type, vault_path)
        pages = WikiBuilder._build_collection_pages(wiki_type, workspace)
        generated_slugs = {page["slug"] for page in pages}

        for page in pages:
            WikiStore.save_page(
                vault_path=vault_path,
                wiki_type=wiki_type,
                slug=page["slug"],
                title=page["title"],
                content=page["content"],
                category=page["category"],
                tags=page.get("tags", []),
                sources=page.get("sources", []),
            )

        existing_generated = {
            page["slug"]
            for page in WikiStore.list_pages(vault_path, wiki_type)
            if page.get("category") == "collection" and str(page.get("slug", "")).startswith("collection-")
        }
        for stale_slug in sorted(existing_generated - generated_slugs):
            WikiStore.delete_page(vault_path, wiki_type, stale_slug)

        return pages

    @staticmethod
    def _fallback_bootstrap_pages(wiki_type: str, workspace: dict) -> list[dict]:
        wiki_vault = WikiBuilder.resolve_wiki_vault()
        if wiki_type == "lit" and wiki_vault:
            return WikiBuilder._build_lit_bootstrap_pages(wiki_vault, workspace)

        source_summary = workspace.get("source_summary", {})
        collections = source_summary.get("collections", [])
        top_tags = source_summary.get("top_tags", [])
        recent_sources = source_summary.get("recent_sources", [])
        reference_notes = workspace.get("reference_notes", [])
        heading = "情报库 VKI 总览" if wiki_type == "intel" else "文献库研究地图"
        bullets = "\n".join(
            f"- {item['label']}：{item['count']} 条"
            for item in collections[:5]
        ) or "- 暂无已整理来源"
        tag_line = "、".join(top_tags[:6]) if top_tags else "暂时还没有稳定高频标签"
        source_lines = "\n".join(
            f"- [{item['collection']}] {item['title']}"
            for item in recent_sources[:5]
        ) or "- 暂无近期样本"
        reference_lines = "\n".join(
            f"- {item['title']}"
            for item in reference_notes[:3]
        ) or "- 暂无可参考的旧笔记"

        if wiki_type == "intel":
            content = (
                "# 情报库 VKI 总览\n\n"
                "## 当前收藏主线\n\n"
                f"{bullets}\n\n"
                "## 高频关键词\n\n"
                f"{tag_line}\n\n"
                "## 最近样本\n\n"
                f"{source_lines}\n\n"
                "## 参考过的旧笔记\n\n"
                f"{reference_lines}\n\n"
                "## 以后怎么用\n\n"
                "- 今日情报里遇到值得留的内容，点“写入 Internet Wiki”。\n"
                "- 回到这里看总览，再决定补哪些概念页或对象页。\n"
            )
        else:
            content = (
                "# 文献库研究地图\n\n"
                "## 当前主线收藏\n\n"
                f"{bullets}\n\n"
                "## 高频关键词\n\n"
                f"{tag_line}\n\n"
                "## 最近读到的论文/笔记\n\n"
                f"{source_lines}\n\n"
                "## 可参考的旧笔记\n\n"
                f"{reference_lines}\n\n"
                "## 以后怎么用\n\n"
                "- 新搜到或新看完的论文先点“保存到文献库”。\n"
                "- 系统会继续把论文页和主题页补进这个 wiki。\n"
            )

        return [{
            "slug": "overview",
            "title": heading,
            "category": "overview",
            "tags": ["vki", "bootstrap"] if wiki_type == "intel" else ["research-map", "bootstrap"],
            "content": content,
        }]

    @staticmethod
    async def bootstrap(
        vault_path: Path,
        wiki_type: str,
    ) -> list[dict]:
        """从现有收藏和参考笔记生成一页初步总览。"""
        WikiStore.ensure_structure(vault_path, wiki_type)
        workspace = WikiBuilder.describe_workspace(wiki_type, vault_path)
        pages: list[dict] = []
        if wiki_type == "lit":
            pages = WikiBuilder._build_lit_bootstrap_pages(vault_path, workspace)
        else:
            summary = json.dumps(workspace.get("source_summary", {}), ensure_ascii=False, indent=2)
            references = json.dumps(workspace.get("reference_notes", []), ensure_ascii=False, indent=2)

            target_label = "情报库 VKI" if wiki_type == "intel" else "文献库研究地图"
            prompt = (
                f"你是一个个人知识库策展助手。请根据现有收藏，为用户生成一页适合首次使用的 {target_label} Markdown 总览。\n\n"
                "## 现有来源摘要\n"
                f"{summary}\n\n"
                "## 可参考的已有 Markdown 笔记\n"
                f"{references}\n\n"
                "## 任务\n"
                f"只输出一个 overview 页面，用于 {target_label} 的冷启动。\n"
                "页面要帮助用户一眼看懂：当前主要关注什么、下一步该补什么、以后如何傻瓜式维护。\n"
                "内容要中文、可读、不要空话，适合 Obsidian。\n\n"
                "## 返回格式（严格 JSON）\n"
                '{\n'
                '  "pages": [\n'
                '    {\n'
                '      "slug": "overview",\n'
                '      "title": "情报库 VKI 总览",\n'
                '      "category": "overview",\n'
                '      "tags": ["bootstrap"],\n'
                '      "content": "# 标题\\n\\n## 当前收藏主线\\n..."\n'
                "    }\n"
                "  ]\n"
                "}\n"
            )

            try:
                response = await agent(prompt, timeout=60)
                data = _extract_json(response)
                if isinstance(data, dict):
                    pages = [page for page in data.get("pages", []) if isinstance(page, dict)]
            except Exception:
                pages = []

        if not pages:
            pages = WikiBuilder._fallback_bootstrap_pages(wiki_type, workspace)

        collection_pages = WikiBuilder._build_collection_pages(wiki_type, workspace)
        pages.extend(collection_pages)
        WikiBuilder._append_collection_section(pages, workspace)

        expected_collection_slugs = {
            page_spec.get("slug", "")
            for page_spec in collection_pages
            if page_spec.get("slug")
        }
        for page in WikiStore.list_pages(vault_path, wiki_type, category="collection"):
            if page["slug"] not in expected_collection_slugs:
                WikiStore.delete_page(vault_path, wiki_type, page["slug"])

        saved: list[dict] = []
        max_pages = 96
        for page_spec in pages[:max_pages]:
            slug = page_spec.get("slug", "overview") or "overview"
            title = page_spec.get("title", "总览")
            category = page_spec.get("category", "overview") or "overview"
            tags = page_spec.get("tags", [])
            content = page_spec.get("content", "")
            sources = page_spec.get("sources", ["bootstrap:collections"])
            result = WikiStore.save_page(
                vault_path=vault_path,
                wiki_type=wiki_type,
                slug=slug,
                title=title,
                content=content,
                category=category,
                tags=tags,
                sources=sources,
            )
            saved.append(result)

        WikiStore.append_log(
            vault_path,
            wiki_type,
            "生成初版",
            f"写入 {len(saved)} 页",
        )
        return saved

    @staticmethod
    async def ingest_card(
        vault_path: Path,
        card_data: dict,
        wiki_type: str = "intel",
    ) -> list[dict]:
        """将 Feed 卡片完整镜像到情报 Wiki。"""
        WikiStore.ensure_structure(vault_path, wiki_type)
        source_ref = f"card:{card_data.get('id', 'unknown')}"
        title = str(card_data.get("title", "未命名情报")).strip() or "未命名情报"
        slug = _slugify(title)
        category = "collection"
        target_path = WikiStore.get_wiki_root(vault_path, wiki_type) / "collections" / f"{slug}.md"
        content = WikiBuilder._build_mirrored_wiki_content(
            payload=card_data,
            wiki_type=wiki_type,
            target_path=target_path,
        )
        tags = [str(tag).strip() for tag in card_data.get("tags", []) if str(tag).strip()]

        WikiStore.save_page(
            vault_path=vault_path,
            wiki_type=wiki_type,
            slug=slug,
            title=title,
            content=content,
            category=category,
            tags=tags,
            sources=[source_ref],
        )
        WikiStore.append_log(
            vault_path,
            wiki_type,
            "ingest 卡片",
            f"镜像保存: {title[:40]}",
        )
        WikiBuilder._sync_collection_pages(vault_path, wiki_type)
        return [{
            "slug": slug,
            "title": title,
            "action": "upsert",
            "category": category,
        }]

    @staticmethod
    async def ingest_paper(
        vault_path: Path,
        paper_data: dict,
        wiki_type: str = "lit",
    ) -> list[dict]:
        """将论文条目完整镜像到 Literature Wiki。"""
        WikiStore.ensure_structure(vault_path, wiki_type)
        source_ref = f"paper:{paper_data.get('id', 'unknown')}"
        title = str(paper_data.get("title", "未命名论文")).strip() or "未命名论文"
        slug = _slugify(title)
        category = "paper"
        target_path = WikiStore.get_wiki_root(vault_path, wiki_type) / "papers" / f"{slug}.md"
        content = WikiBuilder._build_mirrored_wiki_content(
            payload=paper_data,
            wiki_type=wiki_type,
            target_path=target_path,
        )
        tags = [str(tag).strip() for tag in paper_data.get("tags", []) if str(tag).strip()]

        WikiStore.save_page(
            vault_path=vault_path,
            wiki_type=wiki_type,
            slug=slug,
            title=title,
            content=content,
            category=category,
            tags=tags,
            sources=[source_ref],
        )
        WikiStore.append_log(
            vault_path,
            wiki_type,
            "ingest 论文",
            f"镜像保存: {title[:40]}",
        )
        WikiBuilder._sync_collection_pages(vault_path, wiki_type)
        return [{
            "slug": slug,
            "title": title,
            "category": category,
        }]

    @staticmethod
    async def ingest_text(
        vault_path: Path,
        text: str,
        wiki_type: str,
    ) -> list[dict]:
        """从自由文本摘录知识到 Wiki。"""
        WikiStore.ensure_structure(vault_path, wiki_type)

        existing_pages = WikiStore.list_pages(vault_path, wiki_type)
        existing_titles = [p["title"] for p in existing_pages]

        wiki_label = "情报库" if wiki_type == "intel" else "文献库"
        if wiki_type == "intel":
            categories_hint = "entity（公司/产品/人物）或 concept（趋势/技术/事件）"
        else:
            categories_hint = "paper（论文）或 topic（研究主题/方法/领域）"

        prompt = (
            f"你是一个 Wiki 知识库维护助手。请从以下文本中提取关键知识点，写入{wiki_label} Wiki。\n\n"
            "## 当前 Wiki 已有页面（标题列表）\n"
            f"{json.dumps(existing_titles, ensure_ascii=False)}\n\n"
            "## 文本内容\n"
            f"{text[:3000]}\n\n"
            "## 任务\n"
            f"识别关键知识点，对每个知识点生成 Wiki 页面。\n"
            f"category 只能是：{categories_hint}\n\n"
            "## 返回格式（严格 JSON）\n"
            '{\n  "pages": [\n    {\n'
            '      "slug": "slug-here",\n'
            '      "title": "页面标题",\n'
            '      "category": "entity",\n'
            '      "tags": ["tag1", "tag2"],\n'
            '      "content": "## 概述\\n\\n内容..."\n'
            "    }\n  ]\n}\n\n"
            "最多提取 5 个最重要的知识点。slug 只含小写字母、数字、连字符。\n"
        )

        try:
            response = await agent(prompt)
            data = _extract_json(response)
        except Exception as e:
            WikiStore.append_log(vault_path, wiki_type, "ingest 文本失败", str(e))
            return []

        if not data or not isinstance(data, dict):
            return []

        saved: list[dict] = []
        for page_spec in data.get("pages", []):
            try:
                slug = page_spec.get("slug", "") or _slugify(page_spec.get("title", "unknown"))
                WikiStore.save_page(
                    vault_path=vault_path,
                    wiki_type=wiki_type,
                    slug=slug,
                    title=page_spec.get("title", slug),
                    content=page_spec.get("content", ""),
                    category=page_spec.get("category", "concept"),
                    tags=page_spec.get("tags", []),
                    sources=["text:manual"],
                )
                saved.append({"slug": slug, "title": page_spec.get("title", slug)})
            except Exception as e:
                WikiStore.append_log(vault_path, wiki_type, "页面写入失败", str(e))

        WikiStore.append_log(
            vault_path, wiki_type, "ingest 文本", f"写入 {len(saved)} 页",
        )
        return saved

    @staticmethod
    async def lint(vault_path: Path, wiki_type: str) -> dict:
        """使用 Agent 检查 Wiki 健康状况。"""
        WikiStore.ensure_structure(vault_path, wiki_type)
        pages = WikiStore.list_pages(vault_path, wiki_type)

        if not pages:
            return {"status": "empty", "message": "Wiki 暂无页面", "issues": []}

        page_summaries = []
        for p in pages[:30]:
            full = WikiStore.get_page(vault_path, wiki_type, p["slug"])
            content_preview = full.get("content", "")[:200] if full else ""
            page_summaries.append({
                "slug": p["slug"],
                "title": p["title"],
                "category": p["category"],
                "tags": p["tags"],
                "preview": content_preview,
            })

        graph = WikiStore.get_graph(vault_path, wiki_type)
        linked_slugs = (
            {e["source"] for e in graph["edges"]}
            | {e["target"] for e in graph["edges"]}
        )
        orphan_slugs = list({p["slug"] for p in pages} - linked_slugs)

        prompt = (
            "你是 Wiki 知识库健康检查助手。请检查以下 Wiki 页面的质量和一致性。\n\n"
            "## Wiki 页面摘要\n"
            f"{json.dumps(page_summaries, ensure_ascii=False, indent=2)}\n\n"
            "## 孤立页面（无任何链接）\n"
            f"{json.dumps(orphan_slugs, ensure_ascii=False)}\n\n"
            "## 检查任务\n"
            "1. 找出内容过于简短的页面\n"
            "2. 找出可能存在矛盾或重复的页面对\n"
            "3. 找出孤立页面并建议添加哪些链接\n"
            "4. 给出整体健康评分（0-100）和改进建议\n\n"
            "## 返回格式（严格 JSON）\n"
            '{\n'
            '  "health_score": 75,\n'
            '  "summary": "整体评价...",\n'
            '  "issues": [\n'
            '    {"type": "orphan", "slug": "some-page", "title": "页面标题", "description": "建议..."}\n'
            '  ],\n'
            '  "suggestions": ["建议1", "建议2"]\n'
            "}\n"
        )

        try:
            response = await agent(prompt)
            data = _extract_json(response)
        except Exception as e:
            return {"status": "error", "message": f"Agent 调用失败: {e}", "issues": []}

        if not data or not isinstance(data, dict):
            return {"status": "error", "message": "Agent 返回格式无法解析", "issues": []}

        WikiStore.append_log(
            vault_path, wiki_type, "健康检查",
            f"评分: {data.get('health_score', '?')} 分，发现 {len(data.get('issues', []))} 个问题",
        )
        return {"status": "ok", **data}
