"""测试小红书工具"""

from pathlib import Path

import pytest
pytestmark = pytest.mark.anyio

import abo.tools.xhs_crawler as xhs_crawler
from abo.tools.xiaohongshu import (
    xiaohongshu_search,
    xiaohongshu_fetch_comments,
    xiaohongshu_analyze_trends,
    XHSNote,
    XHSComment,
    XiaohongshuAPI,
    XHSFollowingCreator,
)
from abo.tools.xhs_crawler import crawl_xhs_albums_incremental, save_xhs_seed_note_to_vault


@pytest.mark.asyncio
async def test_xiaohongshu_search_basic():
    """测试基本搜索功能"""
    async def fake_search_by_keyword(self, **kwargs):
        return [
            _note("note-1", "科研工具", "科研工作流", likes=320),
            _note("note-2", "论文写作", "论文写作经验", likes=180),
        ]

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(XiaohongshuAPI, "search_by_keyword", fake_search_by_keyword)
    try:
        result = await xiaohongshu_search("科研", max_results=5, min_likes=0, cookie="web_session=test-token")
    finally:
        monkeypatch.undo()

    assert "keyword" in result
    assert result["keyword"] == "科研"
    assert "total_found" in result
    assert "notes" in result
    assert len(result["notes"]) <= 5

    if result["notes"]:
        note = result["notes"][0]
        assert "id" in note
        assert "title" in note
        assert "likes" in note
        assert isinstance(note["likes"], int)


@pytest.mark.asyncio
async def test_xiaohongshu_search_sort_by_likes():
    """测试按赞排序"""
    async def fake_search_by_keyword(self, **kwargs):
        return [
            _note("note-1", "高赞笔记", "内容A", likes=500),
            _note("note-2", "次高赞笔记", "内容B", likes=120),
        ]

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(XiaohongshuAPI, "search_by_keyword", fake_search_by_keyword)
    try:
        result = await xiaohongshu_search("学习", max_results=10, sort_by="likes", cookie="web_session=test-token")
    finally:
        monkeypatch.undo()

    notes = result["notes"]
    if len(notes) >= 2:
        # 验证是按降序排列
        for i in range(len(notes) - 1):
            assert notes[i]["likes"] >= notes[i + 1]["likes"]


@pytest.mark.asyncio
async def test_xiaohongshu_fetch_comments():
    """测试评论获取"""
    async def fake_fetch_comments_via_extension(self, **kwargs):
        return [
            XHSComment(id="c1", author="用户A", content="评论1", likes=32, is_top=True),
            XHSComment(id="c2", author="用户B", content="评论2", likes=10, is_top=False),
        ]

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(XiaohongshuAPI, "_fetch_comments_via_extension", fake_fetch_comments_via_extension)
    try:
        result = await xiaohongshu_fetch_comments(
            note_id="test-note-123",
            max_comments=10,
            sort_by="likes"
        )
    finally:
        monkeypatch.undo()

    assert result["note_id"] == "test-note-123"
    assert "comments" in result
    assert len(result["comments"]) <= 10

    if result["comments"]:
        comment = result["comments"][0]
        assert "id" in comment
        assert "author" in comment
        assert "content" in comment
        assert "likes" in comment


@pytest.mark.asyncio
async def test_xiaohongshu_fetch_comments_sorted():
    """测试评论按赞排序"""
    async def fake_fetch_comments_via_extension(self, **kwargs):
        return [
            XHSComment(id="c1", author="用户A", content="评论1", likes=50, is_top=False),
            XHSComment(id="c2", author="用户B", content="评论2", likes=20, is_top=False),
        ]

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(XiaohongshuAPI, "_fetch_comments_via_extension", fake_fetch_comments_via_extension)
    try:
        result = await xiaohongshu_fetch_comments(
            note_id="test-note",
            max_comments=20,
            sort_by="likes"
        )
    finally:
        monkeypatch.undo()

    comments = result["comments"]
    if len(comments) >= 2:
        for i in range(len(comments) - 1):
            assert comments[i]["likes"] >= comments[i + 1]["likes"]


