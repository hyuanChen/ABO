from pathlib import Path

import pytest

from abo.tools.bilibili_crawler import (
    analyze_saved_bilibili_favorites,
    backfill_saved_bilibili_favorite_author_ids,
    build_saved_bilibili_favorite_up_pool,
)


pytestmark = pytest.mark.anyio


def _write_favorite(
    path: Path,
    *,
    title: str,
    folder: str,
    author: str,
    tags: str,
    date: str,
    bvid: str = "BV1demo",
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(
            [
                f"# {title}",
                "",
                "> [!tip]- 详情",
                f"> 原视频标题：{title}",
                ">",
                "> 简介",
                ">",
                "> [!info]- 笔记属性",
                f"> - **来源**: Bilibili 收藏夹 · {folder}",
                f"> - **UP主**: {author}",
                f"> - **BV号**: {bvid}",
                f"> - **链接**: https://www.bilibili.com/video/{bvid}",
                f"> - **收藏时间**: {date} 08:00:00",
                f"> - **标签**: {tags}",
                "> - **互动**: 10收藏 / 100播放 / 5弹幕",
            ]
        ),
        encoding="utf-8",
    )


def _write_unified_favorite(path: Path, *, title: str, folder: str, author: str, date: str, author_id: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "---",
        "abo-schema: abo.unified-entry/v1",
        "entry-id: fav-frontmatter",
        "entry-type: social-favorite",
        f'title: "{title}"',
        "source-platform: bilibili",
        "source-url: https://www.bilibili.com/video/BV1demo",
        f'author: "{author}"',
    ]
    if author_id:
        lines.append(f"author-id: {author_id}")
    lines.extend(
        [
            f"published: {date} 08:00:00",
            "tags:",
            "  - 机器学习",
            "  - Transformer",
            f'folder-name: "{folder}"',
            "fav_time: 2026-04-10 08:00:00",
            "oid: 999001",
            "---",
            "",
            f"# {title}",
            "",
            "统一 frontmatter 样本。",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


async def test_analyze_saved_bilibili_favorites_groups_similar_followed_ups(tmp_path: Path):
    _write_favorite(
        tmp_path / "bilibili" / "favorites" / "机器学习收藏" / "2026-04-10 A.md",
        title="Transformer 入门",
        folder="机器学习收藏",
        author="算法A",
        tags="机器学习 / Transformer / 教程",
        date="2026-04-10",
    )
    _write_favorite(
        tmp_path / "bilibili" / "favorites" / "机器学习收藏" / "2026-04-11 B.md",
        title="LoRA 实战",
        folder="机器学习收藏",
        author="算法B",
        tags="机器学习 / 微调 / 教程",
        date="2026-04-11",
    )
    _write_favorite(
        tmp_path / "bilibili" / "favorites" / "数码评测" / "2026-04-12 C.md",
        title="相机横评",
        folder="数码评测",
        author="影像C",
        tags="相机 / 评测 / 镜头",
        date="2026-04-12",
    )

    result = await analyze_saved_bilibili_favorites(
        vault_path=tmp_path,
        followed_ups=[
            {"mid": "101", "uname": "算法A", "tag": []},
            {"mid": "102", "uname": "算法B", "tag": []},
            {"mid": "103", "uname": "影像C", "tag": []},
        ],
    )

    assert result["success"] is True
    assert result["total_notes"] == 3
    assert result["matched_followed_count"] == 3
    assert len(result["group_options"]) >= 2

    profiles = result["profiles"]
    assert profiles["101"]["smart_groups"] == profiles["102"]["smart_groups"]
    assert profiles["101"]["smart_groups"] != profiles["103"]["smart_groups"]
    assert profiles["101"]["sample_folders"] == ["机器学习收藏"]
    assert profiles["103"]["sample_tags"][0] == "相机"


async def test_analyze_saved_bilibili_favorites_handles_empty_vault(tmp_path: Path):
    result = await analyze_saved_bilibili_favorites(vault_path=tmp_path, followed_ups=[])

    assert result["success"] is True
    assert result["total_notes"] == 0
    assert result["matched_followed_count"] == 0
    assert result["profiles"] == {}
    assert "还没有本地 B 站内容" in result["message"]


def test_backfill_saved_bilibili_favorite_author_ids_updates_markdown(tmp_path: Path):
    target = tmp_path / "bilibili" / "favorites" / "机器学习收藏" / "2026-04-10 A.md"
    _write_favorite(
        target,
        title="Transformer 入门",
        folder="机器学习收藏",
        author="算法A",
        tags="机器学习 / Transformer / 教程",
        date="2026-04-10",
    )

    result = backfill_saved_bilibili_favorite_author_ids(
        vault_path=tmp_path,
        followed_ups=[{"mid": "101", "uname": "算法A"}],
        creator_profiles={},
    )

    text = target.read_text(encoding="utf-8")
    assert result["updated_count"] == 1
    assert "**UP主UID**: 101" in text


def test_backfill_saved_bilibili_favorite_author_ids_supports_oid_lookup(tmp_path: Path):
    target = tmp_path / "bilibili" / "favorites" / "机器学习收藏" / "2026-04-10 A.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "\n".join(
            [
                "# Transformer 入门",
                "",
                "> [!tip]- 详情",
                "> 原视频标题：Transformer 入门",
                ">",
                "> 简介",
                ">",
                "> [!info]- 笔记属性",
                "> - **来源**: Bilibili 收藏夹 · 机器学习收藏",
                "> - **UP主**: 改名后的算法A",
                "> - **BV号**: BV1demo",
                "> - **OID**: 999001",
                "> - **链接**: https://www.bilibili.com/video/BV1demo",
                "> - **收藏时间**: 2026-04-10 08:00:00",
                "> - **标签**: 机器学习 / Transformer / 教程",
                "> - **互动**: 10收藏 / 100播放 / 5弹幕",
            ]
        ),
        encoding="utf-8",
    )

    result = backfill_saved_bilibili_favorite_author_ids(
        vault_path=tmp_path,
        followed_ups=[],
        creator_profiles={
            "101": {
                "author_id": "101",
                "author": "算法A",
                "sample_oids": ["999001"],
            }
        },
    )

    text = target.read_text(encoding="utf-8")
    assert result["updated_count"] == 1
    assert "**UP主UID**: 101" in text


