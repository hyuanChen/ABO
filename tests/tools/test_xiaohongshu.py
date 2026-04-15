"""测试小红书工具"""

import pytest
pytestmark = pytest.mark.anyio

from abo.tools.xiaohongshu import (
    xiaohongshu_search,
    xiaohongshu_fetch_comments,
    xiaohongshu_analyze_trends,
    XHSNote,
    XHSComment,
    XiaohongshuAPI,
)


@pytest.mark.asyncio
async def test_xiaohongshu_search_basic():
    """测试基本搜索功能"""
    result = await xiaohongshu_search("科研", max_results=5, min_likes=0)

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
    result = await xiaohongshu_search("学习", max_results=10, sort_by="likes")

    notes = result["notes"]
    if len(notes) >= 2:
        # 验证是按降序排列
        for i in range(len(notes) - 1):
            assert notes[i]["likes"] >= notes[i + 1]["likes"]


@pytest.mark.asyncio
async def test_xiaohongshu_fetch_comments():
    """测试评论获取"""
    result = await xiaohongshu_fetch_comments(
        note_id="test-note-123",
        max_comments=10,
        sort_by="likes"
    )

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
    result = await xiaohongshu_fetch_comments(
        note_id="test-note",
        max_comments=20,
        sort_by="likes"
    )

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
    result = await xiaohongshu_analyze_trends("学习")

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


def _note(note_id: str, title: str, content: str, likes: int = 100) -> XHSNote:
    return XHSNote(
        id=note_id,
        title=title,
        content=content,
        author="测试作者",
        author_id="author-1",
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
async def test_following_feed_uses_feed_page_state(monkeypatch):
    api = XiaohongshuAPI()
    captured: dict[str, object] = {}

    async def fake_extract_via_extension(**kwargs):
        captured.update(kwargs)
        return [
            _note("note-follow-hit", "科研日报", "分享科研和论文写作经验", likes=180),
            _note("note-follow-skip", "生活记录", "周末咖啡探店", likes=20),
        ]

    monkeypatch.setattr(api, "_extract_cards_via_extension", fake_extract_via_extension)

    try:
        notes = await api.get_following_feed_with_cookie(
            cookie="web_session=test-token",
            keywords=["科研", "论文"],
            max_notes=5,
        )
    finally:
        await api.close()

    assert [note.id for note in notes] == ["note-follow-hit"]
    assert getattr(notes[0], "matched_keywords") == ["科研", "论文"]
    assert captured["page_kind"] == "feed"
    assert captured["max_results"] == 10
    assert captured["url"] == "https://www.xiaohongshu.com/explore?tab=following"


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
