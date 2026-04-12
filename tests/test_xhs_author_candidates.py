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
