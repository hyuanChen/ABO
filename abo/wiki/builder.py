"""
Wiki 摘录构建器 — 使用 Agent CLI 将源材料提炼到 Wiki 知识库。
"""
import json
import re
from pathlib import Path
from typing import Optional, Union

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


class WikiBuilder:
    """使用 Agent CLI 将源材料摘录到 Wiki 知识库。"""

    @staticmethod
    async def ingest_card(
        vault_path: Path,
        card_data: dict,
        wiki_type: str = "intel",
    ) -> list[dict]:
        """从 Feed 卡片提取实体/概念，创建或更新 Wiki 页面。"""
        WikiStore.ensure_structure(vault_path, wiki_type)

        existing_pages = WikiStore.list_pages(vault_path, wiki_type)
        existing_titles = [p["title"] for p in existing_pages]

        card_text = (
            f"标题：{card_data.get('title', '')}\n"
            f"摘要：{card_data.get('summary', '')}\n"
            f"标签：{', '.join(card_data.get('tags', []))}\n"
            f"来源：{card_data.get('source_url', '')}"
        )
        source_ref = f"card:{card_data.get('id', 'unknown')}"

        prompt = (
            "你是一个 Wiki 知识库维护助手。请从以下情报卡片中提取关键实体和概念，"
            "生成或更新 Wiki 页面。\n\n"
            "## 当前 Wiki 已有页面（标题列表）\n"
            f"{json.dumps(existing_titles, ensure_ascii=False)}\n\n"
            "## 情报卡片内容\n"
            f"{card_text}\n\n"
            "## 任务\n"
            "1. 识别卡片中的关键实体（公司、产品、人物 → category: entity）"
            "和概念（趋势、技术、事件 → category: concept）\n"
            "2. 对每个实体/概念，生成或更新一个 Wiki 页面\n"
            "3. 页面内容使用 Markdown，适当使用 [[wikilinks]] 引用其他相关页面\n"
            "4. 如果实体/概念已在已有页面列表中，请补充更新内容，否则创建新页面\n\n"
            "## 返回格式（严格 JSON，不要有任何额外文字）\n"
            '{\n  "pages": [\n    {\n'
            '      "slug": "openai",\n'
            '      "title": "OpenAI",\n'
            '      "category": "entity",\n'
            '      "tags": ["AI", "公司"],\n'
            '      "content": "## 概述\\n\\nOpenAI 是...\\n\\n## 最新动态\\n\\n- ...",\n'
            '      "action": "create"\n'
            "    }\n  ]\n}\n\n"
            "注意：\n"
            "- slug 只含小写字母、数字、连字符\n"
            "- category 必须是 entity 或 concept（intel wiki）\n"
            "- content 使用中文，适当引用 [[其他页面]]\n"
            "- 最多提取 3 个最重要的实体/概念\n"
        )

        try:
            response = await agent(prompt)
            data = _extract_json(response)
        except Exception as e:
            WikiStore.append_log(
                vault_path, wiki_type, "ingest 失败", f"Agent 调用异常: {e}"
            )
            return []

        if not data or not isinstance(data, dict):
            WikiStore.append_log(
                vault_path, wiki_type, "ingest 失败", "Agent 返回格式无法解析"
            )
            return []

        saved: list[dict] = []
        for page_spec in data.get("pages", []):
            try:
                slug = page_spec.get("slug", "") or _slugify(page_spec.get("title", "unknown"))
                title = page_spec.get("title", slug)
                category = page_spec.get("category", "entity")
                tags = page_spec.get("tags", [])
                content = page_spec.get("content", "")

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
                saved.append({
                    "slug": slug,
                    "title": title,
                    "action": page_spec.get("action", "upsert"),
                })
            except Exception as e:
                WikiStore.append_log(vault_path, wiki_type, "页面写入失败", str(e))

        WikiStore.append_log(
            vault_path, wiki_type,
            "ingest 卡片",
            f"来源: {card_data.get('title', '')[:40]} → 写入 {len(saved)} 页",
        )
        return saved

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
