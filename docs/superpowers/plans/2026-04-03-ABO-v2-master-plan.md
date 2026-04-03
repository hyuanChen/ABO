# ABO v2.0 Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete automation research assistant system with fixed follow-up paper naming, working image/PDF downloads, daily scheduled crawling, social media crawlers (小红书/哔哩哔哩/小宇宙/知乎), preference learning, gamification (XP/happiness/SAN), and reward notifications integrated into the Intelligence Feed.

**Architecture:** The system uses a modular Python backend with FastAPI + APScheduler for scheduled crawling, SQLite for card storage, JSON files for profile/gamification state. Frontend uses React + TypeScript + Tailwind + Zustand. Module SDK pattern for extensible crawlers. WebSocket for real-time notifications.

**Tech Stack:** Python 3.14+, FastAPI, APScheduler, SQLite FTS5, React 18, TypeScript, Tailwind CSS, Zustand, Tauri 2.x

---

## Overview

This plan covers 5 phases (P0-P4) to implement ABO v2.0. Each phase builds on previous work.

**Current Status Check:** Many components may already exist. Verify each component before implementing.

---

## Phase 0: Bug Fixes & Core Infrastructure

### P0-Task 1: Fix Follow-up Paper Naming Convention

**Files:**
- Modify: `abo/main.py` (semantic-scholar save-to-literature endpoint)
- Test: Manual test via API

**Current Issue:** Follow-up papers are not saved with correct naming `{Source}_FollowUp/{AuthorYear}-{ShortTitle}/`

**Expected Naming:**
```
Literature/
└── {SourceTitle}_FollowUp/
    └── {AuthorYear}-{ShortTitle}/
        ├── {AuthorYear}-{ShortTitle}.md
        ├── figures/
        │   ├── figure_1.png
        │   └── ...
        └── paper.pdf
```

- [ ] **Step 1: Locate save_s2_to_literature function**

Find in `abo/main.py` around line 1197: `@app.post("/api/modules/semantic-scholar/save-to-literature")`

- [ ] **Step 2: Update folder naming logic**

Change from:
```python
folder_name = f"{first_author}{year}-{short_title}"
```

To:
```python
source_paper = data.get("source_paper", "Unknown")
source_short = re.sub(r'[^\w\s-]', '', source_paper)[:20].strip()
folder_name = f"{source_short}_FollowUp"
paper_folder = f"{first_author}{year}-{short_title}"
```

- [ ] **Step 3: Update path construction**

```python
# Create nested structure
followup_base = lit_path / folder_name
paper_base = followup_base / paper_folder
paper_base.mkdir(parents=True, exist_ok=True)

# Figures in paper_base/figures/
figures_dir = paper_base / "figures"
figures_dir.mkdir(exist_ok=True)

# Markdown in paper_base/
md_path = paper_base / f"{first_author}{year}-{short_title}.md"

# PDF in paper_base/
pdf_path = paper_base / "paper.pdf"
```

- [ ] **Step 4: Test the endpoint**

```bash
curl -X POST http://127.0.0.1:8765/api/modules/semantic-scholar/save-to-literature \
  -H "Content-Type: application/json" \
  -d '{
    "paper": {"title": "Test Paper", "authors": [{"name": "Zhang"}], "year": 2024, "url": "..."},
    "source_paper": "VGGT",
    "figures": []
  }'
```

Expected: Creates `Literature/VGGT_FollowUp/Zhang2024-TestPaper/` with files inside.

- [ ] **Step 5: Commit**

```bash
git add abo/main.py
git commit -m "fix: follow-up paper naming to {Source}_FollowUp/{AuthorYear}-{ShortTitle}/"
```

---

### P0-Task 2: Fix Image Download from arXiv

**Files:**
- Modify: `abo/main.py` (fetch_paper_figures, fetch_figures_from_arxiv_html, download_arxiv_pdf)
- Create: `tests/test_image_download.py` (optional)

**Issue:** Image extraction from arXiv papers fails. Need multi-source strategy.

**Strategy:**
1. Try arXiv HTML version first (modern papers have `<img>` tags)
2. Fallback to PDF extraction using pdf2image

- [ ] **Step 1: Verify imports in abo/main.py**

Ensure these imports exist at top:
```python
import httpx
import re
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
```

- [ ] **Step 2: Implement fetch_figures_from_arxiv_html**

```python
async def fetch_figures_from_arxiv_html(arxiv_id: str) -> List[Dict]:
    """Fetch figures from arXiv HTML version."""
    url = f"https://arxiv.org/html/{arxiv_id}"
    figures = []

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text

            # Find all img tags with source
            img_pattern = r'<img[^>]+src="([^"]+)"[^>]*>'
            alt_pattern = r'<img[^>]+alt="([^"]*)"[^>]*>'

            imgs = re.findall(img_pattern, html, re.IGNORECASE)
            alts = re.findall(alt_pattern, html, re.IGNORECASE)

            for i, src in enumerate(imgs[:10]):  # Limit to 10 figures
                if src.startswith('/'):
                    src = f"https://arxiv.org{src}"
                elif not src.startswith('http'):
                    src = f"https://arxiv.org/html/{src}"

                figures.append({
                    "url": src,
                    "caption": alts[i] if i < len(alts) else f"Figure {i+1}",
                    "source": "html"
                })
        except Exception as e:
            print(f"HTML fetch failed: {e}")

    return figures
```

