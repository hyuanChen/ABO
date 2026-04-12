import pytest

from abo.default_modules.xiaohongshu import XiaohongshuTracker
from abo.sdk.types import Item


pytestmark = pytest.mark.anyio


def _item(item_id: str, note_id: str, title: str, source: str) -> Item:
    return Item(
        id=item_id,
        raw={
            "note_id": note_id,
            "title": title,
            "content": f"{title} content long enough for testing",
            "url": f"https://www.xiaohongshu.com/explore/{note_id}",
            "crawl_source": source,
        },
    )


async def test_xiaohongshu_fetch_uses_auto_crawl_config(monkeypatch):
    tracker = XiaohongshuTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "keywords": ["科研", "写作"],
            "user_ids": ["user-1"],
            "web_session": "ws-token",
            "id_token": "id-token",
            "follow_feed": True,
            "fetch_follow_limit": 3,
            "enable_keyword_search": True,
            "keyword_min_likes": 800,
            "keyword_search_limit": 4,
        },
    )

    calls = {"users": [], "follow": None, "search": None}

    async def fake_fetch_user_notes(user_id: str, cookie: str, limit: int):
        calls["users"].append((user_id, cookie, limit))
        return [_item("user-item", "note-user", "用户笔记", "user_id")]

    async def fake_fetch_following_notes(cookie: str, keywords: list[str], limit: int):
        calls["follow"] = (cookie, keywords, limit)
        return [
            _item("follow-item-1", "note-follow", "关注笔记", "following"),
            _item("follow-item-dup", "note-user", "重复笔记", "following"),
        ]

    async def fake_search_by_keywords(
        keywords: list[str],
        cookie: str,
        limit: int,
        per_keyword_limit: int,
        min_likes: int,
    ):
        calls["search"] = (keywords, cookie, limit, per_keyword_limit, min_likes)
        return [
            _item("search-item-1", "note-search-1", "关键词笔记1", "keyword:科研"),
            _item("search-item-2", "note-search-2", "关键词笔记2", "keyword:写作"),
        ]

    monkeypatch.setattr(tracker, "_fetch_user_notes", fake_fetch_user_notes)
    monkeypatch.setattr(tracker, "_fetch_following_notes", fake_fetch_following_notes)
    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)

    items = await tracker.fetch(max_results=4)

    assert [item.raw["note_id"] for item in items] == [
        "note-user",
        "note-follow",
        "note-search-1",
        "note-search-2",
    ]
    assert calls["users"] == [("user-1", "web_session=ws-token; id_token=id-token", 4)]
    assert calls["follow"] == ("web_session=ws-token; id_token=id-token", ["科研", "写作"], 3)
    assert calls["search"] == (["科研", "写作"], "web_session=ws-token; id_token=id-token", 2, 4, 800)


async def test_xiaohongshu_fetch_skips_cookie_based_crawls_without_cookie(monkeypatch):
    tracker = XiaohongshuTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "keywords": ["科研"],
            "follow_feed": True,
            "enable_keyword_search": True,
        },
    )

    async def fail_follow(*args, **kwargs):
        raise AssertionError("follow crawl should not run without cookie")

    async def fail_search(*args, **kwargs):
        raise AssertionError("keyword crawl should not run without cookie")

    monkeypatch.setattr(tracker, "_fetch_following_notes", fail_follow)
    monkeypatch.setattr(tracker, "_search_by_keywords", fail_search)

    items = await tracker.fetch(max_results=5)

    assert items == []


async def test_xiaohongshu_fetch_uses_configured_max_results(monkeypatch):
    tracker = XiaohongshuTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "keywords": ["科研"],
            "cookie": "web_session=token",
            "enable_keyword_search": True,
            "keyword_search_limit": 10,
            "max_results": 3,
        },
    )

    async def fake_search_by_keywords(
        keywords: list[str],
        cookie: str,
        limit: int,
        per_keyword_limit: int,
        min_likes: int,
    ):
        return [_item(f"search-item-{index}", f"note-search-{index}", f"关键词笔记{index}", "keyword:科研") for index in range(limit)]

    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)

    items = await tracker.fetch(max_results=20)

    assert len(items) == 3


async def test_xiaohongshu_process_writes_cards_to_xhs_folder(monkeypatch):
    import abo.default_modules.xiaohongshu as xhs_module

    async def fake_claude_json(prompt: str, prefs: dict):
        return {"score": 7, "summary": "摘要", "tags": ["科研"], "category": "学习"}

    monkeypatch.setattr(xhs_module, "claude_json", fake_claude_json)

    tracker = XiaohongshuTracker()
    cards = await tracker.process(
        [_item("search-item", "note-search", "关键词笔记", "keyword:科研")],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].obsidian_path.startswith("xhs/")
