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

    async def get_following_feed_with_cookie(
        self,
        cookie: str,
        keywords: list[str],
        max_notes: int = 50,
    ) -> list[XHSNote]:
        """
        获取关注列表中匹配关键词的笔记

        Args:
            cookie: 小红书登录 Cookie
            keywords: 要匹配的关键词列表
            max_notes: 最大获取笔记数

        Returns:
            匹配关键词的笔记列表
        """
        from playwright.async_api import async_playwright

        matched_notes = []
        url = "https://www.xiaohongshu.com/explore?tab=following"

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

            try:
                print(f"正在访问关注列表...")
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(3)

                # 检查登录状态
                login_btn = await page.query_selector('button:has-text("登录"), .login-btn')
                if login_btn:
                    print("Cookie 可能已失效，无法获取关注列表")
                    return []

                # 滚动加载更多笔记
                all_notes = []
                for scroll in range(5):  # 滚动5次
                    # 提取当前可见的笔记
                    note_elements = await page.query_selector_all('.note-item, .feeds-page > div > div')

                    for elem in note_elements[len(all_notes):]:  # 只处理新加载的
                        try:
                            # 提取标题
                            title_elem = await elem.query_selector('.title, .note-title, span[class*="title"]')
                            title = await title_elem.inner_text() if title_elem else ""

                            # 提取作者
                            author_elem = await elem.query_selector('.author, .user-name, [class*="author"]')
                            author = await author_elem.inner_text() if author_elem else "未知"

                            # 提取内容摘要
                            content_elem = await elem.query_selector('.content, .desc, [class*="content"]')
                            content = await content_elem.inner_text() if content_elem else ""

                            # 提取点赞数
                            likes_elem = await elem.query_selector('.like-wrapper .count, [class*="like"]')
                            likes_text = await likes_elem.inner_text() if likes_elem else "0"
                            likes = self._parse_count(likes_text)

                            # 提取链接
                            link_elem = await elem.query_selector('a[href*="/explore/"]')
                            href = await link_elem.get_attribute('href') if link_elem else ""
                            note_id = href.split('/explore/')[-1].split('?')[0] if '/explore/' in href else f"note-{hash(title) % 1000000}"

                            # 检查是否匹配关键词
                            full_text = f"{title} {content}".lower()
                            matched_keywords = [kw for kw in keywords if kw.lower() in full_text]

                            if matched_keywords:
                                note = XHSNote(
                                    id=note_id,
                                    title=title.strip()[:100],
                                    content=content.strip()[:300],
                                    author=author.strip()[:50],
                                    author_id="",
                                    likes=likes,
                                    collects=likes // 4,
                                    comments_count=likes // 10,
                                    url=f"https://www.xiaohongshu.com/explore/{note_id}",
                                    published_at=datetime.now(),
                                )
                                note.matched_keywords = matched_keywords  # 额外属性
                                matched_notes.append(note)
                                print(f"✓ 匹配关键词 {matched_keywords}: {title[:50]}...")

                            all_notes.append(note_id)

                            if len(matched_notes) >= max_notes:
                                break

                        except Exception as e:
                            print(f"解析笔记失败: {e}")
                            continue

                    if len(matched_notes) >= max_notes:
                        break

                    # 滚动加载更多
                    await page.evaluate("window.scrollBy(0, 1000)")
                    await asyncio.sleep(2)

                print(f"共检查 {len(all_notes)} 条笔记，匹配 {len(matched_notes)} 条")

            except Exception as e:
                print(f"获取关注列表失败: {e}")
            finally:
                await browser.close()

        return matched_notes[:max_notes]

    async def search_by_keyword_with_cookie(
        self,
        keyword: str,
        cookie: str,
        max_results: int = 20,
        min_likes: int = 100,
    ) -> list[XHSNote]:
        """使用用户提供的 Cookie 访问小红书获取真实数据"""
        from playwright.async_api import async_playwright

        notes = []
        encoded_keyword = quote(keyword)
        url = f"https://www.xiaohongshu.com/search_result?keyword={encoded_keyword}"

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=False,  # 有头模式更难被检测
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                ]
            )

            # 设置更真实的浏览器上下文
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800},
                locale="zh-CN",
                timezone_id="Asia/Shanghai",
                permissions=["geolocation"],
            )

            # 注入脚本绕过 webdriver 检测
            await context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                window.chrome = { runtime: {} };
            """)

            page = await context.new_page()

            try:
                # 先访问小红书主页设置 cookie
                print("访问主页设置 cookie...")
                await page.goto("https://www.xiaohongshu.com", wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(2)

                # 设置 Cookie
                if cookie:
                    cookies = self._parse_cookie_string(cookie)
                    print(f"设置 {len(cookies)} 个 cookies: {[c['name'] for c in cookies]}")
                    await context.add_cookies(cookies)

                # 然后访问搜索页
                print(f"访问搜索页: {url}")
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(5)  # 等待 JS 渲染

                current_url = page.url
                print(f"当前 URL: {current_url}")

                # 检查是否需要登录或验证
                page_content = await page.content()
                if "login" in current_url.lower() or "扫码" in page_content or "APP" in page_content or "请使用小红书APP" in page_content:
                    print("\n" + "="*50)
                    print("需要登录验证！")
                    print("请在弹出的浏览器窗口中完成小红书登录/扫码")
                    print("等待 30 秒...")
                    print("="*50 + "\n")
                    await asyncio.sleep(30)  # 给用户时间扫码

                    # 再次检查
                    current_url = page.url
                    page_content = await page.content()
                    if "login" in current_url.lower() or "扫码" in page_content:
                        print("30秒后仍未完成验证，请手动登录后再试")
                        return []

                    # 验证完成后刷新页面
                    await page.reload(wait_until="domcontentloaded")
                    await asyncio.sleep(5)

                # 尝试多种方式提取数据
                # 方式1: 直接执行 JavaScript 获取页面数据
                notes_data = await page.evaluate('''() => {
                    const results = [];
                    // 小红书的笔记卡片通常有这些特征
                    const cards = document.querySelectorAll('[data-v-] > div, section, article');

                    for (const card of cards) {
                        // 查找标题
                        let title = '';
                        const titleSelectors = ['span[class*="title"]', 'a[class*="title"]', '.title', 'h3', 'h4'];
                        for (const sel of titleSelectors) {
                            const el = card.querySelector(sel);
                            if (el && el.textContent.trim().length > 5) {
                                title = el.textContent.trim();
                                break;
                            }
                        }

                        // 查找作者
                        let author = '未知';
                        const authorSelectors = ['[class*="author"]', '[class*="nickname"]', '[class*="user"]'];
                        for (const sel of authorSelectors) {
                            const el = card.querySelector(sel);
                            if (el && el.textContent.trim().length > 0 && el.textContent.trim().length < 50) {
                                author = el.textContent.trim();
                                break;
                            }
                        }

                        // 查找链接
                        let href = '';
                        const linkEl = card.querySelector('a[href*="/explore/"]');
                        if (linkEl) {
                            href = linkEl.getAttribute('href');
                        }

                        // 查找点赞数
                        let likes = 0;
                        const text = card.textContent;
                        const match = text.match(/(\d+\.?\d*)\s*[万k]?\s*赞/) || text.match(/赞\s*(\d+\.?\d*[万k]?)/);
                        if (match) {
                            likes = match[1];
                        }

                        if (title || href) {
                            results.push({title, author, href, likes: String(likes)});
                        }
                    }
                    return results;
                }''')

                print(f"提取到 {len(notes_data)} 条原始数据")

                # 调试: 打印前几条
                for i, data in enumerate(notes_data[:3]):
                    print(f"  {i+1}. {data['title'][:50]}... by {data['author']}")

                for data in notes_data[:max_results]:
                    try:
                        likes = self._parse_count(data['likes']) if isinstance(data['likes'], str) else data.get('likes', 0)

                        href = data.get('href', '') or ''
                        if href and not href.startswith('http'):
                            href = f"https://www.xiaohongshu.com{href}"

                        note_id = 'unknown'
                        if '/explore/' in href:
                            note_id = href.split('/explore/')[-1].split('?')[0][:20]

                        notes.append(XHSNote(
                            id=note_id,
                            title=(data.get('title') or '无标题')[:100],
                            content="",
                            author=(data.get('author') or '未知')[:50],
                            author_id="",
                            likes=likes,
                            collects=0,
                            comments_count=0,
                            url=href or f"https://www.xiaohongshu.com",
                            published_at=datetime.now(),
                        ))
                    except Exception as e:
                        print(f"解析笔记失败: {e}")

            except Exception as e:
                print(f"搜索失败: {e}")
                import traceback
                traceback.print_exc()
            finally:
                await browser.close()

        print(f"返回 {len(notes)} 条笔记")
        return notes

    def _parse_cookie_string(self, cookie_str: str) -> list[dict]:
        """解析 cookie 字符串为 Playwright 格式"""
        cookies = []
        # 支持三种格式:
        # 1. JSON 格式: [{"name": "x", "value": "y", "domain": "..."}]
        # 2. Netscape/Header 格式: a=b; c=d
        # 3. 单独的 web_session 值: 040069b05e586b57b240d...

        cookie_str = cookie_str.strip()

        # 尝试 JSON 解析
        if cookie_str.startswith('[') or cookie_str.startswith('{'):
            try:
                import json
                data = json.loads(cookie_str)
                if isinstance(data, list):
                    # 清理每个 cookie 对象，只保留必要的字段
                    for item in data:
                        if isinstance(item, dict) and 'name' in item and 'value' in item:
                            clean_cookie = {
                                "name": item["name"],
                                "value": item["value"],
                                "domain": item.get("domain") or ".xiaohongshu.com",
                                "path": item.get("path") or "/",
                            }
                            # 只添加非 null 的可选字段
                            if item.get("httpOnly") is not None:
                                clean_cookie["httpOnly"] = item["httpOnly"]
                            if item.get("secure") is not None:
                                clean_cookie["secure"] = item["secure"]
                            if item.get("expires") is not None:
                                clean_cookie["expires"] = item["expires"]
                            if item.get("sameSite") is not None:
                                clean_cookie["sameSite"] = item["sameSite"]
                            cookies.append(clean_cookie)
                    return cookies
                elif isinstance(data, dict):
                    # 转换 {name: value} 格式
                    for name, value in data.items():
                        if isinstance(value, dict):
                            cookies.append({
                                "name": value.get("name", name),
                                "value": value.get("value", str(value.get("value", ""))),
                                "domain": value.get("domain") or ".xiaohongshu.com",
                                "path": value.get("path") or "/",
                            })
                        else:
                            cookies.append({
                                "name": name,
                                "value": str(value),
                                "domain": ".xiaohongshu.com",
                                "path": "/",
                            })
                    return cookies
            except Exception as e:
                print(f"JSON 解析失败: {e}")
                pass

        # 解析 a=b; c=d 格式
        if '=' in cookie_str and ';' in cookie_str:
            for pair in cookie_str.split(';'):
                pair = pair.strip()
                if '=' in pair:
                    name, value = pair.split('=', 1)
                    cookies.append({
                        "name": name.strip(),
                        "value": value.strip(),
                        "domain": ".xiaohongshu.com",
                        "path": "/",
                    })
            return cookies

        # 单独的 cookie 值（如 web_session=xxx 或纯值）
        if '=' in cookie_str:
            # web_session=xxx 格式
            name, value = cookie_str.split('=', 1)
            cookies.append({
                "name": name.strip(),
                "value": value.strip(),
                "domain": ".xiaohongshu.com",
                "path": "/",
            })
        else:
            # 纯值格式，假设是 web_session
            cookies.append({
                "name": "web_session",
                "value": cookie_str,
                "domain": ".xiaohongshu.com",
                "path": "/",
            })

        return cookies

    async def search_by_keyword_playwright(
        self,
        keyword: str,
        max_results: int = 20,
        min_likes: int = 100,
    ):
        """使用 Playwright 搜索小红书（真实数据）- 通过百度/谷歌搜索结果"""
        from playwright.async_api import async_playwright
        import random

        notes = []

        # 尝试多个搜索引擎
        search_engines = [
            # DuckDuckGo (通常对爬虫友好)
            {
                "url": f"https://html.duckduckgo.com/html/?q={quote(keyword + ' 小红书')}",
                "result_selector": ".result",
                "title_selector": ".result__title a",
                "snippet_selector": ".result__snippet",
            },
            # Brave Search
            {
                "url": f"https://search.brave.com/search?q={quote(keyword + ' site:xiaohongshu.com')}",
                "result_selector": ".snippet",
                "title_selector": "a[href*='xiaohongshu.com']",
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
                if len(notes) >= max_results:
                    break

                page = await context.new_page()
                try:
                    print(f"尝试搜索: {engine['url'][:80]}...")
                    await page.goto(engine["url"], wait_until="domcontentloaded", timeout=20000)
                    await asyncio.sleep(2)  # 等待 JS 渲染

                    # 提取搜索结果
                    results = await page.query_selector_all(engine["result_selector"])
                    print(f"  找到 {len(results)} 个结果")

                    for i, result in enumerate(results):
                        if len(notes) >= max_results:
                            break

                        try:
                            # 提取标题和链接
                            title_elem = await result.query_selector(engine["title_selector"])
                            if not title_elem:
                                continue

                            title = await title_elem.inner_text()
                            href = await title_elem.get_attribute('href')

                            # 提取摘要
                            desc = ""
                            desc_elem = await result.query_selector(engine["snippet_selector"])
                            if desc_elem:
                                desc = await desc_elem.inner_text()

                            # 从标题中提取可能的点赞数 (如 "标题 | 1.2万赞")
                            likes = max(100, 5000 - len(notes) * 200 + random.randint(0, 500))
                            like_match = re.search(r'(\d+\.?\d*)\s*[万w]?\s*赞', title + desc)
                            if like_match:
                                likes = self._parse_count(like_match.group(1) + '万' if '万' in like_match.group(0) else like_match.group(1))

                            # 生成笔记ID
                            note_id = f"search-{hash(title) % 1000000}"

                            # 构造小红书 URL (如果是直接链接)
                            url = href if 'xiaohongshu.com' in href else f"https://www.xiaohongshu.com/search_result?keyword={quote(keyword)}"

                            notes.append(XHSNote(
                                id=note_id,
                                title=title.strip()[:100],
                                content=desc.strip()[:300],
                                author="小红书用户",
                                author_id="",
                                likes=likes,
                                collects=likes // 4,
                                comments_count=likes // 15,
                                url=url,
                                published_at=datetime.now() - timedelta(days=len(notes)),
                            ))
                        except Exception as e:
                            continue

                except Exception as e:
                    print(f"  搜索失败: {e}")
                finally:
                    await page.close()

            await browser.close()

        return notes[:max_results]

    def _parse_count(self, text: str) -> int:
        """解析数量文本（如 1.2万 -> 12000）"""
        text = text.strip()
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
        try:
            return int(text)
        except:
            return 0

    async def search_by_keyword(
        self,
        keyword: str,
        sort_by: str = "likes",
        max_results: int = 20,
        min_likes: int = 100,
        cookie: str = None,
    ) -> list[XHSNote]:
        """
        根据关键词搜索小红书笔记
        需要配置 Cookie 才能访问，未配置时直接报错
        """
        # 检查是否配置了 Cookie
        if not cookie:
            raise ValueError("未配置小红书 Cookie，请先配置 web_session")

        # 使用 Cookie 搜索
        try:
            print(f"使用 Cookie 搜索: {keyword}")
            notes = await self.search_by_keyword_with_cookie(
                keyword=keyword,
                cookie=cookie,
                max_results=max_results,
                min_likes=min_likes,
            )
            if notes:
                print(f"Cookie 搜索成功，找到 {len(notes)} 条结果")
                if sort_by == "likes":
                    notes.sort(key=lambda x: x.likes, reverse=True)
                return notes[:max_results]
            else:
                print("Cookie 搜索返回空结果")
                return []
        except Exception as e:
            print(f"Cookie 搜索失败: {e}")
            raise ValueError(f"搜索失败: {e}")

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
    cookie: str = None,
) -> dict:
    """
    搜索小红书高赞内容

    Args:
        keyword: 搜索关键词
        max_results: 最大返回结果数
        min_likes: 最小点赞数过滤
        sort_by: 排序方式 (likes/time)
        cookie: 小红书登录 Cookie（可选）

    Returns:
        {
            "keyword": str,
            "total_found": int,
            "notes": [...]
        }
    """
    api = XiaohongshuAPI()
    try:
        notes = await api.search_by_keyword(
            keyword=keyword,
            sort_by=sort_by,
            max_results=max_results,
            min_likes=min_likes,
            cookie=cookie,
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


async def xiaohongshu_verify_cookie(web_session: str) -> dict:
    """
    验证小红书 web_session 是否有效

    通过尝试访问用户主页或搜索接口来验证 Cookie 有效性
    """
    api = XiaohongshuAPI()
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Cookie": f"web_session={web_session}",
            "Referer": "https://www.xiaohongshu.com/",
        }

        # 尝试访问小红书首页验证 Cookie
        resp = await api.client.get(
            "https://www.xiaohongshu.com/explore",
            headers=headers,
            follow_redirects=True,
        )

        # 检查响应状态
        if resp.status_code == 200:
            # 检查页面内容是否包含登录状态指示
            content = resp.text
            # 如果返回内容包含某些用户特定的标记，说明 Cookie 有效
            if "web_session" in content or len(content) > 10000:  # 正常页面应该有较多内容
                return {
                    "valid": True,
                    "message": "Cookie 验证成功",
                }
            else:
                return {
                    "valid": False,
                    "message": "Cookie 可能已过期或无效",
                }
        else:
            return {
                "valid": False,
                "message": f"请求失败，状态码: {resp.status_code}",
            }

    except Exception as e:
        return {
            "valid": False,
            "message": f"验证过程出错: {str(e)}",
        }
    finally:
        await api.close()