- [ ] **Step 3: Implement fetch_figures_from_pdf**

```python
async def fetch_figures_from_pdf(pdf_path: Path) -> List[Dict]:
    """Extract images from PDF using pdf2image."""
    figures = []

    try:
        from pdf2image import convert_from_path
        import tempfile

        images = convert_from_path(str(pdf_path), first_page=1, last_page=10)

        for i, image in enumerate(images[:5]):
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
                image.save(f.name, 'PNG')
                figures.append({
                    "path": f.name,
                    "caption": f"Page {i+1}",
                    "source": "pdf"
                })
    except ImportError:
        print("pdf2image not installed, skipping PDF extraction")
    except Exception as e:
        print(f"PDF extraction failed: {e}")

    return figures
```

- [ ] **Step 4: Update fetch_paper_figures to use multi-source**

```python
async def fetch_paper_figures(arxiv_id: str, pdf_path: Optional[Path] = None) -> List[Dict]:
    """Fetch figures from multiple sources."""
    # Try HTML first
    figures = await fetch_figures_from_arxiv_html(arxiv_id)

    if not figures and pdf_path and pdf_path.exists():
        # Fallback to PDF
        figures = await fetch_figures_from_pdf(pdf_path)

    return figures
```

- [ ] **Step 5: Install pdf2image dependency**

```bash
pip install pdf2image
# Add to requirements.txt:
echo "pdf2image>=1.17" >> requirements.txt
```

- [ ] **Step 6: Test image extraction**

```bash
python -c "
import asyncio
from abo.main import fetch_paper_figures
result = asyncio.run(fetch_paper_figures('2501.12345'))
print(f'Found {len(result)} figures')
for f in result[:3]:
    print(f'  - {f[\"caption\"][:50]}: {f[\"url\"][:60]}...')
"
```

- [ ] **Step 7: Commit**

```bash
git add abo/main.py requirements.txt
git commit -m "fix: implement multi-source figure extraction (HTML + PDF fallback)"
```

---

### P0-Task 3: Fix PDF Download Function

**Files:**
- Modify: `abo/main.py` (download_arxiv_pdf function)

**Issue:** PDF download fails or uses incorrect URLs. Need multi-source fallback.

**Strategy:**
1. Try arxiv.org/pdf/{id}.pdf
2. Fallback to ar5iv.org/pdf/{id}.pdf
3. Fallback to r.jina.ai/http://arxiv.org/pdf/{id}.pdf

- [ ] **Step 1: Verify download_arxiv_pdf implementation**

Should look like:
```python
async def download_arxiv_pdf(arxiv_id: str, output_path: Path) -> bool:
    """Download PDF from arXiv with multiple fallback sources."""
    sources = [
        f"https://arxiv.org/pdf/{arxiv_id}.pdf",
        f"https://ar5iv.org/pdf/{arxiv_id}.pdf",
        f"https://r.jina.ai/http://arxiv.org/pdf/{arxiv_id}.pdf",
    ]

    async with httpx.AsyncClient(timeout=60) as client:
        for source in sources:
            try:
                resp = await client.get(source, follow_redirects=True)
                if resp.status_code == 200 and len(resp.content) > 1000:
                    output_path.write_bytes(resp.content)
                    print(f"Downloaded PDF from {source}: {len(resp.content)} bytes")
                    return True
            except Exception as e:
                print(f"Failed to download from {source}: {e}")
                continue

    return False
```

- [ ] **Step 2: Test PDF download**

```bash
python -c "
import asyncio
from pathlib import Path
from abo.main import download_arxiv_pdf

output = Path('/tmp/test_arxiv.pdf')
result = asyncio.run(download_arxiv_pdf('2501.12345', output))
print(f'Download success: {result}')
if output.exists():
    print(f'File size: {output.stat().st_size} bytes')
    output.unlink()
"
```

- [ ] **Step 3: Commit if changes made**

```bash
git add abo/main.py
git commit -m "fix: multi-source PDF download with fallback chain"
```

---

### P0-Task 4: Configure Daily Scheduled Crawling

**Files:**
- Verify: `abo/runtime/scheduler.py`
- Verify: `abo/default_modules/arxiv.py` (or semantic-scholar-tracker)
- Test: Manual scheduler verification

**Issue:** Need to ensure daily crawling is properly scheduled.

- [ ] **Step 1: Verify scheduler initialization**

In `abo/main.py`, check `_scheduler` is initialized:
```python
from .runtime.scheduler import Scheduler

_scheduler: Optional[Scheduler] = None

@app.on_event("startup")
async def startup():
    global _scheduler
    _scheduler = Scheduler()
    # ... register modules
    await _scheduler.start()
```

- [ ] **Step 2: Verify module schedule configuration**

