# ABO Intelligence Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first personal intelligence engine with Python module runtime, preference engine, 4 default modules (arXiv/RSS/Podcast/FolderMonitor), and a card-based Feed UI in ABO.

**Architecture:** A Python Package Runtime discovers modules in `~/.abo/modules/`, schedules them via APScheduler, processes items through Claude with injected user preferences, stores cards in SQLite, pushes to ABO UI via WebSocket, and writes to Obsidian Vault. Users extend the system by asking Claude Code to generate new module packages — ABO hot-reloads them instantly.

**Tech Stack:** FastAPI + APScheduler + watchdog (backend); SQLite (cards); React + Zustand + Tailwind (frontend); yt-dlp + faster-whisper (media); feedparser + httpx (feeds); claude CLI subprocess (LLM)

---

## File Map

### New backend files
| File | Responsibility |
|------|---------------|
| `abo/sdk/__init__.py` | Public SDK exports |
| `abo/sdk/types.py` | Item, Card, FeedbackAction dataclasses |
| `abo/sdk/base.py` | Module abstract base class |
| `abo/sdk/tools.py` | claude(), fetch_rss(), download_audio(), transcribe() |
| `abo/runtime/discovery.py` | Scan ~/.abo/modules/, hot-reload via watchdog |
| `abo/runtime/scheduler.py` | APScheduler wrapper, one job per module |
| `abo/runtime/runner.py` | Execute module: fetch→process→store→broadcast |
| `abo/runtime/broadcaster.py` | WebSocket client registry + send helpers |
| `abo/preferences/engine.py` | Load/save ~/.abo/preferences.json, weight updates |
| `abo/store/cards.py` | SQLite CRUD for Card objects |
| `abo/default_modules/arxiv/__init__.py` | arXiv tracker module |
| `abo/default_modules/rss/__init__.py` | RSS/Newsletter aggregator module |
| `abo/default_modules/podcast/__init__.py` | YouTube/Podcast digest module |
| `abo/default_modules/folder_monitor/__init__.py` | Local folder watcher module |

### Modified backend files
| File | Change |
|------|--------|
| `abo/main.py` | Remove game routes; add /api/cards, /api/modules, /ws/feed, startup lifecycle |
| `requirements.txt` | Add apscheduler, feedparser, yt-dlp, faster-whisper |

### New frontend files
| File | Responsibility |
|------|---------------|
| `src/modules/feed/Feed.tsx` | Feed container: WebSocket subscription, keyboard nav, card list |
| `src/modules/feed/CardView.tsx` | Single card with score bar, summary, tags, action buttons |
| `src/modules/feed/ModulePanel.tsx` | Module management list with enable/disable and run-now |
| `src/modules/feed/FeedSidebar.tsx` | Per-module unread counts, filter selector |

### Modified frontend files
| File | Change |
|------|--------|
| `src/core/store.ts` | Add feedCards[], activeFilter, feedModules[] state |
| `src/modules/MainContent.tsx` | Wire feed tab |
| `src/modules/nav/NavSidebar.tsx` | Replace overview with feed as primary tab |

### New data files
| Path | Responsibility |
|------|---------------|
| `~/.abo/preferences.json` | User preference weights (created on first run) |
| `~/.abo/data/cards.db` | SQLite: cards + feedback tables |
| `~/.abo/sdk/README.md` | Claude Code reference doc for writing modules |

---

## Task 1: SDK Types

**Files:**
- Create: `abo/sdk/__init__.py`
- Create: `abo/sdk/types.py`
- Create: `abo/sdk/base.py`

- [ ] **Step 1: Create `abo/sdk/types.py`**

```python
# abo/sdk/types.py
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import time


@dataclass
class Item:
    id: str
    raw: dict[str, Any]
    source_module: str = ""


@dataclass
class Card:
    id: str
    title: str
    summary: str
    score: float          # 0.0–1.0 after preference adjustment
    tags: list[str] = field(default_factory=list)
    source_url: str = ""
    obsidian_path: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    module_id: str = ""
    created_at: float = field(default_factory=time.time)
    read: bool = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "summary": self.summary,
            "score": self.score,
            "tags": self.tags,
            "source_url": self.source_url,
            "obsidian_path": self.obsidian_path,
            "metadata": self.metadata,
            "module_id": self.module_id,
            "created_at": self.created_at,
            "read": self.read,
        }


class FeedbackAction(str, Enum):
    SAVE = "save"
    SKIP = "skip"
    STAR = "star"
    DEEP_DIVE = "deep_dive"
```

- [ ] **Step 2: Create `abo/sdk/base.py`**

```python
# abo/sdk/base.py
from abc import ABC, abstractmethod
from .types import Item, Card, FeedbackAction


class Module(ABC):
    """Base class every ABO module must subclass."""

    id: str = ""
    name: str = ""
    schedule: str = "0 8 * * *"   # cron expression
    icon: str = "rss"             # lucide-react icon name
    output: list[str]             # set in subclass: ["obsidian", "ui"]
    enabled: bool = True
    version: str = "1.0.0"

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if not hasattr(cls, "output") or not isinstance(cls.output, list):
            cls.output = ["obsidian", "ui"]

    @abstractmethod
    async def fetch(self) -> list[Item]:
        """Pull raw data from the source. No LLM calls here."""
        ...

    @abstractmethod
    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """
        Transform items into Cards using Claude.
        prefs is injected automatically by the runner.
        """
        ...

    async def on_feedback(self, card_id: str, action: FeedbackAction) -> None:
        """Optional: react to user feedback (e.g. update local config)."""
        pass

    def get_status(self) -> dict:
        return {"id": self.id, "name": self.name, "enabled": self.enabled,
                "schedule": self.schedule, "icon": self.icon}
```

- [ ] **Step 3: Create `abo/sdk/__init__.py`**

```python
# abo/sdk/__init__.py
from .types import Item, Card, FeedbackAction
from .base import Module
from .tools import claude, claude_json, fetch_rss, download_audio, transcribe

__all__ = [
    "Module", "Item", "Card", "FeedbackAction",
    "claude", "claude_json", "fetch_rss", "download_audio", "transcribe",
]
```

- [ ] **Step 4: Commit**

```bash
git add abo/sdk/
git commit -m "feat(sdk): add Module base class and Item/Card/FeedbackAction types"
```

---

## Task 2: SDK Tools

**Files:**
- Create: `abo/sdk/tools.py`

- [ ] **Step 1: Create `abo/sdk/tools.py`**

```python
# abo/sdk/tools.py
"""
Utility functions available to all ABO modules.
Import: from abo.sdk import claude, fetch_rss, download_audio, transcribe
"""
import asyncio
import json
import re
from pathlib import Path
from typing import Any


def _build_pref_block(prefs: dict) -> str:
    weights = prefs.get("derived_weights", {})
    liked = [k for k, v in weights.items() if v > 1.0]
    disliked = [k for k, v in weights.items() if v < 1.0]
    lang = prefs.get("summary_language", "zh")
    return (
        f"<user_preferences>\n"
        f"  语言：{lang}\n"
        f"  偏好主题：{', '.join(liked) or '暂无'}\n"
        f"  不感兴趣：{', '.join(disliked) or '暂无'}\n"
        f"</user_preferences>\n\n"
    )


async def claude(prompt: str, prefs: dict | None = None) -> str:
    """
    Call local claude CLI. Injects user preferences if provided.
    Returns raw text output.
    """
    full_prompt = (_build_pref_block(prefs) if prefs else "") + prompt
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", full_prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()


async def claude_json(prompt: str, prefs: dict | None = None) -> dict[str, Any]:
    """Call claude and parse JSON from the response."""
    result = await claude(prompt + "\n\nRespond with valid JSON only.", prefs=prefs)
    match = re.search(r'\{.*\}', result, re.DOTALL)
    if match:
        return json.loads(match.group())
    raise ValueError(f"No JSON found in claude response: {result[:200]}")


async def fetch_rss(url: str) -> list[dict]:
    """Fetch and parse an RSS/Atom feed. Returns list of entry dicts."""
    import feedparser
    import httpx
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
    feed = feedparser.parse(resp.text)
    return [
        {
            "id": e.get("id") or e.get("link", ""),
            "title": e.get("title", ""),
            "url": e.get("link", ""),
            "summary": e.get("summary", ""),
            "content": (e.get("content", [{}])[0].get("value", "")
                        or e.get("summary", "")),
            "published": e.get("published", ""),
            "author": e.get("author", ""),
        }
        for e in feed.entries
    ]


async def download_audio(url: str, output_dir: Path | None = None) -> Path:
    """
    Download audio from YouTube/podcast URL via yt-dlp.
    Returns path to the downloaded mp3 file.
    """
    import yt_dlp

    if output_dir is None:
        output_dir = Path.home() / ".abo" / "tmp" / "audio"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_template = str(output_dir / "%(id)s.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [{"key": "FFmpegExtractAudio",
                            "preferredcodec": "mp3", "preferredquality": "128"}],
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        stem = Path(ydl.prepare_filename(info)).stem
    return output_dir / f"{stem}.mp3"


async def transcribe(audio_path: Path, language: str = "zh") -> str:
    """
    Transcribe audio file with faster-whisper (local, no API).
    Returns full transcript as a single string.
    """
    from faster_whisper import WhisperModel
    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(audio_path), beam_size=5,
                                   language=language)
    return " ".join(seg.text.strip() for seg in segments)
```

