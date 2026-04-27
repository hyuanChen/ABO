import asyncio

from abo.wiki.builder import WikiBuilder
from abo.wiki.store import WikiStore


def _write_note(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_lit_bootstrap_builds_multi_page_knowledge_map(tmp_path, monkeypatch):
    (tmp_path / ".obsidian").mkdir()

    _write_note(
        tmp_path / "FollowUps" / "World Action Models are Zero-shot Policies" / "World Action Models are Zero-shot Policies.md",
        "# World Action Models are Zero-shot Policies\n\n主线论文。\n",
    )
    _write_note(
        tmp_path / "FollowUps" / "World Action Models are Zero-shot Policies" / "DreamZero" / "DreamZero.md",
        "---\ntags:\n- follow-up\n- robotics\n---\n# DreamZero\n\n## 核心问题\n\n让 video world model 真正做控制。\n",
    )
    _write_note(
        tmp_path / "robot" / "VLA&WM" / "_organized_summary.md",
        "# VLA&WM — Research Notes Summary\n\n## VLA 核心问题\n\n## 长期方向\n",
    )
    _write_note(
        tmp_path / "robot" / "Feature4policy" / "_organized_summary.md",
        "# Robotics — Research Notes Summary\n\n## 视觉表征\n\n## 3D 表示\n",
    )
    _write_note(
        tmp_path / "其他过去分组" / "1toRead" / "FastVGGT.md",
        "# FastVGGT\n\n## 值得思考的问题\n- token 压缩后会不会损伤几何细节\n",
    )
    _write_note(
        tmp_path / "talks" / "mentor.md",
        "# mentor\n\n方向要能验证，先做一个肯定能 work 的实验。\n",
    )
    _write_note(
        tmp_path / "其他过去分组" / "组会素材" / "week-11.md",
        "---\ntags: [组会]\n---\n# 第11周组会素材\n\n## 讨论话题\n1.\n2.\n\n## 任务分配\n- [ ]\n\n---\nCreated: 2026-03-12\n",
    )
    _write_note(
        tmp_path / "---Idea book---" / "motion.md",
        "# motion\n\n这些细节是你自己需要思考的问题，先验证 pipeline 能 work。\n",
    )

    monkeypatch.setattr(WikiBuilder, "resolve_wiki_vault", staticmethod(lambda: tmp_path))
    monkeypatch.setattr(WikiBuilder, "resolve_literature_source_root", staticmethod(lambda: tmp_path))

    pages = asyncio.run(WikiBuilder.bootstrap(tmp_path, "lit"))

    assert len(pages) >= 8
    saved_pages = WikiStore.list_pages(tmp_path, "lit")
    saved_slugs = {page["slug"] for page in saved_pages}
    assert {
        "overview",
        "research-mainlines",
        "followup-trails",
        "archive-details",
        "mentor-guidance",
        "collection-robot-vlawm",
        "collection-robot-feature4policy",
    }.issubset(saved_slugs)

    overview = (tmp_path / "Wiki" / "Literature" / "overview.md").read_text(encoding="utf-8")
    assert "[[research-mainlines|研究主线]]" in overview
    assert "obsidian://open?vault=" in overview
    assert "## 分层文件夹 VKI" in overview
    assert "[[collection-robot-vlawm|robot / VLA&WM VKI]]" in overview

    guidance = (tmp_path / "Wiki" / "Literature" / "topics" / "mentor-guidance.md").read_text(encoding="utf-8")
    assert "先验证 pipeline 能 work" in guidance or "先做一个肯定能 work 的实验" in guidance
    assert "Created:" not in guidance
    assert "\n- --" not in guidance


def test_ingest_card_mirrors_full_source_note(tmp_path, monkeypatch):
    (tmp_path / ".obsidian").mkdir()

    _write_note(
        tmp_path / "xhs" / "ai-workflow.md",
        "# AI Workflow\n\n## 观察\n\n这里是完整的情报条目内容，不应该只剩摘要。\n",
    )

    monkeypatch.setattr(WikiBuilder, "resolve_wiki_vault", staticmethod(lambda: tmp_path))
    monkeypatch.setattr(WikiBuilder, "resolve_intel_source_root", staticmethod(lambda: tmp_path))

    saved = asyncio.run(WikiBuilder.ingest_card(
        tmp_path,
        {
            "id": "xhs-note-1",
            "title": "AI Workflow",
            "summary": "摘要版本",
            "tags": ["workflow"],
            "source_url": "https://example.com/ai-workflow",
            "obsidian_path": "xhs/ai-workflow.md",
        },
        "intel",
    ))

    assert saved == [{
        "slug": "ai-workflow",
        "title": "AI Workflow",
        "action": "upsert",
        "category": "collection",
    }]

    mirrored = (tmp_path / "Wiki" / "Internet" / "collections" / "ai-workflow.md").read_text(encoding="utf-8")
    assert "# AI Workflow" in mirrored
    assert "这里是完整的情报条目内容" in mirrored
    assert "摘要版本" not in mirrored

    folder_page = (tmp_path / "Wiki" / "Internet" / "collections" / "collection-xhs.md").read_text(encoding="utf-8")
    assert "来源文件夹：`xhs`" in folder_page
    assert "[AI Workflow](obsidian://open?" in folder_page


def test_scan_intel_sources_and_labels_album_directory(tmp_path, monkeypatch):
    (tmp_path / ".obsidian").mkdir()
    _write_note(
        tmp_path / "专辑" / "知识管理" / "album-note.md",
        "# Album Note\n\n这是一条来自专辑目录的小红书笔记。\n",
    )

    monkeypatch.setattr(WikiBuilder, "resolve_intel_source_root", staticmethod(lambda: tmp_path))

    scanned = WikiBuilder._scan_intel_source_files(limit=20)

    assert tmp_path / "专辑" / "知识管理" / "album-note.md" in scanned
    assert WikiBuilder._collection_label(tmp_path / "专辑" / "知识管理" / "album-note.md", "intel") == "小红书 / 知识管理"


def test_ingest_card_fallback_keeps_full_metadata_when_source_note_missing(tmp_path, monkeypatch):
    (tmp_path / ".obsidian").mkdir()

    monkeypatch.setattr(WikiBuilder, "resolve_wiki_vault", staticmethod(lambda: tmp_path))
    monkeypatch.setattr(WikiBuilder, "resolve_intel_source_root", staticmethod(lambda: tmp_path))

    saved = asyncio.run(WikiBuilder.ingest_card(
        tmp_path,
        {
            "id": "bili-note-1",
            "title": "B站知识管理动态",
            "summary": "这是一段简短摘要",
            "tags": ["知识管理", "科研"],
            "source_url": "https://www.bilibili.com/opus/112233",
            "obsidian_path": "bilibili/dynamic/每日关键词监控/知识管理监控/2026-04-27 动态 B站知识管理动态.md",
            "metadata": {
                "up_name": "测试UP",
                "published": "2026-04-27T08:30:00+08:00",
                "monitor_label": "知识管理监控",
                "description": "这里是完整正文，不应该在 source note 丢失时退化成只剩摘要。",
                "matched_keywords": ["科研", "知识管理"],
                "matched_tags": ["Obsidian"],
                "images": ["https://img.example.com/1.jpg"],
            },
        },
        "intel",
    ))

    assert saved[0]["title"] == "B站知识管理动态"
    assert saved[0]["action"] == "upsert"
    assert saved[0]["category"] == "collection"

    mirrored = (tmp_path / "Wiki" / "Internet" / "collections" / f"{saved[0]['slug']}.md").read_text(encoding="utf-8")
    assert "## AI 摘要" in mirrored
    assert "## 正文摘录" in mirrored
    assert "测试UP / 2026-04-27T08:30:00+08:00 / 知识管理监控" in mirrored
    assert "这里是完整正文，不应该在 source note 丢失时退化成只剩摘要。" in mirrored
    assert "## 命中关键词" in mirrored
    assert "## 命中标签" in mirrored
    assert "## 图片" in mirrored


def test_ingest_paper_mirrors_source_note_and_rewrites_relative_links(tmp_path, monkeypatch):
    (tmp_path / ".obsidian").mkdir()

    _write_note(
        tmp_path / "Literature" / "FollowUps" / "VGGT" / "DreamZero" / "DreamZero.md",
        "# DreamZero\n\n[下载PDF](paper.pdf)\n\n![Pipeline](figures/figure_1.png)\n\n## 摘要\n\n完整论文内容。\n",
    )

    monkeypatch.setattr(WikiBuilder, "resolve_wiki_vault", staticmethod(lambda: tmp_path))
    monkeypatch.setattr(WikiBuilder, "resolve_literature_source_root", staticmethod(lambda: tmp_path / "Literature"))

    saved = asyncio.run(WikiBuilder.ingest_paper(
        tmp_path,
        {
            "id": "followup-monitor:dreamzero",
            "title": "DreamZero",
            "summary": "简写摘要",
            "tags": ["robotics", "follow-up"],
            "source_url": "https://arxiv.org/abs/2604.00001",
            "obsidian_path": "FollowUps/VGGT/DreamZero/DreamZero.md",
            "literature_path": "FollowUps/VGGT/DreamZero/DreamZero.md",
            "metadata": {
                "paper_tracking_type": "followup",
                "source_paper_title": "VGGT",
            },
        },
        "lit",
    ))

    assert saved == [{
        "slug": "dreamzero",
        "title": "DreamZero",
        "category": "paper",
    }]

    mirrored = (tmp_path / "Wiki" / "Literature" / "papers" / "dreamzero.md").read_text(encoding="utf-8")
    assert "# DreamZero" in mirrored
    assert "完整论文内容" in mirrored
    assert "[下载PDF](../../../Literature/FollowUps/VGGT/DreamZero/paper.pdf)" in mirrored
    assert "![Pipeline](../../../Literature/FollowUps/VGGT/DreamZero/figures/figure_1.png)" in mirrored

    folder_page = (tmp_path / "Wiki" / "Literature" / "collections" / "collection-followups-vggt.md").read_text(encoding="utf-8")
    assert "来源文件夹：`FollowUps/VGGT`" in folder_page
    assert "[DreamZero](obsidian://open?" in folder_page


def test_describe_workspace_respects_disabled_source_folders(tmp_path, monkeypatch):
    (tmp_path / ".obsidian").mkdir()
    _write_note(
        tmp_path / "robot" / "VLA&WM" / "_organized_summary.md",
        "# VLA&WM — Research Notes Summary\n\n## VLA 核心问题\n",
    )
    _write_note(
        tmp_path / "talks" / "mentor.md",
        "# mentor\n\n方向要能验证，先做一个肯定能 work 的实验。\n",
    )

    WikiStore.ensure_structure(tmp_path, "lit")
    WikiStore.save_source_config(tmp_path, "lit", {"robot/VLA&WM": False, "talks": True})

    monkeypatch.setattr(WikiBuilder, "resolve_wiki_vault", staticmethod(lambda: tmp_path))
    monkeypatch.setattr(WikiBuilder, "resolve_literature_source_root", staticmethod(lambda: tmp_path))

    workspace = WikiBuilder.describe_workspace("lit", tmp_path)

    folder_map = {item["id"]: item for item in workspace["source_folders"]}
    assert folder_map["robot/VLA&WM"]["enabled"] is False
    assert folder_map["talks"]["enabled"] is True
    assert all(item["label"] != "robot / VLA&WM" for item in workspace["source_summary"]["collections"])
    assert any(item["label"] == "talks" for item in workspace["source_summary"]["collections"])
