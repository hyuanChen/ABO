import json
from pathlib import Path

import pytest

from abo.routes import tools as tools_routes


pytestmark = pytest.mark.anyio


def test_normalize_generated_group_label_aliases_and_drops_placeholders():
    assert tools_routes._normalize_generated_group_label("读研 / 读博") == "研究生 / 博士"
    assert tools_routes._normalize_generated_group_label("留学 / 博士申请") == "申博 / 留学"
    assert tools_routes._normalize_generated_group_label("硕博 / 留学申请") == "研究生 / 博士"
    assert tools_routes._normalize_generated_group_label("低信息标签") == ""


def test_normalize_signal_group_labels_splits_mixed_grad_and_study_abroad_label():
    normalized = tools_routes._normalize_signal_group_labels(
        {
            "博士申请": "硕博 / 留学申请",
            "研究生": "硕博 / 留学申请",
        }
    )

    assert normalized["博士申请"] == ["申博 / 留学"]
    assert normalized["研究生"] == ["研究生 / 博士"]


def test_normalize_signal_group_labels_supports_multiple_group_labels():
    normalized = tools_routes._normalize_signal_group_labels(
        {
            "Obsidian": ["知识管理 / Obsidian", "阅读 / 学习", "知识管理 / Obsidian"],
        }
    )

    assert normalized["Obsidian"] == ["知识管理 / Obsidian", "阅读 / 学习"]


def test_assign_entry_groups_by_tags_uses_rule_based_context_for_missing_tags():
    entries = [
        {
            "platform": "xiaohongshu",
            "author": "作者A",
            "display_name": "作者A",
            "author_id": "x1",
            "raw_signals": [],
            "sample_tags": [],
            "sample_titles": ["护发精油正确使用手法教学"],
            "sample_albums": ["sth useful"],
            "source_summary": "来自收藏专辑：sth useful",
        }
    ]

    group_options = tools_routes._assign_entry_groups_by_tags(entries, [], {})

    assert entries[0]["smart_group_labels"] == ["变美 / 穿搭"]
    assert any(option["label"] == "变美 / 穿搭" for option in group_options)


def test_assign_entry_groups_by_tags_prefers_health_group_over_obsidian_substring_match():
    entries = [
        {
            "platform": "xiaohongshu",
            "author": "科普作者",
            "display_name": "科普作者",
            "author_id": "x2",
            "raw_signals": ["健康知识科普", "疤痕增生"],
            "sample_tags": ["健康知识科普", "疤痕增生"],
            "sample_titles": ["受伤怎么不留疤"],
            "sample_albums": ["sth useful"],
            "source_summary": "来自收藏专辑：sth useful",
        }
    ]

    group_options = tools_routes._assign_entry_groups_by_tags(
        entries,
        [
            {
                "value": "smart-obsidian",
                "label": "知识管理 / Obsidian",
                "source_signals": ["知识", "知识库", "Obsidian"],
            }
        ],
        {},
    )

    assert entries[0]["smart_group_labels"] == ["健康 / 医学科普"]
    assert any(option["label"] == "健康 / 医学科普" for option in group_options)


def test_assign_entry_groups_by_tags_can_skip_context_group_creation():
    entries = [
        {
            "platform": "xiaohongshu",
            "author": "作者B",
            "display_name": "作者B",
            "author_id": "x3",
            "raw_signals": [],
            "sample_tags": [],
            "sample_titles": ["护发精油正确使用手法教学"],
            "sample_albums": ["sth useful"],
            "source_summary": "来自收藏专辑：sth useful",
        }
    ]

    group_options = tools_routes._assign_entry_groups_by_tags(
        entries,
        [],
        {},
        allow_context_groups=False,
    )

    assert entries[0]["smart_group_labels"] == ["待补标签"]
    assert any(option["label"] == "待补标签" for option in group_options)


def test_assign_entry_groups_by_tags_supports_multiple_mapped_groups():
    entries = [
        {
            "platform": "bilibili",
            "author": "作者C",
            "display_name": "作者C",
            "author_id": "b1",
            "raw_signals": ["Obsidian"],
            "sample_tags": ["Obsidian"],
            "sample_titles": ["Obsidian 工作流分享"],
        }
    ]

    group_options = tools_routes._assign_entry_groups_by_tags(
        entries,
        [
            {"value": "smart-obsidian", "label": "知识管理 / Obsidian", "source_signals": ["Obsidian"]},
            {"value": "smart-reading", "label": "阅读 / 学习", "source_signals": ["读书笔记"]},
        ],
        {"Obsidian": ["知识管理 / Obsidian", "阅读 / 学习"]},
    )

    assert entries[0]["smart_group_labels"] == ["知识管理 / Obsidian", "阅读 / 学习"]
    assert entries[0]["smart_group_values"] == ["smart-obsidian", "smart-reading"]
    assert any(option["label"] == "知识管理 / Obsidian" for option in group_options)


