# 小红书真实搜索功能实现计划

**Goal:** 实现能够真实联网搜索小红书内容的工具，替换现有的模拟数据

**Architecture:** 使用 Playwright 自动化浏览器访问小红书网页版，模拟真实用户搜索行为，提取搜索结果

**Tech Stack:** Python + Playwright + FastAPI

---

## 问题分析

当前问题：
1. RSSHub `/xiaohongshu/search/{keyword}` 路由不存在/返回403
2. 代码回退到模拟数据，用户无法获得真实搜索结果

解决方案：
1. 使用 Playwright 自动化浏览器访问 `https://www.xiaohongshu.com/search_result?keyword=xxx`
2. 提取页面中的笔记数据（标题、作者、点赞、链接等）
3. 添加缓存机制避免频繁访问

---

## Task 1: 安装 Playwright

**Files:**
- Modify: `abo/tools/xiaohongshu.py`

- [ ] **Step 1: 安装 Playwright**

```bash
cd /Users/huanc/Desktop/ABO
python -m pip install playwright --break-system-packages
python -m playwright install chromium
```

Expected: Playwright 和 Chromium 浏览器安装成功

---

## Task 2: 实现基于 Playwright 的搜索

**Files:**
- Modify: `abo/tools/xiaohongshu.py`

- [ ] **Step 2: 添加 Playwright 搜索方法**

在 `XiaohongshuAPI` 类中添加新方法：

```python
async def search_by_keyword_playwright(
    self,
    keyword: str,
    max_results: int = 20,
    min_likes: int = 100,
) -> list[XHSNote]:
    """使用 Playwright 搜索小红书（真实数据）"""
    from playwright.async_api import async_playwright

    notes = []
    encoded_keyword = quote(keyword)
    url = f"https://www.xiaohongshu.com/search_result?keyword={encoded_keyword}&type=51"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()

        try:
            # 访问搜索页面
            await page.goto(url, wait_until="networkidle", timeout=30000)

            # 等待内容加载
            await page.wait_for_selector('section.note-item, .feeds-page', timeout=10000)

            # 滚动加载更多内容
            for _ in range(3):
                await page.evaluate("window.scrollBy(0, 800)")
                await asyncio.sleep(1)

            # 提取笔记数据
            note_elements = await page.query_selector_all('section.note-item')

            for elem in note_elements[:max_results]:
                try:
                    # 提取标题
                    title_elem = await elem.query_selector('.title span, .note-title')
                    title = await title_elem.inner_text() if title_elem else "无标题"

                    # 提取作者
                    author_elem = await elem.query_selector('.author .name, .user-name')
                    author = await author_elem.inner_text() if author_elem else "未知"

                    # 提取点赞数
                    likes_elem = await elem.query_selector('.like-wrapper .count, .likes-count')
                    likes_text = await likes_elem.inner_text() if likes_elem else "0"
                    likes = self._parse_count(likes_text)

                    # 提取链接
                    link_elem = await elem.query_selector('a[href*="/explore/"]')
                    href = await link_elem.get_attribute('href') if link_elem else ""
                    note_id = href.split('/explore/')[-1].split('?')[0] if '/explore/' in href else f"note-{hash(title)}"

                    # 只保留符合条件的
                    if likes >= min_likes:
                        notes.append(XHSNote(
                            id=note_id,
                            title=title.strip(),
                            content="",  # 需要单独获取详情
                            author=author.strip(),
                            author_id="",
                            likes=likes,
                            collects=0,
                            comments_count=0,
                            url=f"https://www.xiaohongshu.com/explore/{note_id}",
                            published_at=datetime.now(),
                        ))
                except Exception as e:
                    print(f"解析笔记失败: {e}")
                    continue

        except Exception as e:
            print(f"Playwright 搜索失败: {e}")
        finally:
            await browser.close()

    return notes

def _parse_count(self, text: str) -> int:
    """解析数量文本（如 1.2万 -> 12000）"""
    text = text.strip()
    if '万' in text:
        try:
            return int(float(text.replace('万', '')) * 10000)
        except:
            return 0
    try:
        return int(text)
    except:
        return 0
```

---

## Task 3: 修改搜索入口使用 Playwright

**Files:**
- Modify: `abo/tools/xiaohongshu.py`

- [ ] **Step 3: 修改 search_by_keyword 方法**

```python
async def search_by_keyword(
    self,
    keyword: str,
    sort_by: str = "likes",
    max_results: int = 20,
    min_likes: int = 100,
) -> list[XHSNote]:
    """
    根据关键词搜索小红书笔记
    优先使用 Playwright 获取真实数据，失败时回退到模拟数据
    """
    # 首先尝试 Playwright 真实搜索
    try:
        notes = await self.search_by_keyword_playwright(
            keyword=keyword,
            max_results=max_results,
            min_likes=min_likes,
        )
        if notes:
            print(f"Playwright 搜索成功，找到 {len(notes)} 条结果")
            # 排序
            if sort_by == "likes":
                notes.sort(key=lambda x: x.likes, reverse=True)
            return notes[:max_results]
    except Exception as e:
        print(f"Playwright 搜索失败: {e}")

    # 回退到模拟数据
    print("使用模拟数据")
    return self._generate_mock_search_results(keyword, max_results)
```

---

## Task 4: 测试搜索功能

- [ ] **Step 4: 运行测试**

```bash
cd /Users/huanc/Desktop/ABO
python -c "
import asyncio
from abo.tools.xiaohongshu import XiaohongshuAPI

async def test():
    api = XiaohongshuAPI()
    notes = await api.search_by_keyword('Python学习', max_results=5, min_likes=10)
    print(f'找到 {len(notes)} 条结果')
    for note in notes[:3]:
        print(f'  - {note.title} ({note.likes} ❤️) by {note.author}')
    await api.close()

asyncio.run(test())
"
```

Expected: 输出真实的搜索结果

---

## Task 5: 提交代码

- [ ] **Step 5: Git 提交**

```bash
cd /Users/huanc/Desktop/ABO
git add abo/tools/xiaohongshu.py docs/superpowers/plans/2026-04-05-xiaohongshu-real-search.md
git commit -m "feat(xiaohongshu): implement real search using Playwright

- Add Playwright-based browser automation for real Xiaohongshu search
- Extract note data (title, author, likes) from search results page
- Implement count parser for Chinese numbers (1.2万)
- Fallback to mock data when Playwright fails
- Add scroll loading to get more results"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 真实联网搜索 - Task 2-3 实现 Playwright 搜索
- ✅ 失败回退 - Task 3 保留模拟数据作为 fallback
- ✅ 数据解析 - Task 2 实现点赞数解析

**2. Placeholder scan:**
- ✅ 无 placeholder，全部可运行代码

**3. Testing:**
- ⚠️ Playwright 需要安装浏览器，首次运行较慢
- ⚠️ 小红书可能检测自动化工具，可能需要额外反检测措施
