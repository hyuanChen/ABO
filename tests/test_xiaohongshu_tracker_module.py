import json
from pathlib import Path

import pytest

from abo.default_modules.xiaohongshu import XiaohongshuTracker
from abo.sdk.types import Item
from abo.tools.xiaohongshu import XHSComment, XHSNote


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
                "creator_push_enabled": True,
                "keyword_min_likes": 800,
                "keyword_search_limit": 4,
            },
        )

    calls = {"users": [], "follow": None, "search": None}

    async def fake_fetch_user_notes(user_id: str, cookie: str, limit: int, *, fallback_author: str = ""):
        calls["users"].append((user_id, cookie, limit))
        return [_item("user-item", "note-user", "用户笔记", "user_id")]

    async def fake_fetch_following_notes(cookie: str, keywords: list[str], limit: int, **kwargs):
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
        **kwargs,
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
    assert calls["users"] == [("user-1", "web_session=ws-token; id_token=id-token", 5)]
    assert calls["follow"] is not None
    assert calls["follow"][0] == "web_session=ws-token; id_token=id-token"
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


async def test_xiaohongshu_fetch_reuses_global_cookie_from_active_tool(monkeypatch, tmp_path):
    import abo.default_modules.xiaohongshu as xhs_module

    tracker = XiaohongshuTracker()
    prefs_path = tmp_path / ".abo" / "preferences.json"
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        json.dumps(
            {
                "modules": {
                    "xiaohongshu-tracker": {
                        "keyword_monitors": [
                            {
                                "id": "xhs-km-1",
                                "label": "科研",
                                "keywords": ["科研"],
                                "enabled": True,
                                "min_likes": 200,
                                "per_keyword_limit": 5,
                            }
                        ],
                        "following_scan": {"enabled": False},
                        "following_scan_monitors": [],
                        "creator_monitors": [],
                        "creator_push_enabled": False,
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(
        xhs_module,
        "load_config",
        lambda: {"xiaohongshu_cookie": "web_session=global-token; id_token=global-id"},
    )
    monkeypatch.setattr(tracker, "_get_history_store", lambda: None)

    captured: dict[str, object] = {}

    async def fake_search_by_keywords(
        keywords: list[str],
        cookie: str,
        limit: int,
        per_keyword_limit: int,
        min_likes: int,
        **kwargs,
    ):
        captured["keywords"] = keywords
        captured["cookie"] = cookie
        return [_item("search-item-global-cookie", "note-global-cookie", "关键词笔记", "keyword:科研")]

    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)

    items = await tracker.fetch(max_results=5)

    assert [item.raw["note_id"] for item in items] == ["note-global-cookie"]
    assert captured["keywords"] == ["科研"]
    assert captured["cookie"] == "web_session=global-token; id_token=global-id"


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
        **kwargs,
    ):
        return [_item(f"search-item-{index}", f"note-search-{index}", f"关键词笔记{index}", "keyword:科研") for index in range(limit)]

    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)

    items = await tracker.fetch(max_results=20)

    assert len(items) == 3


async def test_xiaohongshu_fetch_skips_previously_seen_notes(monkeypatch):
    tracker = XiaohongshuTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "keywords": ["科研"],
            "cookie": "web_session=token",
            "enable_keyword_search": True,
            "keyword_search_limit": 10,
            "max_results": 5,
        },
    )
    monkeypatch.setattr(tracker, "_get_history_store", lambda: object())
    monkeypatch.setattr(
        tracker,
        "_has_seen_note",
        lambda _store, *, note_id, url: note_id == "note-seen",
    )

    async def fake_search_by_keywords(
        keywords: list[str],
        cookie: str,
        limit: int,
        per_keyword_limit: int,
        min_likes: int,
        **kwargs,
    ):
        return [
            _item("search-item-seen", "note-seen", "旧笔记", "keyword:科研"),
            _item("search-item-new", "note-new", "新笔记", "keyword:科研"),
        ]

    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)

    items = await tracker.fetch(max_results=5)

    assert [item.raw["note_id"] for item in items] == ["note-new"]


