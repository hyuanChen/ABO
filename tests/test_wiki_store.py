from abo.wiki.store import WikiStore


def test_overview_pages_are_saved_at_wiki_root(tmp_path):
    WikiStore.ensure_structure(tmp_path, "intel")

    WikiStore.save_page(
        vault_path=tmp_path,
        wiki_type="intel",
        slug="overview",
        title="情报库 VKI 总览",
        content="# 情报库 VKI 总览\n\n## 当前收藏主线\n",
        category="overview",
        tags=["bootstrap"],
        sources=["bootstrap:collections"],
    )

    overview_path = tmp_path / "Wiki" / "Internet" / "overview.md"
    assert overview_path.exists()

    pages = WikiStore.list_pages(tmp_path, "intel")
    assert any(page["slug"] == "overview" and page["category"] == "overview" for page in pages)


def test_stats_include_recent_pages_and_overview_category(tmp_path):
    WikiStore.ensure_structure(tmp_path, "lit")

    WikiStore.save_page(
        vault_path=tmp_path,
        wiki_type="lit",
        slug="overview",
        title="文献库研究地图",
        content="# 文献库研究地图\n",
        category="overview",
        tags=["bootstrap"],
        sources=["bootstrap:collections"],
    )
    WikiStore.save_page(
        vault_path=tmp_path,
        wiki_type="lit",
        slug="topic-vla",
        title="VLA",
        content="# VLA\n\n## 核心问题\n",
        category="topic",
        tags=["vla"],
        sources=["paper:test"],
    )

    stats = WikiStore.get_stats(tmp_path, "lit")

    assert stats["by_category"]["overview"] == 1
    assert stats["total"] == 2
    recent_slugs = {page["slug"] for page in stats["recent_pages"]}
    assert {"overview", "topic-vla"}.issubset(recent_slugs)


def test_get_page_returns_dynamic_backlinks_for_aliased_wikilinks(tmp_path):
    WikiStore.ensure_structure(tmp_path, "lit")

    WikiStore.save_page(
        vault_path=tmp_path,
        wiki_type="lit",
        slug="overview",
        title="文献总览",
        content="# 文献总览\n\n- [[research-mainlines|研究主线]]\n",
        category="overview",
        tags=["bootstrap"],
        sources=["bootstrap:test"],
    )
    WikiStore.save_page(
        vault_path=tmp_path,
        wiki_type="lit",
        slug="research-mainlines",
        title="研究主线",
        content="# 研究主线\n",
        category="topic",
        tags=["mainline"],
        sources=["bootstrap:test"],
    )

    page = WikiStore.get_page(tmp_path, "lit", "research-mainlines")

    assert page is not None
    assert any(item["slug"] == "overview" and item["title"] == "文献总览" for item in page["backlinks"])


def test_source_config_roundtrip(tmp_path):
    WikiStore.ensure_structure(tmp_path, "intel")

    saved = WikiStore.save_source_config(
        tmp_path,
        "intel",
        {
            "xhs/学术": False,
            "bilibili/favorites/机器学习": True,
        },
    )
    loaded = WikiStore.load_source_config(tmp_path, "intel")

    assert saved["folder_states"]["xhs/学术"] is False
    assert loaded["folder_states"]["xhs/学术"] is False
    assert loaded["folder_states"]["bilibili/favorites/机器学习"] is True
