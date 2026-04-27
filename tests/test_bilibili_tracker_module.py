import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from abo.default_modules.bilibili import BilibiliTracker
from abo.sdk.types import Item
from abo.tools.bilibili import BiliDynamic, BilibiliToolAPI, bilibili_filter_prefetched_dynamics


pytestmark = pytest.mark.anyio


def _item(item_id: str, raw: dict) -> Item:
    payload = {
        "title": "B站内容",
        "description": "测试描述",
        "url": "https://t.bilibili.com/123456",
        "up_uid": "1001",
        "up_name": "测试UP",
    }
    payload.update(raw)
    return Item(id=item_id, raw=payload)


async def test_bilibili_process_reuses_dynamic_save_path_for_follow_feed(monkeypatch):
    import abo.default_modules.bilibili as bili_module

    async def fake_agent_json(prompt: str, prefs: dict):
        return {"score": 7, "summary": "摘要", "tags": ["科研"], "category": "学术"}

    monkeypatch.setattr(bili_module, "agent_json", fake_agent_json)

    tracker = BilibiliTracker()
    cards = await tracker.process(
        [
            _item(
                "bili-dyn-1",
                {
                    "title": "科研周报",
                    "description": "最新研究进展",
                    "url": "https://www.bilibili.com/video/BV1xx411c7mD",
                    "bvid": "BV1xx411c7mD",
                    "dynamic_id": "9001",
                    "dynamic_type": "video",
                    "monitor_source": "followed",
                    "monitor_source_label": "真实关注",
                },
            )
        ],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].obsidian_path.startswith("bilibili/dynamic/")
    assert "SocialMedia/Bilibili" not in cards[0].obsidian_path


async def test_bilibili_process_reuses_dynamic_save_path_for_manual_up(monkeypatch):
    import abo.default_modules.bilibili as bili_module

    async def fake_agent_json(prompt: str, prefs: dict):
        return {"score": 7, "summary": "摘要", "tags": ["科研"], "category": "教程"}

    monkeypatch.setattr(bili_module, "agent_json", fake_agent_json)

    tracker = BilibiliTracker()
    cards = await tracker.process(
        [
            _item(
                "bili-up-1",
                {
                    "title": "论文精读",
                    "description": "专栏内容",
                    "url": "https://www.bilibili.com/read/cv12345",
                    "cvid": "12345",
                    "dynamic_type": "article",
                    "monitor_source": "manual-up",
                    "monitor_source_label": "手动UP池",
                },
            )
        ],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].obsidian_path.startswith("bilibili/dynamic/")
    assert "SocialMedia/Bilibili" not in cards[0].obsidian_path


async def test_bilibili_process_preserves_full_dynamic_preview_payload(monkeypatch):
    import abo.default_modules.bilibili as bili_module

    async def fake_agent_json(prompt: str, prefs: dict):
        return {"score": 8, "summary": "摘要", "tags": ["科研"], "category": "教程"}

    monkeypatch.setattr(bili_module, "agent_json", fake_agent_json)

    tracker = BilibiliTracker()
    cards = await tracker.process(
        [
            _item(
                "bili-dyn-preview",
                {
                    "title": "完整动态卡片",
                    "description": "这里是 feed 里需要完整复刻的 B 站动态正文。",
                    "url": "https://www.bilibili.com/opus/998877",
                    "bvid": "BV1preview",
                    "dynamic_id": "998877",
                    "dynamic_type": "image",
                    "pic": "https://img.example.com/cover.jpg",
                    "images": ["https://img.example.com/cover.jpg", "https://img.example.com/2.jpg"],
                    "tags": ["Obsidian", "知识管理"],
                    "matched_keywords": ["科研"],
                    "matched_tags": ["知识库"],
                    "monitor_label": "知识管理监控",
                    "monitor_subfolder": "每日关键词监控/知识管理监控",
                    "monitor_source": "daily-monitor",
                    "monitor_source_label": "知识管理监控",
                },
            )
        ],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].metadata["thumbnail"] == "https://img.example.com/cover.jpg"
    assert cards[0].metadata["images"] == ["https://img.example.com/cover.jpg", "https://img.example.com/2.jpg"]
    assert cards[0].metadata["tags"] == ["Obsidian", "知识管理"]
    assert cards[0].metadata["matched_keywords"] == ["科研"]
    assert cards[0].metadata["matched_tags"] == ["知识库"]
    assert cards[0].metadata["monitor_label"] == "知识管理监控"
    assert cards[0].metadata["monitor_subfolder"] == "每日关键词监控/知识管理监控"
    assert cards[0].metadata["monitor_source"] == "daily-monitor"
    assert cards[0].metadata["monitor_source_label"] == "知识管理监控"


def test_bilibili_keyword_filter_matches_tags_and_compact_text():
    api = BilibiliToolAPI.__new__(BilibiliToolAPI)
    dynamic = BiliDynamic(
        id="bili-dyn-keyword-match",
        dynamic_id="keyword-match-1",
        title="A I 工作流更新",
        content="这条动态主要在聊知识 管理 的整理方法。",
        author="测试UP",
        author_id="1001",
        url="https://t.bilibili.com/keyword-match-1",
        dynamic_type="text",
        tags=["Obsidian插件", "知识库"],
    )

    matched_keywords, matched_tags = api._resolve_match_metadata(
        dynamic,
        keywords=["AI", "Obsidian", "知识管理"],
        tag_filters=["知识", "插件"],
    )

    assert matched_keywords == ["AI", "Obsidian", "知识管理"]
    assert matched_tags == ["知识", "插件"]


def test_bilibili_prefetched_filter_uses_same_keyword_matching_logic():
    result = bilibili_filter_prefetched_dynamics(
        [
            {
                "id": "bili-dyn-prefetched-1",
                "dynamic_id": "prefetched-1",
                "title": "A I 工具更新",
                "content": "这里也写到了知识 管理 工作流。",
                "author": "测试UP",
                "url": "https://t.bilibili.com/prefetched-1",
                "published_at": datetime.now().isoformat(),
                "tags": ["Obsidian插件"],
            }
        ],
        keywords=["AI", "Obsidian", "知识管理"],
        tag_filters=["插件"],
        limit=10,
        days_back=30,
        monitor_label="测试监控",
    )

    assert result["total_found"] == 1
    assert result["dynamics"][0]["matched_keywords"] == ["AI", "Obsidian", "知识管理"]
    assert result["dynamics"][0]["matched_tags"] == ["插件"]


def test_bilibili_keep_limit_is_capped_to_200():
    api = BilibiliToolAPI.__new__(BilibiliToolAPI)
    assert api._normalize_keep_limit(9999) == 200
    assert api._normalize_keep_limit("250") == 200


async def test_bilibili_save_selected_dynamics_respects_monitor_subfolder(monkeypatch, tmp_path):
    import abo.tools.bilibili_crawler as crawler

    async def fake_enrich_video_notes(notes, *, client, cookie_header=""):
        return None

    monkeypatch.setattr(crawler, "_enrich_video_notes", fake_enrich_video_notes)

    result = await crawler.save_selected_dynamics_to_vault(
        [
            {
                "id": "bili-dyn-save-1",
                "dynamic_id": "665544",
                "title": "知识管理速记",
                "content": "应该跟随监控子目录保存，而不是落到默认路径。",
                "author": "测试UP",
                "author_id": "10086",
                "url": "https://www.bilibili.com/opus/665544",
                "published_at": "2026-04-27T08:30:00+08:00",
                "dynamic_type": "image",
                "images": ["https://img.example.com/1.jpg"],
                "tags": ["知识管理"],
                "matched_keywords": ["科研"],
                "matched_tags": ["Obsidian"],
                "monitor_label": "知识管理监控",
                "monitor_subfolder": "每日关键词监控/知识管理监控",
                "crawl_source": "daily-monitor",
                "crawl_source_label": "知识管理监控",
            }
        ],
        vault_path=tmp_path,
    )

    expected_dir = tmp_path / "bilibili" / "dynamic" / "每日关键词监控" / "知识管理监控"
    dynamic_files = [
        path for path in result["written_files"]
        if "Bilibili 爬取汇总.md" not in path
    ]

    assert result["output_dir"] == str(expected_dir)
    assert len(dynamic_files) == 1
    assert expected_dir == Path(dynamic_files[0]).parent


