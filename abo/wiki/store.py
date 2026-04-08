"""
Wiki 知识库存储层 — 读写 Obsidian Vault 中的 Markdown Wiki 页面。
维护 index.md、log.md，解析 [[wikilinks]] 构建反向链接图。
"""
import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import frontmatter


# ── 常量 ──────────────────────────────────────────────────────────

_WIKI_DIRS: dict[str, str] = {
    "intel": "Intel",
    "lit": "Lit",
}

_CATEGORY_DIRS: dict[str, dict[str, str]] = {
    "intel": {
        "entity": "entities",
        "concept": "concepts",
    },
    "lit": {
        "paper": "papers",
        "topic": "topics",
    },
}

_WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")


def _wiki_root(vault_path: Path, wiki_type: str) -> Path:
    return vault_path / "Wiki" / _WIKI_DIRS[wiki_type]


def _category_dir(vault_path: Path, wiki_type: str, category: str) -> Path:
    subdir = _CATEGORY_DIRS[wiki_type].get(category, category)
    return _wiki_root(vault_path, wiki_type) / subdir


def _page_path(vault_path: Path, wiki_type: str, slug: str) -> Optional[Path]:
    """通过 slug 找到对应的 .md 文件（遍历所有 category 子目录）。"""
    root = _wiki_root(vault_path, wiki_type)
    for cat_dir in _CATEGORY_DIRS[wiki_type].values():
        p = root / cat_dir / f"{slug}.md"
        if p.exists():
            return p
    # 也检查根目录（overview.md 等特殊页面）
    p = root / f"{slug}.md"
    if p.exists():
        return p
    return None


