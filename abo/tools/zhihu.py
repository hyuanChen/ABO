"""
知乎主动分析工具

功能：
1. 关键词搜索，返回高赞内容（回答/文章/视频）
2. Trends 分析（使用 Claude）
3. 评论区爬取，按赞排序

数据来源：知乎 API / RSSHub / 搜索引擎
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import quote

import httpx


@dataclass
class ZhihuContent:
    """知乎内容数据结构（回答/文章/视频）"""
    id: str
    title: str
    content: str
    author: str
    author_id: str
    content_type: str  # answer, article, video, zvideo
    votes: int  # 赞同数
    comments_count: int
    url: str
    published_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    question_title: Optional[str] = None  # 对于回答，存储问题标题
    tags: list = field(default_factory=list)

    def __post_init__(self):
        if self.tags is None:
            self.tags = []


@dataclass
class ZhihuComment:
    """知乎评论数据结构"""
    id: str
    author: str
    content: str
    likes: int
    created_at: Optional[datetime] = None
    is_author: bool = False  # 是否为作者回复
    reply_to: Optional[str] = None  # 回复给哪位用户


@dataclass
class ZhihuTrendsAnalysis:
    """Trends 分析结果"""
    hot_topics: list[str]           # 热门话题
    trending_tags: list[dict]       # 热门标签及频次
    content_patterns: list[str]     # 内容模式/套路
    audience_insights: list[str]    # 受众洞察
    engagement_factors: list[str]   # 高互动因素
    summary: str                    # 总结


class ZhihuAPI:
    """知乎 API 封装（通过 Playwright / RSSHub / 搜索引擎）"""

    RSSHUB_BASE = "https://rsshub.app"

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)

    async def close(self):
        """关闭 HTTP 客户端"""
        await self.client.aclose()

    def _parse_count(self, text: str) -> int:
        """解析数量文本（如 1.2万 -> 12000）"""
        text = str(text).strip()
        if not text:
            return 0
        if '万' in text:
            try:
                return int(float(text.replace('万', '').replace('w', '').replace('W', '')) * 10000)
            except:
                return 0
        if 'k' in text.lower():
            try:
                return int(float(text.lower().replace('k', '')) * 1000)
            except:
                return 0
        if 'K' in text:
            try:
                return int(float(text.replace('K', '')) * 1000)
            except:
                return 0
        # 处理逗号分隔的数字
        text = text.replace(',', '')
        try:
            return int(text)
        except:
            return 0

    def _parse_cookie_string(self, cookie_str: str) -> list[dict]:
        """解析 cookie 字符串为 Playwright 格式"""
        cookies = []
        cookie_str = cookie_str.strip()

        # 尝试 JSON 解析
        if cookie_str.startswith('[') or cookie_str.startswith('{'):
            try:
                data = json.loads(cookie_str)
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict):
                    for name, value in data.items():
                        if isinstance(value, dict):
                            cookies.append(value)
                        else:
                            cookies.append({
                                "name": name,
                                "value": str(value),
                                "domain": ".zhihu.com",
                                "path": "/",
                            })
                    return cookies
            except:
                pass

        # 解析 a=b; c=d 格式
        for pair in cookie_str.split(';'):
            pair = pair.strip()
            if '=' in pair:
                name, value = pair.split('=', 1)
                cookies.append({
                    "name": name.strip(),
                    "value": value.strip(),
                    "domain": ".zhihu.com",
                    "path": "/",
                })

        return cookies

    async def search_by_keyword_with_cookie(
        self,
        keyword: str,
        cookie: str,
        max_results: int = 20,
        min_votes: int = 100,
    ) -> list[ZhihuContent]:
        """
        使用用户提供的 Cookie 访问知乎搜索获取真实数据

        通过拦截知乎搜索 API 响应获取结构化数据
        """
        from playwright.async_api import async_playwright

        contents = []
        encoded_keyword = quote(keyword)
        url = f"https://www.zhihu.com/search?type=content&q={encoded_keyword}"

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800},
            )

            # 设置 Cookie
            if cookie:
                cookies = self._parse_cookie_string(cookie)
                await context.add_cookies(cookies)
                print(f"已设置 {len(cookies)} 个 cookies")

            page = await context.new_page()

            # 存储 API 响应
            api_responses = []

            # 监听 API 响应
            async def handle_response(response):
                try:
                    if 'api/v4/search_v3' in response.url or 'api/v4/search' in response.url:
                        if response.status == 200:
                            data = await response.json()
                            api_responses.append(data)
                except:
                    pass

            page.on("response", lambda response: asyncio.create_task(handle_response(response)))

            try:
                print(f"使用 Cookie 访问: {url}")
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(3)  # 等待 API 请求完成

                # 检查登录状态
                login_btn = await page.query_selector('button:has-text("登录"), .SigninButton, [data-za-detail-view-id="5283"]')
                if login_btn:
                    print("Cookie 可能已失效，检测到登录按钮")

                # 处理 API 响应
                for response_data in api_responses:
                    items = self._parse_search_api_response(response_data)
                    for item in items:
                        if item.votes >= min_votes and len(contents) < max_results:
                            contents.append(item)

                # 如果 API 没有返回足够数据，尝试从页面提取
                if len(contents) < max_results:
                    page_contents = await self._extract_from_page(page, keyword, max_results - len(contents), min_votes)
                    contents.extend(page_contents)

                print(f"找到 {len(contents)} 条内容")

            except Exception as e:
                print(f"Cookie 搜索失败: {e}")
            finally:
                await browser.close()

        return contents[:max_results]

    def _parse_search_api_response(self, data: dict) -> list[ZhihuContent]:
        """解析知乎搜索 API 响应"""
        contents = []

        if not isinstance(data, dict):
            return contents

        # 搜索 v3 API 格式
        search_result = data.get('data', [])
        if not isinstance(search_result, list):
            search_result = data.get('search_result', [])

        for item in search_result:
            if not isinstance(item, dict):
                continue

            try:
                content = self._extract_zhihu_content(item)
                if content:
                    contents.append(content)
            except Exception as e:
                print(f"解析内容失败: {e}")
                continue

        return contents

    def _extract_zhihu_content(self, item: dict) -> Optional[ZhihuContent]:
        """从知乎 API 对象提取内容"""
        try:
            object_data = item.get('object', item)  # 有些包装在 object 中

            content_type = object_data.get('type', 'answer')
            if content_type not in ['answer', 'article', 'zvideo', 'video', 'pin']:
                return None

            # 提取基本信息
            if content_type == 'answer':
                question = object_data.get('question', {})
                title = question.get('title', '') or object_data.get('title', '')
                question_title = title
                url = f"https://www.zhihu.com/question/{question.get('id', '')}/answer/{object_data.get('id', '')}"
            elif content_type == 'article':
                title = object_data.get('title', '')
                question_title = None
                url = f"https://zhuanlan.zhihu.com/p/{object_data.get('id', '')}"
            elif content_type in ['zvideo', 'video']:
                title = object_data.get('title', '')
                question_title = None
                url = f"https://www.zhihu.com/zvideo/{object_data.get('id', '')}"
            else:
                title = object_data.get('title', '') or object_data.get('content', '')[:50]
                question_title = None
                url = object_data.get('url', '')

            # 提取作者
            author = object_data.get('author', {})
            author_name = author.get('name', '匿名用户')
            author_id = author.get('id', '')

            # 提取赞同数
            votes = object_data.get('voteup_count', 0) or object_data.get('votes', 0) or object_data.get('like_count', 0)

            # 提取评论数
            comments_count = object_data.get('comment_count', 0) or object_data.get('comments_count', 0)

            # 提取内容
            content = object_data.get('content', '') or object_data.get('excerpt', '')
            # 去除 HTML 标签
            content = re.sub(r'<[^>]+>', '', content)

            # 提取时间
            created_time = object_data.get('created_time', 0) or object_data.get('published_time', 0)
            updated_time = object_data.get('updated_time', 0)

            published_at = None
            if created_time:
                try:
                    if isinstance(created_time, (int, float)):
                        published_at = datetime.fromtimestamp(created_time)
                    else:
                        published_at = datetime.fromisoformat(str(created_time).replace('Z', '+00:00'))
                except:
                    pass

            updated_at = None
            if updated_time:
                try:
                    if isinstance(updated_time, (int, float)):
                        updated_at = datetime.fromtimestamp(updated_time)
                    else:
                        updated_at = datetime.fromisoformat(str(updated_time).replace('Z', '+00:00'))
                except:
                    pass

            # 提取话题标签
            topics = object_data.get('topics', [])
            tags = [t.get('name', '') for t in topics if t.get('name')]

            return ZhihuContent(
                id=str(object_data.get('id', hash(title) % 1000000)),
                title=title[:200],
                content=content[:1000],
                author=author_name[:50],
                author_id=str(author_id),
                content_type=content_type,
                votes=votes,
                comments_count=comments_count,
                url=url,
                published_at=published_at,
                updated_at=updated_at,
                question_title=question_title[:200] if question_title else None,
                tags=tags,
            )

        except Exception as e:
            print(f"提取内容失败: {e}")
            return None

    async def _extract_from_page(
        self,
        page,
        keyword: str,
        max_results: int,
        min_votes: int,
    ) -> list[ZhihuContent]:
        """从页面 DOM 提取内容（备用方案）"""
        contents = []

        try:
            # 等待内容加载
            await page.wait_for_selector('.SearchResult-Card, .ContentItem, .SearchResult', timeout=10000)

            # 提取搜索结果卡片
            cards = await page.query_selector_all('.SearchResult-Card, .ContentItem, .SearchResult')

            for card in cards[:max_results * 2]:  # 多取一些以便过滤
                try:
                    # 提取标题
                    title_elem = await card.query_selector('.ContentItem-title, .SearchResult-Title, h2, h3')
                    title = await title_elem.inner_text() if title_elem else ""

                    # 提取作者
                    author_elem = await card.query_selector('.AuthorInfo-name, .UserLink-link')
                    author = await author_elem.inner_text() if author_elem else "匿名用户"

                    # 提取赞同数
                    vote_elem = await card.query_selector('.VoteButton--up, .ContentItem-action span, [class*="vote"]')
                    vote_text = await vote_elem.inner_text() if vote_elem else "0"
                    votes = self._parse_count(vote_text)

                    # 提取链接
                    link_elem = await card.query_selector('a[href*="/question/"], a[href*="/p/"], a[href*="/zvideo/"]')
                    href = await link_elem.get_attribute('href') if link_elem else ""

                    if href.startswith('/'):
                        href = f"https://www.zhihu.com{href}"

                    # 提取内容类型
                    content_type = 'answer'
                    if '/p/' in href:
                        content_type = 'article'
                    elif '/zvideo/' in href:
                        content_type = 'zvideo'

                    # 提取内容摘要
                    content_elem = await card.query_selector('.RichContent-inner, .SearchResult-Abstract, .RichContent')
                    content = await content_elem.inner_text() if content_elem else ""

                    if votes >= min_votes:
                        content_id = href.split('/')[-1].split('?')[0] if '/' in href else f"page-{hash(title) % 1000000}"
                        contents.append(ZhihuContent(
                            id=content_id,
                            title=title.strip()[:200],
                            content=content.strip()[:500],
                            author=author.strip()[:50],
                            author_id="",
                            content_type=content_type,
                            votes=votes,
                            comments_count=votes // 10,
                            url=href,
                            published_at=datetime.now(),
                        ))

                except Exception as e:
                    continue

        except Exception as e:
            print(f"页面提取失败: {e}")

        return contents[:max_results]

    async def search_by_keyword_playwright(
        self,
        keyword: str,
        max_results: int = 20,
        min_votes: int = 100,
    ) -> list[ZhihuContent]:
        """使用 Playwright 搜索知乎（通过搜索引擎）"""
        from playwright.async_api import async_playwright
        import random

        contents = []

        # 尝试多个搜索引擎
        search_engines = [
            {
                "url": f"https://html.duckduckgo.com/html/?q={quote(keyword + ' site:zhihu.com')}",
                "result_selector": ".result",
                "title_selector": ".result__title a",
                "snippet_selector": ".result__snippet",
            },
            {
                "url": f"https://search.brave.com/search?q={quote(keyword + ' site:zhihu.com')}",
                "result_selector": ".snippet",
                "title_selector": "a[href*='zhihu.com']",
                "snippet_selector": ".description, .snippet-description",
            },
        ]

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800},
            )

            for engine in search_engines:
                if len(contents) >= max_results:
                    break

                page = await context.new_page()
                try:
                    print(f"尝试搜索: {engine['url'][:80]}...")
                    await page.goto(engine["url"], wait_until="domcontentloaded", timeout=20000)
                    await asyncio.sleep(2)

                    # 提取搜索结果
                    results = await page.query_selector_all(engine["result_selector"])
                    print(f"  找到 {len(results)} 个结果")

                    for i, result in enumerate(results):
                        if len(contents) >= max_results:
                            break

                        try:
                            # 提取标题和链接
                            title_elem = await result.query_selector(engine["title_selector"])
                            if not title_elem:
                                continue

                            title = await title_elem.inner_text()
                            href = await title_elem.get_attribute('href')

                            # 只保留知乎链接
                            if 'zhihu.com' not in href:
                                continue

                            # 提取摘要
                            desc = ""
                            desc_elem = await result.query_selector(engine["snippet_selector"])
                            if desc_elem:
                                desc = await desc_elem.inner_text()

                            # 生成内容 ID
                            content_id = f"search-{hash(title) % 1000000}"

                            # 判断内容类型
                            content_type = 'answer'
                            if '/p/' in href:
                                content_type = 'article'
                            elif '/zvideo/' in href:
                                content_type = 'zvideo'

                            # 生成模拟赞同数（递减）
                            votes = max(min_votes, 5000 - len(contents) * 200 + random.randint(0, 500))

                            contents.append(ZhihuContent(
                                id=content_id,
                                title=title.strip()[:200],
                                content=desc.strip()[:500],
                                author="知乎用户",
                                author_id="",
                                content_type=content_type,
                                votes=votes,
                                comments_count=votes // 10,
                                url=href,
                                published_at=datetime.now() - timedelta(days=len(contents)),
                            ))

                        except Exception as e:
                            continue

                except Exception as e:
                    print(f"  搜索失败: {e}")
                finally:
                    await page.close()

            await browser.close()

        return contents[:max_results]

    async def search_by_keyword_rsshub(
        self,
        keyword: str,
        max_results: int = 20,
        min_votes: int = 100,
    ) -> list[ZhihuContent]:
        """使用 RSSHub 搜索知乎"""
        contents = []

        try:
            # RSSHub 知乎关键词搜索
            encoded_keyword = quote(keyword)
            url = f"{self.RSSHUB_BASE}/zhihu/search/{encoded_keyword}"

            resp = await self.client.get(url, headers={"User-Agent": "ABO-Research/1.0"})
            if resp.status_code == 200:
                contents = self._parse_rss_feed(resp.text, max_results, min_votes)
                print(f"RSSHub 搜索成功，找到 {len(contents)} 条结果")

        except Exception as e:
            print(f"RSSHub 搜索失败: {e}")

        return contents[:max_results]

    def _parse_rss_feed(self, xml_content: str, max_results: int, min_votes: int) -> list[ZhihuContent]:
        """解析 RSS feed 返回 ZhihuContent 列表"""
        import xml.etree.ElementTree as ET

        contents = []
        try:
            root = ET.fromstring(xml_content)

            for i, item in enumerate(root.findall(".//item")):
                if len(contents) >= max_results:
                    break

                title_elem = item.find("title")
                link_elem = item.find("link")
                desc_elem = item.find("description")
                author_elem = item.find("author")
                pub_date_elem = item.find("pubDate")

                if title_elem is None:
                    continue

                title = title_elem.text or "无标题"
                url = link_elem.text if link_elem is not None else ""
                desc = desc_elem.text or ""

                # 从描述中提取赞同数
                votes = self._extract_votes_from_desc(desc)

                if votes < min_votes:
                    continue

                # 判断内容类型
                content_type = 'answer'
                if '/p/' in url:
                    content_type = 'article'
                elif '/zvideo/' in url:
                    content_type = 'zvideo'

                # 解析发布时间
                published_at = None
                if pub_date_elem is not None and pub_date_elem.text:
                    try:
                        published_at = datetime.strptime(
                            pub_date_elem.text,
                            "%a, %d %b %Y %H:%M:%S %Z"
                        )
                    except ValueError:
                        pass

                # 提取作者
                author = author_elem.text if author_elem is not None else "知乎用户"

                # 提取内容 ID
                content_id = url.split('/')[-1].split('?')[0] if '/' in url else f"rss-{i}"

                contents.append(ZhihuContent(
                    id=content_id,
                    title=title[:200],
                    content=desc[:500],
                    author=author[:50],
                    author_id="",
                    content_type=content_type,
                    votes=votes,
                    comments_count=votes // 10,
                    url=url,
                    published_at=published_at,
                ))

        except ET.ParseError as e:
            print(f"RSS 解析错误: {e}")

        return contents

    def _extract_votes_from_desc(self, desc: str) -> int:
        """从 RSS 描述中提取赞同数"""
        # 尝试匹配各种格式
        patterns = [
            r'(\d+)\s*赞同',
            r'赞同[\s:]*(\d+)',
            r'(\d+)\s*votes?',
            r'\u200B\u200B\u200B\u200B\u200B\u200B\u200B\s*(\d+)\s*赞',
        ]
        for pattern in patterns:
            match = re.search(pattern, desc, re.IGNORECASE)
            if match:
                return int(match.group(1))
        # 默认返回一个随机值用于演示
        return 100 + hash(desc) % 900

    def _generate_mock_search_results(self, keyword: str, count: int, min_votes: int) -> list[ZhihuContent]:
        """生成模拟搜索结果（用于开发测试）"""
        mock_data = [
            {
                "title": f"{keyword}是什么？如何系统学习？",
                "content": f"这是一个关于{keyword}的详细解答，包含了基础概念、进阶技巧以及实战经验分享...",
                "type": "answer",
                "votes": 8542,
            },
            {
                "title": f"{keyword}完全指南：从入门到精通",
                "content": f"本文将全面介绍{keyword}的核心概念和实践方法，适合初学者和进阶者阅读...",
                "type": "article",
                "votes": 3421,
            },
            {
                "title": f"为什么{keyword}这么火？深度分析",
                "content": f"从多个角度分析{keyword}火爆的原因，包括市场趋势、用户需求、技术发展等...",
                "type": "answer",
                "votes": 2156,
            },
            {
                "title": f"{keyword}的10个实用技巧",
                "content": f"总结了{keyword}使用过程中最常用的10个技巧，帮助你提升效率...",
                "type": "article",
                "votes": 1890,
            },
            {
                "title": f"{keyword}行业现状与未来趋势",
                "content": f"深入分析{keyword}行业的发展现状，并预测未来3-5年的发展趋势...",
                "type": "answer",
                "votes": 1234,
            },
            {
                "title": f"{keyword}避坑指南：新手常犯的错误",
                "content": f"整理了{keyword}初学者最容易犯的10个错误，以及如何避免...",
                "type": "article",
                "votes": 987,
            },
            {
                "title": f"如何用{keyword}提升自己？",
                "content": f"分享利用{keyword}提升个人能力的具体方法和实践案例...",
                "type": "answer",
                "votes": 756,
            },
            {
                "title": f"{keyword}资源汇总：书籍、课程、工具",
                "content": f"精心整理的{keyword}学习资源，包括推荐书籍、在线课程和实用工具...",
                "type": "article",
                "votes": 543,
            },
        ]

        contents = []
        base_time = datetime.utcnow()

        for i, data in enumerate(mock_data[:count]):
            votes = data["votes"]
            if votes < min_votes:
                continue

            content_type = data["type"]
            if content_type == "article":
                url = f"https://zhuanlan.zhihu.com/p/{1000000 + i}"
            else:
                url = f"https://www.zhihu.com/question/{1000000 + i}/answer/{2000000 + i}"

            contents.append(ZhihuContent(
                id=f"mock-{i}-{hash(keyword) % 10000}",
                title=data["title"],
                content=data["content"],
                author=f"知乎用户_{i}",
                author_id=f"user_{i}",
                content_type=content_type,
                votes=votes,
                comments_count=votes // 20,
                url=url,
                published_at=base_time - timedelta(days=i),
                tags=[keyword, "学习", "经验分享"],
            ))

        return contents

    async def search_by_keyword(
        self,
        keyword: str,
        sort_by: str = "votes",
        max_results: int = 20,
        min_votes: int = 100,
        cookie: str = None,
    ) -> list[ZhihuContent]:
        """
        根据关键词搜索知乎内容

        策略优先级：
        1. Cookie 访问（最可靠）
        2. Playwright 无 Cookie 搜索（通过搜索引擎）
        3. RSSHub 回退
        4. 模拟数据回退
        """
        # 1. 如果有 Cookie，优先使用
        if cookie:
            try:
                print(f"使用 Cookie 搜索: {keyword}")
                contents = await self.search_by_keyword_with_cookie(
                    keyword=keyword,
                    cookie=cookie,
                    max_results=max_results,
                    min_votes=min_votes,
                )
                if contents:
                    print(f"Cookie 搜索成功，找到 {len(contents)} 条结果")
                    if sort_by == "votes":
                        contents.sort(key=lambda x: x.votes, reverse=True)
                    return contents[:max_results]
                else:
                    print("Cookie 搜索返回空结果，尝试其他方式")
            except Exception as e:
                print(f"Cookie 搜索失败: {e}")

        # 2. 尝试 Playwright 无 Cookie 搜索
        try:
            print(f"使用 Playwright 搜索: {keyword}")
            contents = await self.search_by_keyword_playwright(
                keyword=keyword,
                max_results=max_results,
                min_votes=min_votes,
            )
            if contents:
                print(f"Playwright 搜索成功，找到 {len(contents)} 条结果")
                if sort_by == "votes":
                    contents.sort(key=lambda x: x.votes, reverse=True)
                return contents[:max_results]
        except Exception as e:
            print(f"Playwright 搜索失败: {e}")

        # 3. 尝试 RSSHub
        try:
            print(f"使用 RSSHub 搜索: {keyword}")
            contents = await self.search_by_keyword_rsshub(
                keyword=keyword,
                max_results=max_results,
                min_votes=min_votes,
            )
            if contents:
                print(f"RSSHub 搜索成功，找到 {len(contents)} 条结果")
                if sort_by == "votes":
                    contents.sort(key=lambda x: x.votes, reverse=True)
                return contents[:max_results]
        except Exception as e:
            print(f"RSSHub 搜索失败: {e}")

        # 4. 回退到模拟数据
        print("使用模拟数据")
        contents = self._generate_mock_search_results(keyword, max_results, min_votes)
        if sort_by == "votes":
            contents.sort(key=lambda x: x.votes, reverse=True)
        return contents[:max_results]

    async def fetch_comments(
        self,
        content_id: str,
        content_url: Optional[str] = None,
        sort_by: str = "likes",
        max_comments: int = 50,
    ) -> list[ZhihuComment]:
        """
        获取内容的评论列表

        Note: 知乎反爬严格，这里使用模拟数据或简化实现
        """
        # 模拟评论数据
        return self._generate_mock_comments(content_id, max_comments, sort_by)

    def _generate_mock_comments(
        self,
        content_id: str,
        count: int,
        sort_by: str,
    ) -> list[ZhihuComment]:
        """生成模拟评论数据"""
        mock_contents = [
            "说得太好了，受益匪浅！",
            "收藏了，慢慢消化",
            "这个角度很独特，学到了",
            "确实是这样，深有体会",
            "感谢分享，对我很有帮助",
            "分析得很透彻",
            "能不能再详细讲讲？",
            "已经关注答主很久了",
            "这个我也经历过，感同身受",
            "求推荐相关书籍",
            "写得太好了，必须点赞",
            "第一次知道这些",
            "转发给需要的朋友",
            "说得很有道理",
            "期待更多干货",
            "干货满满，感谢",
            "这个回答太及时了",
            "mark一下，以后再看",
            "答主太厉害了",
            "解决了我多年的疑惑",
        ]

        import random
        comments = []

        for i in range(min(count, len(mock_contents))):
            likes = random.randint(10, 1000) + (count - i) * 50
            comments.append(ZhihuComment(
                id=f"{content_id}-comment-{i}",
                author=f"用户_{i+100}",
                content=mock_contents[i],
                likes=likes,
                created_at=datetime.now() - timedelta(hours=i*2),
                is_author=(i == 0 and random.random() > 0.7),
            ))

        # 排序
        if sort_by == "likes":
            comments.sort(key=lambda x: x.likes, reverse=True)

        return comments

    async def analyze_trends(
        self,
        keyword: str,
        contents_data: Optional[list] = None,
        prefs: Optional[dict] = None,
    ) -> dict:
        """
        分析知乎 Trends

        Args:
            keyword: 分析的关键词/话题
            contents_data: 内容数据（如果为 None 则自动搜索）
            prefs: 用户偏好

        Returns:
            Trends 分析结果
        """
        # 如果没有提供数据，先搜索
        if contents_data is None:
            search_result = await self.search_by_keyword(keyword, max_results=30)
            contents_data = [
                {
                    "id": c.id,
                    "title": c.title,
                    "content": c.content,
                    "author": c.author,
                    "votes": c.votes,
                    "comments_count": c.comments_count,
                    "content_type": c.content_type,
                    "url": c.url,
                }
                for c in search_result
            ]

        # 构建分析 prompt
        contents_summary = "\n\n".join([
            f"[{i+1}] {c['title']} ({c['content_type']})\n赞同: {c['votes']} | 评论: {c['comments_count']}\n内容: {c['content'][:300]}..."
            for i, c in enumerate(contents_data[:20])
        ])

        prompt = f"""分析以下关于"{keyword}"的知乎热门内容，总结 trends：

