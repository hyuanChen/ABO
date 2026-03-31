# 01 — Module SDK & Runtime

> Read this when building a new backend module or modifying the module runtime.

---

## Module ABC

Every module extends `abo.sdk.base.Module`:

```python
# abo/sdk/base.py
class Module(ABC):
    id: str = ""              # Unique ID, e.g. "arxiv-tracker"
    name: str = ""            # Display name, e.g. "arXiv 论文追踪"
    schedule: str = "0 8 * * *"  # Cron expression
    icon: str = "rss"         # Lucide icon name
    enabled: bool = True
    output: list[str]         # Auto-set to ["obsidian", "ui"] if not declared

    @abstractmethod
    async def fetch(self) -> list[Item]:
        """Fetch raw data. No Claude calls here."""

    @abstractmethod
    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Process items with Claude. prefs contains user preferences."""

    async def on_feedback(self, card_id: str, action: FeedbackAction) -> None:
        """Optional: handle user feedback (save/skip/star/deep_dive)."""

    def get_status(self) -> dict:
        """Returns module info dict for /api/modules."""
```

---

## Data Types

```python
# abo/sdk/types.py

@dataclass
class Item:
    id: str                   # Unique within module
    raw: dict[str, Any]       # Arbitrary fetched data

@dataclass
class Card:
    id: str                   # Unique
    title: str
    summary: str
    score: float              # 0.0 – 1.0 (relevance)
    tags: list[str]
    source_url: str
    obsidian_path: str        # Relative to vault root, e.g. "Literature/Author2024-Title.md"
    module_id: str = ""       # Set by runner
    created_at: float         # time.time() default
    metadata: dict = {}       # Module-specific extra data

class FeedbackAction(str, Enum):
    SAVE      = "save"
    SKIP      = "skip"
    STAR      = "star"
    DEEP_DIVE = "deep_dive"
```

---

## SDK Tools

```python
from abo.sdk import claude, claude_json, fetch_rss, download_audio, transcribe

# Claude CLI batch call (returns full text)
text = await claude("分析这篇论文...", prefs=prefs)

# Claude CLI + JSON parse (strips code fences, returns dict)
result = await claude_json("返回JSON: {score, summary, tags}", prefs=prefs)
# Returns {} on parse failure — always handle gracefully

# RSS fetcher (httpx + feedparser)
entries = await fetch_rss("https://example.com/feed.xml")
# Returns list[dict] with keys: id, title, summary, link, published

# Audio download (yt-dlp)
audio_path = await download_audio("https://youtube.com/watch?v=xxx")

# Transcription (faster-whisper)
transcript = await transcribe(audio_path)
```

### Preference Injection

The `prefs` dict passed to `claude()` / `claude_json()` auto-generates a `<user_preferences>` XML block:

```xml
<user_preferences>
  偏好主题：machine learning, NLP
  不感兴趣：crypto
  摘要语言：zh
</user_preferences>
```

---

## Runtime Lifecycle

### 1. Discovery (`abo/runtime/discovery.py`)

```
ModuleRegistry.load_all()
├── Scan abo/default_modules/*/  → load __init__.py, find Module subclasses
└── Scan ~/.abo/modules/*/       → same (user custom modules)

start_watcher(registry, on_change)
└── watchdog monitors ~/.abo/modules/ for new __init__.py → hot reload
```

### 2. Scheduling (`abo/runtime/scheduler.py`)

```
ModuleScheduler.start(modules)
└── For each enabled module:
    APScheduler.add_job(runner.run, CronTrigger(module.schedule), id=module.id)

run_now(module_id)  → immediate execution (called by POST /api/modules/{id}/run)
```

### 3. Execution (`abo/runtime/runner.py`)

```
ModuleRunner.run(module):
  1. prefs = preference_engine.get_prefs_for_module(module.id)
  2. items = await module.fetch()
  3. cards = await module.process(items, prefs)
  4. Filter: cards where score >= threshold (default 0.4)
  5. Sort by score desc, take top N (default 20)
  6. For each card:
     a. card.module_id = module.id
     b. If "obsidian" in output → write Vault markdown (frontmatter)
     c. SQLite card_store.save(card)
     d. If "ui" in output → WebSocket broadcaster.send_card(card)
  7. Return count
```

