from collections import Counter

from abo.creator_smart_groups import (
    assign_dynamic_smart_groups,
    build_shared_signal_entries,
    extract_signal_tokens,
    match_smart_groups_from_content_tags,
    merge_creator_profiles,
    sync_shared_creator_group_options,
)


def test_assign_dynamic_smart_groups_clusters_shared_signals():
    entries = [
        {"author_id": "x1", "display_name": "作者A", "signal_weights": Counter({"Obsidian": 3.0, "知识库": 2.0})},
        {"author_id": "x2", "display_name": "作者B", "signal_weights": Counter({"Obsidian": 2.5, "效率": 1.0})},
        {"author_id": "x3", "display_name": "作者C", "signal_weights": Counter({"相机": 3.0, "评测": 2.0})},
    ]

    options = assign_dynamic_smart_groups(entries)

    assert len(options) >= 2
    assert entries[0]["smart_group_value"] == entries[1]["smart_group_value"]
    assert entries[0]["smart_group_value"] != entries[2]["smart_group_value"]


def test_merge_creator_profiles_preserves_manual_override_and_merges_samples():
    existing = {
        "101": {
            "author": "旧作者",
            "author_id": "101",
            "manual_override": True,
            "smart_groups": ["smart-old"],
            "smart_group_labels": ["旧分组"],
            "sample_tags": ["旧标签"],
        }
    }
    incoming = {
        "101": {
            "author": "新作者",
            "author_id": "101",
            "smart_groups": ["smart-new"],
            "smart_group_labels": ["新分组"],
            "sample_tags": ["新标签"],
            "sample_albums": ["专辑A"],
        }
    }

    merged = merge_creator_profiles(
        existing,
        incoming,
        [{"value": "smart-old", "label": "旧分组"}, {"value": "smart-new", "label": "新分组"}],
    )

    assert merged["101"]["manual_override"] is True
    assert merged["101"]["smart_groups"] == ["smart-old"]
    assert merged["101"]["smart_group_labels"] == ["旧分组"]
    assert merged["101"]["sample_tags"] == ["旧标签", "新标签"]
    assert merged["101"]["sample_albums"] == ["专辑A"]


def test_sync_shared_creator_group_options_updates_both_modules():
    prefs = {
        "modules": {
            "bilibili-tracker": {
                "creator_group_options": [{"value": "smart-a", "label": "A组"}],
            },
            "xiaohongshu-tracker": {
                "creator_group_options": [{"value": "smart-b", "label": "B组"}],
            },
        }
    }

    shared = sync_shared_creator_group_options(
        prefs,
        [{"value": "smart-c", "label": "C组"}],
    )

    assert {item["value"] for item in shared} == {"smart-a", "smart-b", "smart-c"}
    assert prefs["modules"]["bilibili-tracker"]["creator_group_options"] == shared
    assert prefs["modules"]["xiaohongshu-tracker"]["creator_group_options"] == shared


def test_sync_shared_creator_group_options_can_replace_existing_snapshot():
    prefs = {
        "modules": {
            "bilibili-tracker": {
                "creator_group_options": [{"value": "smart-a", "label": "A组"}],
            },
            "xiaohongshu-tracker": {
                "creator_group_options": [{"value": "smart-b", "label": "B组"}],
            },
        },
        "shared_creator_grouping": {
            "group_options": [{"value": "smart-legacy", "label": "旧组"}],
        },
    }

    shared = sync_shared_creator_group_options(
        prefs,
        [{"value": "smart-c", "label": "C组"}],
        replace_existing=True,
    )

    assert [(item["value"], item["label"]) for item in shared] == [("smart-c", "C组")]
    assert prefs["modules"]["bilibili-tracker"]["creator_group_options"] == shared
    assert prefs["modules"]["xiaohongshu-tracker"]["creator_group_options"] == shared


def test_assign_dynamic_smart_groups_supports_external_signal_group_labels():
    entries = [
        {"author_id": "x1", "display_name": "作者A", "platform": "bilibili", "signal_weights": Counter({"Obsidian": 3.0, "知识库": 2.0})},
        {"author_id": "x2", "display_name": "作者B", "platform": "xiaohongshu", "signal_weights": Counter({"双链笔记": 2.5, "知识库": 1.0})},
        {"author_id": "x3", "display_name": "作者C", "platform": "bilibili", "signal_weights": Counter({"相机": 3.0, "评测": 2.0})},
    ]

    options = assign_dynamic_smart_groups(
        entries,
        signal_group_labels={
            "Obsidian": "知识管理 / Obsidian",
            "知识库": "知识管理 / Obsidian",
            "双链笔记": "知识管理 / Obsidian",
            "相机": "影像评测",
            "评测": "影像评测",
        },
    )

    option_map = {item["label"]: item for item in options}
    assert entries[0]["smart_group_value"] == entries[1]["smart_group_value"]
    assert option_map["知识管理 / Obsidian"]["source_signals"][:2] == ["Obsidian", "知识库"]
    assert "bilibili" in option_map["知识管理 / Obsidian"]["platforms"]
    assert "xiaohongshu" in option_map["知识管理 / Obsidian"]["platforms"]


def test_match_smart_groups_from_content_tags_uses_source_signals():
    values, labels = match_smart_groups_from_content_tags(
        ["Obsidian 插件", "知识管理"],
        [
            {
                "value": "smart-obsidian",
                "label": "知识管理 / Obsidian",
                "source_signals": ["Obsidian", "知识库", "双链笔记"],
            },
            {
                "value": "smart-camera",
                "label": "影像评测",
                "source_signals": ["相机", "镜头", "评测"],
            },
        ],
    )

    assert values == ["smart-obsidian"]
    assert labels == ["知识管理 / Obsidian"]