async def test_bilibili_fetch_skips_previously_seen_dynamics(monkeypatch, tmp_path):
    import abo.tools.bilibili as bilibili_tool

    tracker = BilibiliTracker()
    captured: dict[str, object] = {}
    prefs_path = tmp_path / ".abo" / "preferences.json"
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        json.dumps(
            {
                "modules": {
                    "bilibili-tracker": {
                        "follow_feed": True,
                        "sessdata": "sess-token",
                        "fetch_follow_limit": 5,
                        "keyword_filter": True,
                        "keywords": ["科研"],
                        "daily_dynamic_monitors": [
                            {
                                "id": "bili-dm-1",
                                "label": "科研监控",
                                "keywords": ["科研"],
                                "tag_filters": [],
                                "enabled": True,
                                "days_back": 30,
                                "limit": 8,
                                "page_limit": 6,
                            }
                        ],
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(tracker, "_load_seen", lambda: set())
    monkeypatch.setattr(tracker, "_save_seen", lambda seen: None)
    monkeypatch.setattr(tracker, "_get_history_store", lambda: object())
    monkeypatch.setattr(
        tracker,
        "_has_seen_dynamic",
        lambda _store, item: str(item.raw.get("dynamic_id") or "") == "9001",
    )
    async def fake_resolve_followed_uid_filters(**kwargs):
        return None

    monkeypatch.setattr(tracker, "_resolve_followed_uid_filters", fake_resolve_followed_uid_filters)

    async def fake_fetch_followed(**kwargs):
        captured["days_back"] = kwargs.get("days_back")
        captured["limit"] = kwargs.get("limit")
        captured["page_limit"] = kwargs.get("page_limit")
        captured["monitor_subfolder"] = kwargs.get("monitor_subfolder")
        return {
            "dynamics": [
                {
                    "id": "bili-dyn-9001",
                    "title": "旧内容",
                    "content": "已经抓过的动态",
                    "url": "https://t.bilibili.com/9001",
                    "dynamic_id": "9001",
                    "author": "测试UP",
                    "author_id": "1001",
                    "dynamic_type": "image",
                },
                {
                    "id": "bili-dyn-9002",
                    "title": "新内容",
                    "content": "新的动态",
                    "url": "https://t.bilibili.com/9002",
                    "dynamic_id": "9002",
                    "author": "测试UP",
                    "author_id": "1001",
                    "dynamic_type": "image",
                },
            ]
        }

    monkeypatch.setattr(bilibili_tool, "bilibili_fetch_followed", fake_fetch_followed)

    items = await tracker.fetch(max_results=5)

    assert captured["days_back"] == 30
    assert captured["limit"] == 8
    assert captured["page_limit"] == 6
    assert captured["monitor_subfolder"] == "每日关键词监控/科研监控/关键词/科研"
    assert [str(item.raw.get("dynamic_id")) for item in items] == ["9002"]


async def test_bilibili_fetch_reuses_global_cookie_and_defaults_follow_feed(monkeypatch, tmp_path):
    import abo.default_modules.bilibili as bili_module
    import abo.tools.bilibili as bilibili_tool

    tracker = BilibiliTracker()
    prefs_path = tmp_path / ".abo" / "preferences.json"
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        json.dumps(
            {
                "modules": {
                    "bilibili-tracker": {
                        "follow_feed": None,
                        "fetch_follow_limit": 3,
                        "daily_dynamic_monitors": [
                            {
                                "id": "bili-dm-1",
                                "label": "科普监控",
                                "keywords": ["科普"],
                                "tag_filters": [],
                                "enabled": True,
                                "days_back": 7,
                            }
                        ],
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(
        bili_module,
        "load_config",
        lambda: {"bilibili_cookie": '[{"name":"SESSDATA","value":"global-sess"}]'},
    )
    monkeypatch.setattr(tracker, "_load_seen", lambda: set())
    monkeypatch.setattr(tracker, "_save_seen", lambda seen: None)
    monkeypatch.setattr(tracker, "_get_history_store", lambda: None)

    async def fake_resolve_followed_uid_filters(**kwargs):
        return None

    monkeypatch.setattr(tracker, "_resolve_followed_uid_filters", fake_resolve_followed_uid_filters)

    captured: dict[str, object] = {}

    async def fake_fetch_followed(**kwargs):
        captured.update(kwargs)
        return {
            "dynamics": [
                {
                    "id": "bili-dyn-global-cookie",
                    "title": "科普新内容",
                    "content": "来自全局 Cookie 的已关注抓取",
                    "url": "https://t.bilibili.com/778899",
                    "dynamic_id": "778899",
                    "author": "测试UP",
                    "author_id": "1001",
                    "dynamic_type": "text",
                }
            ]
        }

    monkeypatch.setattr(bilibili_tool, "bilibili_fetch_followed", fake_fetch_followed)

    items = await tracker.fetch(max_results=5)

    assert captured["sessdata"] == "global-sess"
    assert [str(item.raw.get("dynamic_id")) for item in items] == ["778899"]


async def test_bilibili_fetch_separates_keyword_monitors_from_fixed_up_supervision(monkeypatch, tmp_path):
    import abo.tools.bilibili as bilibili_tool

    tracker = BilibiliTracker()
    captured_calls: list[dict[str, object]] = []
    captured_resolve_args: dict[str, object] = {}
    prefs_path = tmp_path / ".abo" / "preferences.json"
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        json.dumps(
            {
                "modules": {
                    "bilibili-tracker": {
                        "follow_feed": True,
                        "sessdata": "sess-token",
                        "fetch_follow_limit": 6,
                        "fixed_up_monitor_limit": 11,
                        "keyword_filter": True,
                        "days_back": 14,
                        "daily_dynamic_monitors": [
                            {
                                "id": "bili-dm-1",
                                "label": "科研监控",
                                "keywords": ["科研"],
                                "tag_filters": ["知识库"],
                                "enabled": True,
                                "days_back": 21,
                                "limit": 9,
                                "page_limit": 4,
                            }
                        ],
                        "up_uids": ["1001", "https://space.bilibili.com/1002"],
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(tracker, "_load_seen", lambda: set())
    monkeypatch.setattr(tracker, "_save_seen", lambda seen: None)
    monkeypatch.setattr(tracker, "_get_history_store", lambda: object())
    monkeypatch.setattr(tracker, "_has_seen_dynamic", lambda _store, _item: False)

    async def fake_resolve_followed_uid_filters(**kwargs):
        captured_resolve_args.update(kwargs)
        return None

    monkeypatch.setattr(tracker, "_resolve_followed_uid_filters", fake_resolve_followed_uid_filters)

    async def fake_fetch_followed(**kwargs):
        captured_calls.append(dict(kwargs))
        author_ids = kwargs.get("author_ids") or []
        if not author_ids:
            return {
                "dynamics": [
                    {
                        "id": "bili-dyn-keyword",
                        "title": "科研速报",
                        "content": "关键词监控命中",
                        "url": "https://t.bilibili.com/keyword",
                        "dynamic_id": "keyword-1",
                        "author": "分组UP",
                        "author_id": "group-author",
                        "dynamic_type": "text",
                        "crawl_source": "daily-monitor",
                        "crawl_source_label": "科研监控",
                    }
                ]
            }
        if author_ids == ["1001", "1002"]:
            return {
                "dynamics": [
                    {
                        "id": "bili-dyn-fixed",
                        "title": "固定监督更新",
                        "content": "固定UP监督命中",
                        "url": "https://t.bilibili.com/fixed",
                        "dynamic_id": "fixed-1",
                        "author": "固定UP",
                        "author_id": "1001",
                        "dynamic_type": "image",
                    }
                ]
            }
        raise AssertionError(f"unexpected bilibili_fetch_followed author_ids={author_ids}")

    monkeypatch.setattr(bilibili_tool, "bilibili_fetch_followed", fake_fetch_followed)

    items = await tracker.fetch(max_results=6)

    assert captured_resolve_args == {}
    assert len(captured_calls) == 2
    assert captured_calls[0]["author_ids"] is None
    assert captured_calls[0]["keywords"] == ["科研"]
    assert captured_calls[0]["tag_filters"] == ["知识库"]
    assert captured_calls[0]["limit"] == 9
    assert captured_calls[0]["page_limit"] == 4
    assert captured_calls[0]["monitor_subfolder"] == "每日关键词监控/科研监控/关键词/科研/标签/知识库"
    assert captured_calls[1]["author_ids"] == ["1001", "1002"]
    assert captured_calls[1]["keywords"] == []
    assert captured_calls[1]["tag_filters"] == []
    assert captured_calls[1]["limit"] == 11
    assert captured_calls[1]["monitor_subfolder"] == "每日监视UP/固定UP监督"

    assert [str(item.raw.get("dynamic_id") or "") for item in items] == ["keyword-1", "fixed-1"]
    assert items[0].raw["monitor_source"] == "daily-monitor"
    assert items[0].raw["monitor_source_label"] == "科研监控"
    assert items[1].raw["monitor_source"] == "manual-up"
    assert items[1].raw["monitor_source_label"] == "固定UP监督"
    assert items[1].raw["monitor_label"] == "固定UP监督"
    assert items[1].raw["monitor_subfolder"] == "每日监视UP/固定UP监督"


async def test_bilibili_fetch_reuses_monitor_limits_even_when_module_max_results_is_small(monkeypatch, tmp_path):
    import abo.tools.bilibili as bilibili_tool

    tracker = BilibiliTracker()
    captured_calls: list[dict[str, object]] = []
    prefs_path = tmp_path / ".abo" / "preferences.json"
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        json.dumps(
            {
                "modules": {
                    "bilibili-tracker": {
                        "follow_feed": True,
                        "sessdata": "sess-token",
                        "fetch_follow_limit": 20,
                        "keyword_filter": True,
                        "daily_dynamic_monitors": [
                            {
                                "id": "bili-dm-1",
                                "label": "科研监控",
                                "keywords": ["科研"],
                                "enabled": True,
                                "limit": 20,
                                "page_limit": 5,
                            }
                        ],
                        "up_uids": ["1001"],
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(tracker, "_load_seen", lambda: set())
    monkeypatch.setattr(tracker, "_save_seen", lambda seen: None)
    monkeypatch.setattr(tracker, "_get_history_store", lambda: object())
    monkeypatch.setattr(tracker, "_has_seen_dynamic", lambda _store, _item: False)

    async def fake_fetch_followed(**kwargs):
        captured_calls.append(dict(kwargs))
        author_ids = kwargs.get("author_ids") or []
        if author_ids:
            return {
                "dynamics": [
                    {
                        "id": "bili-dyn-fixed",
                        "title": "固定监督更新",
                        "content": "固定UP监督命中",
                        "url": "https://t.bilibili.com/fixed",
                        "dynamic_id": "fixed-1",
                        "author": "固定UP",
                        "author_id": "1001",
                        "dynamic_type": "image",
                    }
                ]
            }
        return {
            "dynamics": [
                {
                    "id": f"bili-dyn-keyword-{index}",
                    "title": f"科研速报 {index}",
                    "content": "关键词监控命中",
                    "url": f"https://t.bilibili.com/keyword-{index}",
                    "dynamic_id": f"keyword-{index}",
                    "author": "关键词UP",
                    "author_id": f"keyword-author-{index}",
                    "dynamic_type": "text",
                }
                for index in range(1, 6)
            ]
        }

    monkeypatch.setattr(bilibili_tool, "bilibili_fetch_followed", fake_fetch_followed)

    items = await tracker.fetch(max_results=2)

    assert len(captured_calls) == 2
    assert captured_calls[0]["limit"] == 20
    assert captured_calls[1]["limit"] == 20
    assert [str(item.raw.get("dynamic_id") or "") for item in items] == [
        "keyword-1",
        "keyword-2",
        "keyword-3",
        "keyword-4",
        "keyword-5",
        "fixed-1",
    ]
    assert items[-1].raw["monitor_source"] == "manual-up"
    assert items[-1].raw["monitor_source_label"] == "固定UP监督"


async def test_bilibili_fetch_batches_multiple_keyword_monitors_from_one_shared_followed_scan(monkeypatch, tmp_path):
    import abo.tools.bilibili as bilibili_tool

    tracker = BilibiliTracker()
    captured_calls: list[dict[str, object]] = []
    prefs_path = tmp_path / ".abo" / "preferences.json"
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        json.dumps(
            {
                "modules": {
                    "bilibili-tracker": {
                        "follow_feed": True,
                        "sessdata": "sess-token",
                        "fetch_follow_limit": 10,
                        "keyword_filter": True,
                        "daily_dynamic_monitors": [
                            {
                                "id": "bili-dm-1",
                                "label": "科研监控",
                                "keywords": ["科研"],
                                "tag_filters": [],
                                "enabled": True,
                                "days_back": 7,
                                "limit": 4,
                                "page_limit": 2,
                            },
                            {
                                "id": "bili-dm-2",
                                "label": "知识库监控",
                                "keywords": [],
                                "tag_filters": ["知识库"],
                                "enabled": True,
                                "days_back": 14,
                                "limit": 5,
                                "page_limit": 3,
                            },
                        ],
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(tracker, "_load_seen", lambda: set())
    monkeypatch.setattr(tracker, "_save_seen", lambda seen: None)
    monkeypatch.setattr(tracker, "_get_history_store", lambda: object())
    monkeypatch.setattr(tracker, "_has_seen_dynamic", lambda _store, _item: False)

    async def fake_fetch_followed(**kwargs):
        captured_calls.append(dict(kwargs))
        assert kwargs.get("keywords") == []
        assert kwargs.get("tag_filters") == []
        return {
            "dynamics": [
                {
                    "id": "bili-dyn-research",
                    "title": "科研速报",
                    "content": "这是一条关于科研进展的动态",
                    "url": "https://t.bilibili.com/research",
                    "dynamic_id": "research-1",
                    "author": "科研UP",
                    "author_id": "1001",
                    "dynamic_type": "text",
                    "tags": ["论文"],
                    "published_at": (datetime.now() - timedelta(hours=2)).isoformat(),
                },
                {
                    "id": "bili-dyn-obsidian",
                    "title": "知识管理更新",
                    "content": "Obsidian 与知识库工作流",
                    "url": "https://t.bilibili.com/obsidian",
                    "dynamic_id": "obsidian-1",
                    "author": "知识管理UP",
                    "author_id": "1002",
                    "dynamic_type": "image",
                    "tags": ["知识库"],
                    "published_at": (datetime.now() - timedelta(hours=1)).isoformat(),
                },
                {
                    "id": "bili-dyn-other",
                    "title": "日常更新",
                    "content": "普通动态",
                    "url": "https://t.bilibili.com/other",
                    "dynamic_id": "other-1",
                    "author": "普通UP",
                    "author_id": "1003",
                    "dynamic_type": "text",
                    "tags": ["生活"],
                    "published_at": (datetime.now() - timedelta(hours=3)).isoformat(),
                },
            ]
        }

    monkeypatch.setattr(bilibili_tool, "bilibili_fetch_followed", fake_fetch_followed)

    items = await tracker.fetch(max_results=10)

    assert len(captured_calls) == 1
    assert captured_calls[0]["days_back"] == 14
    assert captured_calls[0]["page_limit"] == 3
    assert captured_calls[0]["limit"] == 60
    assert captured_calls[0]["scan_cutoff_days"] == 7
    assert [str(item.raw.get("dynamic_id") or "") for item in items] == ["obsidian-1", "research-1"]
    assert items[0].raw["monitor_label"] == "知识库监控"
    assert items[0].raw["monitor_subfolder"] == "每日关键词监控/知识库监控/标签/知识库"
    assert items[0].raw["matched_tags"] == ["知识库"]
    assert items[1].raw["monitor_label"] == "科研监控"
    assert items[1].raw["monitor_subfolder"] == "每日关键词监控/科研监控/关键词/科研"
    assert items[1].raw["matched_keywords"] == ["科研"]


async def test_bilibili_fetch_runs_followed_group_monitors_as_independent_tasks(monkeypatch, tmp_path):
    import abo.tools.bilibili as bilibili_tool

    tracker = BilibiliTracker()
    captured_calls: list[dict[str, object]] = []
    captured_resolve_calls: list[dict[str, object]] = []
    prefs_path = tmp_path / ".abo" / "preferences.json"
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        json.dumps(
            {
                "modules": {
                    "bilibili-tracker": {
                        "follow_feed": True,
                        "sessdata": "sess-token",
                        "fetch_follow_limit": 12,
                        "followed_up_filter_mode": "smart_only",
                        "followed_up_group_monitors": [
                            {
                                "id": "bili-gm-1",
                                "group_value": "study",
                                "label": "学习区",
                                "enabled": True,
                                "days_back": 3,
                                "limit": 7,
                                "page_limit": 9,
                            }
                        ],
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(tracker, "_load_seen", lambda: set())
    monkeypatch.setattr(tracker, "_save_seen", lambda seen: None)
    monkeypatch.setattr(tracker, "_get_history_store", lambda: object())
    monkeypatch.setattr(tracker, "_has_seen_dynamic", lambda _store, _item: False)

    async def fake_resolve_followed_uid_filters(**kwargs):
        captured_resolve_calls.append(dict(kwargs))
        return {"author-2", "author-1"}

    monkeypatch.setattr(tracker, "_resolve_followed_uid_filters", fake_resolve_followed_uid_filters)

    async def fake_fetch_followed(**kwargs):
        captured_calls.append(dict(kwargs))
        return {
            "dynamics": [
                {
                    "id": "bili-dyn-group-1",
                    "title": "学习区新动态",
                    "content": "智能分组独立抓取",
                    "url": "https://t.bilibili.com/group-1",
                    "dynamic_id": "group-1",
                    "author": "学习UP",
                    "author_id": "author-1",
                    "dynamic_type": "text",
                }
            ]
        }

    monkeypatch.setattr(bilibili_tool, "bilibili_fetch_followed", fake_fetch_followed)

    items = await tracker.fetch(max_results=10)

    assert len(captured_resolve_calls) == 1
    assert captured_resolve_calls[0]["followed_up_groups"] == ["study"]
    assert captured_resolve_calls[0]["followed_up_filter_mode"] == "smart_only"
    assert len(captured_calls) == 1
    assert captured_calls[0]["author_ids"] == ["author-1", "author-2"]
    assert captured_calls[0]["keywords"] == []
    assert captured_calls[0]["tag_filters"] == []
    assert captured_calls[0]["days_back"] == 3
    assert captured_calls[0]["limit"] == 7
    assert captured_calls[0]["page_limit"] == 9
    assert captured_calls[0]["monitor_subfolder"] == "定向动态爬取/智能分组/学习区"
    assert [str(item.raw.get("dynamic_id")) for item in items] == ["group-1"]


async def test_bilibili_fetch_fixed_up_supervision_uses_dynamic_pipeline_without_follow_feed(monkeypatch, tmp_path):
    import abo.tools.bilibili as bilibili_tool

    tracker = BilibiliTracker()
    captured_calls: list[dict[str, object]] = []
    prefs_path = tmp_path / ".abo" / "preferences.json"
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        json.dumps(
            {
                "modules": {
                    "bilibili-tracker": {
                        "follow_feed": False,
                        "sessdata": "sess-token",
                        "fetch_follow_limit": 5,
                        "up_uids": ["10086"],
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(tracker, "_load_seen", lambda: set())
    monkeypatch.setattr(tracker, "_save_seen", lambda seen: None)
    monkeypatch.setattr(tracker, "_get_history_store", lambda: object())
    monkeypatch.setattr(tracker, "_has_seen_dynamic", lambda _store, _item: False)

    async def fail_resolve_followed_uid_filters(**kwargs):
        raise AssertionError("follow-feed group filters should not run when follow_feed is disabled")

    monkeypatch.setattr(tracker, "_resolve_followed_uid_filters", fail_resolve_followed_uid_filters)

    async def fake_fetch_followed(**kwargs):
        captured_calls.append(dict(kwargs))
        return {
            "dynamics": [
                {
                    "id": "bili-dyn-fixed-up-only",
                    "title": "固定监督动态",
                    "content": "即使关闭关注流，也应该复用动态抓取链路。",
                    "url": "https://t.bilibili.com/fixed-only",
                    "dynamic_id": "fixed-only-1",
                    "author": "固定UP",
                    "author_id": "10086",
                    "dynamic_type": "text",
                }
            ]
        }

    monkeypatch.setattr(bilibili_tool, "bilibili_fetch_followed", fake_fetch_followed)

    items = await tracker.fetch(max_results=5)

    assert len(captured_calls) == 1
    assert captured_calls[0]["author_ids"] == ["10086"]
    assert captured_calls[0]["keywords"] == []
    assert captured_calls[0]["monitor_subfolder"] == "每日监视UP/固定UP监督"
    assert len(items) == 1
    assert items[0].raw["dynamic_id"] == "fixed-only-1"
    assert items[0].raw["monitor_source"] == "manual-up"
    assert items[0].raw["monitor_source_label"] == "固定UP监督"


async def test_bilibili_targeted_fetch_uses_author_space_pages_and_keeps_scanning(monkeypatch):
    recent_time = datetime.now() - timedelta(hours=6)
    pages = {
        None: {
            "items": [{"id": "page-1-item", "type": "DYNAMIC_TYPE_AV"}],
            "offset": "page-2",
            "has_more": True,
        },
        "page-2": {
            "items": [{"id": "page-2-item", "type": "DYNAMIC_TYPE_WORD"}],
            "offset": "page-3",
            "has_more": False,
        },
    }
    parsed = {
        "page-1-item": BiliDynamic(
            id="bili-dyn-1",
            dynamic_id="dyn-1",
            title="第一页是视频",
            content="第一页动态类型不匹配",
            author="目标UP",
            author_id="target-author",
            url="https://t.bilibili.com/dyn-1",
            published_at=recent_time,
            dynamic_type="video",
        ),
        "page-2-item": BiliDynamic(
            id="bili-dyn-2",
            dynamic_id="dyn-2",
            title="目标动态",
            content="第二页才出现匹配类型",
            author="目标UP",
            author_id="target-author",
            url="https://t.bilibili.com/dyn-2",
            published_at=recent_time,
            dynamic_type="text",
        ),
    }

    api = BilibiliToolAPI(sessdata="fake-sessdata")
    fetch_calls: list[tuple[str, str | None]] = []

    async def fake_fetch_space_dynamic_page(author_id, offset=None):
        fetch_calls.append((author_id, offset))
        return pages[offset]

    async def fail_fetch_polymer_page(offset=None):
        raise AssertionError("targeted author fetch should not hit the global follow-feed API")

    monkeypatch.setattr(api, "_fetch_space_dynamic_page", fake_fetch_space_dynamic_page)
    monkeypatch.setattr(api, "_fetch_polymer_page", fail_fetch_polymer_page)
    monkeypatch.setattr(api, "_parse_space_dynamic_item", lambda item: parsed[item["id"]])

    try:
        result = await api.fetch_followed_dynamics(
            author_ids=["target-author"],
            dynamic_types=[4],
            limit=5,
            days_back=7,
        )
    finally:
        await api.close()

    assert fetch_calls == [("target-author", None), ("target-author", "page-2")]
    assert [item.dynamic_id for item in result] == ["dyn-2"]


async def test_bilibili_targeted_fetch_continues_until_matching_recent_page_for_sparse_authors(monkeypatch):
    recent_time = datetime.now() - timedelta(hours=12)
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    fetch_calls: list[tuple[str, str | None]] = []

    async def fake_fetch_space_dynamic_page(author_id, offset=None):
        fetch_calls.append((author_id, offset))
        page = 1 if offset is None else int(str(offset).split("-")[1])
        next_offset = f"page-{page + 1}"
        return {
            "items": [{"id": f"page-{page}-item", "type": "DYNAMIC_TYPE_AV" if page < 12 else "DYNAMIC_TYPE_WORD"}],
            "offset": next_offset,
            "has_more": page < 12,
        }

    def fake_parse_space_dynamic_item(item):
        page = int(str(item["id"]).split("-")[1])
        return BiliDynamic(
            id=f"bili-dyn-{page}",
            dynamic_id=f"dyn-{page}",
            title=f"第{page}页动态",
            content="稀疏目标作者测试",
            author="目标UP",
            author_id="target-author",
            url=f"https://t.bilibili.com/dyn-{page}",
            published_at=recent_time,
            dynamic_type="text" if page == 12 else "video",
        )

    async def fail_fetch_polymer_page(offset=None):
        raise AssertionError("targeted author fetch should not hit the global follow-feed API")

    monkeypatch.setattr(api, "_fetch_space_dynamic_page", fake_fetch_space_dynamic_page)
    monkeypatch.setattr(api, "_fetch_polymer_page", fail_fetch_polymer_page)
    monkeypatch.setattr(api, "_parse_space_dynamic_item", fake_parse_space_dynamic_item)

    try:
        result = await api.fetch_followed_dynamics(
            author_ids=["target-author"],
            dynamic_types=[4],
            limit=1,
            days_back=7,
        )
    finally:
        await api.close()

    assert len(fetch_calls) == 12
    assert [item.dynamic_id for item in result] == ["dyn-12"]


async def test_bilibili_global_fetch_stops_after_frontend_keep_limit(monkeypatch):
    recent_time = datetime.now() - timedelta(hours=2)
    pages = {
        None: {
            "items": [{"id": "page-1-item", "type": "DYNAMIC_TYPE_WORD"}],
            "offset": "page-2",
            "has_more": True,
        },
        "page-2": {
            "items": [{"id": "page-2-item", "type": "DYNAMIC_TYPE_WORD"}],
            "offset": "page-3",
            "has_more": False,
        },
    }
    parsed = {
        "page-1-item": BiliDynamic(
            id="bili-dyn-1",
            dynamic_id="dyn-1",
            title="第一页动态",
            content="第一页内容",
            author="UP-1",
            author_id="1001",
            url="https://t.bilibili.com/dyn-1",
            published_at=recent_time,
            dynamic_type="text",
        ),
        "page-2-item": BiliDynamic(
            id="bili-dyn-2",
            dynamic_id="dyn-2",
            title="第二页动态",
            content="第二页内容",
            author="UP-2",
            author_id="1002",
            url="https://t.bilibili.com/dyn-2",
            published_at=recent_time - timedelta(hours=1),
            dynamic_type="text",
        ),
    }

    api = BilibiliToolAPI(sessdata="fake-sessdata")
    fetch_offsets: list[str | None] = []

    async def fake_fetch_polymer_page(offset=None):
        fetch_offsets.append(offset)
        return pages[offset]

    monkeypatch.setattr(api, "_fetch_polymer_page", fake_fetch_polymer_page)
    monkeypatch.setattr(api, "_parse_polymer_item", lambda item: parsed[item["id"]])

    try:
        result = await api.fetch_followed_dynamics(
            dynamic_types=[4],
            limit=1,
            days_back=30,
        )
    finally:
        await api.close()

    assert fetch_offsets == [None]
    assert [item.dynamic_id for item in result] == ["dyn-1"]
    assert api._last_fetch_stats["pages_scanned"] == 1
    assert api._last_fetch_stats["matched_count_before_keep"] == 1
    assert api._last_fetch_stats["kept_count"] == 1


async def test_bilibili_global_fetch_respects_explicit_page_limit(monkeypatch):
    recent_time = datetime.now() - timedelta(hours=2)
    pages = {
        None: {
            "items": [{"id": "page-1-item", "type": "DYNAMIC_TYPE_WORD"}],
            "offset": "page-2",
            "has_more": True,
        },
        "page-2": {
            "items": [{"id": "page-2-item", "type": "DYNAMIC_TYPE_WORD"}],
            "offset": "page-3",
            "has_more": True,
        },
        "page-3": {
            "items": [{"id": "page-3-item", "type": "DYNAMIC_TYPE_WORD"}],
            "offset": "page-4",
            "has_more": False,
        },
    }
    parsed = {
        "page-1-item": BiliDynamic(
            id="bili-dyn-1",
            dynamic_id="dyn-1",
            title="第一页动态",
            content="第一页内容",
            author="UP-1",
            author_id="1001",
            url="https://t.bilibili.com/dyn-1",
            published_at=recent_time,
            dynamic_type="text",
        ),
        "page-2-item": BiliDynamic(
            id="bili-dyn-2",
            dynamic_id="dyn-2",
            title="第二页动态",
            content="第二页内容",
            author="UP-2",
            author_id="1002",
            url="https://t.bilibili.com/dyn-2",
            published_at=recent_time,
            dynamic_type="text",
        ),
        "page-3-item": BiliDynamic(
            id="bili-dyn-3",
            dynamic_id="dyn-3",
            title="第三页动态",
            content="第三页内容",
            author="UP-3",
            author_id="1003",
            url="https://t.bilibili.com/dyn-3",
            published_at=recent_time,
            dynamic_type="text",
        ),
    }

    api = BilibiliToolAPI(sessdata="fake-sessdata")
    fetch_offsets: list[str | None] = []

    async def fake_fetch_polymer_page(offset=None):
        fetch_offsets.append(offset)
        return pages[offset]

    monkeypatch.setattr(api, "_fetch_polymer_page", fake_fetch_polymer_page)
    monkeypatch.setattr(api, "_parse_polymer_item", lambda item: parsed[item["id"]])

    try:
        result = await api.fetch_followed_dynamics(
            dynamic_types=[4],
            limit=5,
            days_back=30,
            page_limit=2,
        )
    finally:
        await api.close()

    assert fetch_offsets == [None, "page-2"]
    assert [item.dynamic_id for item in result] == ["dyn-1", "dyn-2"]


async def test_bilibili_global_fetch_returns_partial_results_when_later_page_fails(monkeypatch):
    recent_time = datetime.now() - timedelta(hours=2)
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    fetch_offsets: list[str | None] = []

    async def fake_fetch_polymer_page(offset=None):
        fetch_offsets.append(offset)
        if offset is None:
            return {
                "items": [{"id": "page-1-item", "type": "DYNAMIC_TYPE_WORD"}],
                "offset": "page-2",
                "has_more": True,
            }
        raise ValueError("HTTP 412")

    parsed = {
        "page-1-item": BiliDynamic(
            id="bili-dyn-1",
            dynamic_id="dyn-1",
            title="第一页动态",
            content="第一页内容",
            author="UP-1",
            author_id="1001",
            url="https://t.bilibili.com/dyn-1",
            published_at=recent_time,
            dynamic_type="text",
        ),
    }

    monkeypatch.setattr(api, "_fetch_polymer_page", fake_fetch_polymer_page)
    monkeypatch.setattr(api, "_parse_polymer_item", lambda item: parsed[item["id"]])

    try:
        result = await api.fetch_followed_dynamics(
            dynamic_types=[4],
            limit=50,
            days_back=30,
        )
    finally:
        await api.close()

    assert fetch_offsets == [None, "page-2"]
    assert [item.dynamic_id for item in result] == ["dyn-1"]
    assert api._last_fetch_stats["partial_results"] is True


async def test_bilibili_global_keyword_fetch_respects_requested_days_back(monkeypatch):
    recent_time = datetime.now() - timedelta(hours=2)
    old_time = datetime.now() - timedelta(days=8)
    pages = {
        None: {
            "items": [{"id": "page-1-item", "type": "DYNAMIC_TYPE_WORD"}],
            "offset": "page-2",
            "has_more": True,
        },
        "page-2": {
            "items": [{"id": "page-2-item", "type": "DYNAMIC_TYPE_WORD"}],
            "offset": "page-3",
            "has_more": True,
        },
        "page-3": {
            "items": [{"id": "page-3-item", "type": "DYNAMIC_TYPE_WORD"}],
            "offset": "page-4",
            "has_more": False,
        },
    }
    parsed = {
        "page-1-item": BiliDynamic(
            id="bili-dyn-1",
            dynamic_id="dyn-1",
            title="科研第一页",
            content="科研动态",
            author="UP-1",
            author_id="1001",
            url="https://t.bilibili.com/dyn-1",
            published_at=recent_time,
            dynamic_type="text",
        ),
        "page-2-item": BiliDynamic(
            id="bili-dyn-2",
            dynamic_id="dyn-2",
            title="科研第八天",
            content="科研动态",
            author="UP-2",
            author_id="1002",
            url="https://t.bilibili.com/dyn-2",
            published_at=old_time,
            dynamic_type="text",
        ),
        "page-3-item": BiliDynamic(
            id="bili-dyn-3",
            dynamic_id="dyn-3",
            title="不该继续翻到这里",
            content="科研动态",
            author="UP-3",
            author_id="1003",
            url="https://t.bilibili.com/dyn-3",
            published_at=old_time - timedelta(hours=1),
            dynamic_type="text",
        ),
    }

    api = BilibiliToolAPI(sessdata="fake-sessdata")
    fetch_offsets: list[str | None] = []

    async def fake_fetch_polymer_page(offset=None):
        fetch_offsets.append(offset)
        return pages[offset]

    monkeypatch.setattr(api, "_fetch_polymer_page", fake_fetch_polymer_page)
    monkeypatch.setattr(api, "_parse_polymer_item", lambda item: parsed[item["id"]])

    try:
        result = await api.fetch_followed_dynamics(
            dynamic_types=[4],
            keywords=["科研"],
            limit=10,
            days_back=30,
        )
    finally:
        await api.close()

    assert fetch_offsets == [None, "page-2", "page-3"]
    assert [item.dynamic_id for item in result] == ["dyn-1", "dyn-2", "dyn-3"]
    assert api._last_fetch_stats["pages_scanned"] == 3
    assert api._last_fetch_stats["scan_days_back"] == 30


async def test_bilibili_parse_space_forward_keeps_selected_author_and_original_type():
    api = BilibiliToolAPI(sessdata="fake-sessdata")

    try:
        dynamic = api._parse_space_dynamic_item(
            {
                "id_str": "top-forward-1",
                "type": "DYNAMIC_TYPE_FORWARD",
                "visible": True,
                "modules": [
                    {
                        "module_type": "MODULE_TYPE_AUTHOR",
                        "module_author": {
                            "pub_ts": 1714200000,
                            "more": {
                                "three_point_items": [
                                    {
                                        "type": "THREE_POINT_COPY",
                                        "params": {"link": "https://t.bilibili.com/top-forward-1?share_source=pc_native"},
                                    }
                                ]
                            },
                            "user": {"mid": "target-author", "name": "目标UP"},
                        },
                    },
                    {
                        "module_type": "MODULE_TYPE_DESC",
                        "module_desc": {"text": "这是转发评语 #测试标签#"},
                    },
                    {
                        "module_type": "MODULE_TYPE_DYNAMIC",
                        "module_dynamic": {
                            "type": "MDL_DYN_TYPE_FORWARD",
                            "dyn_forward": {
                                "item": {
                                    "id_str": "orig-video-1",
                                    "type": "DYNAMIC_TYPE_AV",
                                    "visible": True,
                                    "modules": [
                                        {
                                            "module_type": "MODULE_TYPE_AUTHOR",
                                            "module_author": {
                                                "pub_ts": 1714190000,
                                                "user": {"mid": "orig-author", "name": "原作者"},
                                            },
                                        },
                                        {
                                            "module_type": "MODULE_TYPE_DYNAMIC",
                                            "module_dynamic": {
                                                "type": "MDL_DYN_TYPE_ARCHIVE",
                                                "dyn_archive": {
                                                    "title": "原视频标题",
                                                    "desc": "原视频简介",
                                                    "bvid": "BV1xx411c7mD",
                                                    "cover": "http://i0.hdslb.com/bfs/archive/test.jpg",
                                                },
                                            },
                                        },
                                    ],
                                }
                            },
                        },
                    },
                ],
            }
        )
    finally:
        await api.close()

    assert dynamic is not None
    assert dynamic.dynamic_id == "top-forward-1"
    assert dynamic.author_id == "target-author"
    assert dynamic.author == "目标UP"
    assert dynamic.dynamic_type == "video"
    assert dynamic.bvid == "BV1xx411c7mD"
    assert dynamic.url == "https://t.bilibili.com/top-forward-1"
    assert "这是转发评语" in dynamic.content
    assert "原视频简介" in dynamic.content
    assert "测试标签" in dynamic.tags


async def test_bilibili_parse_space_video_uses_dynamic_detail_link():
    api = BilibiliToolAPI(sessdata="fake-sessdata")

    try:
        dynamic = api._parse_space_dynamic_item(
            {
                "id_str": "space-video-1",
                "type": "DYNAMIC_TYPE_AV",
                "visible": True,
                "modules": [
                    {
                        "module_type": "MODULE_TYPE_AUTHOR",
                        "module_author": {
                            "pub_ts": 1714200000,
                            "more": {
                                "three_point_items": [
                                    {
                                        "type": "THREE_POINT_COPY",
                                        "params": {"link": "https://t.bilibili.com/space-video-1?share_source=pc_native"},
                                    }
                                ]
                            },
                            "user": {"mid": "target-author", "name": "目标UP"},
                        },
                    },
                    {
                        "module_type": "MODULE_TYPE_DYNAMIC",
                        "module_dynamic": {
                            "type": "MDL_DYN_TYPE_ARCHIVE",
                            "dyn_archive": {
                                "title": "动态视频标题",
                                "desc": "动态视频简介",
                                "bvid": "BV1xx411c7mD",
                                "jump_url": "https://www.bilibili.com/video/BV1xx411c7mD",
                                "cover": "http://i0.hdslb.com/bfs/archive/test.jpg",
                            },
                        },
                    },
                ],
            }
        )
    finally:
        await api.close()

    assert dynamic is not None
    assert dynamic.dynamic_type == "video"
    assert dynamic.bvid == "BV1xx411c7mD"
    assert dynamic.url == "https://t.bilibili.com/space-video-1"


async def test_bilibili_targeted_single_author_stops_after_frontend_keep_limit(monkeypatch):
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    captured: dict[str, int] = {}
    recent_time = datetime.now() - timedelta(hours=1)

    async def fake_fetch_space_author_dynamics(
        author_id,
        *,
        allowed_dynamic_types,
        keywords,
        tag_filters,
        scan_result_limit,
        stop_result_limit,
        days_back,
        page_limit,
        scan_cutoff_days,
    ):
        captured["scan_result_limit"] = scan_result_limit
        captured["stop_result_limit"] = stop_result_limit
        captured["page_limit"] = page_limit
        return [
            BiliDynamic(
                id=f"bili-dyn-{index}",
                dynamic_id=f"dyn-{index}",
                title=f"动态{index}",
                content="测试",
                author="目标UP",
                author_id=author_id,
                url=f"https://t.bilibili.com/dyn-{index}",
                published_at=recent_time - timedelta(minutes=index),
                dynamic_type="text",
            )
            for index in range(12)
        ]

    monkeypatch.setattr(api, "_fetch_space_author_dynamics", fake_fetch_space_author_dynamics)

    try:
        result = await api.fetch_followed_dynamics(
            author_ids=["target-author"],
            dynamic_types=[4],
            limit=5,
            days_back=30,
        )
    finally:
        await api.close()

    assert captured["scan_result_limit"] >= 36
    assert captured["stop_result_limit"] == 5
    assert captured["page_limit"] is None
    assert len(result) == 5
    assert [item.dynamic_id for item in result] == ["dyn-0", "dyn-1", "dyn-2", "dyn-3", "dyn-4"]


async def test_bilibili_targeted_author_stops_after_keep_limit_when_recent_pages_keep_matching(monkeypatch):
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    recent_ts = int((datetime.now() - timedelta(hours=1)).timestamp())
    requested_offsets: list[str | None] = []

    async def fake_fetch_space_dynamic_page(author_id: str, offset: str | None = None):
        requested_offsets.append(offset)
        page_no = len(requested_offsets)
        return {
            "items": [
                {
                    "id_str": f"dyn-{page_no}",
                    "type": "DYNAMIC_TYPE_WORD",
                    "modules": {
                        "module_author": {
                            "pub_ts": recent_ts,
                            "user": {"name": "目标UP", "mid": author_id},
                        },
                        "module_desc": {
                            "text": f"第 {page_no} 页动态",
                        },
                        "module_dynamic": {
                            "type": "MDL_DYN_TYPE_WORD",
                        },
                    },
                }
            ],
            "offset": f"page-{page_no}",
            "has_more": True,
        }

    monkeypatch.setattr(api, "_fetch_space_dynamic_page", fake_fetch_space_dynamic_page)

    try:
        result = await api._fetch_space_author_dynamics(
            "target-author",
            allowed_dynamic_types={"text"},
            keywords=None,
            tag_filters=None,
            scan_result_limit=36,
            stop_result_limit=3,
            days_back=30,
        )
    finally:
        await api.close()

    assert requested_offsets == [None, "page-1", "page-2"]
    assert api._space_fetch_stats_cache["target-author"]["pages_scanned"] == 3
    assert [item.dynamic_id for item in result] == ["dyn-1", "dyn-2", "dyn-3"]


async def test_bilibili_global_fetch_scans_beyond_legacy_default_page_budget(monkeypatch):
    recent_time = datetime.now() - timedelta(hours=2)
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    fetch_offsets: list[str | None] = []

    pages: dict[str | None, dict] = {}
    parsed: dict[str, BiliDynamic] = {}
    for page_no in range(1, 21):
        offset = None if page_no == 1 else f"page-{page_no}"
        next_offset = f"page-{page_no + 1}"
        item_id = f"page-{page_no}-item"
        pages[offset] = {
            "items": [{"id": item_id, "type": "DYNAMIC_TYPE_WORD"}],
            "offset": next_offset,
            "has_more": page_no < 20,
        }
        parsed[item_id] = BiliDynamic(
            id=f"bili-dyn-{page_no}",
            dynamic_id=f"dyn-{page_no}",
            title=f"第{page_no}页动态",
            content="终于命中了目标关键词" if page_no == 20 else "全关注流深翻页测试",
            author="目标UP",
            author_id="target-author",
            url=f"https://t.bilibili.com/dyn-{page_no}",
            published_at=recent_time,
            dynamic_type="text",
        )

    async def fake_fetch_polymer_page(offset=None):
        fetch_offsets.append(offset)
        return pages[offset]

    monkeypatch.setattr(api, "_fetch_polymer_page", fake_fetch_polymer_page)
    monkeypatch.setattr(api, "_parse_polymer_item", lambda item: parsed[item["id"]])

    try:
        result = await api.fetch_followed_dynamics(
            dynamic_types=[4],
            keywords=["目标关键词"],
            limit=1,
            days_back=7,
        )
    finally:
        await api.close()

    assert len(fetch_offsets) == 20
    assert [item.dynamic_id for item in result] == ["dyn-20"]


async def test_bilibili_targeted_author_respects_explicit_page_limit(monkeypatch):
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    recent_ts = int((datetime.now() - timedelta(hours=1)).timestamp())
    requested_offsets: list[str | None] = []

    async def fake_fetch_space_dynamic_page(author_id: str, offset: str | None = None):
        requested_offsets.append(offset)
        page_no = len(requested_offsets)
        return {
            "items": [
                {
                    "id_str": f"dyn-{page_no}",
                    "type": "DYNAMIC_TYPE_WORD",
                    "modules": {
                        "module_author": {
                            "pub_ts": recent_ts,
                            "user": {"name": "目标UP", "mid": author_id},
                        },
                        "module_desc": {
                            "text": f"第 {page_no} 页动态",
                        },
                        "module_dynamic": {
                            "type": "MDL_DYN_TYPE_WORD",
                        },
                    },
                }
            ],
            "offset": f"page-{page_no}",
            "has_more": True,
        }

    monkeypatch.setattr(api, "_fetch_space_dynamic_page", fake_fetch_space_dynamic_page)

    try:
        result = await api._fetch_space_author_dynamics(
            "target-author",
            allowed_dynamic_types={"text"},
            keywords=None,
            tag_filters=None,
            scan_result_limit=36,
            stop_result_limit=10,
            days_back=30,
            page_limit=2,
        )
    finally:
        await api.close()

    assert requested_offsets == [None, "page-1"]
    assert api._space_fetch_stats_cache["target-author"]["pages_scanned"] == 2
    assert [item.dynamic_id for item in result] == ["dyn-1", "dyn-2"]


async def test_bilibili_targeted_keyword_fetch_respects_requested_days_back(monkeypatch):
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    recent_ts = int((datetime.now() - timedelta(hours=1)).timestamp())
    old_ts = int((datetime.now() - timedelta(days=8)).timestamp())
    requested_offsets: list[str | None] = []

    async def fake_fetch_space_dynamic_page(author_id: str, offset: str | None = None):
        requested_offsets.append(offset)
        if offset is None:
            return {
                "items": [
                    {
                        "id_str": "dyn-1",
                        "type": "DYNAMIC_TYPE_WORD",
                        "modules": {
                            "module_author": {
                                "pub_ts": recent_ts,
                                "user": {"name": "目标UP", "mid": author_id},
                            },
                            "module_desc": {"text": "最近一周内的科研动态"},
                            "module_dynamic": {"type": "MDL_DYN_TYPE_WORD"},
                        },
                    }
                ],
                "offset": "page-1",
                "has_more": True,
            }
        if offset == "page-1":
            return {
                "items": [
                    {
                        "id_str": "dyn-2",
                        "type": "DYNAMIC_TYPE_WORD",
                        "modules": {
                            "module_author": {
                                "pub_ts": old_ts,
                                "user": {"name": "目标UP", "mid": author_id},
                            },
                            "module_desc": {"text": "已经超过一周的科研动态"},
                            "module_dynamic": {"type": "MDL_DYN_TYPE_WORD"},
                        },
                    }
                ],
                "offset": "page-2",
                "has_more": True,
            }
        return {
            "items": [
                {
                    "id_str": "dyn-3",
                    "type": "DYNAMIC_TYPE_WORD",
                    "modules": {
                        "module_author": {
                            "pub_ts": old_ts,
                            "user": {"name": "目标UP", "mid": author_id},
                        },
                        "module_desc": {"text": "不该再翻到这里"},
                        "module_dynamic": {"type": "MDL_DYN_TYPE_WORD"},
                    },
                }
            ],
            "offset": "page-3",
            "has_more": False,
        }

    monkeypatch.setattr(api, "_fetch_space_dynamic_page", fake_fetch_space_dynamic_page)

    try:
        result = await api._fetch_space_author_dynamics(
            "target-author",
            allowed_dynamic_types={"text"},
            keywords=["科研"],
            tag_filters=None,
            scan_result_limit=36,
            stop_result_limit=10,
            days_back=30,
        )
    finally:
        await api.close()

    assert requested_offsets == [None, "page-1", "page-2"]
    assert [item.dynamic_id for item in result] == ["dyn-1", "dyn-2"]
    assert api._space_fetch_stats_cache["target-author"]["pages_scanned"] == 3
    assert api._space_fetch_stats_cache["target-author"]["scan_days_back"] == 30


async def test_bilibili_targeted_author_returns_partial_results_when_later_page_fails(monkeypatch):
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    recent_ts = int((datetime.now() - timedelta(hours=1)).timestamp())
    requested_offsets: list[str | None] = []

    async def fake_fetch_space_dynamic_page(author_id: str, offset: str | None = None):
        requested_offsets.append(offset)
        if offset is None:
            return {
                "items": [
                    {
                        "id_str": "dyn-1",
                        "type": "DYNAMIC_TYPE_WORD",
                        "modules": {
                            "module_author": {
                                "pub_ts": recent_ts,
                                "user": {"name": "目标UP", "mid": author_id},
                            },
                            "module_desc": {"text": "第一页动态"},
                            "module_dynamic": {"type": "MDL_DYN_TYPE_WORD"},
                        },
                    }
                ],
                "offset": "page-1",
                "has_more": True,
            }
        raise ValueError("HTTP 412")

    monkeypatch.setattr(api, "_fetch_space_dynamic_page", fake_fetch_space_dynamic_page)

    try:
        result = await api._fetch_space_author_dynamics(
            "target-author",
            allowed_dynamic_types={"text"},
            keywords=None,
            tag_filters=None,
            scan_result_limit=50,
            stop_result_limit=50,
            days_back=30,
        )
    finally:
        await api.close()

    assert requested_offsets == [None, "page-1"]
    assert [item.dynamic_id for item in result] == ["dyn-1"]
    assert api._space_fetch_stats_cache["target-author"]["partial_results"] is True


async def test_bilibili_targeted_group_limit_is_final_keep_count(monkeypatch):
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    recent_time = datetime.now() - timedelta(hours=1)
    captured_scan_limits: list[tuple[str, int]] = []

    async def fake_fetch_space_author_dynamics(
        author_id,
        *,
        allowed_dynamic_types,
        keywords,
        tag_filters,
        scan_result_limit,
        stop_result_limit,
        days_back,
        page_limit,
        scan_cutoff_days,
    ):
        captured_scan_limits.append((author_id, scan_result_limit))
        author_rank = int(str(author_id).replace("author-", ""))
        return [
            BiliDynamic(
                id=f"bili-dyn-{author_id}-{index}",
                dynamic_id=f"dyn-{author_id}-{index}",
                title=f"{author_id}-{index}",
                content="分组测试",
                author=f"UP-{author_rank}",
                author_id=author_id,
                url=f"https://t.bilibili.com/{author_id}-{index}",
                published_at=recent_time + timedelta(minutes=author_rank * 10 - index),
                dynamic_type="text",
            )
            for index in range(3)
        ]

    monkeypatch.setattr(api, "_fetch_space_author_dynamics", fake_fetch_space_author_dynamics)

    try:
        result = await api.fetch_followed_dynamics(
            author_ids=["author-1", "author-2", "author-3", "author-4"],
            dynamic_types=[4],
            limit=2,
            days_back=7,
        )
    finally:
        await api.close()

    assert all(scan_limit >= 36 for _, scan_limit in captured_scan_limits)
    assert len(result) == 2
    assert [item.dynamic_id for item in result] == ["dyn-author-4-0", "dyn-author-3-0"]


async def test_bilibili_targeted_group_round_robins_authors_before_final_keep(monkeypatch):
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    recent_time = datetime.now()

    async def fake_fetch_space_author_dynamics(
        author_id,
        *,
        allowed_dynamic_types,
        keywords,
        tag_filters,
        scan_result_limit,
        stop_result_limit,
        days_back,
        page_limit,
        scan_cutoff_days,
    ):
        if author_id == "hot-author":
            return [
                BiliDynamic(
                    id=f"hot-{index}",
                    dynamic_id=f"hot-{index}",
                    title=f"hot-{index}",
                    content="热门作者",
                    author="Hot",
                    author_id=author_id,
                    url=f"https://t.bilibili.com/hot-{index}",
                    published_at=recent_time - timedelta(minutes=index),
                    dynamic_type="text",
                )
                for index in range(6)
            ]
        return [
            BiliDynamic(
                id="cold-0",
                dynamic_id="cold-0",
                title="cold-0",
                content="冷门作者",
                author="Cold",
                author_id=author_id,
                url="https://t.bilibili.com/cold-0",
                published_at=recent_time - timedelta(days=3),
                dynamic_type="text",
            )
        ]

    monkeypatch.setattr(api, "_fetch_space_author_dynamics", fake_fetch_space_author_dynamics)

    try:
        result = await api.fetch_followed_dynamics(
            author_ids=["hot-author", "cold-author"],
            dynamic_types=[4],
            limit=3,
            days_back=30,
        )
    finally:
        await api.close()

    assert len(result) == 3
    assert "cold-0" in [item.dynamic_id for item in result]


async def test_bilibili_targeted_group_stops_followup_pages_after_global_keep_limit(monkeypatch):
    api = BilibiliToolAPI(sessdata="fake-sessdata")
    recent_ts = int((datetime.now() - timedelta(hours=1)).timestamp())
    requested_pages: list[tuple[str, str | None]] = []

    async def fake_fetch_space_dynamic_page(author_id: str, offset: str | None = None):
        requested_pages.append((author_id, offset))
        if offset is None:
            return {
                "items": [
                    {
                        "id_str": f"{author_id}-dyn-1",
                        "type": "DYNAMIC_TYPE_WORD",
                        "modules": {
                            "module_author": {
                                "pub_ts": recent_ts,
                                "user": {"name": author_id, "mid": author_id},
                            },
                            "module_desc": {"text": f"{author_id} 的第一页"},
                            "module_dynamic": {"type": "MDL_DYN_TYPE_WORD"},
                        },
                    }
                ],
                "offset": "page-1",
                "has_more": True,
            }
        return {
            "items": [
                {
                    "id_str": f"{author_id}-dyn-2",
                    "type": "DYNAMIC_TYPE_WORD",
                    "modules": {
                        "module_author": {
                            "pub_ts": recent_ts,
                            "user": {"name": author_id, "mid": author_id},
                        },
                        "module_desc": {"text": f"{author_id} 的第二页"},
                        "module_dynamic": {"type": "MDL_DYN_TYPE_WORD"},
                    },
                }
            ],
            "offset": "page-2",
            "has_more": False,
        }

    monkeypatch.setattr(api, "_fetch_space_dynamic_page", fake_fetch_space_dynamic_page)

    try:
        result = await api.fetch_followed_dynamics(
            author_ids=["author-a", "author-b", "author-c"],
            dynamic_types=[4],
            limit=2,
            days_back=7,
        )
    finally:
        await api.close()

    assert len(result) == 2
    assert all(offset is None for _, offset in requested_pages)