- [ ] **Step 2: Update `requirements.txt`**

```
fastapi>=0.115
uvicorn[standard]>=0.34
python-frontmatter>=1.1
pypdf>=5.0
pdfminer.six>=20231228
httpx>=0.28
watchdog>=6.0
pyyaml>=6.0
apscheduler>=3.10
feedparser>=6.0
yt-dlp>=2024.1.1
faster-whisper>=1.0
```

- [ ] **Step 3: Install new deps**

```bash
pip install apscheduler feedparser yt-dlp faster-whisper watchdog
```

- [ ] **Step 4: Commit**

```bash
git add abo/sdk/tools.py requirements.txt
git commit -m "feat(sdk): add claude/fetch_rss/download_audio/transcribe tools"
```

---

## Task 3: SQLite Card Store

**Files:**
- Create: `abo/store/__init__.py`
- Create: `abo/store/cards.py`

- [ ] **Step 1: Create `abo/store/cards.py`**

```python
# abo/store/cards.py
"""
SQLite-backed storage for Card objects.
Database lives at ~/.abo/data/cards.db
"""
import json
import sqlite3
import time
from pathlib import Path

from ..sdk.types import Card

DB_PATH = Path.home() / ".abo" / "data" / "cards.db"

_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS cards (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    summary     TEXT,
    score       REAL,
    tags        TEXT,          -- JSON array
    source_url  TEXT,
    obsidian_path TEXT,
    metadata    TEXT,          -- JSON object
    module_id   TEXT,
    created_at  REAL,
    read        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id     TEXT NOT NULL,
    action      TEXT NOT NULL,
    ts          REAL NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.executescript(_CREATE_SQL)
    return conn


def _row_to_card(row: sqlite3.Row) -> Card:
    return Card(
        id=row["id"],
        title=row["title"],
        summary=row["summary"] or "",
        score=row["score"] or 0.0,
        tags=json.loads(row["tags"] or "[]"),
        source_url=row["source_url"] or "",
        obsidian_path=row["obsidian_path"] or "",
        metadata=json.loads(row["metadata"] or "{}"),
        module_id=row["module_id"] or "",
        created_at=row["created_at"] or time.time(),
        read=bool(row["read"]),
    )


class CardStore:
    def save(self, card: Card) -> None:
        with _connect() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO cards
                (id, title, summary, score, tags, source_url,
                 obsidian_path, metadata, module_id, created_at, read)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, (
                card.id, card.title, card.summary, card.score,
                json.dumps(card.tags), card.source_url,
                card.obsidian_path, json.dumps(card.metadata),
                card.module_id, card.created_at, int(card.read),
            ))

    def get(self, card_id: str) -> Card | None:
        with _connect() as conn:
            row = conn.execute(
                "SELECT * FROM cards WHERE id = ?", (card_id,)
            ).fetchone()
        return _row_to_card(row) if row else None

    def list(
        self,
        module_id: str | None = None,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Card]:
        query = "SELECT * FROM cards WHERE 1=1"
        params: list = []
        if module_id:
            query += " AND module_id = ?"
            params.append(module_id)
        if unread_only:
            query += " AND read = 0"
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params += [limit, offset]
        with _connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [_row_to_card(r) for r in rows]

    def mark_read(self, card_id: str) -> None:
        with _connect() as conn:
            conn.execute("UPDATE cards SET read = 1 WHERE id = ?", (card_id,))

    def record_feedback(self, card_id: str, action: str) -> None:
        with _connect() as conn:
            conn.execute(
                "INSERT INTO feedback (card_id, action, ts) VALUES (?,?,?)",
                (card_id, action, time.time()),
            )

    def unread_counts(self) -> dict[str, int]:
        with _connect() as conn:
            rows = conn.execute("""
                SELECT module_id, COUNT(*) as cnt
                FROM cards WHERE read = 0
                GROUP BY module_id
            """).fetchall()
        return {r["module_id"]: r["cnt"] for r in rows}
```

- [ ] **Step 2: Create `abo/store/__init__.py`**

```python
from .cards import CardStore
__all__ = ["CardStore"]
```

- [ ] **Step 3: Commit**

```bash
git add abo/store/
git commit -m "feat(store): add SQLite CardStore with feedback tracking"
```

---

## Task 4: Preference Engine

**Files:**
- Create: `abo/preferences/__init__.py`
- Create: `abo/preferences/engine.py`

- [ ] **Step 1: Create `abo/preferences/engine.py`**

```python
# abo/preferences/engine.py
"""
Manages ~/.abo/preferences.json.
Records feedback signals, updates tag weights, reorders cards.
"""
import json
import time
from pathlib import Path

from ..sdk.types import Card, FeedbackAction

PREFS_PATH = Path.home() / ".abo" / "preferences.json"

_DEFAULTS: dict = {
    "global": {
        "summary_language": "zh",
        "detail_level": "medium",
        "max_cards_per_run": 20,
        "score_threshold": 0.4,
    },
    "modules": {},
    "feedback_history": [],
    "derived_weights": {},
}

# How much each action multiplies a tag's weight
_MULTIPLIERS = {
    FeedbackAction.STAR:      1.12,
    FeedbackAction.SAVE:      1.06,
    FeedbackAction.SKIP:      0.84,
    FeedbackAction.DEEP_DIVE: 1.12,
}


class PreferenceEngine:
    def __init__(self) -> None:
        self._data = self._load()

    # ── I/O ────────────────────────────────────────────────────────────────

    def _load(self) -> dict:
        PREFS_PATH.parent.mkdir(parents=True, exist_ok=True)
        if PREFS_PATH.exists():
            try:
                return json.loads(PREFS_PATH.read_text())
            except json.JSONDecodeError:
                pass
        saved = json.dumps(_DEFAULTS, ensure_ascii=False, indent=2)
        PREFS_PATH.write_text(saved)
        return dict(_DEFAULTS)

    def _save(self) -> None:
        PREFS_PATH.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2)
        )

    # ── Public API ──────────────────────────────────────────────────────────

    def get_for_module(self, module_id: str) -> dict:
        """Return merged prefs dict for a specific module (used in prompts)."""
        base = dict(self._data.get("global", {}))
        module_overrides = self._data.get("modules", {}).get(module_id, {})
        base.update(module_overrides)
        base["derived_weights"] = self._data.get("derived_weights", {})
        return base

    def record_feedback(self, card: Card, action: FeedbackAction) -> None:
        weights: dict[str, float] = self._data.setdefault("derived_weights", {})
        multiplier = _MULTIPLIERS.get(action, 1.0)

        for tag in card.tags:
            current = weights.get(tag, 1.0)
            updated = round(min(2.5, max(0.05, current * multiplier)), 4)
            weights[tag] = updated

        history: list = self._data.setdefault("feedback_history", [])
        history.append({
            "card_id": card.id,
            "action": action.value,
            "module_id": card.module_id,
            "tags": card.tags,
            "ts": time.time(),
        })
        # Keep last 500 entries
        self._data["feedback_history"] = history[-500:]
        self._save()

    def reorder(self, cards: list[Card], module_id: str) -> list[Card]:
        """Re-rank cards by score adjusted for user tag preferences."""
        weights = self._data.get("derived_weights", {})

        def adjusted_score(card: Card) -> float:
            if not card.tags:
                return card.score
            boost = sum(weights.get(t, 1.0) for t in card.tags) / len(card.tags)
            return card.score * boost

        return sorted(cards, key=adjusted_score, reverse=True)

    def threshold(self, module_id: str) -> float:
        module_cfg = self._data.get("modules", {}).get(module_id, {})
        return module_cfg.get(
            "score_threshold",
            self._data["global"].get("score_threshold", 0.4)
        )

    def max_cards(self, module_id: str) -> int:
        module_cfg = self._data.get("modules", {}).get(module_id, {})
        return module_cfg.get(
            "max_cards_per_run",
            self._data["global"].get("max_cards_per_run", 20)
        )
```

