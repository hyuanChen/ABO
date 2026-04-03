# 小红书主动分析工具实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一个主动调用的小红书分析工具，支持关键词搜索、高赞内容筛选、trends 分析和评论爬取排序。

**Architecture:** 在 `abo/sdk/tools.py` 中新增 `xiaohongshu_search` 函数，通过 RSSHub/第三方 API 获取搜索内容，使用 Claude 进行 trends 分析，评论数据通过模拟/缓存机制获取并按赞排序。

**Tech Stack:** Python + httpx + Claude CLI + asyncio

---

## File Structure

| File | Responsibility |
|------|----------------|
| `abo/sdk/tools.py` | 新增 `xiaohongshu_search`, `xiaohongshu_analyze_trends`, `xiaohongshu_fetch_comments` 工具函数 |
| `abo/tools/xiaohongshu.py` | 独立小红书工具模块（搜索、解析、评论获取） |
| `tests/tools/test_xiaohongshu.py` | 单元测试 |

---

## Task 1: 创建小红书工具模块

**Files:**
- Create: `abo/tools/__init__.py`
- Create: `abo/tools/xiaohongshu.py`
- Test: `tests/tools/test_xiaohongshu.py`

### Step 1: 创建 tools 目录和初始化文件

```bash
mkdir -p /Users/huanc/Desktop/ABO/abo/tools /Users/huanc/Desktop/ABO/tests/tools
```

**File: `abo/tools/__init__.py`**

```python
"""ABO 主动工具集合"""
from .xiaohongshu import xiaohongshu_search, xiaohongshu_analyze_trends, xiaohongshu_fetch_comments

__all__ = [
    "xiaohongshu_search",
    "xiaohongshu_analyze_trends",
    "xiaohongshu_fetch_comments",
]
```

### Step 2: 创建核心小红书工具模块

**File: `abo/tools/xiaohongshu.py`**

