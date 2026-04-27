import json
import time
from pathlib import Path

from abo.vault.tag_index import (
    build_vault_signal_database,
    save_vault_shared_group_artifacts,
    save_vault_signal_database,
    vault_shared_creator_profiles_path,
    vault_shared_groups_path,
    vault_shared_tag_index_path,
    vault_signal_database_path,
)


def test_build_vault_signal_database_collects_frontmatter_fields_and_inline_tags(tmp_path: Path):
    (tmp_path / "notes").mkdir(parents=True, exist_ok=True)
    (tmp_path / "xhs").mkdir(parents=True, exist_ok=True)

    (tmp_path / "notes" / "knowledge.md").write_text(
        "\n".join(
            [
                "---",
                "title: 知识管理样本",
                "tags:",
                "  - Obsidian",
                "  - 知识库",
                "---",
                "",
                "# 知识管理样本",
                "",
                "正文里也有 #卡片笔记 和 #双链笔记。",
            ]
        ),
        encoding="utf-8",
    )
    (tmp_path / "xhs" / "xhs-note.md").write_text(
        "\n".join(
            [
                "# 小红书样本",
                "",
                "> [!info]- 笔记属性",
                "> - **来源**: 小红书 · 博主A",
                "> - **标签**: AI, 大模型, vibecoding",
                "> - **收藏专辑**: 计算机行业",
            ]
        ),
        encoding="utf-8",
    )

    database = build_vault_signal_database(tmp_path)
    signal_map = {item["signal"]: item for item in database["signals"]}

    assert database["total_files"] == 2
    assert database["indexed_files"] == 2
    assert signal_map["Obsidian"]["count"] == 1
    assert signal_map["知识库"]["count"] == 1
    assert signal_map["卡片笔记"]["count"] == 1
    assert signal_map["AI"]["platforms"] == ["xiaohongshu"]
    assert "博主A" in signal_map["AI"]["sample_authors"]


def test_build_vault_signal_database_treats_album_folder_as_xhs(tmp_path: Path):
    (tmp_path / "专辑" / "科研").mkdir(parents=True, exist_ok=True)
    (tmp_path / "专辑" / "科研" / "album-note.md").write_text(
        "\n".join(
            [
                "# 专辑样本",
                "",
                "> [!info]- 笔记属性",
                "> - **来源**: 小红书 · 博主Album",
                "> - **标签**: AI, 科研",
                "> - **收藏专辑**: 科研",
            ]
        ),
        encoding="utf-8",
    )

    database = build_vault_signal_database(tmp_path)
    signal_map = {item["signal"]: item for item in database["signals"]}

    assert signal_map["AI"]["platforms"] == ["xiaohongshu"]
    assert "博主Album" in signal_map["AI"]["sample_authors"]


def test_save_vault_signal_database_writes_into_vault(tmp_path: Path):
    database = {
        "vault_path": str(tmp_path),
        "total_files": 1,
        "indexed_files": 1,
        "signal_count": 1,
        "signals": [{"signal": "AI", "count": 1}],
    }

    saved = save_vault_signal_database(tmp_path, database)
    target = vault_signal_database_path(tmp_path)
    tag_index_target = vault_shared_tag_index_path(tmp_path)

    assert target.exists()
    assert saved["database_path"] == str(target)
    assert saved["tag_index_path"] == str(tag_index_target)
    assert tag_index_target.exists()
    assert '"signal": "AI"' in target.read_text(encoding="utf-8")
    assert "file_index" not in json.loads(tag_index_target.read_text(encoding="utf-8"))


def test_build_vault_signal_database_reuses_cached_files_incrementally(tmp_path: Path):
    (tmp_path / "notes").mkdir(parents=True, exist_ok=True)

    keep_path = tmp_path / "notes" / "keep.md"
    update_path = tmp_path / "notes" / "update.md"
    remove_path = tmp_path / "notes" / "remove.md"
    new_path = tmp_path / "notes" / "new.md"

    keep_path.write_text(
        "\n".join(
            [
                "---",
                "tags:",
                "  - AI工具",
                "---",
                "",
                "# keep",
            ]
        ),
        encoding="utf-8",
    )
    update_path.write_text(
        "\n".join(
            [
                "---",
                "tags:",
                "  - Obsidian",
                "---",
                "",
                "# update",
            ]
        ),
        encoding="utf-8",
    )
    remove_path.write_text(
        "\n".join(
            [
                "---",
                "tags:",
                "  - 宠物",
                "---",
                "",
                "# remove",
            ]
        ),
        encoding="utf-8",
    )

    first_database = build_vault_signal_database(tmp_path)
    save_vault_signal_database(tmp_path, first_database)

    time.sleep(0.02)
    update_path.write_text(
        "\n".join(
            [
                "---",
                "tags:",
                "  - 知识管理",
                "---",
                "",
                "# update",
            ]
        ),
        encoding="utf-8",
    )
    remove_path.unlink()
    new_path.write_text(
        "\n".join(
            [
                "---",
                "tags:",
                "  - 科研",
                "---",
                "",
                "# new",
            ]
        ),
        encoding="utf-8",
    )

    second_database = build_vault_signal_database(tmp_path)
    signal_map = {item["signal"]: item for item in second_database["signals"]}

    assert second_database["build_mode"] == "incremental"
    assert second_database["new_files"] == 1
    assert second_database["updated_files"] == 1
    assert second_database["removed_files"] == 1
    assert second_database["reused_files"] == 1
    assert "AI工具" in signal_map
    assert "知识管理" in signal_map
    assert "科研" in signal_map
    assert "Obsidian" not in signal_map
    assert "宠物" not in signal_map

    save_vault_signal_database(tmp_path, second_database)
    internal_payload = json.loads(vault_signal_database_path(tmp_path).read_text(encoding="utf-8"))
    public_payload = json.loads(vault_shared_tag_index_path(tmp_path).read_text(encoding="utf-8"))
    assert "file_index" in internal_payload
    assert "file_index" not in public_payload


def test_save_vault_shared_group_artifacts_writes_into_vault_data_dir(tmp_path: Path):
    result = save_vault_shared_group_artifacts(
        tmp_path,
        group_options=[{"value": "smart-ai", "label": "AI / 大模型"}],
        signal_group_labels={"AI": "AI / 大模型"},
        creator_profiles={
            "xiaohongshu": {"user-a": {"author": "博主A", "smart_group_labels": ["AI / 大模型"]}},
            "bilibili": {"101": {"author": "UPA", "smart_group_labels": ["AI / 大模型"]}},
        },
        creator_catalog={"xhs:user-a": {"author": "博主A"}},
    )

    assert result["shared_groups_path"] == str(vault_shared_groups_path(tmp_path))
    assert result["creator_profiles_path"] == str(vault_shared_creator_profiles_path(tmp_path))
    assert vault_shared_groups_path(tmp_path).exists()
    assert vault_shared_creator_profiles_path(tmp_path).exists()