- [ ] **Step 2: Create `abo/preferences/__init__.py`**

```python
from .engine import PreferenceEngine
__all__ = ["PreferenceEngine"]
```

- [ ] **Step 3: Commit**

```bash
git add abo/preferences/
git commit -m "feat(preferences): add PreferenceEngine with tag weight updates"
```

---

## Task 5: WebSocket Broadcaster

**Files:**
- Create: `abo/runtime/broadcaster.py`

- [ ] **Step 1: Create `abo/runtime/broadcaster.py`**

```python
# abo/runtime/broadcaster.py
"""
Global WebSocket client registry.
Modules push cards here; FastAPI /ws/feed endpoint registers clients.
"""
import json
from fastapi import WebSocket

from ..sdk.types import Card


class Broadcaster:
    def __init__(self) -> None:
        self._clients: list[WebSocket] = []

    def register(self, ws: WebSocket) -> None:
        self._clients.append(ws)

    def unregister(self, ws: WebSocket) -> None:
        self._clients = [c for c in self._clients if c is not ws]

    async def send_card(self, card: Card) -> None:
        payload = json.dumps({"type": "new_card", "card": card.to_dict()})
        dead: list[WebSocket] = []
        for ws in self._clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister(ws)

    async def send_event(self, event: dict) -> None:
        payload = json.dumps(event)
        dead: list[WebSocket] = []
        for ws in self._clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister(ws)


# Singleton used by main.py and runner.py
broadcaster = Broadcaster()
```

- [ ] **Step 2: Create `abo/runtime/__init__.py`** (creates the package so Task 6 imports work)

```python
# abo/runtime/__init__.py
from .runner import ModuleRunner
from .broadcaster import broadcaster
__all__ = ["ModuleRunner", "broadcaster"]
```

- [ ] **Step 3: Commit**

```bash
git add abo/runtime/broadcaster.py abo/runtime/__init__.py
git commit -m "feat(runtime): add WebSocket broadcaster singleton and package init"
```

---

## Task 6: Module Runner

**Files:**
- Create: `abo/runtime/__init__.py`
- Create: `abo/runtime/runner.py`

- [ ] **Step 1: Create `abo/runtime/runner.py`**

```python
# abo/runtime/runner.py
"""
Executes a single module: fetch → process → filter → reorder → store → broadcast → vault.
"""
import time
from pathlib import Path

from ..sdk.base import Module
from ..sdk.types import Card
from ..store.cards import CardStore
from ..preferences.engine import PreferenceEngine
from .broadcaster import Broadcaster


class ModuleRunner:
    def __init__(
        self,
        card_store: CardStore,
        prefs: PreferenceEngine,
        broadcaster: Broadcaster,
        vault_path: Path | None = None,
    ) -> None:
        self._store = card_store
        self._prefs = prefs
        self._broadcaster = broadcaster
        self._vault = vault_path

    async def run(self, module: Module) -> int:
        """Run a module end-to-end. Returns number of new cards produced."""
        print(f"[runner] Starting: {module.name}")
        start = time.time()
        try:
            items = await module.fetch()
            print(f"[runner] {module.name}: fetched {len(items)} items")

            prefs = self._prefs.get_for_module(module.id)
            cards = await module.process(items, prefs)

            # Filter below threshold
            threshold = self._prefs.threshold(module.id)
            cards = [c for c in cards if c.score >= threshold]

            # Apply preference re-ranking
            cards = self._prefs.reorder(cards, module.id)

            # Honour max_cards limit
            max_n = self._prefs.max_cards(module.id)
            cards = cards[:max_n]

            for card in cards:
                card.module_id = module.id
                self._store.save(card)

                if "obsidian" in module.output and card.obsidian_path and self._vault:
                    await self._write_obsidian(card)

                if "ui" in module.output:
                    await self._broadcaster.send_card(card)

            elapsed = round(time.time() - start, 1)
            print(f"[runner] {module.name}: done — {len(cards)} cards in {elapsed}s")
            return len(cards)

        except Exception as exc:
            print(f"[runner] ERROR in {module.name}: {exc}")
            await self._broadcaster.send_event({
                "type": "module_error",
                "module_id": module.id,
                "error": str(exc),
            })
            return 0

    async def _write_obsidian(self, card: Card) -> None:
        """Write card to Obsidian vault as Markdown with YAML frontmatter."""
        import frontmatter as fm
        path = self._vault / card.obsidian_path
        path.parent.mkdir(parents=True, exist_ok=True)

        post = fm.Post(content=(
            f"# {card.title}\n\n{card.summary}\n\n"
            f"[原文链接]({card.source_url})\n"
        ))
        post.metadata.update({
            "abo-type": card.module_id,
            "relevance-score": round(card.score, 3),
            "tags": card.tags,
            **card.metadata,
        })
        tmp = path.with_suffix(".tmp")
        tmp.write_text(fm.dumps(post), encoding="utf-8")
        tmp.replace(path)
```

- [ ] **Step 2: Create `abo/runtime/__init__.py`**

```python
from .runner import ModuleRunner
from .broadcaster import broadcaster
__all__ = ["ModuleRunner", "broadcaster"]
```

- [ ] **Step 3: Commit**

```bash
git add abo/runtime/
git commit -m "feat(runtime): add ModuleRunner with vault write and broadcast"
```

---

## Task 7: Module Discovery + Hot-Reload

**Files:**
- Create: `abo/runtime/discovery.py`

- [ ] **Step 1: Create `abo/runtime/discovery.py`**

```python
# abo/runtime/discovery.py
"""
Scans built-in and user module directories.
watchdog observer reloads modules when files change.
"""
import importlib
import importlib.util
import sys
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from ..sdk.base import Module

BUILTIN_DIR = Path(__file__).parent.parent / "default_modules"
USER_DIR = Path.home() / ".abo" / "modules"


class ModuleRegistry:
    def __init__(self) -> None:
        self._modules: dict[str, Module] = {}

    def load_all(self) -> None:
        USER_DIR.mkdir(parents=True, exist_ok=True)
        for directory in [BUILTIN_DIR, USER_DIR]:
            if not directory.exists():
                continue
            for mod_dir in sorted(directory.iterdir()):
                if mod_dir.is_dir() and (mod_dir / "__init__.py").exists():
                    self._load_dir(mod_dir)

    def _load_dir(self, mod_dir: Path) -> None:
        pkg_name = f"_abo_module_{mod_dir.name}"
        try:
            spec = importlib.util.spec_from_file_location(
                pkg_name,
                mod_dir / "__init__.py",
                submodule_search_locations=[str(mod_dir)],
            )
            if spec is None or spec.loader is None:
                return
            mod = importlib.util.module_from_spec(spec)
            sys.modules[pkg_name] = mod
            spec.loader.exec_module(mod)

            for attr_name in dir(mod):
                cls = getattr(mod, attr_name)
                if (
                    isinstance(cls, type)
                    and issubclass(cls, Module)
                    and cls is not Module
                    and cls.id
                ):
                    instance = cls()
                    self._modules[instance.id] = instance
                    print(f"[discovery] Loaded: {instance.name} ({instance.id})")
        except Exception as exc:
            print(f"[discovery] Failed to load {mod_dir.name}: {exc}")

    def reload_dir(self, mod_dir: Path) -> None:
        # Remove stale entries for this directory
        pkg_name = f"_abo_module_{mod_dir.name}"
        stale = [k for k, v in self._modules.items()
                 if type(v).__module__ == pkg_name]
        for k in stale:
            del self._modules[k]
        if pkg_name in sys.modules:
            del sys.modules[pkg_name]
        self._load_dir(mod_dir)

    def all(self) -> list[Module]:
        return list(self._modules.values())

    def get(self, module_id: str) -> Module | None:
        return self._modules.get(module_id)

    def enabled(self) -> list[Module]:
        return [m for m in self._modules.values() if m.enabled]


class _HotReloadHandler(FileSystemEventHandler):
    def __init__(self, registry: ModuleRegistry, on_reload) -> None:
        self._registry = registry
        self._on_reload = on_reload

    def on_any_event(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix == ".py":
            mod_dir = path.parent
            self._registry.reload_dir(mod_dir)
            if self._on_reload:
                self._on_reload(self._registry)


def start_watcher(registry: ModuleRegistry, on_reload=None) -> Observer:
    observer = Observer()
    observer.schedule(
        _HotReloadHandler(registry, on_reload),
        str(USER_DIR),
        recursive=True,
    )
    observer.start()
    return observer
```