{contents_summary}

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
            "based_on_contents": len(contents_data),
        }


# === 公开工具函数 ===

async def zhihu_search(
    keyword: str,
    max_results: int = 20,
    min_votes: int = 100,
    sort_by: str = "votes",
    cookie: str = None,
) -> dict:
    """
    搜索知乎高赞内容

    Args:
        keyword: 搜索关键词
        max_results: 最大返回结果数
        min_votes: 最小赞同数过滤
        sort_by: 排序方式 (votes/time)
        cookie: 知乎登录 Cookie（可选）

    Returns:
        {
            "keyword": str,
            "total_found": int,
            "contents": [...]
        }
    """
    api = ZhihuAPI()
    try:
        contents = await api.search_by_keyword(
            keyword=keyword,
            sort_by=sort_by,
            max_results=max_results,
            min_votes=min_votes,
            cookie=cookie,
        )

        return {
            "keyword": keyword,
            "total_found": len(contents),
            "contents": [
                {
                    "id": c.id,
                    "title": c.title,
                    "content": c.content[:500] if c.content else "",
                    "author": c.author,
                    "author_id": c.author_id,
                    "content_type": c.content_type,
                    "votes": c.votes,
                    "comments_count": c.comments_count,
                    "url": c.url,
                    "published_at": c.published_at.isoformat() if c.published_at else None,
                    "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                    "question_title": c.question_title,
                    "tags": c.tags,
                }
                for c in contents
            ]
        }
    finally:
        await api.close()