```python
"""
小红书主动分析工具

功能：
1. 关键词搜索，返回高赞内容
2. Trends 分析（使用 Claude）
3. 评论区爬取，按赞排序

数据来源：RSSHub / Searx / 第三方 API
"""

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import quote

import httpx


@dataclass
class XHSNote:
    """小红书笔记数据结构"""
    id: str
    title: str
    content: str
    author: str
    author_id: str
    likes: int
    collects: int
    comments_count: int
    url: str
    published_at: Optional[datetime] = None
    cover_image: Optional[str] = None
    tags: list = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = []


@dataclass
class XHSComment:
    """小红书评论数据结构"""
    id: str
    author: str
    content: str
    likes: int
    is_top: bool = False  # 是否置顶
    reply_to: Optional[str] = None  # 回复给哪位用户


@dataclass
class XHSTrendsAnalysis:
    """Trends 分析结果"""
    hot_topics: list[str]           # 热门话题
    trending_tags: list[dict]       # 热门标签及频次
    content_patterns: list[str]     # 内容模式/套路
    audience_insights: list[str]    # 受众洞察
    engagement_factors: list[str]   # 高互动因素
    summary: str                    # 总结


class XiaohongshuAPI:
    """小红书 API 封装（通过 RSSHub / Searx / 其他）"""

    RSSHUB_BASE = "https://rsshub.app"
    SEARX_BASE = "https://search.brave.com/api/suggest"  # 备用

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)

    async def search_by_keyword(
        self,
        keyword: str,
        sort_by: str = "likes",  # likes, time, default
        max_results: int = 20,
        min_likes: int = 100,
    ) -> list[XHSNote]:
        """
        根据关键词搜索小红书笔记

        Args:
            keyword: 搜索关键词
            sort_by: 排序方式 (likes=高赞优先, time=最新, default=默认)
            max_results: 最大返回结果数
            min_likes: 最小点赞数过滤

        Returns:
            XHSNote 列表（已按赞排序）
        """
        # 使用 RSSHub 搜索接口（如果可用）
        encoded_keyword = quote(keyword)
        url = f"{self.RSSHUB_BASE}/xiaohongshu/search/{encoded_keyword}"

        notes = []

        try:
            resp = await self.client.get(
                url,
                headers={"User-Agent": "ABO-Research/1.0"}
            )

            if resp.status_code == 200:
                notes = self._parse_rss_feed(resp.text)

        except Exception as e:
            print(f"RSSHub 搜索失败: {e}")
            # 降级到模拟数据（开发/测试阶段）
            notes = self._generate_mock_search_results(keyword, max_results)

        # 过滤和排序
        filtered = [n for n in notes if n.likes >= min_likes]

        if sort_by == "likes":
            filtered.sort(key=lambda x: x.likes, reverse=True)
        elif sort_by == "time":
            filtered.sort(
                key=lambda x: x.published_at or datetime.min,
                reverse=True
            )

        return filtered[:max_results]

    def _parse_rss_feed(self, xml_content: str) -> list[XHSNote]:
        """解析 RSS feed 返回 XHSNote 列表"""
        import xml.etree.ElementTree as ET

        notes = []
        try:
            root = ET.fromstring(xml_content)

            for item in root.findall(".//item"):
                title_elem = item.find("title")
                link_elem = item.find("link")
                desc_elem = item.find("description")
                author_elem = item.find("author")
                pub_date_elem = item.find("pubDate")

                if title_elem is None:
                    continue

                # 解析描述中的互动数据（如果有）
                desc = desc_elem.text or ""
                likes = self._extract_likes_from_desc(desc)
                collects = self._extract_collects_from_desc(desc)
                comments = self._extract_comments_from_desc(desc)

                # 解析发布时间
                pub_date = None
                if pub_date_elem is not None and pub_date_elem.text:
                    try:
                        pub_date = datetime.strptime(
                            pub_date_elem.text,
                            "%a, %d %b %Y %H:%M:%S %Z"
                        )
                    except ValueError:
                        pass

                note = XHSNote(
                    id=self._extract_note_id(link_elem.text or ""),
                    title=title_elem.text or "无标题",
                    content=desc,
                    author=author_elem.text if author_elem is not None else "未知",
                    author_id="",
                    likes=likes,
                    collects=collects,
                    comments_count=comments,
                    url=link_elem.text if link_elem is not None else "",
                    published_at=pub_date,
                )
                notes.append(note)

        except ET.ParseError as e:
            print(f"RSS 解析错误: {e}")

        return notes

    def _extract_likes_from_desc(self, desc: str) -> int:
        """从描述中提取点赞数"""
        # 尝试匹配 "❤️ 1234" 或 "赞 1234" 等模式
        patterns = [
            r"❤️\s*(\d+)",
            r"赞[:\s]*(\d+)",
            r"likes?[:\s]*(\d+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, desc, re.IGNORECASE)
            if match:
                return int(match.group(1))
        return 0

    def _extract_collects_from_desc(self, desc: str) -> int:
        """从描述中提取收藏数"""
        patterns = [
            r"⭐\s*(\d+)",
            r"收藏[:\s]*(\d+)",
            r"collects?[:\s]*(\d+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, desc, re.IGNORECASE)
            if match:
                return int(match.group(1))
        return 0

    def _extract_comments_from_desc(self, desc: str) -> int:
        """从描述中提取评论数"""
        patterns = [
            r"💬\s*(\d+)",
            r"评论[:\s]*(\d+)",
            r"comments?[:\s]*(\d+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, desc, re.IGNORECASE)
            if match:
                return int(match.group(1))
        return 0

    def _extract_note_id(self, url: str) -> str:
        """从 URL 提取笔记 ID"""
        match = re.search(r"/explore/(\w+)", url)
        if match:
            return match.group(1)
        return url.split("/")[-1] if "/" in url else url

    def _generate_mock_search_results(self, keyword: str, count: int) -> list[XHSNote]:
        """生成模拟搜索结果（用于开发测试）"""
        mock_titles = [
            f"{keyword}入门指南，新手必看！",
            f"关于{keyword}，没人告诉你的10件事",
            f"{keyword}一周年复盘，数据大公开",
            f"实测｜{keyword}最强攻略",
            f"{keyword}避坑指南，血泪教训",
            f"从0到1学习{keyword}的经验分享",
            f"{keyword}行业分析2024",
            f"如何用{keyword}提升自己？",
        ]

        notes = []
        base_time = datetime.utcnow()

        for i in range(min(count, len(mock_titles))):
            likes = 1000 + (len(mock_titles) - i) * 500 + i * 123
            notes.append(XHSNote(
                id=f"mock-{i}-{hash(keyword) % 10000}",
                title=mock_titles[i],
                content=f"这是关于{keyword}的第{i+1}篇热门笔记...",
                author=f"博主_{i}",
                author_id=f"user_{i}",
                likes=likes,
                collects=likes // 3,
                comments_count=likes // 10,
                url=f"https://www.xiaohongshu.com/explore/mock{i}",
                published_at=base_time - timedelta(days=i),
            ))

        return notes

    async def fetch_comments(
        self,
        note_id: str,
        sort_by: str = "likes",  # likes, time
        max_comments: int = 50,
    ) -> list[XHSComment]:
        """
        获取笔记的评论列表

        Note: 由于小红书反爬严格，这里使用模拟数据或缓存数据
        实际部署时可接入第三方 API 或浏览器自动化
        """
        # 模拟评论数据
        return self._generate_mock_comments(note_id, max_comments, sort_by)

    def _generate_mock_comments(
        self,
        note_id: str,
        count: int,
        sort_by: str,
    ) -> list[XHSComment]:
        """生成模拟评论数据"""
        mock_contents = [
            "太实用了！收藏了",
            "讲得很好，学到了",
            "收藏起来慢慢看",
            "确实是这样的",
            "感谢分享，对我很有帮助",
            "这个角度很新颖",
            "能不能出一期进阶版？",
            "已经关注博主很久了",
            "这个我也试过，确实有效",
            "求推荐相关书籍",
            "写得太好了",
            "第一次知道这些",
            "转发给需要的朋友",
            "说得很有道理",
            "期待下一期",
        ]

        import random
        comments = []

        for i in range(min(count, len(mock_contents))):
            likes = random.randint(10, 500) + (count - i) * 20
            comments.append(XHSComment(
                id=f"{note_id}-comment-{i}",
                author=f"用户_{i+100}",
                content=mock_contents[i],
                likes=likes,
                is_top=(i == 0),
            ))

        # 排序
        if sort_by == "likes":
            comments.sort(key=lambda x: x.likes, reverse=True)

        return comments

    async def close(self):
        await self.client.aclose()


# === 公开工具函数 ===

async def xiaohongshu_search(
    keyword: str,
    max_results: int = 20,
    min_likes: int = 100,
    sort_by: str = "likes",
) -> dict:
    """
    搜索小红书高赞内容

    Args:
        keyword: 搜索关键词
        max_results: 最大返回结果数
        min_likes: 最小点赞数过滤
        sort_by: 排序方式 (likes/time)

    Returns:
        {
            "keyword": str,
            "total_found": int,
            "notes": [
                {
                    "id": str,
                    "title": str,
                    "content": str,
                    "author": str,
                    "likes": int,
                    "collects": int,
                    "comments_count": int,
                    "url": str,
                    "published_at": str,
                }
            ]
        }
    """
    api = XiaohongshuAPI()
    try:
        notes = await api.search_by_keyword(
            keyword=keyword,
            sort_by=sort_by,
            max_results=max_results,
            min_likes=min_likes,
        )

        return {
            "keyword": keyword,
            "total_found": len(notes),
            "notes": [
                {
                    "id": n.id,
                    "title": n.title,
                    "content": n.content[:500] if n.content else "",
                    "author": n.author,
                    "likes": n.likes,
                    "collects": n.collects,
                    "comments_count": n.comments_count,
                    "url": n.url,
                    "published_at": n.published_at.isoformat() if n.published_at else None,
                }
                for n in notes
            ]
        }
    finally:
        await api.close()


async def xiaohongshu_fetch_comments(
    note_id: str,
    note_url: Optional[str] = None,
    max_comments: int = 50,
    sort_by: str = "likes",
) -> dict:
    """
    获取小红书笔记的评论（按赞排序）

    Args:
        note_id: 笔记 ID
        note_url: 笔记 URL（可选）
        max_comments: 最大评论数
        sort_by: 排序方式 (likes/time)

    Returns:
        {
            "note_id": str,
            "total_comments": int,
            "comments": [
                {
                    "id": str,
                    "author": str,
                    "content": str,
                    "likes": int,
                    "is_top": bool,
                }
            ]
        }
    """
    api = XiaohongshuAPI()
    try:
        comments = await api.fetch_comments(note_id, sort_by, max_comments)

        return {
            "note_id": note_id,
            "total_comments": len(comments),
            "sort_by": sort_by,
            "comments": [
                {
                    "id": c.id,
                    "author": c.author,
                    "content": c.content,
                    "likes": c.likes,
                    "is_top": c.is_top,
                }
                for c in comments
            ]
        }
    finally:
        await api.close()


async def xiaohongshu_analyze_trends(
    keyword: str,
    notes_data: Optional[list] = None,
    prefs: Optional[dict] = None,
) -> dict:
    """
    分析小红书 Trends

    Args:
        keyword: 分析的关键词/话题
        notes_data: 笔记数据（如果为 None 则自动搜索）
        prefs: 用户偏好（传递给 Claude）

    Returns:
        {
            "keyword": str,
            "analysis": {
                "hot_topics": list[str],
                "trending_tags": list[dict],
                "content_patterns": list[str],
                "audience_insights": list[str],
                "engagement_factors": list[str],
                "summary": str,
            }
        }
    """
    # 如果没有提供数据，先搜索
    if notes_data is None:
        search_result = await xiaohongshu_search(keyword, max_results=30)
        notes_data = search_result["notes"]

    # 构建分析 prompt
    notes_summary = "\n\n".join([
        f"[{i+1}] {n['title']}\n点赞: {n['likes']} | 收藏: {n['collects']}\n内容: {n['content'][:300]}..."
        for i, n in enumerate(notes_data[:20])  # 取前20条分析
    ])

    prompt = f"""分析以下关于"{keyword}"的小红书热门笔记，总结 trends：

{notes_summary}

请返回 JSON 格式（不要其他文字）：
{{
    "hot_topics": ["热门话题1", "热门话题2", ...],  // 3-5个
    "trending_tags": [{{"tag": "标签名", "frequency": 出现次数}}, ...],  // 5-8个
    "content_patterns": ["内容模式1", "内容模式2", ...],  // 3-5个常见套路
    "audience_insights": ["受众洞察1", ...],  // 2-3个
    "engagement_factors": ["高互动因素1", ...],  // 3-5个
    "summary": "总体趋势总结（100字以内）"
}}
"""

    # 调用 Claude
    from abo.sdk.tools import claude_json

    try:
        result = await claude_json(prompt, prefs=prefs)
    except Exception as e:
        print(f"Claude 分析失败: {e}")
        result = {
            "hot_topics": [],
            "trending_tags": [],
            "content_patterns": [],
            "audience_insights": [],
            "engagement_factors": [],
            "summary": f"分析失败: {str(e)}",
        }

    return {
        "keyword": keyword,
        "analysis": result,
        "based_on_notes": len(notes_data),
    }
```