def test_match_smart_groups_from_content_tags_avoids_short_false_positive_substrings():
    values, labels = match_smart_groups_from_content_tags(
        ["健康知识科普"],
        [
            {
                "value": "smart-obsidian",
                "label": "知识管理 / Obsidian",
                "source_signals": ["知识", "知识库", "Obsidian"],
            }
        ],
    )

    assert values == []
    assert labels == []


def test_build_shared_signal_entries_summarizes_catalog():
    entries = build_shared_signal_entries(
        {
            "vault_signal_database": {
                "signals": [
                    {
                        "signal": "卡片笔记",
                        "count": 5,
                        "platforms": ["vault"],
                        "sample_titles": ["卡片笔记法"],
                    }
                ]
            },
            "group_options": [
                {"value": "smart-obsidian", "label": "知识管理 / Obsidian", "source_signals": ["Obsidian", "知识库"]},
            ],
            "signal_group_labels": {"双链笔记": "知识管理 / Obsidian", "卡片笔记": "知识管理 / Obsidian"},
            "creator_catalog": {
                "bili:1": {
                    "platform": "bilibili",
                    "author": "作者A",
                    "smart_group_labels": ["知识管理 / Obsidian"],
                    "raw_signals": ["Obsidian", "知识库"],
                },
                "xhs:user-a": {
                    "platform": "xiaohongshu",
                    "author": "作者B",
                    "smart_group_labels": ["知识管理 / Obsidian"],
                    "raw_signals": ["双链笔记"],
                },
            },
        }
    )

    entry_map = {item["signal"]: item for item in entries}
    assert entry_map["Obsidian"]["group_label"] == "知识管理 / Obsidian"
    assert "bilibili" in entry_map["Obsidian"]["platforms"]
    assert any(item["signal"] == "双链笔记" and item["group_label"] == "知识管理 / Obsidian" for item in entries)
    assert any(item["signal"] == "卡片笔记" and item["group_label"] == "知识管理 / Obsidian" for item in entries)


def test_build_shared_signal_entries_keeps_multiple_group_labels():
    entries = build_shared_signal_entries(
        {
            "signal_group_labels": {
                "Obsidian": ["知识管理 / Obsidian", "阅读 / 学习"],
            },
            "creator_catalog": {
                "bili:1": {
                    "platform": "bilibili",
                    "author": "作者A",
                    "smart_group_labels": ["知识管理 / Obsidian", "阅读 / 学习"],
                    "raw_signals": ["Obsidian"],
                },
            },
        }
    )

    entry_map = {item["signal"]: item for item in entries}
    assert entry_map["Obsidian"]["group_labels"] == ["知识管理 / Obsidian", "阅读 / 学习"]
    assert entry_map["Obsidian"]["group_label"] == "知识管理 / Obsidian · 阅读 / 学习"


def test_extract_signal_tokens_keeps_compact_keywords_and_filters_long_free_text():
    tokens = extract_signal_tokens(
        "和claude 深度聊完",
        "【闪客】一口气拆穿Skill/MCP/RAG/Agent/OpenClaw底层逻辑",
        "系统停摆常常只需要一个瞬间",
    )

    assert "claude" in [token.lower() for token in tokens]
    assert "MCP" in tokens
    assert "RAG" in tokens
    assert "Agent" in tokens
    assert "OpenClaw" in tokens
    assert "系统停摆常常只需要一个瞬间" not in tokens


def test_assign_dynamic_smart_groups_collapses_unmapped_singletons_into_pending_bucket():
    entries = [
        {"author_id": "x1", "display_name": "作者A", "signal_weights": Counter({"AI": 2.0, "大模型": 1.5})},
        {"author_id": "x2", "display_name": "作者B", "signal_weights": Counter({"AI": 2.0, "Agent": 1.5})},
        {"author_id": "x3", "display_name": "作者C", "signal_weights": Counter({"拍花": 1.4})},
        {"author_id": "x4", "display_name": "作者D", "signal_weights": Counter({"干杯": 1.3})},
        {"author_id": "x5", "display_name": "作者E", "signal_weights": Counter({"中式美学": 1.2})},
        {"author_id": "x6", "display_name": "作者F", "signal_weights": Counter({"RUC": 1.2})},
        {"author_id": "x7", "display_name": "作者G", "signal_weights": Counter({"旅游攻略": 1.2})},
        {"author_id": "x8", "display_name": "作者H", "signal_weights": Counter({"旅行": 1.1})},
        {"author_id": "x9", "display_name": "作者I", "signal_weights": Counter({"变美": 1.2})},
        {"author_id": "x10", "display_name": "作者J", "signal_weights": Counter({"护肤": 1.1})},
        {"author_id": "x11", "display_name": "作者K", "signal_weights": Counter({"人情世故": 1.0})},
        {"author_id": "x12", "display_name": "作者L", "signal_weights": Counter({"股市": 1.0})},
        {"author_id": "x13", "display_name": "作者M", "signal_weights": Counter({"播客": 1.0})},
    ]

    options = assign_dynamic_smart_groups(entries)

    label_map = {item["value"]: item["label"] for item in options}
    assert any(item["label"] == "待细化" for item in options)
    assert label_map[entries[2]["smart_group_value"]] == "待细化"