async def test_xiaohongshu_fetch_expands_selected_smart_groups_from_creator_profiles(monkeypatch):
    tracker = XiaohongshuTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "web_session": "ws-token",
            "creator_push_enabled": True,
            "creator_groups": ["research"],
            "creator_profiles": {
                "user-research-1": {
                    "author": "科研博主",
                    "author_id": "user-research-1",
                    "smart_groups": ["research"],
                    "smart_group_labels": ["科研学习"],
                }
            },
            "keyword_monitors": [],
            "following_scan": {"enabled": False},
            "following_scan_monitors": [],
            "creator_monitors": [],
        },
    )
    monkeypatch.setattr(tracker, "_get_history_store", lambda: None)

    calls: list[str] = []

    async def fake_fetch_user_notes(user_id: str, cookie: str, limit: int, *, fallback_author: str = ""):
        calls.append(user_id)
        return [_item("smart-group-item", "note-smart-group", "智能分组博主笔记", "user_id")]

    async def fake_fetch_following_notes(*args, **kwargs):
        return []

    async def fake_search_by_keywords(*args, **kwargs):
        return []

    monkeypatch.setattr(tracker, "_fetch_user_notes", fake_fetch_user_notes)
    monkeypatch.setattr(tracker, "_fetch_following_notes", fake_fetch_following_notes)
    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)

    items = await tracker.fetch(max_results=5)

    assert calls == ["user-research-1"]
    assert [item.raw["note_id"] for item in items] == ["note-smart-group"]


async def test_xiaohongshu_process_writes_cards_to_xhs_folder(monkeypatch):
    import abo.default_modules.xiaohongshu as xhs_module

    async def fake_agent_json(prompt: str, prefs: dict):
        return {"score": 7, "summary": "摘要", "tags": ["科研"], "category": "学习"}

    monkeypatch.setattr(xhs_module, "agent_json", fake_agent_json)

    tracker = XiaohongshuTracker()
    cards = await tracker.process(
        [_item("search-item", "note-search", "关键词笔记", "keyword:科研")],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].obsidian_path.startswith("xhs/关键词扫描/科研/")


async def test_xiaohongshu_process_preserves_full_preview_payload(monkeypatch):
    import abo.default_modules.xiaohongshu as xhs_module

    async def fake_agent_json(prompt: str, prefs: dict):
        return {"score": 7, "summary": "摘要", "tags": ["科研"], "category": "学习"}

    monkeypatch.setattr(xhs_module, "agent_json", fake_agent_json)

    tracker = XiaohongshuTracker()
    item = tracker._note_to_item(
        XHSNote(
            id="note-preview",
            title="完整预览卡片",
            content="这是会进入 feed 的完整正文内容，需要保留图片、视频、评论预览等字段用于前端复刻。",
            author="测试作者",
            author_id="author-1",
            likes=99,
            collects=66,
            comments_count=12,
            url="https://www.xiaohongshu.com/explore/note-preview",
            cover_image="https://img.example.com/cover.jpg",
            note_type="video",
            images=["https://img.example.com/cover.jpg", "https://img.example.com/2.jpg"],
            video_url="https://video.example.com/clip.mp4",
            comments_preview=[
                XHSComment(
                    id="c1",
                    author="评论用户",
                    content="这条评论也应该保留。",
                    likes=8,
                    is_top=True,
                )
            ],
            xsec_token="token-1",
            xsec_source="pc_search",
        ),
        source="keyword:科研",
        matched_keywords=["科研"],
    )
    cards = await tracker.process([item], prefs={})

    assert len(cards) == 1
    assert cards[0].metadata["author_id"] == "author-1"
    assert cards[0].metadata["cover_image"] == "https://img.example.com/cover.jpg"
    assert cards[0].metadata["images"] == ["https://img.example.com/cover.jpg", "https://img.example.com/2.jpg"]
    assert cards[0].metadata["video_url"] == "https://video.example.com/clip.mp4"
    assert cards[0].metadata["xsec_token"] == "token-1"
    assert cards[0].metadata["xsec_source"] == "pc_search"
    assert cards[0].metadata["matched_keywords"] == ["科研"]
    assert cards[0].metadata["comments_preview"] == [
        {
            "id": "c1",
            "author": "评论用户",
            "content": "这条评论也应该保留。",
            "likes": 8,
            "is_top": True,
        }
    ]
    assert "完整正文内容" in str(cards[0].metadata["content"])


async def test_xiaohongshu_process_writes_following_cards_to_following_subfolder(monkeypatch):
    import abo.default_modules.xiaohongshu as xhs_module

    async def fake_agent_json(prompt: str, prefs: dict):
        return {"score": 7, "summary": "摘要", "tags": ["科研"], "category": "学习"}

    monkeypatch.setattr(xhs_module, "agent_json", fake_agent_json)

    tracker = XiaohongshuTracker()
    cards = await tracker.process(
        [_item("follow-item", "note-follow", "关注笔记", "following")],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].obsidian_path.startswith("xhs/关注流扫描/")