- [ ] **Step 2: Commit**

```bash
git add abo/runtime/discovery.py
git commit -m "feat(runtime): add module discovery and watchdog hot-reload"
```

---

## Task 8: APScheduler Integration

**Files:**
- Create: `abo/runtime/scheduler.py`

- [ ] **Step 1: Create `abo/runtime/scheduler.py`**

```python
# abo/runtime/scheduler.py
"""
APScheduler wrapper. One cron job per enabled module.
"""
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..sdk.base import Module
from .runner import ModuleRunner


class ModuleScheduler:
    def __init__(self, runner: ModuleRunner) -> None:
        self._runner = runner
        self._scheduler = AsyncIOScheduler()

    def start(self, modules: list[Module]) -> None:
        for module in modules:
            self._add_job(module)
        self._scheduler.start()
        print(f"[scheduler] Started with {len(modules)} module(s)")

    def _add_job(self, module: Module) -> None:
        if not module.enabled:
            return
        try:
            trigger = CronTrigger.from_crontab(module.schedule)
            self._scheduler.add_job(
                self._run_module,
                trigger=trigger,
                args=[module],
                id=module.id,
                replace_existing=True,
                misfire_grace_time=300,
            )
        except Exception as exc:
            print(f"[scheduler] Could not schedule {module.id}: {exc}")

    async def _run_module(self, module: Module) -> None:
        await self._runner.run(module)

    def reschedule(self, modules: list[Module]) -> None:
        """Called after hot-reload to add/update jobs."""
        current_ids = {job.id for job in self._scheduler.get_jobs()}
        for module in modules:
            self._add_job(module)
        print(f"[scheduler] Rescheduled — {len(self._scheduler.get_jobs())} jobs")

    async def run_now(self, module_id: str, registry) -> bool:
        """Trigger a module immediately (used by API endpoint)."""
        module = registry.get(module_id)
        if not module:
            return False
        asyncio.create_task(self._runner.run(module))
        return True

    def job_info(self) -> list[dict]:
        result = []
        for job in self._scheduler.get_jobs():
            next_run = job.next_run_time
            result.append({
                "id": job.id,
                "next_run": next_run.isoformat() if next_run else None,
            })
        return result
```

- [ ] **Step 2: Commit**

```bash
git add abo/runtime/scheduler.py
git commit -m "feat(runtime): add APScheduler wrapper with per-module cron jobs"
```

---

## Task 9: Default Module — arXiv Tracker

**Files:**
- Create: `abo/default_modules/__init__.py`
- Create: `abo/default_modules/arxiv/__init__.py`

- [ ] **Step 1: Create `abo/default_modules/arxiv/__init__.py`**

```python
# abo/default_modules/arxiv/__init__.py
"""
arXiv daily paper tracker.
Fetches papers matching configured keywords, scores them with Claude,
writes individual notes + daily digest to Obsidian Literature/.
"""
import hashlib
from datetime import datetime, timedelta, timezone

import httpx

from abo.sdk import Module, Item, Card, claude_json


ARXIV_API = "https://export.arxiv.org/api/query"


class ArxivTracker(Module):
    id = "arxiv-tracker"
    name = "arXiv 论文追踪"
    schedule = "0 8 * * *"
    icon = "rss"
    output = ["obsidian", "ui"]

    # ── Configure these ───────────────────────────────────────────────────
    keywords: list[str] = ["large language model", "diffusion model"]
    max_results: int = 30
    # ─────────────────────────────────────────────────────────────────────

    async def fetch(self) -> list[Item]:
        query = " OR ".join(f'abs:"{kw}"' for kw in self.keywords)
        params = {
            "search_query": query,
            "start": 0,
            "max_results": self.max_results,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(ARXIV_API, params=params)

        import xml.etree.ElementTree as ET
        ns = {"a": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(resp.text)

        # Only include papers from last 48 hours
        cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
        items = []
        for entry in root.findall("a:entry", ns):
            raw_id = entry.find("a:id", ns).text.split("/")[-1]
            published_str = entry.find("a:published", ns).text
            published = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
            if published < cutoff:
                continue
            items.append(Item(
                id=raw_id,
                raw={
                    "title": entry.find("a:title", ns).text.strip().replace("\n", " "),
                    "abstract": entry.find("a:summary", ns).text.strip(),
                    "authors": [
                        a.find("a:name", ns).text
                        for a in entry.findall("a:author", ns)
                    ],
                    "url": f"https://arxiv.org/abs/{raw_id}",
                    "pdf_url": f"https://arxiv.org/pdf/{raw_id}",
                    "published": published.strftime("%Y-%m-%d"),
                },
            ))
        return items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards: list[Card] = []
        for item in items:
            p = item.raw
            prompt = f"""分析以下 arXiv 论文，返回 JSON（不要有其他文字）：
{{
  "score": <1-10 整数，与以下关键词的相关性：{self.keywords}>,
  "summary": "<50字以内中文摘要，聚焦核心贡献>",
  "tags": ["<标签1>", "<标签2>", "<标签3>"],
  "contribution": "<一句话核心创新>"
}}

标题：{p['title']}
摘要：{p['abstract'][:600]}"""

            try:
                result = await claude_json(prompt, prefs=prefs)
            except Exception:
                result = {"score": 5, "summary": p["abstract"][:80],
                          "tags": [], "contribution": ""}

            first_author = (p["authors"][0].split()[-1]
                            if p["authors"] else "Unknown")
            year = p["published"][:4]
            slug = p["title"][:40].replace(" ", "-").replace("/", "-")

            cards.append(Card(
                id=item.id,
                title=p["title"],
                summary=result.get("summary", ""),
                score=min(result.get("score", 5), 10) / 10,
                tags=result.get("tags", []),
                source_url=p["url"],
                obsidian_path=f"Literature/{first_author}{year}-{slug}.md",
                metadata={
                    "abo-type": "arxiv-paper",
                    "authors": p["authors"],
                    "arxiv-id": item.id,
                    "pdf-url": p["pdf_url"],
                    "published": p["published"],
                    "contribution": result.get("contribution", ""),
                    "relevance-score": result.get("score", 5),
                },
            ))
        return cards
```

- [ ] **Step 2: Create `abo/default_modules/__init__.py`**

```python
# empty
```

- [ ] **Step 3: Commit**

```bash
git add abo/default_modules/
git commit -m "feat(modules): add arXiv daily tracker module"
```

---

## Task 10: Default Module — RSS Aggregator

**Files:**
- Create: `abo/default_modules/rss/__init__.py`

- [ ] **Step 1: Create `abo/default_modules/rss/__init__.py`**