Check `abo/default_modules/arxiv.py`:
```python
class ArxivTracker(Module):
    id = "arxiv-tracker"
    name = "ArXiv Tracker"
    schedule = "0 10 * * *"  # Daily at 10:00
    enabled = True
```

- [ ] **Step 3: Verify scheduler adds jobs**

Check `abo/runtime/scheduler.py`:
```python
def add_module_job(self, module: Module):
    if not module.enabled:
        return

    trigger = CronTrigger.from_crontab(module.schedule)
    job = self._scheduler.add_job(
        self._run_module,
        trigger=trigger,
        id=module.id,
        args=[module],
        replace_existing=True
    )
    print(f"Scheduled {module.id} with cron: {module.schedule}")
```

- [ ] **Step 4: Test scheduler via API**

```bash
# Start backend
python -m abo.main &

# Check modules endpoint
curl http://127.0.0.1:8765/api/modules

# Verify scheduler logs show next run times
curl http://127.0.0.1:8765/api/health
```

- [ ] **Step 5: Commit**

If any fixes needed:
```bash
git add abo/runtime/scheduler.py abo/default_modules/arxiv.py
git commit -m "fix: verify daily scheduled crawling configuration"
```

---

## Phase 1: Social Media Crawlers (小红书/哔哩哔哩/小宇宙/知乎)

### P1-Task 1: Create 小红书 (Xiaohongshu) Crawler Module

**Files:**
- Create: `abo/default_modules/xiaohongshu.py`
- Modify: `abo/main.py` (register module)

**Challenge:** 小红书 has anti-scraping measures. Use search API or RSS feeds if available.

- [ ] **Step 1: Create xiaohongshu.py module**

```python
"""Xiaohongshu (RED) content crawler for academic lifestyle content."""
from typing import List, Dict, Any
from ..sdk import Module, Item, Card
import httpx
import re

class XiaohongshuTracker(Module):
    id = "xiaohongshu-tracker"
    name = "小红书科研生活"
    schedule = "0 11 * * *"  # Daily at 11:00
    enabled = True
    keywords = ["科研工具", "论文写作", "学术日常"]

    async def fetch(self) -> List[Item]:
        """Fetch posts from Xiaohongshu search."""
        items = []

        # Note: Direct scraping is blocked. Alternative approaches:
        # 1. Use third-party API services
        # 2. Use RSS feeds from xiaohongshu.com
        # 3. Manual import via user-provided links

        # Placeholder: Return empty list with note
        # Real implementation requires authenticated API access

        return items

    async def process(self, items: List[Item], prefs: Dict[str, Any]) -> List[Card]:
        """Convert Xiaohongshu posts to Cards."""
        cards = []
        for item in items:
            card = Card(
                id=f"xhs-{item.id}",
                title=item.title,
                content=item.content,
                source="xiaohongshu",
                source_url=item.url,
                tags=item.tags,
                created_at=item.created_at
            )
            cards.append(card)
        return cards
```

- [ ] **Step 2: Implement RSS-based fetching (alternative)**

```python
async def fetch_from_rss(self) -> List[Item]:
    """Fetch from RSS feeds if available."""
    items = []

    # Use rss2json or similar service
    rss_urls = [
        # Add known RSS feeds for academic content
    ]

    async with httpx.AsyncClient() as client:
        for rss_url in rss_urls:
            try:
                resp = await client.get(rss_url, timeout=30)
                # Parse RSS XML
            except:
                continue

    return items
```

- [ ] **Step 3: Register module in abo/main.py**

```python
from .default_modules.xiaohongshu import XiaohongshuTracker

# In startup:
_registry.register(XiaohongshuTracker())
```

- [ ] **Step 4: Commit**

```bash
git add abo/default_modules/xiaohongshu.py abo/main.py
git commit -m "feat: add xiaohongshu crawler module (placeholder)"
```

---

### P1-Task 2: Create 哔哩哔哩 (Bilibili) Crawler Module

**Files:**
- Create: `abo/default_modules/bilibili.py`
- Modify: `abo/main.py` (register module)

**Approach:** Bilibili has a search API that can be used for academic content.

- [ ] **Step 1: Create bilibili.py module**

