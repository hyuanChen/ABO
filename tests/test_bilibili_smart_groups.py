from pathlib import Path

import pytest

from abo.tools.bilibili_crawler import analyze_saved_bilibili_favorites


pytestmark = pytest.mark.anyio


def _write_favorite(path: Path, *, title: str, folder: str, author: str, tags: str, date: str) -> None:
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
                "> - **BV号**: BV1demo",
                "> - **链接**: https://www.bilibili.com/video/BV1demo",
                f"> - **收藏时间**: {date} 08:00:00",
                f"> - **标签**: {tags}",
                "> - **互动**: 10收藏 / 100播放 / 5弹幕",
            ]
        ),
        encoding="utf-8",
    )


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
    assert "还没有本地 B 站收藏结果" in result["message"]