```python
# abo/default_modules/rss/__init__.py
"""
RSS / Newsletter aggregator.
Polls multiple feeds every 2 hours, deduplicates by URL hash,
Claude groups by theme and extracts highlights into one daily digest.
"""
import hashlib
from datetime import datetime

from abo.sdk import Module, Item, Card, fetch_rss, claude


class RssAggregator(Module):
    id = "rss-aggregator"
    name = "RSS 聚合"
    schedule = "0 */2 * * *"
    icon = "newspaper"
    output = ["obsidian", "ui"]

    # ── Configure these ───────────────────────────────────────────────────
    feeds: list[str] = [
        "https://feeds.feedburner.com/oreilly/radar",
        "https://simonwillison.net/atom/everything/",
    ]
    # ─────────────────────────────────────────────────────────────────────

    async def fetch(self) -> list[Item]:
        seen: set[str] = set()
        items: list[Item] = []
        for feed_url in self.feeds:
            try:
                entries = await fetch_rss(feed_url)
                for e in entries:
                    url_hash = hashlib.md5(e["url"].encode()).hexdigest()
                    if url_hash in seen:
                        continue
                    seen.add(url_hash)
                    items.append(Item(
                        id=url_hash,
                        raw={**e, "feed_url": feed_url},
                    ))
            except Exception as exc:
                print(f"[rss] Failed to fetch {feed_url}: {exc}")
        return items[:60]  # cap raw items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        if not items:
            return []

        # Build a batch prompt — one Claude call for all items
        entries_text = "\n\n".join(
            f"[{i+1}] 标题：{it.raw['title']}\n"
            f"    链接：{it.raw['url']}\n"
            f"    摘要：{it.raw['content'][:300]}"
            for i, it in enumerate(items)
        )

        prompt = f"""以下是来自 RSS 订阅的 {len(items)} 篇文章。
请按主题分组，为每篇返回 JSON 列表（不要有其他文字）：
[
  {{
    "index": <原始序号1-{len(items)}>,
    "score": <1-10 信息价值评分>,
    "summary": "<30字中文要点>",
    "tags": ["<标签>"]
  }},
  ...
]

文章列表：
{entries_text}"""

        try:
            import json, re
            raw = await claude(prompt, prefs=prefs)
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            results = json.loads(match.group()) if match else []
        except Exception:
            results = []

        result_map = {r["index"]: r for r in results}
        today = datetime.now().strftime("%Y-%m-%d")
        cards: list[Card] = []

        for i, item in enumerate(items, 1):
            r = result_map.get(i, {})
            score = min(r.get("score", 5), 10) / 10
            cards.append(Card(
                id=item.id,
                title=item.raw["title"],
                summary=r.get("summary", item.raw["summary"][:80]),
                score=score,
                tags=r.get("tags", []),
                source_url=item.raw["url"],
                obsidian_path=f"Trends/{today}-rss-digest.md",
                metadata={
                    "abo-type": "rss-article",
                    "feed": item.raw.get("feed_url", ""),
                    "published": item.raw.get("published", ""),
                },
            ))
        return cards
```

- [ ] **Step 2: Commit**

```bash
git add abo/default_modules/rss/
git commit -m "feat(modules): add RSS aggregator module"
```

---

## Task 11: Default Module — Podcast/YouTube Digest

**Files:**
- Create: `abo/default_modules/podcast/__init__.py`

- [ ] **Step 1: Create `abo/default_modules/podcast/__init__.py`**

```python
# abo/default_modules/podcast/__init__.py
"""
YouTube / podcast episode digest.
Downloads audio with yt-dlp, transcribes locally with faster-whisper,
generates structured summary with Claude.
"""
import hashlib
from datetime import datetime
from pathlib import Path

from abo.sdk import Module, Item, Card, fetch_rss, download_audio, transcribe, claude


_SEEN_FILE = Path.home() / ".abo" / "data" / "podcast_seen.txt"


class PodcastDigest(Module):
    id = "podcast-digest"
    name = "播客摘要"
    schedule = "0 7 * * *"
    icon = "mic"
    output = ["obsidian", "ui"]

    # ── Configure these ───────────────────────────────────────────────────
    feeds: list[str] = []        # podcast RSS feeds
    youtube_channels: list[str] = []  # YouTube channel URLs
    max_episodes: int = 3        # max new episodes per run
    # ─────────────────────────────────────────────────────────────────────

    def _seen(self) -> set[str]:
        _SEEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        if _SEEN_FILE.exists():
            return set(_SEEN_FILE.read_text().splitlines())
        return set()

    def _mark_seen(self, ep_id: str) -> None:
        with _SEEN_FILE.open("a") as f:
            f.write(ep_id + "\n")

    async def fetch(self) -> list[Item]:
        seen = self._seen()
        items: list[Item] = []

        for feed_url in self.feeds:
            try:
                entries = await fetch_rss(feed_url)
                for e in entries:
                    ep_id = hashlib.md5(e["url"].encode()).hexdigest()
                    if ep_id not in seen:
                        items.append(Item(id=ep_id, raw={
                            **e, "type": "podcast", "audio_url": e["url"]
                        }))
            except Exception as exc:
                print(f"[podcast] Feed error {feed_url}: {exc}")

        return items[:self.max_episodes]

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards: list[Card] = []
        for item in items:
            try:
                audio_path = await download_audio(item.raw["audio_url"])
                transcript = await transcribe(audio_path)
                audio_path.unlink(missing_ok=True)  # clean up

                prompt = f"""以下是播客/视频的完整文字稿。请返回 JSON（不要有其他文字）：
{{
  "score": <1-10 信息价值评分>,
  "summary": "<150字以内中文总体概述>",
  "key_points": ["<要点1>", "<要点2>", "<要点3>", "<要点4>", "<要点5>"],
  "tags": ["<标签1>", "<标签2>", "<标签3>"],
  "quote": "<最有价值的一句原话（英文或中文）>"
}}

标题：{item.raw.get('title', '')}
文字稿（前3000字）：
{transcript[:3000]}"""

                result = {}
                try:
                    import json, re
                    raw_resp = await claude(prompt, prefs=prefs)
                    match = re.search(r'\{.*\}', raw_resp, re.DOTALL)
                    result = json.loads(match.group()) if match else {}
                except Exception:
                    pass

                today = datetime.now().strftime("%Y-%m-%d")
                title = item.raw.get("title", "Unknown Episode")
                slug = title[:40].replace(" ", "-")
                key_points_md = "\n".join(
                    f"- {p}" for p in result.get("key_points", [])
                )

                self._mark_seen(item.id)
                cards.append(Card(
                    id=item.id,
                    title=title,
                    summary=result.get("summary", transcript[:120]),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", []),
                    source_url=item.raw.get("url", ""),
                    obsidian_path=f"Podcasts/{today}-{slug}.md",
                    metadata={
                        "abo-type": "podcast-episode",
                        "key-points": result.get("key_points", []),
                        "notable-quote": result.get("quote", ""),
                        "transcript-preview": transcript[:500],
                    },
                ))
            except Exception as exc:
                print(f"[podcast] Failed to process {item.id}: {exc}")
        return cards
```

- [ ] **Step 2: Commit**

```bash
git add abo/default_modules/podcast/
git commit -m "feat(modules): add podcast/YouTube digest module"
```

---

## Task 12: Default Module — Folder Monitor

**Files:**
- Create: `abo/default_modules/folder_monitor/__init__.py`

- [ ] **Step 1: Create `abo/default_modules/folder_monitor/__init__.py`**

```python
# abo/default_modules/folder_monitor/__init__.py
"""
Watches a local folder for new PDF/DOCX files and generates summaries.
Uses watchdog for real-time detection; schedule is used as a fallback scan.
"""
import hashlib
from pathlib import Path
from datetime import datetime

import pypdf

from abo.sdk import Module, Item, Card, claude_json

_SEEN_FILE = Path.home() / ".abo" / "data" / "folder_seen.txt"


class FolderMonitor(Module):
    id = "folder-monitor"
    name = "文件夹监控"
    schedule = "*/30 * * * *"   # scan every 30 min as fallback
    icon = "folder-open"
    output = ["obsidian", "ui"]

    # ── Configure these ───────────────────────────────────────────────────
    watch_paths: list[str] = [str(Path.home() / "Downloads")]
    extensions: list[str] = [".pdf", ".docx"]
    # ─────────────────────────────────────────────────────────────────────

    def _seen(self) -> set[str]:
        _SEEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        return set(_SEEN_FILE.read_text().splitlines()) if _SEEN_FILE.exists() else set()

    def _mark_seen(self, file_hash: str) -> None:
        with _SEEN_FILE.open("a") as f:
            f.write(file_hash + "\n")

    async def fetch(self) -> list[Item]:
        seen = self._seen()
        items: list[Item] = []
        for folder_str in self.watch_paths:
            folder = Path(folder_str).expanduser()
            if not folder.exists():
                continue
            for ext in self.extensions:
                for file in folder.glob(f"*{ext}"):
                    file_hash = hashlib.md5(
                        f"{file.name}{file.stat().st_size}".encode()
                    ).hexdigest()
                    if file_hash not in seen:
                        items.append(Item(
                            id=file_hash,
                            raw={"path": str(file), "name": file.name, "ext": ext},
                        ))
        return items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards: list[Card] = []
        for item in items:
            path = Path(item.raw["path"])
            try:
                text = self._extract_text(path)
                result = await claude_json(f"""分析以下文档内容，返回 JSON：
{{
  "doc_type": "<论文|报告|文章|书籍|其他>",
  "score": <1-10 信息价值>,
  "title": "<推断的标题或文件名>",
  "summary": "<100字以内中文摘要>",
  "tags": ["<标签1>", "<标签2>"]
}}

文件名：{path.name}
内容（前2000字）：
{text[:2000]}""", prefs=prefs)

                doc_type = result.get("doc_type", "文档")
                folder_map = {"论文": "Literature", "报告": "Literature"}
                obsidian_folder = folder_map.get(doc_type, "Notes")
                slug = path.stem[:40]
                today = datetime.now().strftime("%Y-%m-%d")

                self._mark_seen(item.id)
                cards.append(Card(
                    id=item.id,
                    title=result.get("title", path.name),
                    summary=result.get("summary", ""),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", []),
                    source_url=f"file://{path}",
                    obsidian_path=f"{obsidian_folder}/{today}-{slug}.md",
                    metadata={
                        "abo-type": "local-file",
                        "source-path": str(path),
                        "doc-type": doc_type,
                    },
                ))
            except Exception as exc:
                print(f"[folder] Error processing {path.name}: {exc}")
        return cards

    def _extract_text(self, path: Path) -> str:
        if path.suffix == ".pdf":
            reader = pypdf.PdfReader(str(path))
            return " ".join(
                page.extract_text() or "" for page in reader.pages[:20]
            )
        return path.read_text(encoding="utf-8", errors="ignore")
```