```python
"""Bilibili academic video crawler."""
from typing import List, Dict, Any
from ..sdk import Module, Item, Card
import httpx

class BilibiliTracker(Module):
    id = "bilibili-tracker"
    name = "哔哩哔哩学术视频"
    schedule = "0 12 * * *"
    enabled = True
    keywords = ["深度学习", "机器学习", "论文解读"]

    async def fetch(self) -> List[Item]:
        """Fetch videos from Bilibili search API."""
        items = []

        # Bilibili search API endpoint
        search_api = "https://api.bilibili.com/x/web-interface/search/type"

        async with httpx.AsyncClient() as client:
            for keyword in self.keywords:
                try:
                    resp = await client.get(
                        search_api,
                        params={
                            "keyword": keyword,
                            "search_type": "video",
                            "order": "pubdate",  # Latest first
                            "page": 1,
                            "pagesize": 10
                        },
                        headers={
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                        },
                        timeout=30
                    )

                    data = resp.json()
                    if data.get("data", {}).get("result"):
                        for video in data["data"]["result"]:
                            items.append(Item(
                                id=str(video["bvid"]),
                                title=video["title"],
                                content=f"UP主: {video.get('author', 'Unknown')}\n{video.get('description', '')}",
                                url=f"https://www.bilibili.com/video/{video['bvid']}",
                                tags=[keyword],
                                created_at=video.get("pubdate", ""),
                                metadata={
                                    "view_count": video.get("play", 0),
                                    "duration": video.get("duration", ""),
                                    "author": video.get("author", "")
                                }
                            ))
                except Exception as e:
                    print(f"Bilibili search failed for {keyword}: {e}")

        return items

    async def process(self, items: List[Item], prefs: Dict[str, Any]) -> List[Card]:
        """Convert Bilibili videos to Cards."""
        cards = []
        for item in items:
            card = Card(
                id=f"bili-{item.id}",
                title=item.title,
                content=item.content,
                source="bilibili",
                source_url=item.url,
                tags=item.tags,
                created_at=item.created_at,
                metadata=item.metadata
            )
            cards.append(card)
        return cards
```

- [ ] **Step 2: Register module**

```python
from .default_modules.bilibili import BilibiliTracker

_registry.register(BilibiliTracker())
```

- [ ] **Step 3: Test module**

```bash
curl -X POST http://127.0.0.1:8765/api/modules/bilibili-tracker/run
```

- [ ] **Step 4: Commit**

```bash
git add abo/default_modules/bilibili.py abo/main.py
git commit -m "feat: add bilibili crawler module with search API"
```

---

### P1-Task 3: Create 小宇宙 (Xiaoyuzhou) Podcast Crawler

**Files:**
- Create: `abo/default_modules/xiaoyuzhou.py`
- Modify: `abo/main.py`

**Approach:** Use RSS feeds from podcast platform.

- [ ] **Step 1: Create xiaoyuzhou.py module**

```python
"""Xiaoyuzhou (小宇宙) podcast crawler for knowledge content."""
from typing import List, Dict, Any
from ..sdk import Module, Item, Card
import httpx
import xml.etree.ElementTree as ET

class XiaoyuzhouTracker(Module):
    id = "xiaoyuzhou-tracker"
    name = "小宇宙播客"
    schedule = "0 9 * * *"
    enabled = True
    keywords = ["科技", "商业", "文化"]

    # RSS feeds for popular knowledge podcasts
    RSS_FEEDS = [
        # Add RSS URLs for target podcasts
    ]

    async def fetch(self) -> List[Item]:
        """Fetch from podcast RSS feeds."""
        items = []

        async with httpx.AsyncClient() as client:
            for feed_url in self.RSS_FEEDS:
                try:
                    resp = await client.get(feed_url, timeout=30)
                    root = ET.fromstring(resp.text)

                    # Parse RSS items
                    channel = root.find('channel')
                    if channel is not None:
                        for item in channel.findall('item')[:10]:
                            title = item.findtext('title', '')
                            description = item.findtext('description', '')
                            link = item.findtext('link', '')
                            pub_date = item.findtext('pubDate', '')

                            # Filter by keywords
                            content_text = f"{title} {description}"
                            if any(kw in content_text for kw in self.keywords):
                                items.append(Item(
                                    id=link.split('/')[-1] if '/' in link else title[:20],
                                    title=title,
                                    content=description[:500],
                                    url=link,
                                    tags=[kw for kw in self.keywords if kw in content_text],
                                    created_at=pub_date
                                ))
                except Exception as e:
                    print(f"RSS fetch failed for {feed_url}: {e}")

        return items

    async def process(self, items: List[Item], prefs: Dict[str, Any]) -> List[Card]:
        """Convert podcast episodes to Cards."""
        cards = []
        for item in items:
            card = Card(
                id=f"xyz-{item.id}",
                title=f"🎧 {item.title}",
                content=item.content,
                source="xiaoyuzhou",
                source_url=item.url,
                tags=item.tags,
                created_at=item.created_at
            )
            cards.append(card)
        return cards
```

- [ ] **Step 2: Register and commit**

```bash
git add abo/default_modules/xiaoyuzhou.py abo/main.py
git commit -m "feat: add xiaoyuzhou podcast crawler module"
```

---

### P1-Task 4: Create 知乎 (Zhihu) Crawler Module

**Files:**
- Create: `abo/default_modules/zhihu.py`
- Modify: `abo/main.py`

**Approach:** Use Zhihu's public search API.

- [ ] **Step 1: Create zhihu.py module**

