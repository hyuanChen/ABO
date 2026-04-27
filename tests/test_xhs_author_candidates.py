from pathlib import Path

import pytest

from abo.tools.xhs_crawler import analyze_saved_xhs_authors


pytestmark = pytest.mark.anyio


async def test_analyze_saved_xhs_authors_from_markdown(tmp_path: Path):
    xhs_dir = tmp_path / "xhs"
    xhs_dir.mkdir(parents=True)

    (xhs_dir / "2026-04-10 note-a.md").write_text(
        "\n".join(
            [
                "# 第一条",
                "",
                "> [!info]- 笔记属性",
                "> - **来源**: 小红书 · 博主A",
                "> - **作者ID**: user-a",
                "> - **链接**: https://www.xiaohongshu.com/explore/note-a",
                "> - **日期**: 2026-04-10",
                "> - **互动**: 1200赞 / 300收藏 / 20评论 / 3分享",
            ]
        ),
        encoding="utf-8",
    )
    (xhs_dir / "2026-04-11 note-b.md").write_text(
        "\n".join(
            [
                "# 第二条",
                "",
                "> [!info]- 笔记属性",
                "> - **来源**: 小红书 · 博主A",
                "> - **作者ID**: user-a",
                "> - **链接**: https://www.xiaohongshu.com/explore/note-b",
                "> - **日期**: 2026-04-11",
                "> - **互动**: 800赞 / 220收藏 / 12评论 / 1分享",
            ]
        ),
        encoding="utf-8",
    )
    (xhs_dir / "2026-04-09 note-c.md").write_text(
        "\n".join(
            [
                "# 第三条",
                "",
                "> [!info]- 笔记属性",
                "> - **来源**: 小红书 · 博主B",
                "> - **作者ID**: 未知",
                "> - **链接**: https://www.xiaohongshu.com/explore/note-c",
                "> - **日期**: 2026-04-09",
                "> - **互动**: 300赞 / 80收藏 / 5评论 / 0分享",
            ]
        ),
        encoding="utf-8",
    )

    result = await analyze_saved_xhs_authors(vault_path=tmp_path, cookie=None, resolve_author_ids=False)

    assert result["success"] is True
    assert result["total_notes"] == 3
    assert len(result["candidates"]) == 2

    first = result["candidates"][0]
    assert first["author"] == "博主A"
    assert first["author_id"] == "user-a"
    assert first["note_count"] == 2
    assert first["latest_title"] == "第二条"


async def test_analyze_saved_xhs_authors_from_unified_frontmatter(tmp_path: Path):
    xhs_dir = tmp_path / "xhs"
    xhs_dir.mkdir(parents=True)

    (xhs_dir / "2026-04-12 note-d.md").write_text(
        "\n".join(
            [
                "---",
                "abo-schema: abo.unified-entry/v1",
                "entry-id: note-d",
                "entry-type: social-note",
                'title: "第四条"',
                "source-platform: xiaohongshu",
                "source-url: https://www.xiaohongshu.com/explore/note-d",
                'author: "博主C"',
                "author-id: user-c",
                "published: 2026-04-12T08:00:00",
                "tags:",
                "  - AI",
                "likes: 500",
                "collects: 120",
                "comments-count: 8",
                "---",
                "",
                "# 第四条",
                "",
                "统一 frontmatter 样本。",
            ]
        ),
        encoding="utf-8",
    )

    result = await analyze_saved_xhs_authors(vault_path=tmp_path, cookie=None, resolve_author_ids=False)

    assert result["success"] is True
    assert result["total_notes"] == 1
    assert result["candidates"][0]["author"] == "博主C"
    assert result["candidates"][0]["author_id"] == "user-c"
    assert result["candidates"][0]["note_count"] == 1


async def test_analyze_saved_xhs_authors_splits_tags_and_extracts_content_signals(tmp_path: Path):
    xhs_dir = tmp_path / "xhs"
    xhs_dir.mkdir(parents=True)

    (xhs_dir / "2026-04-13 note-e.md").write_text(
        "\n".join(
            [
                "# 和claude 深度聊完",
                "",
                "> [!tip]- 详情",
                "> 原帖标题：和claude 深度聊完",
                ">",
                "> 经常想把生成的文档自动写进知识库。",
                ">",
                "> [!info]- 笔记属性",
                "> - **来源**: 小红书 · 博主D",
                "> - **链接**: https://www.xiaohongshu.com/explore/note-e",
                "> - **日期**: 2026-04-13",
                "> - **互动**: 200赞 / 80收藏 / 5评论 / 1分享",
                "> - **收藏专辑**: sth useful",
                "> - **标签**: AI, 大模型, vibecoding, 知识库",
            ]
        ),
        encoding="utf-8",
    )

    result = await analyze_saved_xhs_authors(vault_path=tmp_path, cookie=None, resolve_author_ids=False)

    candidate = result["candidates"][0]
    assert candidate["sample_tags"] == ["AI", "大模型", "vibecoding", "知识库"]
    assert "claude" in [item.lower() for item in candidate["content_signals"]]


async def test_analyze_saved_xhs_authors_reads_album_directory(tmp_path: Path):
    album_dir = tmp_path / "专辑" / "知识管理"
    album_dir.mkdir(parents=True)

    (album_dir / "2026-04-14 note-f.md").write_text(
        "\n".join(
            [
                "# 第五条",
                "",
                "> [!info]- 笔记属性",
                "> - **来源**: 小红书 · 博主E",
                "> - **作者ID**: user-e",
                "> - **链接**: https://www.xiaohongshu.com/explore/note-f",
                "> - **日期**: 2026-04-14",
                "> - **互动**: 260赞 / 90收藏 / 7评论 / 1分享",
            ]
        ),
        encoding="utf-8",
    )

    result = await analyze_saved_xhs_authors(vault_path=tmp_path, cookie=None, resolve_author_ids=False)

    assert result["success"] is True
    assert result["total_notes"] == 1
    assert str(tmp_path / "专辑") in result["source_dirs"]
    assert result["candidates"][0]["author"] == "博主E"
    assert result["candidates"][0]["sample_albums"] == ["知识管理"]