- [ ] **Step 2: Commit**

```bash
git add abo/default_modules/folder_monitor/
git commit -m "feat(modules): add local folder monitor module"
```

---

## Task 13: FastAPI Routes

**Files:**
- Modify: `abo/main.py`

- [ ] **Step 1: Replace game routes and add feed infrastructure in `abo/main.py`**

Remove all `abo.game.*` imports and routes. Add:

```python
# Add to imports in abo/main.py
from contextlib import asynccontextmanager
from abo.runtime.discovery import ModuleRegistry, start_watcher
from abo.runtime.scheduler import ModuleScheduler
from abo.runtime.runner import ModuleRunner
from abo.runtime.broadcaster import broadcaster
from abo.preferences.engine import PreferenceEngine
from abo.store.cards import CardStore
from abo.sdk.types import FeedbackAction
from pydantic import BaseModel   # already imported

# Module system singletons (module-level)
_registry = ModuleRegistry()
_prefs = PreferenceEngine()
_card_store = CardStore()
_scheduler: ModuleScheduler | None = None


@asynccontextmanager
async def lifespan(app):
    # ── startup ──────────────────────────────────────────────────────────
    global _scheduler
    cfg = load_config()
    vault_path = Path(cfg.vault_path) if cfg.is_configured else None
    _write_sdk_readme()

    _registry.load_all()
    runner = ModuleRunner(_card_store, _prefs, broadcaster, vault_path)
    _scheduler = ModuleScheduler(runner)
    _scheduler.start(_registry.enabled())
    start_watcher(_registry, lambda reg: _scheduler.reschedule(reg.enabled()))
    print(f"[ABO] Ready — {len(_registry.all())} modules loaded")
    yield
    # ── shutdown ─────────────────────────────────────────────────────────
    if _scheduler:
        _scheduler._scheduler.shutdown(wait=False)


# Replace the existing FastAPI() construction line with:
app = FastAPI(title="ABO Backend", version="0.5.0", lifespan=lifespan)


# ── Feed WebSocket ─────────────────────────────────────────────────────

@app.websocket("/ws/feed")
async def feed_ws(ws: WebSocket):
    await ws.accept()
    broadcaster.register(ws)
    try:
        while True:
            await ws.receive_text()   # keep-alive ping/pong
    except Exception:
        broadcaster.unregister(ws)


# ── Cards ──────────────────────────────────────────────────────────────

@app.get("/api/cards")
async def get_cards(
    module_id: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
):
    cards = _card_store.list(
        module_id=module_id, unread_only=unread_only,
        limit=limit, offset=offset,
    )
    return {"cards": [c.to_dict() for c in cards]}


@app.get("/api/cards/unread-counts")
async def unread_counts():
    return _card_store.unread_counts()


class FeedbackRequest(BaseModel):
    # FeedbackAction is str+Enum — compatible with Pydantic v2 without extra config
    action: FeedbackAction


@app.post("/api/cards/{card_id}/feedback")
async def submit_feedback(card_id: str, body: FeedbackRequest):
    card = _card_store.get(card_id)
    if not card:
        raise HTTPException(404, "Card not found")
    _prefs.record_feedback(card, body.action)
    _card_store.record_feedback(card_id, body.action.value)
    _card_store.mark_read(card_id)

    module = _registry.get(card.module_id)
    if module:
        await module.on_feedback(card_id, body.action)

    # DEEP_DIVE: trigger a secondary Claude call for richer notes
    if body.action == FeedbackAction.DEEP_DIVE:
        pass  # TODO Phase 2: implement deep-dive enrichment

    return {"ok": True}


# ── Modules ────────────────────────────────────────────────────────────

@app.get("/api/modules")
async def list_modules():
    job_map = {j["id"]: j for j in (_scheduler.job_info() if _scheduler else [])}
    return {
        "modules": [
            {
                **m.get_status(),
                "next_run": job_map.get(m.id, {}).get("next_run"),
            }
            for m in _registry.all()
        ]
    }


@app.post("/api/modules/{module_id}/run")
async def run_module_now(module_id: str):
    if not _scheduler:
        raise HTTPException(503, "Scheduler not ready")
    ok = await _scheduler.run_now(module_id, _registry)
    if not ok:
        raise HTTPException(404, f"Module {module_id} not found")
    return {"ok": True}


@app.patch("/api/modules/{module_id}/toggle")
async def toggle_module(module_id: str):
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")
    module.enabled = not module.enabled
    return {"enabled": module.enabled}
```

- [ ] **Step 2: Commit**

```bash
git add abo/main.py
git commit -m "feat(api): add /api/cards, /api/modules, /ws/feed routes; remove game routes"
```

---

## Task 14: Frontend Store Update

**Files:**
- Modify: `src/core/store.ts`

- [ ] **Step 1: Add feed state to store**

Append to the existing store (do not replace existing state):

```typescript
// Add to src/core/store.ts

export interface FeedCard {
  id: string;
  title: string;
  summary: string;
  score: number;
  tags: string[];
  source_url: string;
  obsidian_path: string;
  module_id: string;
  created_at: number;
  read: boolean;
  metadata: Record<string, unknown>;
}

export interface FeedModule {
  id: string;
  name: string;
  icon: string;
  schedule: string;
  enabled: boolean;
  next_run: string | null;
}

// Add to AboStore interface:
feedCards: FeedCard[];
feedModules: FeedModule[];
activeModuleFilter: string | null;
unreadCounts: Record<string, number>;

setFeedCards: (cards: FeedCard[]) => void;
prependCard: (card: FeedCard) => void;
setFeedModules: (modules: FeedModule[]) => void;
setActiveModuleFilter: (id: string | null) => void;
setUnreadCounts: (counts: Record<string, number>) => void;

// Add to create() initial state:
feedCards: [],
feedModules: [],
activeModuleFilter: null,
unreadCounts: {},

// Add to create() actions:
setFeedCards: (feedCards) => set({ feedCards }),
prependCard: (card) => set((s) => ({ feedCards: [card, ...s.feedCards] })),
setFeedModules: (feedModules) => set({ feedModules }),
setActiveModuleFilter: (activeModuleFilter) => set({ activeModuleFilter }),
setUnreadCounts: (unreadCounts) => set({ unreadCounts }),
```

- [ ] **Step 2: Commit**

```bash
git add src/core/store.ts
git commit -m "feat(store): add feed cards, modules, filter, unread count state"
```

---

## Task 15: CardView Component

**Files:**
- Create: `src/modules/feed/CardView.tsx`

- [ ] **Step 1: Create `src/modules/feed/CardView.tsx`**