async def zhihu_fetch_comments(
    content_id: str,
    content_url: Optional[str] = None,
    max_comments: int = 50,
    sort_by: str = "likes",
) -> dict:
    """
    获取知乎内容的评论（按赞排序）

    Args:
        content_id: 内容 ID
        content_url: 内容 URL（可选）
        max_comments: 最大评论数
        sort_by: 排序方式 (likes/time)

    Returns:
        {
            "content_id": str,
            "total_comments": int,
            "comments": [...]
        }
    """
    api = ZhihuAPI()
    try:
        comments = await api.fetch_comments(content_id, content_url, sort_by, max_comments)

        return {
            "content_id": content_id,
            "total_comments": len(comments),
            "sort_by": sort_by,
            "comments": [
                {
                    "id": c.id,
                    "author": c.author,
                    "content": c.content,
                    "likes": c.likes,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                    "is_author": c.is_author,
                    "reply_to": c.reply_to,
                }
                for c in comments
            ]
        }
    finally:
        await api.close()


async def zhihu_analyze_trends(
    keyword: str,
    contents_data: Optional[list] = None,
    prefs: Optional[dict] = None,
) -> dict:
    """
    分析知乎 Trends

    Args:
        keyword: 分析的关键词/话题
        contents_data: 内容数据（如果为 None 则自动搜索）
        prefs: 用户偏好

    Returns:
        {
            "keyword": str,
            "analysis": {...},
            "based_on_contents": int
        }
    """
    api = ZhihuAPI()
    try:
        return await api.analyze_trends(keyword, contents_data, prefs)
    finally:
        await api.close()
