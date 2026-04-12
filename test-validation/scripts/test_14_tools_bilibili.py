#!/usr/bin/env python3
"""Tests for Bilibili Tools."""
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest


def test_bilibili_tools_imports():
    """Test Bilibili tools can be imported."""
    try:
        from abo.tools.bilibili import bilibili_fetch_followed, bilibili_verify_sessdata
        assert True
    except ImportError as e:
        pytest.skip(f"Bilibili tools not available: {e}")


def test_bilibili_image_card_allows_null_pictures():
    """Image dynamics may return pictures=null."""
    from abo.tools.bilibili import BilibiliToolAPI

    api = BilibiliToolAPI(sessdata="dummy")
    try:
        dynamic = api._parse_image_card(
            dynamic_id="123",
            desc={
                "timestamp": 1710000000,
                "user_profile": {"uname": "UP主", "uid": 42},
            },
            card={"item": {"description": "测试图文", "pictures": None}},
            keywords=None,
        )

        assert dynamic is not None
        assert dynamic.images == []
        assert dynamic.dynamic_type == "image"
    finally:
        # Avoid leaking the async client opened by the API wrapper.
        import asyncio

        asyncio.run(api.close())


def test_bilibili_cookie_header_normalization():
    """Crawler accepts Cookie-Editor JSON and raw SESSDATA."""
    from abo.tools.bilibili_crawler import normalize_cookie_header

    exported = '[{"name":"SESSDATA","value":"abc"},{"name":"bili_jct","value":"csrf"}]'

    assert normalize_cookie_header(exported) == "SESSDATA=abc; bili_jct=csrf"
    assert normalize_cookie_header("abc") == "SESSDATA=abc"
    assert normalize_cookie_header("SESSDATA=abc; bili_jct=csrf") == "SESSDATA=abc; bili_jct=csrf"


def test_bilibili_favorite_note_keeps_raw_fav_time():
    """Incremental favorite crawls need the raw favorite timestamp as a cursor."""
    from abo.tools.bilibili_crawler import _favorite_media_to_note

    note = _favorite_media_to_note(
        {
            "id": 100,
            "bvid": "BV123",
            "title": "测试收藏",
            "fav_time": 1710000000,
            "upper": {"name": "UP主"},
        },
        {"id": 42, "title": "默认收藏夹"},
    )

    assert note.metadata["fav_time_ts"] == 1710000000
    assert note.metadata["fav_time"]


def test_bilibili_favorite_write_renames_only_new_files(tmp_path):
    """Favorite crawl output should use the actual favorite date without rescanning old files."""
    from abo.tools.bilibili_crawler import BilibiliNote, _today, write_notes_to_vault

    folder = tmp_path / "bilibili" / "favorites" / "默认收藏夹"
    folder.mkdir(parents=True)
    old_file = folder / "2026-04-01 收藏 旧视频 BVOLD.md"
    old_file.write_text(
        "> - **收藏时间**: 2022-01-02 12:00:00\n",
        encoding="utf-8",
    )

    result = write_notes_to_vault(
        [
            BilibiliNote(
                source_type="favorite",
                title="测试收藏",
                content="简介",
                url="https://www.bilibili.com/video/BV123",
                author="UP主",
                bvid="BV123",
                folder_name="默认收藏夹",
                metadata={
                    "fav_time": "2025-03-14 08:00:00",
                    "cnt_info": {},
                },
            )
        ],
        vault_path=tmp_path,
    )

    renamed = folder / "2025-03-14 测试收藏 BV123.md"
    source = folder / f"{_today()} 收藏 测试收藏 BV123.md"
    index = tmp_path / "bilibili" / f"{_today()} Bilibili 爬取汇总.md"

    assert old_file.exists()
    assert renamed.exists()
    assert not source.exists()
    assert result["renamed_favorite_count"] == 1
    assert str(renamed) in result["written_files"]
    assert "favorites/默认收藏夹/2025-03-14 测试收藏 BV123" in index.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_bilibili_favorite_resource_page_caps_page_size():
    """Bilibili favorite resources reject oversized ps values with code=-400."""
    from abo.tools.bilibili_crawler import _fetch_favorite_resource_page

    class Response:
        status_code = 200

        def json(self):
            return {"code": 0, "data": {"medias": []}}

    class Client:
        def __init__(self):
            self.params = None

        async def get(self, _url, *, params, headers):
            self.params = params
            return Response()

    client = Client()
    status_code, data = await _fetch_favorite_resource_page(
        client,  # type: ignore[arg-type]
        cookie_header="SESSDATA=abc",
        mid="42",
        folder_id="123",
        page=1,
        page_size=50,
    )

    assert status_code == 200
    assert data["code"] == 0
    assert client.params["ps"] == 20


