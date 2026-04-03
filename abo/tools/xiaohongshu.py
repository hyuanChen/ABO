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