```python
"""Zhihu academic content crawler."""
from typing import List, Dict, Any
from ..sdk import Module, Item, Card
import httpx

class ZhihuTracker(Module):
    id = "zhihu-tracker"
    name = "知乎学术讨论"
    schedule = "0 13 * * *"
    enabled = True
    keywords = ["人工智能", "科研", "学术"]

    async def fetch(self) -> List[Item]:
        """Fetch from Zhihu search."""
        items = []

        # Zhihu search API (requires proper headers)
        search_url = "https://www.zhihu.com/api/v4/search_v3"

        async with httpx.AsyncClient() as client:
            for keyword in self.keywords:
                try:
                    resp = await client.get(
                        search_url,
                        params={
                            "t": "general",
                            "q": keyword,
                            "correction": 1,
                            "offset": 0,
                            "limit": 10
                        },
                        headers={
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                            "Referer": "https://search.zhihu.com/"
                        },
                        timeout=30
                    )

                    data = resp.json()
                    for obj in data.get("data", []):
                        if "object" in obj:
                            content = obj["object"]
                            items.append(Item(
                                id=str(content.get("id", "")),
                                title=content.get("title", ""),
                                content=content.get("excerpt", ""),
                                url=content.get("url", ""),
                                tags=[keyword],
                                created_at=content.get("created_time", ""),
                                metadata={
                                    "voteup_count": content.get("voteup_count", 0),
                                    "author": content.get("author", {}).get("name", "")
                                }
                            ))
                except Exception as e:
                    print(f"Zhihu search failed for {keyword}: {e}")

        return items

    async def process(self, items: List[Item], prefs: Dict[str, Any]) -> List[Card]:
        """Convert Zhihu content to Cards."""
        cards = []
        for item in items:
            card = Card(
                id=f"zhihu-{item.id}",
                title=item.title,
                content=item.content,
                source="zhihu",
                source_url=item.url,
                tags=item.tags,
                created_at=item.created_at,
                metadata=item.metadata
            )
            cards.append(card)
        return cards
```

- [ ] **Step 2: Register and commit**

```bash
git add abo/default_modules/zhihu.py abo/main.py
git commit -m "feat: add zhihu crawler module"
```

---

## Phase 2: Feed Integration & Preference Learning

### P2-Task 1: Integrate All Crawlers into Intelligence Feed

**Files:**
- Verify: `abo/store/cards.py`
- Verify: `abo/runtime/runner.py`
- Verify: `src/modules/feed/Feed.tsx`

**Goal:** Ensure all crawler output appears in the Feed.

- [ ] **Step 1: Verify cards are stored with source field**

Check `abo/store/cards.py`:
```python
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    source TEXT,  -- xiaohongshu, bilibili, zhihu, arxiv, etc.
    source_url TEXT,
    tags TEXT,  -- JSON array
    created_at TEXT,
    metadata TEXT,  -- JSON
    viewed BOOLEAN DEFAULT 0,
    liked BOOLEAN DEFAULT NULL
);
```

- [ ] **Step 2: Verify runner stores cards**

Check `abo/runtime/runner.py`:
```python
async def run_module(self, module: Module):
    items = await module.fetch()
    cards = await module.process(items, prefs)

    for card in cards:
        await self.store.save_card(card)
```

- [ ] **Step 3: Verify Feed API returns all sources**

```bash
# Test feed endpoint
curl http://127.0.0.1:8765/api/cards

# Should see cards from all sources
```

- [ ] **Step 4: Update Feed UI to show source icons**

In `src/modules/feed/CardView.tsx`, ensure source icons exist:
```typescript
const sourceIcons: Record<string, string> = {
  "arxiv": "📄",
  "semantic-scholar": "🔬",
  "xiaohongshu": "📕",
  "bilibili": "📺",
  "xiaoyuzhou": "🎧",
  "zhihu": "❓",
  "rss": "📰",
  "podcast": "🎙️",
};
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/feed/CardView.tsx
git commit -m "feat: add source icons for all crawler types in Feed"
```

---

### P2-Task 2: Implement Feedback & Preference Learning

**Files:**
- Verify: `abo/preferences/engine.py`
- Verify: `src/core/store.ts`
- Verify: `src/modules/feed/CardView.tsx` (feedback buttons)

**Goal:** When user likes/dislikes content, update keyword preferences.

- [ ] **Step 1: Verify preference engine exists**

`abo/preferences/engine.py`:
```python
from dataclasses import dataclass, field
from typing import Dict, List

@dataclass
class KeywordPreference:
    keyword: str
    score: float  # -1.0 to 1.0
    count: int = 0

class PreferenceEngine:
    def __init__(self, storage_path: Path):
        self.storage_path = storage_path
        self.preferences: Dict[str, KeywordPreference] = {}
        self._load()

    def update_from_feedback(self, keywords: List[str], liked: bool):
        """Update preferences based on user feedback."""
        for kw in keywords:
            if kw not in self.preferences:
                self.preferences[kw] = KeywordPreference(kw, 0.0)

            pref = self.preferences[kw]
            pref.count += 1

            # Weighted average update
            alpha = 0.3
            target = 1.0 if liked else -1.0
            pref.score = pref.score * (1 - alpha) + target * alpha

        self._save()

    def get_prioritized(self, cards: List[Card]) -> List[Card]:
        """Sort cards by preference scores."""
        def score_card(card):
            total = 0
            for tag in card.tags:
                if tag in self.preferences:
                    total += self.preferences[tag].score
            return total / len(card.tags) if card.tags else 0

        return sorted(cards, key=score_card, reverse=True)
```