```tsx
// src/modules/feed/CardView.tsx
import { Bookmark, X, Star, ChevronDown, ExternalLink } from "lucide-react";
import type { FeedCard } from "../../core/store";

interface Props {
  card: FeedCard;
  focused: boolean;
  onClick: () => void;
  onFeedback: (action: string) => void;
}

const ACTIONS = [
  { key: "save",      label: "保存 S", Icon: Bookmark,    color: "text-emerald-500 hover:border-emerald-300" },
  { key: "skip",      label: "跳过 X", Icon: X,           color: "text-slate-400   hover:border-slate-300" },
  { key: "star",      label: "精华 F", Icon: Star,        color: "text-amber-500   hover:border-amber-300" },
  { key: "deep_dive", label: "深度 D", Icon: ChevronDown, color: "text-indigo-500  hover:border-indigo-300" },
] as const;

export default function CardView({ card, focused, onClick, onFeedback }: Props) {
  const scorePct = Math.round(card.score * 100);

  return (
    <article
      onClick={onClick}
      className={`rounded-2xl border p-5 cursor-pointer transition-all duration-150 ${
        focused
          ? "border-indigo-400 bg-white dark:bg-slate-800 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-400/20"
          : "border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${scorePct}%` }}
            role="meter" aria-valuenow={scorePct} aria-valuemin={0} aria-valuemax={100}
          />
        </div>
        <span className="text-xs text-slate-400 tabular-nums">{scorePct}%</span>
        <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{card.module_id}</span>
        {card.source_url && (
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="打开原文"
            className="text-slate-300 dark:text-slate-600 hover:text-indigo-400 transition-colors"
          >
            <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug mb-2 line-clamp-2">
        {card.title}
      </h3>

      {/* Summary */}
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3 line-clamp-3">
        {card.summary}
      </p>

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {card.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-400 dark:text-slate-500"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Action bar — only when focused */}
      {focused && (
        <div className="flex gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-700/50">
          {ACTIONS.map(({ key, label, Icon, color }) => (
            <button
              key={key}
              onClick={(e) => { e.stopPropagation(); onFeedback(key); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 ${color}`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/feed/CardView.tsx
git commit -m "feat(ui): add CardView with score bar, tags, keyboard action buttons"
```

---

## Task 16: Feed Container

**Files:**
- Create: `src/modules/feed/Feed.tsx`

- [ ] **Step 1: Create `src/modules/feed/Feed.tsx`**

```tsx
// src/modules/feed/Feed.tsx
import { useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { api } from "../../core/api";
import { useStore, FeedCard } from "../../core/store";
import CardView from "./CardView";

const WS_URL = "ws://127.0.0.1:8765/ws/feed";

export default function Feed() {
  const {
    feedCards, setFeedCards, prependCard,
    activeModuleFilter, setUnreadCounts,
  } = useStore();
  const [focusIdx, setFocusIdx] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Initial load
  useEffect(() => {
    const params = activeModuleFilter
      ? `?module_id=${activeModuleFilter}&unread_only=true`
      : "?unread_only=true";
    api.get<{ cards: FeedCard[] }>(`/api/cards${params}`)
      .then((r) => { setFeedCards(r.cards); setFocusIdx(0); })
      .catch(() => {});

    api.get<Record<string, number>>("/api/cards/unread-counts")
      .then(setUnreadCounts)
      .catch(() => {});
  }, [activeModuleFilter, setFeedCards, setUnreadCounts]);

  // WebSocket — real-time card push
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "new_card") {
        prependCard(data.card as FeedCard);
        setFocusIdx(0);
      }
    };
    ws.onerror = () => {};
    wsRef.current = ws;
    return () => ws.close();
  }, [prependCard]);

  // Keyboard navigation
  useEffect(() => {
    const visible = filteredCards();
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const card = visible[focusIdx];
      switch (e.key) {
        case "j": e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, visible.length - 1)); break;
        case "k": e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); break;
        case "s": if (card) { e.preventDefault(); handleFeedback(card.id, "save"); } break;
        case "x": if (card) { e.preventDefault(); handleFeedback(card.id, "skip"); } break;
        case "f": if (card) { e.preventDefault(); handleFeedback(card.id, "star"); } break;
        case "d": if (card) { e.preventDefault(); handleFeedback(card.id, "deep_dive"); } break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIdx, feedCards, activeModuleFilter]);

  function filteredCards(): FeedCard[] {
    if (!activeModuleFilter) return feedCards;
    return feedCards.filter((c) => c.module_id === activeModuleFilter);
  }

  async function handleFeedback(cardId: string, action: string) {
    await api.post(`/api/cards/${cardId}/feedback`, { action }).catch(() => {});
    // Remove from view immediately for skip
    if (action === "skip") {
      setFeedCards(feedCards.filter((c) => c.id !== cardId));
    }
  }

  const visible = filteredCards();

  if (visible.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-400 dark:text-slate-600">
        <Inbox className="w-12 h-12" aria-hidden />
        <p className="text-sm">今日 Feed 已清空</p>
        <p className="text-xs">使用 J/K 导航，S=保存，X=跳过，F=精华，D=深度</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-3">
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
          {visible.length} 条未读 · J/K 导航 · S 保存 · X 跳过 · F 精华 · D 深度
        </p>
        {visible.map((card, i) => (
          <CardView
            key={card.id}
            card={card}
            focused={i === focusIdx}
            onClick={() => setFocusIdx(i)}
            onFeedback={(action) => handleFeedback(card.id, action)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/feed/Feed.tsx
git commit -m "feat(ui): add Feed container with WebSocket, keyboard nav, filter"
```

---

## Task 17: Module Management Panel

**Files:**
- Create: `src/modules/feed/ModulePanel.tsx`

- [ ] **Step 1: Create `src/modules/feed/ModulePanel.tsx`**

```tsx
// src/modules/feed/ModulePanel.tsx
import { useEffect } from "react";
import { Play, Terminal } from "lucide-react";
import { api } from "../../core/api";
import { useStore, FeedModule } from "../../core/store";

export default function ModulePanel() {
  const { feedModules, setFeedModules, unreadCounts } = useStore();

  useEffect(() => {
    api.get<{ modules: FeedModule[] }>("/api/modules")
      .then((r) => setFeedModules(r.modules))
      .catch(() => {});
  }, [setFeedModules]);

  async function runNow(moduleId: string) {
    await api.post(`/api/modules/${moduleId}/run`, {}).catch(() => {});
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-xl text-slate-800 dark:text-slate-100">模块管理</h2>
          <button
            onClick={() => {
              const msg = "在终端运行 Claude Code，告诉它：\n\n「帮我写一个 ABO 模块，放在 ~/.abo/modules/ 目录下，描述你想要的功能」\n\nABO 会自动检测并加载新模块。";
              alert(msg);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden />
            + 新建模块
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {feedModules.map((mod) => {
            const unread = unreadCounts[mod.id] ?? 0;
            return (
              <div
                key={mod.id}
                className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${mod.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{mod.name}</p>
                    {unread > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                        {unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {mod.schedule}
                    {mod.next_run && ` · 下次：${new Date(mod.next_run).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                </div>
                <button
                  onClick={() => runNow(mod.id)}
                  aria-label={`立即运行 ${mod.name}`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4" aria-hidden />
                </button>
              </div>
            );
          })}

          {feedModules.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">
              加载模块中…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/feed/ModulePanel.tsx
git commit -m "feat(ui): add ModulePanel with run-now and new module prompt"
```

---

## Task 18: Wire Feed Into App

**Files:**
- Modify: `src/modules/MainContent.tsx`
- Modify: `src/modules/nav/NavSidebar.tsx`
- Create: `src/modules/feed/FeedSidebar.tsx`

- [ ] **Step 1: Create `src/modules/feed/FeedSidebar.tsx`**

```tsx
// src/modules/feed/FeedSidebar.tsx
import { useStore } from "../../core/store";

export default function FeedSidebar() {
  const { feedModules, activeModuleFilter, setActiveModuleFilter, unreadCounts } = useStore();
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <nav className="w-44 shrink-0 border-r border-slate-200 dark:border-slate-700/60 h-full overflow-y-auto py-4 px-2 flex flex-col gap-0.5">
      <button
        onClick={() => setActiveModuleFilter(null)}
        className={`flex items-center justify-between w-full px-3 py-1.5 rounded-xl text-sm transition-colors cursor-pointer ${
          !activeModuleFilter
            ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        全部
        {totalUnread > 0 && (
          <span className="text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5 leading-none">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {feedModules.map((mod) => {
        const count = unreadCounts[mod.id] ?? 0;
        const active = activeModuleFilter === mod.id;
        return (
          <button
            key={mod.id}
            onClick={() => setActiveModuleFilter(mod.id)}
            className={`flex items-center justify-between w-full px-3 py-1.5 rounded-xl text-sm transition-colors cursor-pointer ${
              active
                ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <span className="truncate">{mod.name}</span>
            {count > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1 shrink-0">{count}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Update `src/modules/MainContent.tsx`**

```tsx
// src/modules/MainContent.tsx
import { useStore } from "../core/store";
import Feed from "./feed/Feed";
import FeedSidebar from "./feed/FeedSidebar";
import ModulePanel from "./feed/ModulePanel";
import Literature from "./literature/Literature";
import MindMap from "./mindmap/MindMap";
import ClaudePanel from "./claude-panel/ClaudePanel";
import ArxivTracker from "./arxiv/ArxivTracker";
import MeetingGenerator from "./meeting/MeetingGenerator";
import HealthDashboard from "./health/HealthDashboard";
import PodcastDigest from "./podcast/PodcastDigest";
import TrendTracker from "./trends/TrendTracker";
import Settings from "./settings/Settings";

export default function MainContent() {
  const activeTab = useStore((s) => s.activeTab);

  // Feed tab gets the two-pane layout (sidebar + cards)
  if (activeTab === "overview") {
    return (
      <main className="flex-1 min-h-0 flex overflow-hidden bg-slate-50 dark:bg-slate-950">
        <FeedSidebar />
        <div className="flex-1 min-w-0 overflow-hidden">
          <Feed />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {activeTab === "literature" && <Literature />}
      {activeTab === "ideas"      && <MindMap />}
      {activeTab === "claude"     && <ClaudePanel />}
      {activeTab === "arxiv"      && <ArxivTracker />}
      {activeTab === "meeting"    && <MeetingGenerator />}
      {activeTab === "health"     && <HealthDashboard />}
      {activeTab === "podcast"    && <PodcastDigest />}
      {activeTab === "trends"     && <TrendTracker />}
      {activeTab === "settings"   && <Settings />}
    </main>
  );
}
```

- [ ] **Step 3: Add unread badge to NavSidebar overview button**

In `src/modules/nav/NavSidebar.tsx`, update the `NavButton` render for `"overview"`:

```tsx
// At the top of NavSidebar, add:
const unreadCounts = useStore((s) => s.unreadCounts);
const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

// In NAV_ITEMS map, after the label for "overview":
{id === "overview" && totalUnread > 0 && (
  <span className="ml-auto text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5 leading-none">
    {totalUnread > 99 ? "99+" : totalUnread}
  </span>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/feed/ src/modules/MainContent.tsx src/modules/nav/NavSidebar.tsx
git commit -m "feat(ui): wire Feed two-pane layout, FeedSidebar filter, unread badge"
```

---

## Task 19: Claude Code SDK README

**Files:**
- Create: `~/.abo/sdk/README.md` (written at runtime on first startup)

- [ ] **Step 1: Add startup writer to `abo/main.py`**

```python
# Add to startup function in abo/main.py
_SDK_README_PATH = Path.home() / ".abo" / "sdk" / "README.md"

def _write_sdk_readme():
    _SDK_README_PATH.parent.mkdir(parents=True, exist_ok=True)
    if _SDK_README_PATH.exists():
        return
    _SDK_README_PATH.write_text("""# ABO Module SDK

ABO 自动发现 `~/.abo/modules/<name>/__init__.py` 中的模块。
文件保存后立即热加载，无需重启。

## 最小可用模块（30行）

```python
from abo.sdk import Module, Item, Card, claude_json

class MyModule(Module):
    id       = "my-module"          # 唯一 ID，小写连字符
    name     = "我的模块"
    schedule = "0 8 * * *"         # cron：每天8点
    icon     = "rss"               # lucide-react 图标名
    output   = ["obsidian", "ui"]  # 输出目标

    async def fetch(self) -> list[Item]:
        # 拉取原始数据，返回 Item 列表
        return [Item(id="unique-id", raw={"title": "...", "url": "..."})]

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        # prefs 包含用户偏好，会自动注入 claude 调用
        cards = []
        for item in items:
            result = await claude_json(
                f"评分(1-10)并用中文总结：{item.raw['title']}",
                prefs=prefs
            )
            cards.append(Card(
                id=item.id,
                title=item.raw["title"],
                summary=result.get("summary", ""),
                score=result.get("score", 5) / 10,
                tags=result.get("tags", []),
                source_url=item.raw.get("url", ""),
                obsidian_path="Notes/my-notes.md",
            ))
        return cards
```

## 可用工具

```python
from abo.sdk import claude, claude_json, fetch_rss, download_audio, transcribe

await claude("prompt", prefs=prefs)           # 返回文本
await claude_json("prompt", prefs=prefs)      # 返回解析后的 dict
await fetch_rss("https://...")                # 返回 list[dict]
await download_audio("https://youtube...")    # 返回 Path (mp3)
await transcribe(audio_path)                  # 返回转录文本
```

## 调度示例

```
"0 8 * * *"      每天 08:00
"0 */2 * * *"    每 2 小时
"*/30 * * * *"   每 30 分钟
"0 7 * * 1"      每周一 07:00
```

## 输出目标

- `"obsidian"` — 写入 Vault，路径由 `card.obsidian_path` 决定
- `"ui"` — 推送到 ABO Feed 界面
""")

# Call in startup:
_write_sdk_readme()
```

- [ ] **Step 2: Commit**

```bash
git add abo/main.py
git commit -m "feat: write ~/.abo/sdk/README.md on startup for Claude Code reference"
```

---

## Task 20: End-to-End Smoke Test

- [ ] **Step 1: Start backend**

```bash
cd /Users/huanc/Desktop/ABO
python -m abo.main
```

Expected output:
```
[discovery] Loaded: arXiv 论文追踪 (arxiv-tracker)
[discovery] Loaded: RSS 聚合 (rss-aggregator)
[discovery] Loaded: 播客摘要 (podcast-digest)
[discovery] Loaded: 文件夹监控 (folder-monitor)
[scheduler] Started with 4 module(s)
INFO: Application startup complete.
```

- [ ] **Step 2: Verify module list API**

```bash
curl http://127.0.0.1:8765/api/modules | python -m json.tool
```

Expected: 4 modules with schedule and next_run fields.

- [ ] **Step 3: Trigger arXiv module manually**

```bash
curl -X POST http://127.0.0.1:8765/api/modules/arxiv-tracker/run
sleep 30
curl http://127.0.0.1:8765/api/cards | python -m json.tool | head -60
```

Expected: cards array with scored papers.

- [ ] **Step 4: Start frontend and verify Feed UI**

```bash
npm run dev
```

Open `http://localhost:1420`, navigate to 今日 tab, verify cards appear.

- [ ] **Step 5: Test hot-reload — create a user module**

```bash
mkdir -p ~/.abo/modules/test-module
cat > ~/.abo/modules/test-module/__init__.py << 'EOF'
from abo.sdk import Module, Item, Card

class TestModule(Module):
    id = "test-module"
    name = "测试模块"
    schedule = "0 23 * * *"
    icon = "flask-conical"
    output = ["ui"]

    async def fetch(self):
        return [Item(id="test-1", raw={"title": "热加载测试", "url": ""})]

    async def process(self, items, prefs):
        return [Card(id=i.id, title=i.raw["title"], summary="热加载成功",
                     score=0.9, tags=["test"], obsidian_path="") for i in items]
EOF
```

Expected: Backend logs show `[discovery] Loaded: 测试模块 (test-module)` within 2 seconds. Module appears in `/api/modules` without restart.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete ABO intelligence feed — module runtime + preferences + 4 default modules + feed UI"
git push origin main
```

---

## Summary

| Layer | Files | Purpose |
|-------|-------|---------|
| SDK | `abo/sdk/` (4 files) | Types, base class, tool functions |
| Runtime | `abo/runtime/` (5 files) | Discovery, scheduling, running, broadcasting |
| Preferences | `abo/preferences/` | Tag weight engine, prompt injection |
| Storage | `abo/store/` | SQLite card + feedback |
| Modules | `abo/default_modules/` (4 dirs) | arXiv, RSS, Podcast, Folder |
| API | `abo/main.py` | Feed routes, WebSocket, startup lifecycle |
| Frontend | `src/modules/feed/` (3 files) | Feed, CardView, ModulePanel |
| Store | `src/core/store.ts` | Feed state |

**After this plan:** users can ask Claude Code to write `~/.abo/modules/<name>/__init__.py` and ABO will discover, schedule, and render the module without any restart or app update.