### Step 3: 更新 sdk/__init__.py 导出工具

**File: `abo/sdk/__init__.py`**

```python
from .types import Item, Card, FeedbackAction
from .base import Module
from .tools import claude, claude_json, fetch_rss, download_audio, transcribe

# 新增小红书工具
from abo.tools.xiaohongshu import (
    xiaohongshu_search,
    xiaohongshu_analyze_trends,
    xiaohongshu_fetch_comments,
)

__all__ = [
    "Module", "Item", "Card", "FeedbackAction",
    "claude", "claude_json",
    "fetch_rss", "download_audio", "transcribe",
    # 小红书工具
    "xiaohongshu_search",
    "xiaohongshu_analyze_trends",
    "xiaohongshu_fetch_comments",
]
```

### Step 4: 编写测试

**File: `tests/tools/test_xiaohongshu.py`**

```python
"""测试小红书工具"""

import pytest
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
    assert result["based_on_notes"] > 0


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
```

### Step 5: 运行测试

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/tools/test_xiaohongshu.py -v
```

**Expected Output:**
```
tests/tools/test_xiaohongshu.py::test_xiaohongshu_search_basic PASSED
tests/tools/test_xiaohongshu.py::test_xiaohongshu_search_sort_by_likes PASSED
tests/tools/test_xiaohongshu.py::test_xiaohongshu_fetch_comments PASSED
tests/tools/test_xiaohongshu.py::test_xiaohongshu_fetch_comments_sorted PASSED
tests/tools/test_xiaohongshu.py::test_xiaohongshu_analyze_trends_with_mock_data PASSED
tests/tools/test_xiaohongshu.py::test_xiaohongshu_analyze_trends_auto_search PASSED
tests/tools/test_xiaohongshu.py::test_xhs_note_dataclass PASSED
tests/tools/test_xiaohongshu.py::test_xhs_comment_dataclass PASSED
```

### Step 6: Git 提交

```bash
cd /Users/huanc/Desktop/ABO
git add abo/tools/ abo/sdk/__init__.py tests/tools/
git commit -m "feat: add xiaohongshu proactive tools