async def test_xiaohongshu_process_writes_creator_cards_to_creator_subfolder(monkeypatch):
    import abo.default_modules.xiaohongshu as xhs_module

    async def fake_agent_json(prompt: str, prefs: dict):
        return {"score": 7, "summary": "摘要", "tags": ["科研"], "category": "学习"}

    monkeypatch.setattr(xhs_module, "agent_json", fake_agent_json)

    tracker = XiaohongshuTracker()
    cards = await tracker.process(
        [
            Item(
                id="user-item",
                    raw={
                        "note_id": "note-user",
                        "title": "指定用户笔记",
                        "content": "指定用户笔记内容足够长，满足测试条件，而且需要明显超过二十个字符才会进入卡片处理流程。",
                        "url": "https://www.xiaohongshu.com/explore/note-user",
                        "crawl_source": "user_id",
                        "user_id": "user-1",
                    "author": "博主A",
                },
            )
        ],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].obsidian_path.startswith("xhs/指定用户扫描/博主A/")


async def test_xiaohongshu_fetch_following_notes_delegates_to_followed_backend(monkeypatch):
    tracker = XiaohongshuTracker()

    captured: dict[str, object] = {}

    async def fake_get_following_feed_with_cookie(
        self,
        *,
        cookie: str,
        keywords: list[str],
        max_notes: int = 50,
        use_extension: bool = True,
        extension_port: int = 9334,
        dedicated_window_mode: bool = True,
    ):
        captured.update(
            {
                "cookie": cookie,
                "keywords": keywords,
                "max_notes": max_notes,
                "use_extension": use_extension,
                "extension_port": extension_port,
                "dedicated_window_mode": dedicated_window_mode,
            }
        )
        return [
            XHSNote(
                id="note-followed-1",
                title="已关注博主的新笔记",
                content="这里应该只来自真实已关注作者。",
                author="关注作者",
                author_id="followed-author-1",
                likes=128,
                collects=12,
                comments_count=3,
                url="https://www.xiaohongshu.com/explore/note-followed-1",
            )
        ]

    monkeypatch.setattr(
        "abo.default_modules.xiaohongshu.XiaohongshuAPI.get_following_feed_with_cookie",
        fake_get_following_feed_with_cookie,
    )

    items = await tracker._fetch_following_notes(
        cookie="web_session=test-token",
        keywords=["科研"],
        limit=6,
    )

    assert captured == {
        "cookie": "web_session=test-token",
        "keywords": ["科研"],
        "max_notes": 6,
        "use_extension": True,
        "extension_port": 9334,
        "dedicated_window_mode": True,
    }
    assert len(items) == 1
    assert items[0].raw["crawl_source"] == "following"
    assert items[0].raw["user_id"] == "followed-author-1"


async def test_xiaohongshu_search_by_keywords_delegates_to_shared_search_flow(monkeypatch):
    tracker = XiaohongshuTracker()

    captured_calls: list[dict[str, object]] = []

    async def fake_xiaohongshu_search(
        keyword: str,
        max_results: int = 20,
        min_likes: int = 100,
        sort_by: str = "comprehensive",
        recent_days: int | None = None,
        cookie: str | None = None,
        use_extension: bool = True,
        extension_port: int = 9334,
        dedicated_window_mode: bool = False,
    ) -> dict:
        captured_calls.append(
            {
                "keyword": keyword,
                "max_results": max_results,
                "min_likes": min_likes,
                "sort_by": sort_by,
                "recent_days": recent_days,
                "cookie": cookie,
                "use_extension": use_extension,
                "extension_port": extension_port,
                "dedicated_window_mode": dedicated_window_mode,
            }
        )
        return {
            "keyword": keyword,
            "total_found": 1,
            "notes": [
                {
                    "id": f"{keyword}-1",
                    "title": f"{keyword} 笔记",
                    "content": "这是主动工具统一搜索链路返回的结果。",
                    "author": "作者A",
                    "author_id": "author-a",
                    "likes": 123,
                    "collects": 8,
                    "comments_count": 2,
                    "url": f"https://www.xiaohongshu.com/explore/{keyword}-1",
                    "published_at": "2026-04-28T10:00:00",
                    "cover_image": "https://example.com/cover.jpg",
                    "note_type": "normal",
                    "images": ["https://example.com/cover.jpg"],
                    "video_url": None,
                    "xsec_token": "",
                    "xsec_source": "",
                    "comments_preview": [],
                }
            ],
        }

    async def fail_direct_search_by_keyword(*args, **kwargs):
        raise AssertionError("tracker keyword monitor should reuse xiaohongshu_search instead of direct API.search_by_keyword")

    monkeypatch.setattr("abo.default_modules.xiaohongshu.xiaohongshu_search", fake_xiaohongshu_search)
    monkeypatch.setattr("abo.tools.xiaohongshu.XiaohongshuAPI.search_by_keyword", fail_direct_search_by_keyword)

    items = await tracker._search_by_keywords(
        keywords=["科研"],
        cookie="web_session=test-token",
        limit=3,
        per_keyword_limit=4,
        min_likes=500,
        recent_days=7,
        sort_by="time",
        extension_port=9555,
        dedicated_window_mode=True,
    )

    assert captured_calls == [
        {
            "keyword": "科研",
            "max_results": 12,
            "min_likes": 500,
            "sort_by": "time",
            "recent_days": 7,
            "cookie": "web_session=test-token",
            "use_extension": True,
            "extension_port": 9555,
            "dedicated_window_mode": True,
        }
    ]
    assert [item.raw["note_id"] for item in items] == ["科研-1"]
    assert items[0].raw["crawl_source"] == "keyword:科研"
    assert items[0].raw["matched_keywords"] == ["科研"]