def test_build_effective_shared_grouping_prefs_reuses_vault_saved_profiles(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "shared_smart_groups.json").write_text(
        json.dumps(
            {
                "groups": [{"value": "smart-obsidian", "label": "知识管理 / Obsidian"}],
                "signal_group_labels": {"Obsidian": "知识管理 / Obsidian"},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (data_dir / "shared_creator_profiles.json").write_text(
        json.dumps(
            {
                "profiles": {
                    "xiaohongshu": {
                        "xhs-1": {
                            "author_id": "xhs-1",
                            "author": "阿宁",
                            "smart_groups": ["smart-obsidian"],
                            "smart_group_labels": ["知识管理 / Obsidian"],
                            "sample_tags": ["Obsidian"],
                        }
                    }
                },
                "creator_catalog": {
                    "xiaohongshu:xhs-1": {
                        "platform": "xiaohongshu",
                        "author": "阿宁",
                        "author_id": "xhs-1",
                        "smart_group_labels": ["知识管理 / Obsidian"],
                    }
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    prefs = {"modules": {}, "shared_creator_grouping": {}}
    merged = tools_routes._build_effective_shared_grouping_prefs(prefs, vault_path=tmp_path)

    assert merged["shared_creator_grouping"]["signal_group_labels"]["Obsidian"] == ["知识管理 / Obsidian"]
    assert merged["modules"]["xiaohongshu-tracker"]["creator_profiles"]["xhs-1"]["author"] == "阿宁"
    assert merged["shared_creator_grouping"]["creator_catalog"]["xiaohongshu:xhs-1"]["author"] == "阿宁"


async def test_build_shared_creator_grouping_bundle_reuses_saved_creator_lookups(monkeypatch):
    async def fake_suggest(_entries, _prefs):
        return {}

    monkeypatch.setattr(tools_routes, "_suggest_ai_signal_group_labels", fake_suggest)

    prefs = {
        "shared_creator_grouping": {
            "creator_lookup": {
                "xiaohongshu_author_ids": {"阿宁": "xhs-1"},
                "bilibili_oids": {"oid-1": "101"},
            },
            "creator_catalog": {
                "bilibili:101": {
                    "platform": "bilibili",
                    "author": "算法A",
                    "author_id": "101",
                    "sample_oids": ["oid-1"],
                },
                "xiaohongshu:xhs-1": {
                    "platform": "xiaohongshu",
                    "author": "阿宁",
                    "author_id": "xhs-1",
                },
            },
        },
        "modules": {
            "bilibili-tracker": {
                "creator_profiles": {
                    "101": {
                        "author_id": "101",
                        "author": "算法A",
                        "sample_oids": ["oid-1"],
                    }
                }
            },
            "xiaohongshu-tracker": {
                "creator_profiles": {
                    "xhs-1": {
                        "author_id": "xhs-1",
                        "author": "阿宁",
                    }
                }
            },
        },
    }

    bundle = await tools_routes._build_shared_creator_grouping_bundle(
        prefs=prefs,
        xhs_authors=[
            {
                "author": "阿宁",
                "author_id": "",
                "note_count": 3,
                "total_likes": 120,
                "total_collects": 80,
                "total_comments": 20,
                "latest_title": "Obsidian 工作流",
                "sample_titles": ["Obsidian 工作流"],
                "sample_albums": ["知识管理"],
                "sample_tags": ["Obsidian", "知识库"],
                "source_summary": "来自收藏专辑：知识管理",
                "score": 9.2,
            }
        ],
        bilibili_candidates=[
            {
                "author": "改名后的算法A",
                "author_id": "",
                "matched_mid": "",
                "matched_uname": "",
                "note_count": 2,
                "latest_title": "Transformer 入门",
                "sample_titles": ["Transformer 入门"],
                "sample_tags": ["机器学习", "教程"],
                "sample_folders": ["机器学习收藏"],
                "sample_oids": ["oid-1"],
                "source_summary": "来自收藏夹：机器学习收藏",
            }
        ],
    )

    assert bundle["xhs_lookup_resolved_count"] == 1
    assert bundle["bilibili_lookup_resolved_count"] == 1
    assert "xhs-1" in bundle["xhs_profiles"]
    assert "101" in bundle["bilibili_profiles"]
    assert bundle["creator_lookup"]["bilibili_oids"]["oid-1"] == "101"


async def test_build_shared_creator_grouping_bundle_prefers_rule_based_content_groups_for_pending_profiles(monkeypatch):
    async def fake_suggest(_entries, _prefs):
        return {}

    monkeypatch.setattr(tools_routes, "_suggest_ai_signal_group_labels", fake_suggest)

    bundle = await tools_routes._build_shared_creator_grouping_bundle(
        prefs={"modules": {}, "shared_creator_grouping": {}},
        xhs_authors=[
            {
                "author": "博主A",
                "author_id": "",
                "note_count": 2,
                "latest_title": "和claude深度聊完",
                "sample_titles": ["和claude深度聊完"],
                "sample_albums": ["sth useful"],
                "sample_tags": ["AI", "大模型", "知识库"],
                "content_signals": ["claude"],
                "source_summary": "来自收藏专辑：sth useful",
                "score": 8.5,
            }
        ],
        bilibili_candidates=[
            {
                "author": "飞天闪客",
                "author_id": "",
                "matched_mid": "",
                "matched_uname": "",
                "note_count": 1,
                "latest_title": "【闪客】一口气拆穿Skill MCP RAG Agent OpenClaw底层逻辑",
                "sample_titles": ["【闪客】一口气拆穿Skill MCP RAG Agent OpenClaw底层逻辑"],
                "sample_tags": ["MCP", "RAG", "Agent"],
                "sample_folders": ["默认收藏夹"],
                "sample_oids": ["oid-demo"],
                "sample_urls": ["https://www.bilibili.com/video/BV1demo"],
                "content_signals": ["MCP", "RAG", "Agent", "OpenClaw"],
                "source_summary": "来自收藏夹：默认收藏夹",
            }
        ],
    )

    xhs_profile = next(iter(bundle["xhs_profiles"].values()))
    bili_profile = next(iter(bundle["bilibili_profiles"].values()))

    assert xhs_profile["pending_author_id"] is True
    assert "AI / 大模型" in xhs_profile["smart_group_labels"]
    assert "知识管理 / Obsidian" in xhs_profile["smart_group_labels"]
    assert bili_profile["pending_author_id"] is True
    assert bili_profile["smart_group_labels"] == ["AI / 大模型"]


async def test_build_shared_creator_grouping_bundle_uses_vault_tag_database_for_shared_groups(
    tmp_path: Path,
    monkeypatch,
):
    async def fake_suggest(_entries, _prefs):
        return {}

    monkeypatch.setattr(tools_routes, "_suggest_ai_signal_group_labels", fake_suggest)

    (tmp_path / "notes").mkdir(parents=True, exist_ok=True)
    (tmp_path / "notes" / "obsidian.md").write_text(
        "\n".join(
            [
                "---",
                "title: Obsidian 样本",
                "tags:",
                "  - Obsidian",
                "  - 知识库",
                "---",
                "",
                "# Obsidian 样本",
            ]
        ),
        encoding="utf-8",
    )

    bundle = await tools_routes._build_shared_creator_grouping_bundle(
        prefs={"modules": {}, "shared_creator_grouping": {}},
        xhs_authors=[],
        bilibili_candidates=[],
        vault_path=tmp_path,
    )

    assert bundle["vault_signal_database"]["signal_count"] >= 2
    assert Path(bundle["vault_signal_database"]["database_path"]).exists()
    assert Path(bundle["shared_data_paths"]["tag_index_path"]).exists()
    assert Path(bundle["shared_data_paths"]["shared_groups_path"]).exists()
    assert Path(bundle["shared_data_paths"]["creator_profiles_path"]).exists()
    assert any(option["label"] == "知识管理 / Obsidian" for option in bundle["group_options"])


async def test_build_shared_creator_assignment_bundle_reuses_existing_group_rules():
    bundle = await tools_routes._build_shared_creator_assignment_bundle(
        prefs={
            "shared_creator_grouping": {
                "group_options": [
                    {"value": "ai-da-mo-xing", "label": "AI / 大模型"},
                ],
                "signal_group_labels": {
                    "Agent": "AI / 大模型",
                    "大模型": "AI / 大模型",
                },
            },
            "modules": {},
        },
        xhs_authors=[
            {
                "author": "博主A",
                "author_id": "xhs-1",
                "note_count": 2,
                "latest_title": "最近在聊大模型",
                "sample_titles": ["最近在聊大模型"],
                "sample_albums": ["AI 收藏"],
                "sample_tags": ["大模型"],
                "source_summary": "来自收藏专辑：AI 收藏",
                "score": 8.0,
            }
        ],
        bilibili_candidates=[
            {
                "author": "UPA",
                "author_id": "101",
                "matched_mid": "101",
                "matched_uname": "UPA",
                "note_count": 1,
                "latest_title": "Agent 工作流",
                "sample_titles": ["Agent 工作流"],
                "sample_tags": ["Agent"],
                "sample_folders": ["默认收藏夹"],
                "sample_oids": ["oid-1"],
                "sample_urls": ["https://www.bilibili.com/video/BV1demo"],
                "source_summary": "来自收藏夹：默认收藏夹",
            }
        ],
    )

    assert bundle["fallback_signal_group_labels"] == {}
    assert bundle["ai_signal_group_labels"] == {}
    assert bundle["xhs_profiles"]["xhs-1"]["smart_group_labels"] == ["AI / 大模型"]
    assert bundle["bilibili_profiles"]["101"]["smart_group_labels"] == ["AI / 大模型"]