async def test_analyze_saved_bilibili_favorites_reads_unified_frontmatter(tmp_path: Path):
    _write_unified_favorite(
        tmp_path / "bilibili" / "favorites" / "机器学习收藏" / "2026-04-10 D.md",
        title="前置 frontmatter 收藏",
        folder="机器学习收藏",
        author="算法D",
        date="2026-04-10",
        author_id="104",
    )

    result = await analyze_saved_bilibili_favorites(
        vault_path=tmp_path,
        followed_ups=[{"mid": "104", "uname": "算法D", "tag": []}],
    )

    assert result["success"] is True
    assert result["total_notes"] == 1
    assert result["matched_followed_count"] == 1
    assert result["profiles"]["104"]["sample_oids"] == ["999001"]


async def test_analyze_saved_bilibili_favorites_scans_watch_later_and_dynamic(tmp_path: Path):
    watch_later = tmp_path / "bilibili" / "watch_later" / "2026-04-10 稍后再看 A.md"
    watch_later.parent.mkdir(parents=True, exist_ok=True)
    watch_later.write_text(
        "\n".join(
            [
                "# 十年前没听懂《你的名字》配乐",
                "",
                "> [!tip]- 详情",
                "> 原视频标题：十年前没听懂《你的名字》配乐",
                ">",
                "> 配乐和电影情绪真是绑在一起的。",
                ">",
                "> [!info]- 笔记属性",
                "> - **来源**: Bilibili 稍后再看",
                "> - **UP主**: 不存在电台",
                "> - **链接**: https://www.bilibili.com/video/BV1music",
                "> - **发布时间**: 2026-04-10 08:00:00",
                "> - **标签**: 配乐 / 音乐 / 电影",
            ]
        ),
        encoding="utf-8",
    )

    dynamic = tmp_path / "bilibili" / "dynamic" / "2026-04-11 动态 B.md"
    dynamic.parent.mkdir(parents=True, exist_ok=True)
    dynamic.write_text(
        "\n".join(
            [
                "# 宗教最厉害的是控制解释权",
                "",
                "> [!tip]- 详情",
                "> 原动态标题：宗教最厉害的是控制解释权",
                ">",
                "> 这是一次关于表达方式的讨论。",
                ">",
                "> [!info]- 笔记属性",
                "> - **来源**: Bilibili · 某UP",
                "> - **链接**: https://t.bilibili.com/123",
                "> - **日期**: 2026-04-11 20:00:00",
                "> - **标签**: 观点 / 讨论",
            ]
        ),
        encoding="utf-8",
    )

    result = await analyze_saved_bilibili_favorites(vault_path=tmp_path, followed_ups=[])

    assert result["total_notes"] == 2
    authors = {item["author"] for item in result["all_candidates"]}
    assert "不存在电台" in authors
    assert "某UP" in authors