async def test_xiaohongshu_following_monitor_without_keyword_filter_fetches_full_feed(monkeypatch):
    tracker = XiaohongshuTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "web_session": "ws-token",
            "extension_port": 9555,
            "dedicated_window_mode": False,
            "enable_keyword_search": False,
            "keyword_monitors": [],
            "creator_push_enabled": False,
            "creator_monitors": [],
            "following_scan": {
                "enabled": True,
                "keywords": [],
                "fetch_limit": 4,
                "recent_days": 30,
                "sort_by": "likes",
                "keyword_filter": False,
            },
            "following_scan_monitors": [
                {
                    "id": "xhs-fm-open-feed",
                    "label": "全关注流",
                    "keywords": [],
                    "enabled": True,
                    "fetch_limit": 4,
                    "recent_days": 30,
                    "sort_by": "likes",
                    "keyword_filter": False,
                    "include_comments": False,
                    "comments_limit": 20,
                    "comments_sort_by": "likes",
                }
            ],
        },
    )

    captured: dict[str, object] = {}

    async def fake_fetch_following_notes(
        cookie: str,
        keywords: list[str],
        limit: int,
        *,
        recent_days: int = 7,
        sort_by: str = "time",
        extension_port: int = 9334,
        dedicated_window_mode: bool = True,
    ):
        captured.update(
            {
                "cookie": cookie,
                "keywords": keywords,
                "limit": limit,
                "recent_days": recent_days,
                "sort_by": sort_by,
                "extension_port": extension_port,
                "dedicated_window_mode": dedicated_window_mode,
            }
        )
        return [_item("follow-open-feed", "note-open-feed", "开放关注流", "following")]

    async def fake_search_by_keywords(*args, **kwargs):
        return []

    monkeypatch.setattr(tracker, "_fetch_following_notes", fake_fetch_following_notes)
    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)

    items = await tracker.fetch(max_results=4)

    assert captured == {
        "cookie": "web_session=ws-token",
        "keywords": [""],
        "limit": 4,
        "recent_days": 30,
        "sort_by": "likes",
        "extension_port": 9555,
        "dedicated_window_mode": False,
    }
    assert [item.raw["note_id"] for item in items] == ["note-open-feed"]


