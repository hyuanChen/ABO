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