async def test_analyze_saved_bilibili_favorites_reports_author_progress(tmp_path: Path):
    _write_favorite(
        tmp_path / "bilibili" / "favorites" / "机器学习收藏" / "2026-04-10 A.md",
        title="Transformer 入门",
        folder="机器学习收藏",
        author="算法A",
        tags="机器学习 / Transformer / 教程",
        date="2026-04-10",
    )
    _write_favorite(
        tmp_path / "bilibili" / "favorites" / "数码评测" / "2026-04-12 B.md",
        title="相机横评",
        folder="数码评测",
        author="影像B",
        tags="相机 / 评测 / 镜头",
        date="2026-04-12",
    )

    progress_events: list[dict] = []
    result = await analyze_saved_bilibili_favorites(
        vault_path=tmp_path,
        followed_ups=[
            {"mid": "101", "uname": "算法A", "tag": []},
            {"mid": "102", "uname": "影像B", "tag": []},
        ],
        progress_callback=lambda payload: progress_events.append(dict(payload)),
    )

    assert result["success"] is True
    assert any("正在匹配关注作者" in str(event.get("stage") or "") for event in progress_events)
    assert progress_events[-1]["stage"] == "本地 B站标签分析完成"
    assert progress_events[-1]["processed_authors"] == 2


def test_backfill_saved_bilibili_favorite_author_ids_updates_unified_frontmatter(tmp_path: Path):
    target = tmp_path / "bilibili" / "favorites" / "机器学习收藏" / "2026-04-10 D.md"
    _write_unified_favorite(
        target,
        title="前置 frontmatter 收藏",
        folder="机器学习收藏",
        author="算法D",
        date="2026-04-10",
    )

    result = backfill_saved_bilibili_favorite_author_ids(
        vault_path=tmp_path,
        followed_ups=[{"mid": "104", "uname": "算法D"}],
        creator_profiles={},
    )

    text = target.read_text(encoding="utf-8")
    assert result["updated_count"] == 1
    assert "author-id: '104'" in text or "author-id: \"104\"" in text or "author-id: 104" in text


async def test_build_saved_bilibili_favorite_up_pool_filters_followed_and_resolves_uid_via_video_meta(
    tmp_path: Path,
    monkeypatch,
):
    followed_target = tmp_path / "bilibili" / "favorites" / "机器学习收藏" / "2026-04-10 A.md"
    favorite_only_target = tmp_path / "bilibili" / "favorites" / "影评收藏" / "2026-04-11 B.md"
    _write_favorite(
        followed_target,
        title="Transformer 入门",
        folder="机器学习收藏",
        author="算法A",
        tags="机器学习 / Transformer / 教程",
        date="2026-04-10",
        bvid="BV1follow1234",
    )
    _write_favorite(
        favorite_only_target,
        title="电影配乐拆解",
        folder="影评收藏",
        author="不存在电台",
        tags="电影 / 配乐 / 影评",
        date="2026-04-11",
        bvid="BV1favorite23",
    )

    async def fake_fetch(_client, *, bvid: str, headers=None, referer=None):
        if bvid == "BV1favorite23":
            return {"author": "不存在电台", "author_id": "202"}
        return {}

    monkeypatch.setattr("abo.tools.bilibili_crawler.fetch_bilibili_video_metadata", fake_fetch)

    result = await build_saved_bilibili_favorite_up_pool(
        vault_path=tmp_path,
        followed_ups=[{"mid": "101", "uname": "算法A"}],
        creator_profiles={},
    )

    assert result["favorite_up_uids"] == ["202"]
    assert result["already_followed_count"] == 1
    assert result["favorite_up_profiles"]["202"]["author"] == "不存在电台"
    assert result["updated_count"] == 2
    assert "**UP主UID**: 101" in followed_target.read_text(encoding="utf-8")
    assert "**UP主UID**: 202" in favorite_only_target.read_text(encoding="utf-8")