async def test_xiaohongshu_creator_monitor_respects_recent_days_and_time_sort(monkeypatch):
    tracker = XiaohongshuTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "web_session": "ws-token",
            "creator_push_enabled": True,
            "enable_keyword_search": False,
            "keyword_monitors": [],
            "following_scan": {"enabled": False},
            "following_scan_monitors": [],
            "creator_monitors": [
                {
                    "id": "monitor-recent",
                    "user_id": "user-recent",
                    "label": "最近博主",
                    "author": "最近博主",
                    "enabled": True,
                    "per_user_limit": 2,
                    "recent_days": 1,
                    "sort_by": "time",
                    "include_comments": False,
                    "comments_limit": 20,
                    "comments_sort_by": "likes",
                }
            ],
        },
    )
    monkeypatch.setattr(
        "abo.default_modules.xiaohongshu.check_creator_allowed",
        lambda user_id: type("Decision", (), {"allowed": True, "reason": "", "cooldown_until": ""})(),
    )

    old_time = "2026-04-20T08:00:00"
    mid_time = "2026-04-27T08:00:00"
    new_time = "2026-04-27T10:00:00"

    async def fake_fetch_user_notes(user_id: str, cookie: str, limit: int, *, fallback_author: str = ""):
        return [
            _item("creator-old", "note-old", "两天前的笔记", "user_id"),
            _item("creator-mid", "note-mid", "今天上午的笔记", "user_id"),
            _item("creator-new", "note-new", "刚刚发布的笔记", "user_id"),
        ]

    async def fake_fetch_following_notes(*args, **kwargs):
        return []

    async def fake_search_by_keywords(*args, **kwargs):
        return []

    async def fake_fetch_user_notes_with_dates(user_id: str, cookie: str, limit: int, *, fallback_author: str = ""):
        items = await fake_fetch_user_notes(user_id, cookie, limit, fallback_author=fallback_author)
        items[0].raw["published_at"] = old_time
        items[1].raw["published_at"] = mid_time
        items[2].raw["published_at"] = new_time
        return items

    monkeypatch.setattr(tracker, "_fetch_following_notes", fake_fetch_following_notes)
    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)
    monkeypatch.setattr(tracker, "_fetch_user_notes", fake_fetch_user_notes_with_dates)

    items = await tracker.fetch(max_results=5)

    assert [item.raw["note_id"] for item in items] == ["note-new", "note-mid"]


async def test_xiaohongshu_creator_monitor_limits_profile_batch(monkeypatch):
    tracker = XiaohongshuTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "web_session": "ws-token",
            "creator_push_enabled": True,
            "enable_keyword_search": False,
            "keyword_monitors": [],
            "keywords": [],
            "following_scan": {"enabled": False},
            "following_scan_monitors": [],
            "creator_monitors": [
                {"id": f"monitor-{index}", "user_id": f"user-{index}", "enabled": True, "per_user_limit": 1}
                for index in range(8)
            ],
        },
    )
    monkeypatch.setattr("abo.default_modules.xiaohongshu.check_creator_allowed", lambda user_id: type("Decision", (), {"allowed": True, "reason": "", "cooldown_until": ""})())
    sleep_calls: list[int] = []

    async def fake_sleep(seconds: int):
        sleep_calls.append(seconds)

    delays = iter([20, 24, 30, 22])

    monkeypatch.setattr("abo.default_modules.xiaohongshu.asyncio.sleep", fake_sleep)
    monkeypatch.setattr("abo.default_modules.xiaohongshu.random.randint", lambda low, high: next(delays))

    calls: list[str] = []

    async def fake_fetch_user_notes(user_id: str, cookie: str, limit: int, *, fallback_author: str = ""):
        calls.append(user_id)
        return [_item(f"item-{user_id}", f"note-{user_id}", f"用户笔记 {user_id}", "user_id")]

    async def fake_fetch_following_notes(*args, **kwargs):
        return []

    async def fake_search_by_keywords(*args, **kwargs):
        return []

    monkeypatch.setattr(tracker, "_fetch_user_notes", fake_fetch_user_notes)
    monkeypatch.setattr(tracker, "_fetch_following_notes", fake_fetch_following_notes)
    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)

    await tracker.fetch(max_results=20)

    assert calls == [f"user-{index}" for index in range(5)]
    assert sleep_calls == [20, 24, 30, 22]


async def test_xiaohongshu_creator_monitor_skips_when_safety_fuse_active(monkeypatch):
    tracker = XiaohongshuTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "web_session": "ws-token",
            "creator_push_enabled": True,
            "enable_keyword_search": False,
            "keyword_monitors": [],
            "keywords": [],
            "following_scan": {"enabled": False},
            "following_scan_monitors": [],
            "creator_monitors": [
                {"id": "monitor-risk", "user_id": "risk-user", "enabled": True, "per_user_limit": 1},
            ],
        },
    )
    monkeypatch.setattr("abo.default_modules.xiaohongshu.check_creator_allowed", lambda user_id: type("Decision", (), {"allowed": False, "reason": "全局风险冷却中", "cooldown_until": "2099-01-01T00:00:00Z"})())

    calls: list[str] = []

    async def fake_fetch_user_notes(user_id: str, cookie: str, limit: int, *, fallback_author: str = ""):
        calls.append(user_id)
        return [_item("item-risk", "note-risk", "风险用户笔记", "user_id")]

    async def fake_search_by_keywords(*args, **kwargs):
        return []

    monkeypatch.setattr(tracker, "_fetch_user_notes", fake_fetch_user_notes)
    monkeypatch.setattr(tracker, "_search_by_keywords", fake_search_by_keywords)

    items = await tracker.fetch(max_results=20)

    assert calls == []
    assert items == []