### 4. Broadcasting (`abo/runtime/broadcaster.py`)

```
broadcaster.send_card(card) → JSON via WebSocket to all connected clients
  Message format: {"type": "new_card", "card": {Card.to_dict()}}

broadcaster.send_event(event) → arbitrary event dict
```

---

## Writing a New Module

### File Location

- **Built-in**: `abo/default_modules/{name}/__init__.py`
- **User custom**: `~/.abo/modules/{name}/__init__.py` (hot-loaded)

### Minimal Example

```python
# abo/default_modules/my_module/__init__.py
from abo.sdk import Module, Item, Card, claude_json

class MyModule(Module):
    id       = "my-module"
    name     = "我的模块"
    schedule = "0 8 * * *"     # Daily at 8 AM
    icon     = "rss"           # Lucide icon name
    output   = ["obsidian", "ui"]

    async def fetch(self) -> list[Item]:
        # Fetch data from external source
        return [Item(id="1", raw={"title": "Example", "content": "..."})]

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards = []
        for item in items:
            result = await claude_json(
                f"分析并返回JSON: {{score, summary, tags}}\n\n{item.raw['content']}",
                prefs=prefs,
            )
            cards.append(Card(
                id=item.id,
                title=item.raw["title"],
                summary=result.get("summary", ""),
                score=result.get("score", 5) / 10,  # Normalize to 0-1
                tags=result.get("tags", []),
                source_url="",
                obsidian_path=f"Notes/{item.raw['title']}.md",
            ))
        return cards
```

### Reading Module-Specific Config

Modules read their config from `~/.abo/preferences.json`:

```python
async def fetch(self) -> list[Item]:
    from pathlib import Path
    import json
    prefs_path = Path.home() / ".abo" / "preferences.json"
    my_config = {}
    if prefs_path.exists():
        data = json.loads(prefs_path.read_text())
        my_config = data.get("modules", {}).get(self.id, {})
    keywords = my_config.get("keywords", ["default"])
    # ... use keywords
```

---

## Existing Modules Reference

| Module ID | Class | Schedule | What it does |
|-----------|-------|----------|-------------|
| `arxiv-tracker` | `ArxivTracker` | `0 8 * * *` | arXiv API → Claude score + summary |
| `rss-aggregator` | `RssAggregator` | `0 */2 * * *` | RSS feeds → Claude trend analysis |
| `podcast-digest` | `PodcastDigest` | `0 7 * * *` | yt-dlp → whisper → Claude summary |
| `folder-monitor` | `FolderMonitor` | `*/5 * * * *` | ~/Downloads PDF → Claude analysis |

---

## CardStore API (`abo/store/cards.py`)

```python
card_store = CardStore()  # SQLite at ~/.abo/data/cards.db

card_store.save(card)                          # INSERT OR REPLACE
card_store.get(card_id) -> Card | None
card_store.list(module_id, unread_only, limit, offset) -> list[Card]
card_store.mark_read(card_id)
card_store.record_feedback(card_id, action)    # Sets feedback + read=1
card_store.count_feedback(module_id, action)   # Count by module + action
card_store.unread_counts() -> dict[str, int]   # Per-module unread counts
```

### SQLite Schema

```sql
CREATE TABLE cards (
    id            TEXT PRIMARY KEY,
    module_id     TEXT NOT NULL,
    title         TEXT NOT NULL,
    summary       TEXT,
    score         REAL,
    tags          TEXT,          -- JSON array string
    source_url    TEXT,
    obsidian_path TEXT,
    metadata      TEXT,          -- JSON object string
    created_at    REAL,
    read          INTEGER DEFAULT 0,
    feedback      TEXT           -- "save" | "skip" | "star" | "deep_dive" | NULL
);
```

---

## Preference Engine (`abo/preferences/engine.py`)

```python
prefs = PreferenceEngine()

# Used by runner before module.process()
module_prefs = prefs.get_prefs_for_module("arxiv-tracker")

# Used by runner for filtering
threshold = prefs.threshold("arxiv-tracker")  # default 0.4
max_cards = prefs.max_cards("arxiv-tracker")   # default 20

# Called when user clicks feedback button
prefs.record_feedback(card.tags, "star")
# → Adjusts derived_weights: star=1.1x, save=1.05x, skip=0.85x, deep_dive=1.1x
```