@pytest.mark.asyncio
async def test_xiaohongshu_analyze_trends_with_mock_data():
    """测试 trends 分析（使用模拟数据）"""
    mock_notes = [
        {
            "id": "1",
            "title": "科研工具推荐",
            "content": "分享几个好用的科研工具",
            "likes": 5000,
            "collects": 2000,
        },
        {
            "id": "2",
            "title": "读博经验分享",
            "content": "读博三年的一些心得",
            "likes": 3000,
            "collects": 1500,
        },
    ]

    result = await xiaohongshu_analyze_trends("科研", notes_data=mock_notes)

    assert result["keyword"] == "科研"
    assert "analysis" in result
    assert "based_on_notes" in result

    analysis = result["analysis"]
    # 验证返回结构
    assert isinstance(analysis.get("hot_topics", []), list)
    assert isinstance(analysis.get("trending_tags", []), list)
    assert isinstance(analysis.get("summary", ""), str)


@pytest.mark.asyncio
async def test_xiaohongshu_analyze_trends_auto_search():
    """测试自动搜索后分析"""
    # 不传递 notes_data，让它自动搜索
    async def fake_search(*args, **kwargs):
        return {
            "keyword": "学习",
            "total_found": 2,
            "notes": [
                {
                    "id": "1",
                    "title": "学习方法",
                    "content": "高效学习方法总结",
                    "likes": 300,
                    "collects": 120,
                },
                {
                    "id": "2",
                    "title": "知识管理",
                    "content": "Obsidian 工作流",
                    "likes": 260,
                    "collects": 90,
                },
            ],
        }

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr("abo.tools.xiaohongshu.xiaohongshu_search", fake_search)
    try:
        result = await xiaohongshu_analyze_trends("学习")
    finally:
        monkeypatch.undo()

    assert result["keyword"] == "学习"
    assert "analysis" in result
    # based_on_notes 可能为 0（如果 RSSHub 不可用），但至少结构正确
    assert isinstance(result["based_on_notes"], int)


def test_xhs_note_dataclass():
    """测试 XHSNote 数据类"""
    note = XHSNote(
        id="test-1",
        title="测试标题",
        content="测试内容",
        author="测试作者",
        author_id="user1",
        likes=100,
        collects=50,
        comments_count=20,
        url="https://example.com",
    )

    assert note.id == "test-1"
    assert note.likes == 100
    assert note.tags == []  # 默认空列表


def test_xhs_comment_dataclass():
    """测试 XHSComment 数据类"""
    comment = XHSComment(
        id="c1",
        author="用户1",
        content="评论内容",
        likes=50,
        is_top=True,
    )

    assert comment.is_top is True
    assert comment.reply_to is None


def _note(
    note_id: str,
    title: str,
    content: str,
    likes: int = 100,
    *,
    author: str = "测试作者",
    author_id: str = "author-1",
) -> XHSNote:
    return XHSNote(
        id=note_id,
        title=title,
        content=content,
        author=author,
        author_id=author_id,
        likes=likes,
        collects=0,
        comments_count=0,
        url=f"https://www.xiaohongshu.com/explore/{note_id}",
    )


@pytest.mark.asyncio
async def test_search_by_keyword_uses_search_page_state(monkeypatch):
    api = XiaohongshuAPI()
    captured: dict[str, object] = {}

    async def fake_extract_via_extension(**kwargs):
        captured.update(kwargs)
        return [_note("note-search", "科研工具", "科研写作工作流", likes=320)]

    monkeypatch.setattr(api, "_extract_cards_via_extension", fake_extract_via_extension)

    try:
        notes = await api.search_by_keyword(
            keyword="科研",
            max_results=5,
            min_likes=0,
            cookie="web_session=test-token",
        )
    finally:
        await api.close()

    assert len(notes) == 1
    assert captured["page_kind"] == "search"
    assert captured["max_results"] == 10
    assert captured["url"] == "https://www.xiaohongshu.com/search_result?keyword=%E7%A7%91%E7%A0%94"


@pytest.mark.asyncio
async def test_profile_extension_prefers_plugin_profile_cards_command(monkeypatch):
    api = XiaohongshuAPI()
    calls: list[tuple[str, dict[str, object]]] = []

    class FakeBridge:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def wait_until_ready(self, timeout: float = 15.0):
            return None

        async def call(self, method: str, params=None, timeout: float = 30.0):
            payload = params or {}
            calls.append((method, payload))
            if method in {"navigate", "wait_for_load", "wait_dom_stable", "scroll_by", "dispatch_wheel_event", "scroll_to_bottom"}:
                return None
            if method == "wait_for_xhs_state":
                return {"risk": None}
            if method == "get_xhs_profile_cards":
                return [
                    {"href": f"https://www.xiaohongshu.com/explore/{index:024x}", "title": "插件卡片"}
                    for index in range(5)
                ]
            raise AssertionError(f"unexpected bridge method: {method}")

    monkeypatch.setattr("abo.tools.xiaohongshu.XHSExtensionBridge", FakeBridge)

    try:
        notes = await api._extract_cards_via_extension(
            "https://www.xiaohongshu.com/user/profile/user-123",
            max_results=5,
            page_kind="profile",
        )
    finally:
        await api.close()

    assert [note.id for note in notes] == [f"{index:024x}" for index in range(5)]
    assert any(method == "get_xhs_profile_cards" for method, _ in calls)
    assert not any(method == "evaluate" for method, _ in calls)