def _atomic_write(path: Path, text: str) -> None:
    """原子写入：先写 .tmp 再 os.replace。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


class WikiStore:
    """Wiki 知识库存储层，无状态静态方法集合。"""

    # ── 初始化结构 ─────────────────────────────────────────────────

    @staticmethod
    def ensure_structure(vault_path: Path, wiki_type: str) -> None:
        """创建 Wiki 目录骨架：子目录 + index.md + log.md。"""
        root = _wiki_root(vault_path, wiki_type)
        root.mkdir(parents=True, exist_ok=True)

        for subdir in _CATEGORY_DIRS[wiki_type].values():
            (root / subdir).mkdir(exist_ok=True)

        index_path = root / "index.md"
        if not index_path.exists():
            wiki_label = "情报库" if wiki_type == "intel" else "文献库"
            _atomic_write(
                index_path,
                f"---\nabo_type: wiki\nwiki: {wiki_type}\ncategory: overview\n"
                f"title: \"{wiki_label} Wiki 目录\"\n"
                f"created: {date.today().isoformat()}\n"
                f"updated: {date.today().isoformat()}\n"
                f"tags: []\nsources: []\n---\n\n"
                f"# {wiki_label} Wiki 目录\n\n"
                f"暂无页面，从摘录开始构建你的知识库。\n",
            )

        log_path = root / "log.md"
        if not log_path.exists():
            _atomic_write(
                log_path,
                "# Wiki 操作日志\n\n| 时间 | 操作 | 详情 |\n|------|------|------|\n",
            )

    # ── 列举页面 ───────────────────────────────────────────────────

    @staticmethod
    def list_pages(
        vault_path: Path,
        wiki_type: str,
        category: Optional[str] = None,
    ) -> list[dict]:
        """列出所有 wiki 页面（带 frontmatter 元数据），可按 category 过滤。"""
        root = _wiki_root(vault_path, wiki_type)
        if not root.exists():
            return []

        search_dirs: list[Path] = []
        if category:
            subdir = _CATEGORY_DIRS[wiki_type].get(category, category)
            d = root / subdir
            if d.exists():
                search_dirs.append(d)
        else:
            for subdir in _CATEGORY_DIRS[wiki_type].values():
                d = root / subdir
                if d.exists():
                    search_dirs.append(d)

        pages: list[dict] = []
        for d in search_dirs:
            for md_file in sorted(d.glob("*.md")):
                try:
                    post = frontmatter.load(str(md_file))
                    slug = md_file.stem
                    pages.append({
                        "slug": slug,
                        "title": post.metadata.get("title", slug),
                        "category": post.metadata.get("category", ""),
                        "wiki": wiki_type,
                        "tags": post.metadata.get("tags", []),
                        "sources": post.metadata.get("sources", []),
                        "created": str(post.metadata.get("created", "")),
                        "updated": str(post.metadata.get("updated", "")),
                        "summary": post.content[:120].strip() if post.content else "",
                    })
                except Exception:
                    continue
        return pages

    # ── 读取单页 ───────────────────────────────────────────────────

    @staticmethod
    def get_page(vault_path: Path, wiki_type: str, slug: str) -> Optional[dict]:
        """读取单个页面的内容和元数据，返回 None 表示不存在。"""
        path = _page_path(vault_path, wiki_type, slug)
        if path is None:
            return None
        try:
            post = frontmatter.load(str(path))
            return {
                "slug": slug,
                "title": post.metadata.get("title", slug),
                "category": post.metadata.get("category", ""),
                "wiki": wiki_type,
                "content": post.content,
                "tags": post.metadata.get("tags", []),
                "sources": post.metadata.get("sources", []),
                "backlinks": post.metadata.get("backlinks", []),
                "created": str(post.metadata.get("created", "")),
                "updated": str(post.metadata.get("updated", "")),
            }
        except Exception:
            return None

    # ── 保存页面 ───────────────────────────────────────────────────

    @staticmethod
    def save_page(
        vault_path: Path,
        wiki_type: str,
        slug: str,
        title: str,
        content: str,
        category: str,
        tags: list[str],
        sources: list[str],
    ) -> dict:
        """创建或更新 Wiki 页面，写入 frontmatter，更新 index.md。"""
        subdir = _CATEGORY_DIRS[wiki_type].get(category, category)
        cat_dir = _wiki_root(vault_path, wiki_type) / subdir
        cat_dir.mkdir(parents=True, exist_ok=True)
        path = cat_dir / f"{slug}.md"

        now = date.today().isoformat()
        created = now
        existing_backlinks: list[str] = []

        if path.exists():
            try:
                old = frontmatter.load(str(path))
                created = str(old.metadata.get("created", now))
                existing_backlinks = old.metadata.get("backlinks", [])
            except Exception:
                pass

        metadata = {
            "abo_type": "wiki",
            "wiki": wiki_type,
            "category": category,
            "title": title,
            "created": created,
            "updated": now,
            "tags": tags,
            "sources": sources,
            "backlinks": existing_backlinks,
        }
        post = frontmatter.Post(content, **metadata)
        _atomic_write(path, frontmatter.dumps(post))

        WikiStore.rebuild_index(vault_path, wiki_type)
        WikiStore.append_log(
            vault_path, wiki_type,
            "保存页面",
            f"[[{subdir}/{slug}]] — {title}",
        )

        return {
            "slug": slug,
            "title": title,
            "category": category,
            "wiki": wiki_type,
            "tags": tags,
            "sources": sources,
            "created": created,
            "updated": now,
        }

    # ── 删除页面 ───────────────────────────────────────────────────

    @staticmethod
    def delete_page(vault_path: Path, wiki_type: str, slug: str) -> bool:
        """删除页面，更新 index.md，返回是否成功删除。"""
        path = _page_path(vault_path, wiki_type, slug)
        if path is None:
            return False
        try:
            path.unlink()
            WikiStore.rebuild_index(vault_path, wiki_type)
            WikiStore.append_log(vault_path, wiki_type, "删除页面", slug)
            return True
        except Exception:
            return False

    # ── 搜索 ──────────────────────────────────────────────────────

    @staticmethod
    def search_pages(
        vault_path: Path,
        wiki_type: str,
        query: str,
    ) -> list[dict]:
        """全文搜索 + frontmatter tags 搜索，返回匹配页面列表。"""
        if not query:
            return WikiStore.list_pages(vault_path, wiki_type)

        query_lower = query.lower()
        results: list[dict] = []
        for page in WikiStore.list_pages(vault_path, wiki_type):
            if query_lower in page["title"].lower():
                results.append(page)
                continue
            if any(query_lower in t.lower() for t in page.get("tags", [])):
                results.append(page)
                continue
            full = WikiStore.get_page(vault_path, wiki_type, page["slug"])
            if full and query_lower in full.get("content", "").lower():
                results.append(page)
        return results

    # ── 脑图数据 ──────────────────────────────────────────────────

    @staticmethod
    def get_graph(vault_path: Path, wiki_type: str) -> dict:
        """解析所有页面的 [[wikilinks]]，构建 nodes/edges 图数据。"""
        pages = WikiStore.list_pages(vault_path, wiki_type)
        slug_set = {p["slug"] for p in pages}

        nodes: list[dict] = []
        edges: list[dict] = []
        seen_edges: set[tuple[str, str]] = set()

        for page in pages:
            full = WikiStore.get_page(vault_path, wiki_type, page["slug"])
            content = full.get("content", "") if full else ""
            links = _WIKILINK_RE.findall(content)
            link_count = len(links)

            nodes.append({
                "id": page["slug"],
                "label": page["title"],
                "category": page["category"],
                "size": max(10, min(40, 10 + link_count * 3)),
            })

            for raw_link in links:
                target_raw = raw_link.split("|")[0].strip()
                target_slug = target_raw.split("/")[-1].strip()
                if not target_slug:
                    continue
                if target_slug in slug_set and target_slug != page["slug"]:
                    edge_key = (page["slug"], target_slug)
                    if edge_key not in seen_edges:
                        seen_edges.add(edge_key)
                        edges.append({
                            "source": page["slug"],
                            "target": target_slug,
                        })

        return {"nodes": nodes, "edges": edges}

    # ── 反向链接 ──────────────────────────────────────────────────

    @staticmethod
    def get_backlinks(vault_path: Path, wiki_type: str, slug: str) -> list[dict]:
        """找出所有通过 [[wikilink]] 链接到 slug 页面的其他页面。"""
        backlinks: list[dict] = []
        for page in WikiStore.list_pages(vault_path, wiki_type):
            if page["slug"] == slug:
                continue
            full = WikiStore.get_page(vault_path, wiki_type, page["slug"])
            if not full:
                continue
            content = full.get("content", "")
            for raw_link in _WIKILINK_RE.findall(content):
                target_raw = raw_link.split("|")[0].strip()
                target_slug = target_raw.split("/")[-1].strip()
                if target_slug == slug:
                    backlinks.append({
                        "slug": page["slug"],
                        "title": page["title"],
                        "category": page["category"],
                    })
                    break
        return backlinks

    # ── 操作日志 ──────────────────────────────────────────────────

    @staticmethod
    def append_log(
        vault_path: Path,
        wiki_type: str,
        action: str,
        detail: str,
    ) -> None:
        """向 log.md 追加一行操作记录。"""
        root = _wiki_root(vault_path, wiki_type)
        log_path = root / "log.md"
        if not log_path.exists():
            WikiStore.ensure_structure(vault_path, wiki_type)
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        line = f"| {now} | {action} | {detail} |\n"
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            pass

    # ── 重建索引 ──────────────────────────────────────────────────

    @staticmethod
    def rebuild_index(vault_path: Path, wiki_type: str) -> None:
        """从所有页面重建 index.md，按 category 分组。"""
        root = _wiki_root(vault_path, wiki_type)
        if not root.exists():
            return

        wiki_label = "情报库" if wiki_type == "intel" else "文献库"
        category_labels: dict[str, str] = {
            "entity": "实体",
            "concept": "概念",
            "paper": "论文",
            "topic": "主题",
        }

        by_category: dict[str, list[dict]] = {k: [] for k in _CATEGORY_DIRS[wiki_type]}
        for page in WikiStore.list_pages(vault_path, wiki_type):
            cat = page.get("category", "")
            if cat in by_category:
                by_category[cat].append(page)

        total = sum(len(v) for v in by_category.values())
        lines: list[str] = [
            "---",
            "abo_type: wiki",
            f"wiki: {wiki_type}",
            "category: overview",
            f'title: "{wiki_label} Wiki 目录"',
            f"created: {date.today().isoformat()}",
            f"updated: {date.today().isoformat()}",
            "tags: []",
            "sources: []",
            "---",
            "",
            f"# {wiki_label} Wiki 目录",
            "",
            f"> 共 **{total}** 个页面，最后更新：{datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "",
        ]

        for cat_key, cat_pages in by_category.items():
            label = category_labels.get(cat_key, cat_key)
            subdir = _CATEGORY_DIRS[wiki_type][cat_key]
            lines.append(f"## {label}（{len(cat_pages)}）")
            lines.append("")
            if cat_pages:
                for p in sorted(cat_pages, key=lambda x: x["title"]):
                    tags_str = " ".join(f"`{t}`" for t in p.get("tags", [])[:3])
                    summary = p.get("summary", "")[:60]
                    lines.append(f"- [[{subdir}/{p['slug']}|{p['title']}]] {tags_str}")
                    if summary:
                        lines.append(f"  {summary}")
            else:
                lines.append("暂无页面")
            lines.append("")

        index_path = root / "index.md"
        _atomic_write(index_path, "\n".join(lines))

    # ── 统计信息 ──────────────────────────────────────────────────

    @staticmethod
    def get_stats(vault_path: Path, wiki_type: str) -> dict:
        """统计各 category 的页面数量。"""
        stats: dict[str, int] = {}
        total = 0
        for cat_key in _CATEGORY_DIRS[wiki_type]:
            count = len(WikiStore.list_pages(vault_path, wiki_type, category=cat_key))
            stats[cat_key] = count
            total += count
        return {"total": total, "by_category": stats, "wiki_type": wiki_type}

    # ── 读取 index 内容 ────────────────────────────────────────────

    @staticmethod
    def get_index(vault_path: Path, wiki_type: str) -> str:
        """读取 index.md 正文内容。"""
        root = _wiki_root(vault_path, wiki_type)
        index_path = root / "index.md"
        if not index_path.exists():
            WikiStore.ensure_structure(vault_path, wiki_type)
        if index_path.exists():
            try:
                post = frontmatter.load(str(index_path))
                return post.content
            except Exception:
                return index_path.read_text(encoding="utf-8")
        return ""