- [ ] **Step 2: Verify feedback API endpoint**

In `abo/main.py`:
```python
@app.post("/api/cards/{card_id}/feedback")
async def submit_feedback(card_id: str, data: dict):
    liked = data.get("liked")  # True = like, False = dislike, None = neutral

    # Get card tags
    card = await card_store.get_card(card_id)

    # Update preferences
    if liked is not None:
        prefs_engine.update_from_feedback(card.tags, liked)

    # Update card liked status
    await card_store.update_liked(card_id, liked)

    return {"ok": True}
```

- [ ] **Step 3: Verify frontend feedback buttons work**

In `CardView.tsx`, ensure feedback is sent:
```typescript
async function handleFeedback(liked: boolean | null) {
  await api.post(`/api/cards/${card.id}/feedback`, { liked });
  onFeedback?.(card.id, liked);
}
```

- [ ] **Step 4: Test preference learning**

```bash
# Like a card
curl -X POST http://127.0.0.1:8765/api/cards/test-123/feedback \
  -H "Content-Type: application/json" \
  -d '{"liked": true}'

# Check preferences
curl http://127.0.0.1:8765/api/preferences
```

- [ ] **Step 5: Commit**

```bash
git add abo/preferences/engine.py abo/main.py
git commit -m "feat: implement keyword preference learning from user feedback"
```

---

## Phase 3: Gamification & Reward System

### P3-Task 1: Implement Game State Management

**Files:**
- Verify: `abo/game/__init__.py`
- Create: `abo/game/rewards.py`
- Verify: `src/core/store.ts`

**Goal:** Track XP, happiness, SAN, productivity with reward notifications.

- [ ] **Step 1: Verify game state dataclass**

`abo/game/__init__.py`:
```python
from dataclasses import dataclass, field
from typing import List, Dict
from datetime import datetime

@dataclass
class GameState:
    level: int = 1
    xp: int = 0
    max_xp: int = 100
    happiness: int = 50  # 0-100
    san: int = 100  # 0-100 (SAN值)
    productivity: int = 50  # 0-100
    streak_days: int = 0
    last_checkin: str = ""
    achievements: List[str] = field(default_factory=list)

    def add_xp(self, amount: int) -> bool:
        """Add XP and return True if leveled up."""
        self.xp += amount
        leveled_up = False
        while self.xp >= self.max_xp:
            self.xp -= self.max_xp
            self.level += 1
            self.max_xp = int(self.max_xp * 1.2)
            leveled_up = True
        return leveled_up
```

- [ ] **Step 2: Implement reward mapping**

`abo/game/rewards.py`:
```python
from dataclasses import dataclass
from typing import Dict

@dataclass
class ActionReward:
    xp: int
    happiness: int
    san: int
    productivity: int
    message: str

ACTION_REWARDS: Dict[str, ActionReward] = {
    "card_like": ActionReward(10, 5, 0, 0, "发现有趣内容"),
    "card_dislike": ActionReward(2, 0, 0, 0, "标记不感兴趣"),
    "card_save": ActionReward(15, 3, 2, 5, "保存有价值内容"),
    "paper_read": ActionReward(20, 2, 5, 10, "阅读论文"),
    "paper_save": ActionReward(15, 3, 2, 5, "保存论文"),
    "daily_checkin": ActionReward(50, 10, 5, 10, "每日签到"),
    "module_run": ActionReward(5, 2, 0, 3, "执行爬虫任务"),
    "feedback_submit": ActionReward(5, 3, 0, 2, "提交反馈"),
}

def calculate_reward(action: str, metadata: dict = None) -> ActionReward:
    """Calculate reward for an action."""
    base = ACTION_REWARDS.get(action, ActionReward(5, 0, 0, 0, "完成任务"))

    # Apply multipliers based on metadata
    if metadata:
        if metadata.get("streak", 0) > 5:
            base.xp = int(base.xp * 1.5)

    return base
```

- [ ] **Step 3: Verify frontend game state in store.ts**

```typescript
interface GameStats {
  level: number;
  xp: number;
  maxXP: number;
  happiness: number;
  san: number;
  productivity: number;
}

interface RewardNotification {
  id: string;
  action: string;
  xp: number;
  happiness_delta: number;
  san_delta: number;
  message?: string;
}

interface AboStore {
  gameStats: GameStats;
  rewardQueue: RewardNotification[];
  addXP: (amount: number) => void;
  addReward: (reward: RewardNotification) => void;
  dismissReward: (id: string) => void;
}
```

- [ ] **Step 4: Commit**

```bash
git add abo/game/rewards.py
git commit -m "feat: implement action reward mapping system"
```

---

### P3-Task 2: Integrate Rewards with User Actions

**Files:**
- Modify: `abo/main.py` (feedback endpoint, checkin endpoint, etc.)
- Verify: `src/components/RewardNotification.tsx`

**Goal:** Trigger reward notifications when user performs actions.

- [ ] **Step 1: Update feedback endpoint to return rewards**