@pytest.mark.asyncio
async def test_following_feed_uses_feed_page_state(monkeypatch):
    api = XiaohongshuAPI()
    captured: dict[str, object] = {}

    async def fake_search_followed_notes_with_extension(**kwargs):
        captured.setdefault("keywords", []).append(kwargs["keyword"])
        captured.setdefault("allow_foreground_fallbacks", []).append(kwargs["allow_foreground_fallback"])
        return [
            _note(
                "note-follow-hit",
                "科研日报",
                "分享科研和论文写作经验",
                likes=180,
                author="关注作者",
                author_id="",
            ),
            _note(
                "note-follow-skip",
                "生活记录",
                "周末咖啡探店",
                likes=20,
                author="路人作者",
                author_id="stranger-1",
            ),
        ]

    monkeypatch.setattr(api, "_search_followed_notes_with_extension", fake_search_followed_notes_with_extension)

    try:
        notes = await api.get_following_feed_with_cookie(
            cookie="web_session=test-token",
            keywords=["科研", "论文"],
            max_notes=5,
        )
    finally:
        await api.close()

    assert [note.id for note in notes] == ["note-follow-hit", "note-follow-skip"]
    assert getattr(notes[0], "matched_keywords") == ["科研", "论文"]
    assert getattr(notes[1], "matched_keywords") == ["科研", "论文"]
    assert captured["keywords"] == ["科研", "论文"]
    assert captured["allow_foreground_fallbacks"] == [False, False]


@pytest.mark.asyncio
async def test_following_feed_skips_keyword_when_filter_click_fails(monkeypatch):
    api = XiaohongshuAPI()
    captured_keywords: list[str] = []

    async def fake_search_followed_notes_with_extension(**kwargs):
        keyword = kwargs["keyword"]
        captured_keywords.append(keyword)
        if keyword == "科研":
            return []
        return [
            _note(
                "note-follow-next-keyword",
                "下一个关键词命中",
                "前一个词点不到已关注时，直接跳过",
                likes=99,
                author="关注作者",
                author_id="followed-author-2",
            )
        ]

    monkeypatch.setattr(api, "_search_followed_notes_with_extension", fake_search_followed_notes_with_extension)

    try:
        notes = await api.get_following_feed_with_cookie(
            cookie="web_session=test-token",
            keywords=["科研", "论文"],
            max_notes=5,
            use_extension=True,
        )
    finally:
        await api.close()

    assert [note.id for note in notes] == ["note-follow-next-keyword"]
    assert captured_keywords == ["科研", "论文"]


@pytest.mark.asyncio
async def test_followed_extension_does_not_activate_tab_when_foreground_fallback_disabled(monkeypatch):
    api = XiaohongshuAPI()
    activate_calls: list[str] = []

    async def fake_apply_followed_search_filter_with_extension(bridge, *, foreground: bool = False):
        return False

    class FakeBridge:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def wait_until_ready(self, timeout: float = 20.0):
            return None

        async def call(self, method: str, params=None, timeout: float = 30.0):
            if method in {"ensure_dedicated_xhs_tab", "wait_for_load", "wait_dom_stable"}:
                return None
            if method == "wait_for_xhs_state":
                return {"risk": None}
            if method == "activate_tab":
                activate_calls.append(method)
                return None
            raise AssertionError(f"unexpected bridge method: {method}")

    monkeypatch.setattr(api, "_apply_followed_search_filter_with_extension", fake_apply_followed_search_filter_with_extension)
    monkeypatch.setattr("abo.tools.xiaohongshu.XHSExtensionBridge", FakeBridge)

    try:
        notes = await api._search_followed_notes_with_extension(
            keyword="科研",
            cookie="web_session=test-token",
            max_results=5,
            extension_port=9334,
            dedicated_window_mode=True,
            allow_foreground_fallback=False,
        )
    finally:
        await api.close()

    assert notes == []
    assert activate_calls == []