@pytest.mark.asyncio
async def test_bilibili_favorite_items_continue_after_short_page(monkeypatch):
    """A short page can still have later pages when favorites include hidden/deleted items."""
    import abo.tools.bilibili_crawler as crawler

    async def fake_folders(_cookie_header: str, _mid: str):
        return [{"id": "42", "title": "默认收藏夹", "media_count": 39}]

    calls: list[int] = []

    async def fake_page(_client, *, page: int, **_kwargs):
        calls.append(page)
        count = 19 if page == 1 else 20
        medias = [
            {
                "id": page * 100 + index,
                "bvid": f"BV{page}{index}",
                "title": f"视频 {page}-{index}",
                "fav_time": 1710000000 - index,
                "upper": {"name": "UP主"},
            }
            for index in range(count)
        ]
        return 200, {"code": 0, "data": {"medias": medias}}

    monkeypatch.setattr(crawler, "fetch_favorite_folders", fake_folders)
    monkeypatch.setattr(crawler, "_fetch_favorite_resource_page", fake_page)

    notes, folders = await crawler.fetch_favorite_items(
        "SESSDATA=abc",
        mid="1",
        item_limit=100,
    )

    assert len(folders) == 1
    assert calls[:2] == [1, 2]
    assert len(notes) == 39


@pytest.mark.asyncio
async def test_bilibili_fetch_followed_dynamics_uses_polymer_pagination():
    """Video-only fetch should page past the first 20 results."""
    from abo.tools.bilibili import BilibiliToolAPI

    def build_item(index: int) -> dict:
        ts = int((datetime.now() - timedelta(minutes=index)).timestamp())
        return {
            "id_str": f"dyn-{index}",
            "type": "DYNAMIC_TYPE_AV",
            "modules": {
                "module_author": {
                    "name": f"UP {index}",
                    "mid": index,
                    "pub_ts": ts,
                },
                "module_dynamic": {
                    "desc": {"text": f"desc {index}"},
                    "major": {
                        "type": "MAJOR_TYPE_ARCHIVE",
                        "archive": {
                            "title": f"title {index}",
                            "desc": f"desc {index}",
                            "bvid": f"BV{index}",
                            "jump_url": f"//www.bilibili.com/video/BV{index}",
                            "cover": f"https://img/{index}.jpg",
                        },
                    },
                },
            },
        }

    pages = [
        {
            "items": [build_item(i) for i in range(20)],
            "offset": "next-page",
            "has_more": True,
        },
        {
            "items": [build_item(i) for i in range(20, 40)],
            "offset": None,
            "has_more": False,
        },
    ]

    api = BilibiliToolAPI(sessdata="dummy")
    try:
        seen_offsets: list[str | None] = []

        async def fake_fetch_page(offset: str | None = None) -> dict:
            seen_offsets.append(offset)
            return pages[len(seen_offsets) - 1]

        api._fetch_polymer_page = fake_fetch_page  # type: ignore[method-assign]
        dynamics = await api.fetch_followed_dynamics(dynamic_types=[8], limit=25, days_back=7)

        assert len(dynamics) == 25
        assert seen_offsets == [None, "next-page"]
        assert dynamics[0].dynamic_id == "dyn-0"
        assert dynamics[-1].dynamic_id == "dyn-24"
    finally:
        await api.close()


def test_bilibili_parse_polymer_opus_sets_preview_cover():
    """Polymer opus items should expose image previews."""
    from abo.tools.bilibili import BilibiliToolAPI

    api = BilibiliToolAPI(sessdata="dummy")
    try:
        dynamic = api._parse_polymer_item(
            {
                "id_str": "123",
                "type": "DYNAMIC_TYPE_DRAW",
                "modules": {
                    "module_author": {"name": "作者", "mid": 1, "pub_ts": 1710000000},
                    "module_dynamic": {
                        "major": {
                            "type": "MAJOR_TYPE_OPUS",
                            "opus": {
                                "title": None,
                                "jump_url": "//www.bilibili.com/opus/123",
                                "summary": {"text": "图文内容"},
                                "pics": [{"url": "https://img/cover.jpg"}],
                            },
                        }
                    },
                },
            },
            keywords=None,
        )

        assert dynamic is not None
        assert dynamic.dynamic_type == "image"
        assert dynamic.pic == "https://img/cover.jpg"
        assert dynamic.images == ["https://img/cover.jpg"]
    finally:
        import asyncio

        asyncio.run(api.close())


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