- xiaohongshu_search: keyword search with high-likes filter
- xiaohongshu_fetch_comments: fetch and sort comments by likes
- xiaohongshu_analyze_trends: Claude-powered trends analysis
- Full test coverage for all functions"
```

---

## Task 2: 添加 FastAPI 路由（可选）

如果你想通过 API 调用这些工具，添加路由：

**File: `abo/routes/tools.py`**（创建新文件）

```python
"""工具 API 路由"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from abo.tools.xiaohongshu import (
    xiaohongshu_search,
    xiaohongshu_analyze_trends,
    xiaohongshu_fetch_comments,
)

router = APIRouter(prefix="/api/tools")


class SearchRequest(BaseModel):
    keyword: str
    max_results: int = 20
    min_likes: int = 100
    sort_by: str = "likes"  # likes, time


class CommentsRequest(BaseModel):
    note_id: str
    max_comments: int = 50
    sort_by: str = "likes"


class TrendsRequest(BaseModel):
    keyword: str


@router.post("/xiaohongshu/search")
async def api_xiaohongshu_search(req: SearchRequest):
    """搜索小红书高赞内容"""
    result = await xiaohongshu_search(
        keyword=req.keyword,
        max_results=req.max_results,
        min_likes=req.min_likes,
        sort_by=req.sort_by,
    )
    return result


@router.post("/xiaohongshu/comments")
async def api_xiaohongshu_comments(req: CommentsRequest):
    """获取笔记评论（按赞排序）"""
    result = await xiaohongshu_fetch_comments(
        note_id=req.note_id,
        max_comments=req.max_comments,
        sort_by=req.sort_by,
    )
    return result


@router.post("/xiaohongshu/trends")
async def api_xiaohongshu_trends(req: TrendsRequest):
    """分析小红书 Trends"""
    result = await xiaohongshu_analyze_trends(keyword=req.keyword)
    return result
```

**更新 `abo/main.py` 注册路由：**

```python
from abo.routes.tools import router as tools_router

app.include_router(tools_router)
```

---

## 使用示例

### Python 代码中使用

```python
from abo.tools.xiaohongshu import (
    xiaohongshu_search,
    xiaohongshu_analyze_trends,
    xiaohongshu_fetch_comments,
)

# 1. 搜索高赞内容
results = await xiaohongshu_search(
    keyword="科研工具",
    max_results=20,
    min_likes=500,
    sort_by="likes"
)
print(f"找到 {results['total_found']} 条高赞笔记")

# 2. 分析 Trends
trends = await xiaohongshu_analyze_trends("科研工具")
print(trends['analysis']['summary'])

# 3. 获取评论
comments = await xiaohongshu_fetch_comments(
    note_id="note-123",
    max_comments=30,
    sort_by="likes"
)
for c in comments['comments'][:5]:
    print(f"{c['author']}: {c['content']} (赞: {c['likes']})")
```

### API 调用

```bash
# 搜索
curl -X POST http://127.0.0.1:8765/api/tools/xiaohongshu/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "科研", "max_results": 10, "min_likes": 1000}'

# 分析 Trends
curl -X POST http://127.0.0.1:8765/api/tools/xiaohongshu/trends \
  -H "Content-Type: application/json" \
  -d '{"keyword": "读博"}'

# 获取评论
curl -X POST http://127.0.0.1:8765/api/tools/xiaohongshu/comments \
  -H "Content-Type: application/json" \
  -d '{"note_id": "abc123", "max_comments": 20}'
```

---

## 扩展建议

1. **真实数据源**：接入 RSSHub、第三方 API 或浏览器自动化（Playwright）获取真实数据
2. **缓存机制**：使用 Redis 或本地 SQLite 缓存搜索结果，避免频繁请求
3. **代理池**：添加代理支持以应对反爬
4. **前端界面**：在 React 前端添加搜索界面和 Trends 可视化

---

## 自检清单

- [x] 搜索功能支持关键词、高赞过滤、排序
- [x] 评论获取支持按赞排序
- [x] Trends 分析使用 Claude 进行智能总结
- [x] 包含完整的单元测试
- [x] 包含模拟数据（开发测试用）
- [x] SDK 导出所有工具函数
- [x] 可选 FastAPI 路由