@pytest.mark.asyncio
async def test_followed_extension_reuses_search_card_collection(monkeypatch):
    api = XiaohongshuAPI()
    captured: dict[str, object] = {}
    state_wait_calls: list[dict[str, object]] = []

    async def fake_apply_followed_search_filter_with_extension(bridge, *, foreground: bool = False):
        captured["foreground"] = foreground
        return True

    async def fake_collect_cards_from_extension_page(bridge, *, max_results: int, page_kind: str):
        captured["collect_max_results"] = max_results
        captured["collect_page_kind"] = page_kind
        return [
            _note(
                "notefollow1",
                "第一条",
                "来自统一搜索抽卡逻辑",
                author="作者甲",
                author_id="author-1",
            ),
            _note(
                "notefollow2",
                "第二条",
                "继续沿用关键词搜索滚动和抽卡",
                author="作者乙",
                author_id="author-2",
            ),
        ]

    class FakeBridge:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def wait_until_ready(self, timeout: float = 20.0):
            return None

        async def call(self, method: str, params=None, timeout: float = 30.0):
            if method in {"ensure_dedicated_xhs_tab", "navigate", "wait_for_load", "wait_dom_stable"}:
                return None
            if method == "wait_for_xhs_state":
                state_wait_calls.append(dict(params or {}))
                return {"risk": None}
            raise AssertionError(f"unexpected bridge method: {method}")

    monkeypatch.setattr(api, "_apply_followed_search_filter_with_extension", fake_apply_followed_search_filter_with_extension)
    monkeypatch.setattr(api, "_collect_cards_from_extension_page", fake_collect_cards_from_extension_page)
    monkeypatch.setattr("abo.tools.xiaohongshu.XHSExtensionBridge", FakeBridge)

    try:
        notes = await api._search_followed_notes_with_extension(
            keyword="科研",
            cookie="web_session=test-token",
            max_results=2,
            extension_port=9334,
            dedicated_window_mode=True,
        )
    finally:
        await api.close()

    assert [note.id for note in notes] == ["notefollow1", "notefollow2"]
    assert captured == {
        "foreground": True,
        "collect_max_results": 2,
        "collect_page_kind": "search",
    }
    assert state_wait_calls == [
        {"kind": "search", "timeout": 15000, "interval": 500},
    ]


@pytest.mark.asyncio
async def test_save_xhs_seed_note_supports_nested_subfolder(tmp_path: Path):
    result = await save_xhs_seed_note_to_vault(
        seed_data={
            "id": "note-seed-1",
            "title": "关注流测试笔记",
            "content": "保存到关注流子文件夹",
            "author": "测试作者",
            "author_id": "user-1",
            "url": "https://www.xiaohongshu.com/explore/note-seed-1",
        },
        vault_path=tmp_path,
        subfolder="关注流/科研",
    )

    assert Path(result["xhs_dir"]) == tmp_path / "xhs" / "关注流" / "科研"
    assert Path(result["markdown_path"]).exists()


@pytest.mark.asyncio
async def test_crawl_xhs_albums_saves_into_album_root(tmp_path: Path, monkeypatch):
    async def fake_fetch_board_notes(*args, **kwargs):
        return [
            {
                "note_id": "note-album-1",
                "xsec_token": "token-1",
                "time": "2026-04-26T10:00:00+08:00",
            }
        ]

    async def fake_crawl_note(url: str, **kwargs):
        target_root_dir = Path(kwargs["target_root_dir"])
        assert target_root_dir == tmp_path / "专辑"
        md_path = target_root_dir / "研究灵感" / "2026-04-26 album-note.md"
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text("# album note\n", encoding="utf-8")
        return {
            "success": True,
            "note_id": "note-album-1",
            "title": "album note",
            "author": "测试作者",
            "url": url,
            "markdown_path": str(md_path),
            "xhs_dir": str(md_path.parent),
            "target_root_dir": str(target_root_dir),
        }

    monkeypatch.setattr(xhs_crawler, "_fetch_board_notes", fake_fetch_board_notes)
    monkeypatch.setattr(xhs_crawler, "crawl_xhs_note_to_vault", fake_crawl_note)

    result = await crawl_xhs_albums_incremental(
        [{"board_id": "board-1", "name": "研究灵感", "count": 1, "url": "https://www.xiaohongshu.com/board/board-1"}],
        vault_path=tmp_path,
        crawl_delay_seconds=0,
        use_extension=False,
    )

    progress_path = tmp_path / "专辑" / ".xhs-albums-progress.json"
    assert result["success"] is True
    assert result["saved"] == 1
    assert result["progress_path"] == str(progress_path)
    assert progress_path.exists()