```python
from .game.rewards import calculate_reward

@app.post("/api/cards/{card_id}/feedback")
async def submit_feedback(card_id: str, data: dict):
    liked = data.get("liked")

    # ... existing logic ...

    # Calculate reward
    action = "card_like" if liked else "card_dislike"
    reward = calculate_reward(action)

    # Update game state
    game_state.add_xp(reward.xp)
    game_state.happiness = max(0, min(100, game_state.happiness + reward.happiness))
    game_state.san = max(0, min(100, game_state.san + reward.san))

    # Broadcast reward via WebSocket
    await ws_manager.broadcast({
        "type": "reward_earned",
        "data": {
            "action": action,
            "xp": reward.xp,
            "happiness_delta": reward.happiness,
            "san_delta": reward.san,
            "message": reward.message
        }
    })

    return {
        "ok": True,
        "reward": {
            "xp": reward.xp,
            "happiness_delta": reward.happiness,
            "san_delta": reward.san
        }
    }
```

- [ ] **Step 2: Verify frontend RewardNotification component**

`src/components/RewardNotification.tsx`:
```typescript
function RewardToast({ id, action, xp, happiness_delta, san_delta, message }: RewardToastProps) {
  const { dismissReward, addXP } = useStore();

  useEffect(() => {
    if (xp > 0) addXP(xp);

    const timer = setTimeout(() => {
      dismissReward(id);
    }, 5000);

    return () => clearTimeout(timer);
  }, [id, xp, addXP, dismissReward]);

  // ... render notification UI ...
}
```

- [ ] **Step 3: Add WebSocket listener for rewards**

In `src/core/events.ts` or store:
```typescript
// Listen for WebSocket reward messages
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "reward_earned") {
    addReward({
      id: Date.now().toString(),
      ...data.data
    });
  }
};
```

- [ ] **Step 4: Commit**

```bash
git add abo/main.py src/components/RewardNotification.tsx
git commit -m "feat: integrate rewards with user actions and WebSocket notifications"
```

---

## Phase 4: Frontend Configuration Panel

### P4-Task 1: Create Module Configuration Panel

**Files:**
- Create: `src/components/ModuleConfigPanel.tsx`
- Modify: `src/modules/profile/Profile.tsx`

**Goal:** Frontend UI to view and configure all crawler modules.

- [ ] **Step 1: Create ModuleConfigPanel component**

`src/components/ModuleConfigPanel.tsx`:
```typescript
import { useEffect, useState } from "react";
import { Settings, Clock, Globe, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";
import { api } from "../core/api";
import { useStore } from "../core/store";

interface ModuleConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  keywords?: string[];
}

export default function ModuleConfigPanel() {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useStore();

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const data = await api.get<{ modules: any[] }>("/api/modules");

      const configs: ModuleConfig[] = data.modules.map((m) => ({
        id: m.id,
        name: m.name,
        enabled: m.enabled,
        schedule: m.schedule || "0 10 * * *",
        keywords: m.keywords || getDefaultKeywords(m.id),
      }));

      setModules(configs);
    } catch (e) {
      addToast({ kind: "error", title: "加载模块配置失败" });
    } finally {
      setLoading(false);
    }
  }

  function getDefaultKeywords(moduleId: string): string[] {
    const defaults: Record<string, string[]> = {
      "xiaohongshu-tracker": ["科研工具", "论文写作", "学术日常"],
      "bilibili-tracker": ["深度学习", "机器学习", "论文解读"],
      "xiaoyuzhou-tracker": ["科技", "商业", "文化"],
      "zhihu-tracker": ["人工智能", "科研", "学术"],
      "arxiv-tracker": ["computer vision", "nlp", "multimodal"],
    };
    return defaults[moduleId] || [];
  }

  async function toggleModule(moduleId: string, enabled: boolean) {
    try {
      await api.patch(`/api/modules/${moduleId}/toggle`, {});

      setModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, enabled: !enabled } : m))
      );

      addToast({
        kind: "success",
        title: enabled ? "模块已禁用" : "模块已启用",
      });
    } catch (e) {
      addToast({ kind: "error", title: "操作失败" });
    }
  }

  // ... render module list with icons, schedules, keywords, toggles ...
}
```

- [ ] **Step 2: Integrate into Profile page**

`src/modules/profile/Profile.tsx`:
```typescript
import ModuleConfigPanel from "../../components/ModuleConfigPanel";

// In render:
<Card
  title="爬虫模块管理"
  icon={<span style={{ fontSize: "1rem" }}>🔧</span>}
  style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
>
  <ModuleConfigPanel />
</Card>
```

- [ ] **Step 3: Test configuration panel**

1. Open Profile page
2. See "爬虫模块管理" section
3. Verify all modules listed with correct icons
4. Test enable/disable toggle

- [ ] **Step 4: Commit**

```bash
git add src/components/ModuleConfigPanel.tsx src/modules/profile/Profile.tsx
git commit -m "feat: add ModuleConfigPanel for crawler management"
```

---

### P4-Task 2: Create Feed Sort Control

