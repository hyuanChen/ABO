# Bilibili Followed Users Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution (user requested no subagents)

**Goal:** Enhance bilibili-tracker module to fetch and filter all followed users' dynamics and new video uploads

**Architecture:** Use Bilibili's `dynamic_new` and `dynamic_history` APIs to fetch the follow feed, filter by dynamic type (video uploads, text, images, articles), apply keyword filtering, and deduplicate using dynamic IDs stored in local state.

**Tech Stack:** Python, httpx, asyncio, JSON state persistence

**API Documentation Sources:**
- [SocialSisterYi/bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
- [Bilibili Dynamic API - CSDN](https://blog.csdn.net/qq_45475497/article/details/158430214)

---

## Task 1: Create State Management for Seen Dynamics

**Files:**
- Modify: `abo/default_modules/bilibili/__init__.py`

### Step 1.1: Add state management for seen dynamic IDs

Add to `BilibiliTracker` class:

```python
import hashlib

# Add to class:
_STATE_PATH = Path.home() / ".abo" / "data" / "bilibili_seen.json"

def _load_seen(self) -> set[str]:
    """Load seen dynamic IDs from state file."""
    if self._STATE_PATH.exists():
        return set(json.loads(self._STATE_PATH.read_text()))
    return set()

def _save_seen(self, seen: set[str]):
    """Save seen dynamic IDs to state file."""
    self._STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = self._STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(list(seen), ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, self._STATE_PATH)
```

### Step 1.2: Add import for os

```python
import os
```

---

## Task 2: Add Configuration Structure

### Step 2.1: Add configuration class/structure

Add at top of file or in class:

```python
# Dynamic type codes
DYNAMIC_TYPES = {
    "video": 8,      # 视频投稿
    "text": 4,       # 纯文字
    "image": 2,      # 图文
    "article": 64,   # 专栏文章
    "repost": 1,     # 转发
}

DEFAULT_CONFIG = {
    "follow_feed": True,           # Enable followed users feed
    "follow_feed_types": [8, 2, 4, 64],  # Video, image, text, article
    "fetch_follow_limit": 20,      # Number of dynamics to fetch
    "keyword_filter": True,        # Filter by keywords
    "keywords": ["科研", "学术", "读博", "论文", "AI", "机器学习"],
    "up_uids": [],                 # Specific UIDs to track (backward compat)
    "sessdata": None,              # Bilibili SESSDATA cookie
}
```

---

## Task 3: Implement Follow Feed Fetching

### Step 3.1: Add follow feed API methods

Add to `BilibiliTracker`:

```python
async def _fetch_follow_feed(
    self,
    sessdata: str,
    dynamic_types: list[int],
    keywords: list[str],
    limit: int,
    seen: set[str]
) -> list[Item]:
    """Fetch followed users' dynamics from Bilibili API."""
    items = []

    # Build type_list bitmask (268435455 = all types)
    type_list = sum(1 << (t - 1) for t in dynamic_types) if dynamic_types else 268435455

    url = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"
    params = {
        "uid": self._extract_uid_from_sessdata(sessdata),
        "type_list": type_list,
    }

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Cookie": f"SESSDATA={sessdata}",
        "Referer": "https://t.bilibili.com/",
    }

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, params=params, headers=headers)

        if resp.status_code != 200:
            print(f"[bilibili] Follow feed API error: {resp.status_code}")
            return items

        data = resp.json()
        if data.get("code") != 0:
            print(f"[bilibili] API error: {data.get('message')}")
            return items

        cards = data.get("data", {}).get("cards", [])

        for card in cards[:limit]:
            item = self._parse_dynamic_card(card, keywords, seen)
            if item:
                items.append(item)
                seen.add(item.id)

    except Exception as e:
        print(f"[bilibili] Failed to fetch follow feed: {e}")

    return items

def _extract_uid_from_sessdata(self, sessdata: str) -> str:
    """Extract UID from SESSDATA or use default."""
    # SESSDATA doesn't contain UID directly, user should provide it
    # For now, return empty and API should still work with just SESSDATA
    return ""

def _parse_dynamic_card(
    self,
    card: dict,
    keywords: list[str],
    seen: set[str]
) -> Item | None:
    """Parse a dynamic card into an Item."""
    desc = card.get("desc", {})
    dynamic_id = str(desc.get("dynamic_id", ""))

    # Skip if already seen
    if dynamic_id in seen:
        return None

    # Get dynamic type
    dynamic_type = desc.get("type", 0)

    # Parse card content (JSON string)
    try:
        card_content = json.loads(card.get("card", "{}"))
    except:
        card_content = {}

    # Extract info based on type
    if dynamic_type == 8:  # Video upload
        return self._parse_video_dynamic(dynamic_id, desc, card_content, keywords)
    elif dynamic_type == 2:  # Image/text
        return self._parse_image_dynamic(dynamic_id, desc, card_content, keywords)
    elif dynamic_type == 4:  # Plain text
        return self._parse_text_dynamic(dynamic_id, desc, card_content, keywords)
    elif dynamic_type == 64:  # Article
        return self._parse_article_dynamic(dynamic_id, desc, card_content, keywords)

    return None
```

---

## Task 4: Implement Dynamic Type Parsers

### Step 4.1: Add video dynamic parser

```python
def _parse_video_dynamic(
    self,
    dynamic_id: str,
    desc: dict,
    card: dict,
    keywords: list[str]
) -> Item | None:
    """Parse a video upload dynamic."""
    # Video info is in card directly for type 8
    title = card.get("title", "")
    desc_text = card.get("desc", "")
    bvid = card.get("bvid", "")

    # Keyword filtering
    content = f"{title} {desc_text}".lower()
    if keywords and not any(kw.lower() in content for kw in keywords):
        return None

    up_uid = str(desc.get("user_profile", {}).get("uid", ""))
    up_name = desc.get("user_profile", {}).get("uname", "UP主")
    timestamp = desc.get("timestamp", 0)

    return Item(
        id=f"bili-dyn-{dynamic_id}",
        raw={
            "title": title,
            "description": desc_text,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "bvid": bvid,
            "dynamic_id": dynamic_id,
            "up_uid": up_uid,
            "up_name": up_name,
            "published": datetime.fromtimestamp(timestamp).isoformat() if timestamp else "",
            "platform": "bilibili",
            "dynamic_type": "video",
            "pic": card.get("pic", ""),
            "duration": card.get("duration", ""),
        },
    )
```

### Step 4.2: Add image dynamic parser

```python
def _parse_image_dynamic(
    self,
    dynamic_id: str,
    desc: dict,
    card: dict,
    keywords: list[str]
) -> Item | None:
    """Parse an image/text dynamic."""
    item_content = card.get("item", {})
    description = item_content.get("description", "")

    # Keyword filtering
    if keywords and not any(kw.lower() in description.lower() for kw in keywords):
        return None

    up_uid = str(desc.get("user_profile", {}).get("uid", ""))
    up_name = desc.get("user_profile", {}).get("uname", "UP主")
    timestamp = desc.get("timestamp", 0)

    # Get images
    pictures = item_content.get("pictures", [])
    image_urls = [p.get("img_src", "") for p in pictures]

    return Item(
        id=f"bili-dyn-{dynamic_id}",
        raw={
            "title": description[:100],  # Use first 100 chars as title
            "description": description,
            "url": f"https://t.bilibili.com/{dynamic_id}",
            "dynamic_id": dynamic_id,
            "up_uid": up_uid,
            "up_name": up_name,
            "published": datetime.fromtimestamp(timestamp).isoformat() if timestamp else "",
            "platform": "bilibili",
            "dynamic_type": "image",
            "images": image_urls,
        },
    )
```

### Step 4.3: Add text dynamic parser

```python
def _parse_text_dynamic(
    self,
    dynamic_id: str,
    desc: dict,
    card: dict,
    keywords: list[str]
) -> Item | None:
    """Parse a plain text dynamic."""
    item_content = card.get("item", {})
    content = item_content.get("content", "")

    # Keyword filtering
    if keywords and not any(kw.lower() in content.lower() for kw in keywords):
        return None

    up_uid = str(desc.get("user_profile", {}).get("uid", ""))
    up_name = desc.get("user_profile", {}).get("uname", "UP主")
    timestamp = desc.get("timestamp", 0)

    return Item(
        id=f"bili-dyn-{dynamic_id}",
        raw={
            "title": content[:100],
            "description": content,
            "url": f"https://t.bilibili.com/{dynamic_id}",
            "dynamic_id": dynamic_id,
            "up_uid": up_uid,
            "up_name": up_name,
            "published": datetime.fromtimestamp(timestamp).isoformat() if timestamp else "",
            "platform": "bilibili",
            "dynamic_type": "text",
        },
    )
```

### Step 4.4: Add article dynamic parser

```python
def _parse_article_dynamic(
    self,
    dynamic_id: str,
    desc: dict,
    card: dict,
    keywords: list[str]
) -> Item | None:
    """Parse an article (column) dynamic."""
    title = card.get("title", "")
    summary = card.get("summary", "")

    # Keyword filtering
    content = f"{title} {summary}".lower()
    if keywords and not any(kw.lower() in content for kw in keywords):
        return None

    up_uid = str(desc.get("user_profile", {}).get("uid", ""))
    up_name = desc.get("user_profile", {}).get("uname", "UP主")
    timestamp = desc.get("timestamp", 0)
    cvid = card.get("id", "")

    return Item(
        id=f"bili-dyn-{dynamic_id}",
        raw={
            "title": title,
            "description": summary,
            "url": f"https://www.bilibili.com/read/cv{cvid}",
            "cvid": cvid,
            "dynamic_id": dynamic_id,
            "up_uid": up_uid,
            "up_name": up_name,
            "published": datetime.fromtimestamp(timestamp).isoformat() if timestamp else "",
            "platform": "bilibili",
            "dynamic_type": "article",
            "banner_url": card.get("banner_url", ""),
        },
    )
```

---

## Task 5: Update Main Fetch Method

### Step 5.1: Modify fetch() to support follow feed

Replace the existing `fetch()` method:

```python
async def fetch(
    self,
    up_uids: list[str] = None,
    keywords: list[str] = None,
    max_results: int = 20,
    dynamic_types: list[int] = None,
    use_follow_feed: bool = True,
) -> list[Item]:
    """
    Fetch Bilibili videos and dynamics.

    Args:
        up_uids: List of Bilibili UP主 UIDs (optional, uses follow feed if empty)
        keywords: List of keywords to filter content
        max_results: Maximum number of results
        dynamic_types: Types of dynamics to fetch (default: [8, 2, 4, 64])
        use_follow_feed: Whether to use followed users feed
    """
    items = []
    seen = self._load_seen()

    # Load config
    prefs_path = Path.home() / ".abo" / "preferences.json"
    config = self.DEFAULT_CONFIG.copy()

    if prefs_path.exists():
        data = json.loads(prefs_path.read_text())
        bilibili_config = data.get("modules", {}).get("bilibili-tracker", {})
        config.update(bilibili_config)

    # Use config values if not provided
    keywords = keywords or config.get("keywords", ["科研", "学术", "读博", "论文"])
    up_uids = up_uids or config.get("up_uids", [])
    dynamic_types = dynamic_types or config.get("follow_feed_types", [8, 2, 4, 64])
    use_follow_feed = use_follow_feed and config.get("follow_feed", True)

    # Method 1: Followed users feed (if enabled and has SESSDATA)
    if use_follow_feed and config.get("sessdata"):
        follow_items = await self._fetch_follow_feed(
            sessdata=config["sessdata"],
            dynamic_types=dynamic_types,
            keywords=keywords if config.get("keyword_filter", True) else [],
            limit=max_results,
            seen=seen,
        )
        items.extend(follow_items)

    # Method 2: Specific UP主s (backward compatibility)
    if up_uids:
        for uid in up_uids[:5]:
            up_items = await self._fetch_up_videos(uid, keywords, max_results // len(up_uids))
            for item in up_items:
                if item.id not in seen:
                    items.append(item)
                    seen.add(item.id)

    # Save seen IDs
    self._save_seen(seen)

    return items[:max_results]
```

---

## Task 6: Update Process Method

### Step 6.1: Enhance process() to handle different dynamic types

Update the `process()` method to handle the new dynamic types:

```python
async def process(self, items: list[Item], prefs: dict) -> list[Card]:
    """Process Bilibili dynamics into cards."""
    cards = []
    cutoff = datetime.utcnow() - timedelta(days=14)

    for item in items:
        p = item.raw
        dynamic_type = p.get("dynamic_type", "video")

        # Skip old items
        published_str = p.get("published", "")
        if published_str:
            try:
                published_dt = datetime.fromisoformat(published_str)
                if published_dt < cutoff:
                    continue
            except:
                pass

        # Build content for analysis
        if dynamic_type == "video":
            content = f"标题：{p.get('title', '')}\n简介：{p.get('description', '')[:500]}"
            prompt_template = (
                f'分析以下B站视频，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"category":"<分类：教程/学术/科普/其他>"}}\n\n'
            )
            obsidian_path = f"SocialMedia/Bilibili/Video/{p.get('bvid', 'unknown')}.md"
        elif dynamic_type == "article":
            content = f"标题：{p.get('title', '')}\n摘要：{p.get('description', '')[:500]}"
            prompt_template = (
                f'分析以下B站专栏文章，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"category":"<分类：教程/学术/科普/其他>"}}\n\n'
            )
            obsidian_path = f"SocialMedia/Bilibili/Article/cv{p.get('cvid', 'unknown')}.md"
        else:  # image, text
            content = f"内容：{p.get('description', '')[:500]}"
            prompt_template = (
                f'分析以下B站动态，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"category":"<分类：动态/分享/其他>"}}\n\n'
            )
            safe_title = p.get("title", "")[:30].replace(" ", "-").replace("/", "-").replace(":", "-")
            obsidian_path = f"SocialMedia/Bilibili/Dynamic/{safe_title}.md"

        try:
            result = await claude_json(prompt_template + content, prefs=prefs)
        except Exception:
            result = {}

        cards.append(
            Card(
                id=item.id,
                title=p.get("title", "B站动态"),
                summary=result.get("summary", p.get("description", "")[:100]),
                score=min(result.get("score", 5), 10) / 10,
                tags=result.get("tags", []) + ["B站", result.get("category", "动态")],
                source_url=p["url"],
                obsidian_path=obsidian_path,
                metadata={
                    "abo-type": f"bilibili-{dynamic_type}",
                    "platform": "bilibili",
                    "up_uid": p.get("up_uid"),
                    "up_name": p.get("up_name"),
                    "dynamic_id": p.get("dynamic_id"),
                    "dynamic_type": dynamic_type,
                    "bvid": p.get("bvid"),
                    "cvid": p.get("cvid"),
                    "published": p.get("published"),
                    "duration": p.get("duration"),
                    "thumbnail": p.get("pic") or p.get("banner_url"),
                    "images": p.get("images", []),
                    "description": p.get("description", ""),
                },
            )
        )

    return cards
```

---

## Task 7: Add Configuration Documentation

### Step 7.1: Update docstring with new config options

Update the module docstring:

```python
"""
哔哩哔哩 (Bilibili) 视频和动态追踪模块

追踪关注UP主的动态和新视频发布，支持多种动态类型过滤。

配置选项 (在 ~/.abo/preferences.json 中):
{
    "modules": {
        "bilibili-tracker": {
            "follow_feed": true,              // 启用关注动态流
            "follow_feed_types": [8, 2, 4, 64],  // 动态类型: 8=视频, 2=图文, 4=文字, 64=专栏
            "fetch_follow_limit": 20,         // 每次获取动态数量
            "keyword_filter": true,           // 启用关键词过滤
            "keywords": ["科研", "学术", "读博", "论文"],  // 过滤关键词
            "up_uids": [],                    // 特定UP主UID列表(可选)
            "sessdata": "xxx"                 // B站登录Cookie (必须用于关注流)
        }
    }
}

获取 SESSDATA:
1. 登录 bilibili.com
2. 打开浏览器开发者工具 (F12)
3. 切换到 Application/Storage > Cookies
4. 找到 SESSDATA 字段并复制值

动态类型说明:
- 8: 视频投稿 (默认启用)
- 2: 图文动态 (默认启用)
- 4: 纯文字动态 (默认启用)
- 64: 专栏文章 (默认启用)
- 1: 转发动态 (默认禁用)
"""
```

---

## Task 8: Test and Commit

### Step 8.1: Run tests

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/ -v -k bilibili --tb=short
```

### Step 8.2: Commit changes

```bash
git add abo/default_modules/bilibili/__init__.py
git commit -m "feat(bilibili): add followed users dynamics feed support

- Add follow feed API integration (dynamic_new endpoint)
- Support multiple dynamic types: video(8), image(2), text(4), article(64)
- Add state management for seen dynamics (deduplication)
- Add keyword filtering for all dynamic types
- Enhance process() to handle different content types
- Add configuration docs for SESSDATA setup"
```

---

## Summary of Changes

| Component | Changes |
|-----------|---------|
| State Management | Added `_load_seen()` / `_save_seen()` for dynamic ID tracking |
| Configuration | Added `DEFAULT_CONFIG` with follow feed options |
| API Integration | Added `_fetch_follow_feed()` using Bilibili dynamic API |
| Parsers | Added parsers for video, image, text, article dynamics |
| Fetch | Updated `fetch()` to support both follow feed and specific UIDs |
| Process | Enhanced `process()` to handle different dynamic types |
| Documentation | Added config docs for SESSDATA and dynamic types |

## Self-Review Checklist

- [ ] Follow feed API uses correct endpoint and authentication
- [ ] All dynamic type parsers handle their content correctly
- [ ] State deduplication works across runs
- [ ] Keyword filtering applied to all types
- [ ] Backward compatibility with existing up_uids feature
- [ ] Configuration documented clearly

---

**Plan complete. Execute inline using executing-plans skill or manually.**