@pytest.mark.asyncio
async def test_search_falls_back_to_playwright_when_extension_errors(monkeypatch):
    api = XiaohongshuAPI()
    fallback_calls: list[dict[str, object]] = []

    async def fail_extension(**kwargs):
        raise RuntimeError("transient bridge timeout")

    async def fake_extract_via_playwright(**kwargs):
        fallback_calls.append(kwargs)
        return [_note("note-fallback", "科研工作流", "通过回退链路抓到的内容", likes=260)]

    monkeypatch.setattr(api, "_extract_cards_via_extension", fail_extension)
    monkeypatch.setattr(api, "_extract_cards_via_playwright", fake_extract_via_playwright)

    try:
        notes = await api.search_by_keyword(
            keyword="科研",
            max_results=3,
            min_likes=0,
            cookie="web_session=test-token",
        )
    finally:
        await api.close()

    assert [note.id for note in notes] == ["note-fallback"]
    assert fallback_calls == [
        {
            "url": "https://www.xiaohongshu.com/search_result?keyword=%E7%A7%91%E7%A0%94",
            "cookie": "web_session=test-token",
            "max_results": 6,
            "page_kind": "search",
        }
    ]


@pytest.mark.asyncio
async def test_user_notes_manual_current_tab_skips_profile_navigation(monkeypatch):
    api = XiaohongshuAPI()
    current_tab_calls: list[dict[str, object]] = []

    async def fake_current_tab(**kwargs):
        current_tab_calls.append(kwargs)
        return [_note("note-current-tab", "当前页笔记", "来自用户已打开主页", author_id="")]

    async def fail_plugin_priority(**kwargs):
        raise AssertionError("manual_current_tab should not navigate to a profile URL")

    monkeypatch.setattr(api, "_extract_profile_cards_from_current_tab", fake_current_tab)
    monkeypatch.setattr(api, "_extract_cards_with_plugin_priority", fail_plugin_priority)

    try:
        notes = await api.get_user_notes_with_cookie(
            "https://www.xiaohongshu.com/user/profile/user-123",
            cookie="web_session=test-token",
            max_notes=5,
            manual_current_tab=True,
        )
    finally:
        await api.close()

    assert [note.id for note in notes] == ["note-current-tab"]
    assert notes[0].author_id == "user-123"
    assert current_tab_calls == [
        {
            "expected_user_id": "user-123",
            "max_results": 5,
            "extension_port": 9334,
        }
    ]


@pytest.mark.asyncio
async def test_user_notes_require_extension_does_not_fallback_to_playwright(monkeypatch):
    api = XiaohongshuAPI()
    playwright_calls: list[dict[str, object]] = []

    async def fail_extension(**kwargs):
        raise RuntimeError("bridge unavailable")

    async def fake_playwright(**kwargs):
        playwright_calls.append(kwargs)
        return [_note("note-playwright", "不应回退", "不应使用 Playwright")]

    monkeypatch.setattr(api, "_extract_cards_via_extension", fail_extension)
    monkeypatch.setattr(api, "_extract_cards_via_playwright", fake_playwright)

    try:
        with pytest.raises(RuntimeError, match="bridge unavailable"):
            await api.get_user_notes_with_cookie(
                "user-123",
                cookie="web_session=test-token",
                max_notes=5,
                require_extension_success=True,
            )
    finally:
        await api.close()

    assert playwright_calls == []


@pytest.mark.asyncio
async def test_user_notes_require_extension_rejects_empty_plugin_result(monkeypatch):
    api = XiaohongshuAPI()
    playwright_calls: list[dict[str, object]] = []

    async def empty_extension(**kwargs):
        return []

    async def fake_playwright(**kwargs):
        playwright_calls.append(kwargs)
        return [_note("note-playwright", "不应回退", "不应使用 Playwright")]

    monkeypatch.setattr(api, "_extract_cards_via_extension", empty_extension)
    monkeypatch.setattr(api, "_extract_cards_via_playwright", fake_playwright)

    try:
        with pytest.raises(RuntimeError, match="插件 bridge 路径未读取到笔记"):
            await api.get_user_notes_with_cookie(
                "user-123",
                cookie="web_session=test-token",
                max_notes=5,
                require_extension_success=True,
            )
    finally:
        await api.close()

    assert playwright_calls == []