**Files:**
- Create: `src/components/FeedSortControl.tsx`
- Modify: `src/modules/feed/Feed.tsx`

**Goal:** Allow users to switch between default/prioritized/mixed feed sorting.

- [ ] **Step 1: Create FeedSortControl component**

```typescript
import { List, Sparkles, Shuffle } from "lucide-react";

type SortMode = "default" | "prioritized" | "mixed";

interface Props {
  mode: SortMode;
  onChange: (mode: SortMode) => void;
}

export default function FeedSortControl({ mode, onChange }: Props) {
  const modes: { value: SortMode; label: string; icon: React.ReactNode }[] = [
    { value: "default", label: "默认", icon: <List className="w-4 h-4" /> },
    { value: "prioritized", label: "推荐", icon: <Sparkles className="w-4 h-4" /> },
    { value: "mixed", label: "混合", icon: <Shuffle className="w-4 h-4" /> },
  ];

  return (
    <div className="flex gap-2">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            mode === m.value
              ? "bg-indigo-600 text-white"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
          }`}
        >
          {m.icon}
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update Feed to support sort modes**

```typescript
const [sortMode, setSortMode] = useState<SortMode>("default");

// When fetching cards, pass sort mode
async function loadCards() {
  const data = await api.get(`/api/cards?sort=${sortMode}`);
  setCards(data.cards);
}

useEffect(() => {
  loadCards();
}, [sortMode]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FeedSortControl.tsx src/modules/feed/Feed.tsx
git commit -m "feat: add FeedSortControl for default/prioritized/mixed sorting"
```

---

## Phase 5: Integration & Testing

### P5-Task 1: End-to-End Testing

**Goal:** Verify all components work together.

- [ ] **Step 1: Test complete flow**

1. Start backend: `python -m abo.main`
2. Start frontend: `npm run dev`
3. Open Tauri app or browser at `http://localhost:1420`

- [ ] **Step 2: Verify feed flow**

1. Go to Profile → 爬虫模块管理
2. Enable a module (e.g., bilibili-tracker)
3. Click "立即运行" to trigger crawl
4. Go to Intelligence Feed
5. Verify new cards appear with correct source icons

- [ ] **Step 3: Test preference learning**

1. Find a card with tags
2. Click "喜欢" (like)
3. Check Profile → 偏好学习
4. Verify keyword scores updated

- [ ] **Step 4: Test gamification**

1. Like a card
2. Verify reward notification appears
3. Check Profile → 游戏状态
4. Verify XP/happiness/SAN updated

- [ ] **Step 5: Test PDF and image download**

1. Find an arXiv paper card
2. Click "保存到文献库"
3. Verify folder structure: `{AuthorYear}-{Title}/`
4. Verify PDF and figures downloaded

---

### P5-Task 2: Performance & Polish

- [ ] **Step 1: Add loading states**

Ensure all async operations have loading indicators.

- [ ] **Step 2: Add error handling**

Ensure graceful error messages for network failures.

- [ ] **Step 3: Optimize database queries**

Add indexes if needed:
```sql
CREATE INDEX idx_cards_source ON cards(source);
CREATE INDEX idx_cards_created_at ON cards(created_at);
CREATE INDEX idx_cards_viewed ON cards(viewed);
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete ABO v2.0 with all crawlers, preferences, and gamification"
```

---

## Summary Checklist

### Completed Features:
- [ ] P0-Task 1: Follow-up naming fixed
- [ ] P0-Task 2: Image download working
- [ ] P0-Task 3: PDF download working
- [ ] P0-Task 4: Daily scheduling configured
- [ ] P1-Task 1: 小红书 crawler
- [ ] P1-Task 2: 哔哩哔哩 crawler
- [ ] P1-Task 3: 小宇宙 crawler
- [ ] P1-Task 4: 知乎 crawler
- [ ] P2-Task 1: Feed integration
- [ ] P2-Task 2: Preference learning
- [ ] P3-Task 1: Game state management
- [ ] P3-Task 2: Reward system
- [ ] P4-Task 1: Module config panel
- [ ] P4-Task 2: Feed sort control
- [ ] P5-Task 1: E2E testing
- [ ] P5-Task 2: Performance polish

---

## Notes for Implementation

1. **Many components may already exist** - Always verify before implementing
2. **Test incrementally** - Complete one phase before moving to next
3. **Commit frequently** - Each task should end with a commit
4. **Use subagents** - For independent tasks, dispatch subagents in parallel
5. **Document issues** - If a crawler cannot be implemented (anti-scraping), document alternatives

## Time Tracking

Record actual time spent on each phase:

| Phase | Estimated | Actual | Status |
|-------|-----------|--------|--------|
| P0 | 2-3h | ___ | ___ |
| P1 | 3-4h | ___ | ___ |
| P2 | 2-3h | ___ | ___ |
| P3 | 2h | ___ | ___ |
| P4 | 2h | ___ | ___ |
| P5 | 2h | ___ | ___ |
| **Total** | **13-16h** | ___ | ___ |

---

**Plan complete. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach would you like?
