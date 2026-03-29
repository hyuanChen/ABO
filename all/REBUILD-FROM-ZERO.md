# ABO — 从零重建完整流程

> **目标：** 大刀阔斧清空旧代码，在同一个 Tauri 项目骨架上重新实现所有功能。
> **参考：** 同目录 `ABO-完整产品需求说明.md`（完整产品需求）
> **工作目录：** `/Users/huanc/Desktop/ABO/`

---

## 总体方针

| 决策 | 说明 |
|------|------|
| 保留 | Tauri 项目配置、package.json、requirements.txt 骨架、src-tauri/ |
| 保留 | `abo/claude_bridge/`（runner.py + context_builder.py 可直接复用） |
| 保留 | `abo/vault/`（reader.py + writer.py 通用工具） |
| 保留 | `abo/literature/`（importer.py + indexer.py，产品保留该功能） |
| 清空重写 | `src/`（全部 React 代码） |
| 清空重写 | `abo/main.py`（FastAPI 入口） |
| 直接删除 | `abo/game/`（游戏化，彻底废弃） |
| 直接删除 | `abo/journal/`（被新架构的 health 模块接管） |
| 直接删除 | `abo/mindmap/`（被 sdk/runtime 新架构接管，若有需要在新 ideas 模块重写） |
| 新建 | `abo/sdk/`、`abo/runtime/`、`abo/preferences/`、`abo/store/`、`abo/default_modules/` |

---

## 第一阶段：清场

### Step 1.1 — 删除废弃后端目录

```bash
cd /Users/huanc/Desktop/ABO

# 游戏化（彻底废弃）
rm -rf abo/game/

# 旧架构（被新架构接管）
rm -rf abo/journal/
rm -rf abo/mindmap/

# 旧入口（重写，不是修改）
rm abo/main.py
rm abo/config.py
rm abo/default_skill_tree.yaml
rm abo/cli.py
```

### Step 1.2 — 删除废弃前端目录

```bash
# 删除所有 src/modules/ 下的内容（全部重写）
rm -rf src/modules/

# 删除根组件（重写）
rm src/App.tsx
rm src/components/Toast.tsx
rm src/SetupWizard.tsx

# 删除旧 store（重写）
rm src/core/store.ts

# 保留（无需改动）
# src/core/api.ts
# src/core/events.ts
# src/main.tsx
# src/index.css
# src/App.css
```

### Step 1.3 — 验证保留文件完整性

```bash
# 确认这些文件存在且未损坏
ls abo/claude_bridge/runner.py
ls abo/claude_bridge/context_builder.py
ls abo/vault/reader.py
ls abo/vault/writer.py
ls abo/literature/importer.py
ls abo/literature/indexer.py
ls abo/obsidian/
ls src/core/api.ts
ls src/core/events.ts
ls src-tauri/src/main.rs
```

### Step 1.4 — 清理后 commit

```bash
git add -A
git commit -m "chore: remove all gamification and legacy code — clean slate for rebuild"
```

---

## 第二阶段：后端骨架（从零搭建）

> **调用 skill：** `superpowers:writing-plans` 在编码前制定详细计划

按以下顺序创建文件。每个 Task 完成后单独 commit。

---

### Task B1：项目配置文件

**文件：** `abo/__init__.py`（空文件，确保包可导入）

**文件：** `requirements.txt`（全量覆盖）

```
fastapi>=0.115
uvicorn[standard]>=0.34
python-frontmatter>=1.1
pypdf>=5.0
pdfminer.six>=20231228
httpx>=0.28
feedparser>=6.0
apscheduler>=3.10
watchdog>=4.0
yt-dlp>=2024.1.0
faster-whisper>=1.0
python-pptx>=1.0
jinja2>=3.1
pyyaml>=6.0
```

```bash
pip install -r requirements.txt
git commit -m "chore: update requirements.txt for full rebuild"
```

---

### Task B2：配置管理

**文件：** `abo/config.py`

```python
# abo/config.py
"""
全局配置：Vault 路径 + 应用配置。
持久化到 ~/.abo-config.json（与旧版兼容）。
"""
import json
from pathlib import Path

_CONFIG_PATH = Path.home() / ".abo-config.json"
_ABO_DIR = Path.home() / ".abo"

_DEFAULTS = {
    "vault_path": str(Path.home() / "Documents" / "MyVault"),
    "version": "1.0.0",
}


def load() -> dict:
    if _CONFIG_PATH.exists():
        return {**_DEFAULTS, **json.loads(_CONFIG_PATH.read_text())}
    return _DEFAULTS.copy()


def save(data: dict) -> None:
    _CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def get_vault_path() -> Path:
    return Path(load()["vault_path"])


def get_abo_dir() -> Path:
    _ABO_DIR.mkdir(parents=True, exist_ok=True)
    return _ABO_DIR
```

```bash
git commit -m "feat(config): add config manager for vault path"
```

---

### Task B3：SDK Types

**文件：** `abo/sdk/types.py`

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import time


@dataclass
class Item:
    """模块 fetch() 的原始数据单元"""
    id: str
    raw: dict[str, Any]


@dataclass
class Card:
    """经 Claude 处理后的标准化内容卡片"""
    id: str
    title: str
    summary: str
    score: float            # 相关性评分 0.0–1.0
    tags: list[str]
    source_url: str
    obsidian_path: str      # 相对 Vault 根的路径，如 "Literature/Author2026-Title.md"
    module_id: str = ""
    created_at: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "summary": self.summary,
            "score": self.score,
            "tags": self.tags,
            "source_url": self.source_url,
            "obsidian_path": self.obsidian_path,
            "module_id": self.module_id,
            "created_at": self.created_at,
            "read": False,
            "metadata": self.metadata,
        }


class FeedbackAction(str, Enum):
    SAVE      = "save"       # 保存到 Obsidian
    SKIP      = "skip"       # 跳过，降低同类权重
    STAR      = "star"       # 精华，大幅提升权重
    DEEP_DIVE = "deep_dive"  # 深度分析（触发二次 Claude）
```

---

### Task B4：SDK Base Class

**文件：** `abo/sdk/base.py`

```python
from abc import ABC, abstractmethod
from .types import Item, Card, FeedbackAction


class Module(ABC):
    """所有 ABO 模块的基类（内置模块和用户自定义模块都继承此类）"""
    id: str = ""
    name: str = ""
    schedule: str = "0 8 * * *"   # cron 表达式
    icon: str = "rss"             # Lucide React 图标名
    enabled: bool = True

    def __init_subclass__(cls, **kwargs):
        """子类未显式声明 output 时，默认同时输出到 obsidian 和 ui"""
        super().__init_subclass__(**kwargs)
        if not isinstance(getattr(cls, "output", None), list):
            cls.output = ["obsidian", "ui"]

    @abstractmethod
    async def fetch(self) -> list[Item]:
        """拉取原始数据，返回 Item 列表（不做 Claude 处理）"""
        ...

    @abstractmethod
    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """用 Claude 处理数据，prefs 包含用户偏好，应注入 Claude prompt"""
        ...

    async def on_feedback(self, card_id: str, action: FeedbackAction) -> None:
        """用户操作回调，子类可重写以实现自定义逻辑"""
        pass

    def get_status(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "schedule": self.schedule,
            "icon": self.icon,
            "enabled": self.enabled,
            "output": getattr(self, "output", ["obsidian", "ui"]),
        }
```

---

### Task B5：SDK Tools

**文件：** `abo/sdk/tools.py`

```python
"""
ABO SDK 工具函数。
所有异步，封装本机工具（claude CLI、yt-dlp、faster-whisper）。
"""
import asyncio
import json
import re
from pathlib import Path

import httpx
import feedparser


def _build_pref_block(prefs: dict) -> str:
    weights = prefs.get("derived_weights", {})
    liked = [t for t, w in weights.items() if w >= 1.1]
    disliked = [t for t, w in weights.items() if w <= 0.7]
    g = prefs.get("global", {})
    return (
        "<user_preferences>\n"
        f"  偏好主题：{', '.join(liked) or '暂无'}\n"
        f"  不感兴趣：{', '.join(disliked) or '暂无'}\n"
        f"  摘要语言：{g.get('summary_language', 'zh')}\n"
        "</user_preferences>"
    )


async def claude(prompt: str, prefs: dict | None = None) -> str:
    """调用本机 claude CLI，返回完整文本（批处理模式）"""
    full = f"{_build_pref_block(prefs)}\n\n{prompt}" if prefs else prompt
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", full,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()


async def claude_json(prompt: str, prefs: dict | None = None) -> dict:
    """调用 claude 并解析 JSON（自动剥离 markdown code fence）"""
    raw = await claude(prompt, prefs=prefs)
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    text = match.group(1) if match else raw
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {}


async def fetch_rss(url: str) -> list[dict]:
    """feedparser 封装，返回 entry 列表"""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, follow_redirects=True)
    feed = feedparser.parse(resp.text)
    return [
        {
            "id": e.get("id") or e.get("link", ""),
            "title": e.get("title", ""),
            "summary": e.get("summary", ""),
            "link": e.get("link", ""),
            "published": e.get("published", ""),
        }
        for e in feed.entries
    ]


async def download_audio(url: str, output_dir: Path | None = None) -> Path:
    """yt-dlp 下载仅音频，返回 mp3 文件路径"""
    out = output_dir or (Path.home() / ".abo" / "tmp" / "audio")
    out.mkdir(parents=True, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        "yt-dlp", "--extract-audio", "--audio-format", "mp3",
        "-o", str(out / "%(id)s.%(ext)s"),
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()
    files = sorted(out.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise FileNotFoundError(f"yt-dlp 下载失败: {url}")
    return files[0]


async def transcribe(audio_path: Path) -> str:
    """faster-whisper 本地转录（在 executor 中运行，避免阻塞事件循环）"""
    loop = asyncio.get_event_loop()
    def _run():
        from faster_whisper import WhisperModel
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(str(audio_path), beam_size=5)
        return " ".join(s.text.strip() for s in segments)
    return await loop.run_in_executor(None, _run)
```

---

### Task B6：SDK `__init__.py`

```python
# abo/sdk/__init__.py
from .types import Item, Card, FeedbackAction
from .base import Module
from .tools import claude, claude_json, fetch_rss, download_audio, transcribe

__all__ = [
    "Module", "Item", "Card", "FeedbackAction",
    "claude", "claude_json",
    "fetch_rss", "download_audio", "transcribe",
]
```

```bash
git commit -m "feat(sdk): add Module ABC, Card/Item types, and tool functions"
```

---

### Task B7：Preference Engine

**文件：** `abo/preferences/engine.py`

核心职责：
1. 读写 `~/.abo/preferences.json`
2. 根据 feedback 更新 `derived_weights`
3. 向 SDK claude 调用注入偏好上下文

```python
import json
from pathlib import Path
from .types import Card, FeedbackAction  # noqa: 避免循环引用用字符串


_PREFS_PATH = Path.home() / ".abo" / "preferences.json"

_DEFAULTS = {
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

_WEIGHT_RULES = {
    "star":      (lambda tags: {t: 1.1 for t in tags}),
    "save":      (lambda tags: {t: 1.05 for t in tags}),
    "skip":      (lambda tags: {tags[0]: 0.85} if tags else {}),
    "deep_dive": (lambda tags: {t: 1.1 for t in tags}),
}


class PreferenceEngine:
    def __init__(self):
        self._data = self._load()

    def _load(self) -> dict:
        if _PREFS_PATH.exists():
            return {**_DEFAULTS, **json.loads(_PREFS_PATH.read_text())}
        return {k: v.copy() if isinstance(v, dict) else v for k, v in _DEFAULTS.items()}

    def _save(self):
        _PREFS_PATH.parent.mkdir(parents=True, exist_ok=True)
        _PREFS_PATH.write_text(json.dumps(self._data, indent=2, ensure_ascii=False))

    def get_prefs_for_module(self, module_id: str) -> dict:
        return {
            **self._data,
            "module": self._data["modules"].get(module_id, {}),
        }

    def threshold(self, module_id: str) -> float:
        return self._data["modules"].get(module_id, {}).get(
            "score_threshold",
            self._data["global"]["score_threshold"]
        )

    def max_cards(self, module_id: str) -> int:
        return self._data["modules"].get(module_id, {}).get(
            "max_cards_per_run",
            self._data["global"]["max_cards_per_run"]
        )

    def record_feedback(self, card_tags: list[str], action: str):
        """更新 derived_weights"""
        rule = _WEIGHT_RULES.get(action)
        if not rule or not card_tags:
            return
        updates = rule(card_tags)
        weights = self._data["derived_weights"]
        for tag, factor in updates.items():
            current = weights.get(tag, 1.0)
            weights[tag] = max(0.1, min(5.0, current * factor))
        self._save()

    def all_data(self) -> dict:
        return self._data

    def update(self, data: dict):
        self._data.update(data)
        self._save()
```

**文件：** `abo/preferences/__init__.py`

```python
from .engine import PreferenceEngine
__all__ = ["PreferenceEngine"]
```

```bash
git commit -m "feat(preferences): add PreferenceEngine with tag weight updates"
```

---

### Task B8：Card Store（SQLite）

**文件：** `abo/store/cards.py`

```python
import json
import sqlite3
from pathlib import Path
from ..sdk.types import Card

_DB_PATH = Path.home() / ".abo" / "data" / "cards.db"

_DDL = """
CREATE TABLE IF NOT EXISTS cards (
    id            TEXT PRIMARY KEY,
    module_id     TEXT NOT NULL,
    title         TEXT NOT NULL,
    summary       TEXT,
    score         REAL,
    tags          TEXT,
    source_url    TEXT,
    obsidian_path TEXT,
    metadata      TEXT,
    created_at    REAL,
    read          INTEGER DEFAULT 0,
    feedback      TEXT
);
CREATE INDEX IF NOT EXISTS idx_module ON cards(module_id);
CREATE INDEX IF NOT EXISTS idx_unread ON cards(read, created_at DESC);
"""


class CardStore:
    def __init__(self, db_path: Path = _DB_PATH):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = db_path
        with self._conn() as conn:
            conn.executescript(_DDL)

    def _conn(self):
        return sqlite3.connect(self._db)

    def save(self, card: Card):
        with self._conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO cards
                   (id, module_id, title, summary, score, tags, source_url,
                    obsidian_path, metadata, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (card.id, card.module_id, card.title, card.summary, card.score,
                 json.dumps(card.tags, ensure_ascii=False),
                 card.source_url, card.obsidian_path,
                 json.dumps(card.metadata, ensure_ascii=False),
                 card.created_at)
            )

    def get(self, card_id: str) -> Card | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
        return self._row_to_card(row) if row else None

    def list(self, module_id: str | None = None, unread_only: bool = False,
             limit: int = 50, offset: int = 0) -> list[Card]:
        sql = "SELECT * FROM cards WHERE 1=1"
        params: list = []
        if module_id:
            sql += " AND module_id=?"; params.append(module_id)
        if unread_only:
            sql += " AND read=0"
        sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params += [limit, offset]
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_card(r) for r in rows]

    def mark_read(self, card_id: str):
        with self._conn() as conn:
            conn.execute("UPDATE cards SET read=1 WHERE id=?", (card_id,))

    def record_feedback(self, card_id: str, action: str):
        with self._conn() as conn:
            conn.execute("UPDATE cards SET feedback=?, read=1 WHERE id=?",
                         (action, card_id))

    def unread_counts(self) -> dict[str, int]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT module_id, COUNT(*) FROM cards WHERE read=0 GROUP BY module_id"
            ).fetchall()
        return {r[0]: r[1] for r in rows}

    def _row_to_card(self, row) -> Card:
        return Card(
            id=row[0], module_id=row[1], title=row[2], summary=row[3] or "",
            score=row[4] or 0.0,
            tags=json.loads(row[5] or "[]"),
            source_url=row[6] or "", obsidian_path=row[7] or "",
            metadata=json.loads(row[8] or "{}"),
            created_at=row[9] or 0.0,
        )
```

**文件：** `abo/store/__init__.py`

```python
from .cards import CardStore
__all__ = ["CardStore"]
```

```bash
git commit -m "feat(store): add SQLite CardStore with CRUD and unread counts"
```

---

### Task B9：WebSocket Broadcaster

**文件：** `abo/runtime/broadcaster.py`

```python
import json
from fastapi import WebSocket
from ..sdk.types import Card


class Broadcaster:
    def __init__(self):
        self._clients: list[WebSocket] = []

    def register(self, ws: WebSocket):
        self._clients.append(ws)

    def unregister(self, ws: WebSocket):
        self._clients = [c for c in self._clients if c is not ws]

    async def send_card(self, card: Card):
        await self._broadcast(json.dumps({"type": "new_card", "card": card.to_dict()}))

    async def send_event(self, event: dict):
        await self._broadcast(json.dumps(event))

    async def _broadcast(self, payload: str):
        dead = []
        for ws in self._clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister(ws)


broadcaster = Broadcaster()
```

---

### Task B10：Module Runner（执行流水线）

**文件：** `abo/runtime/runner.py`

```python
import os
from pathlib import Path
import frontmatter as fm

from ..sdk.base import Module
from ..sdk.types import Card
from ..preferences.engine import PreferenceEngine
from ..store.cards import CardStore
from .broadcaster import Broadcaster
from .. import config as cfg


class ModuleRunner:
    def __init__(self, store: CardStore, prefs: PreferenceEngine,
                 broadcaster: Broadcaster, vault_path: Path | None = None):
        self._store = store
        self._prefs = prefs
        self._broadcaster = broadcaster
        self._vault = vault_path or cfg.get_vault_path()

    async def run(self, module: Module) -> int:
        prefs = self._prefs.get_prefs_for_module(module.id)

        items = await module.fetch()
        cards = await module.process(items, prefs)

        # 过滤低分
        threshold = self._prefs.threshold(module.id)
        cards = [c for c in cards if c.score >= threshold]

        # 按评分降序，取前 N
        max_n = self._prefs.max_cards(module.id)
        cards = sorted(cards, key=lambda c: c.score, reverse=True)[:max_n]

        count = 0
        for card in cards:
            card.module_id = module.id
            output = getattr(module, "output", ["obsidian", "ui"])

            if "obsidian" in output and card.obsidian_path:
                self._write_vault(card)

            self._store.save(card)

            if "ui" in output:
                await self._broadcaster.send_card(card)

            count += 1

        return count

    def _write_vault(self, card: Card):
        path = self._vault / card.obsidian_path
        path.parent.mkdir(parents=True, exist_ok=True)

        content = f"# {card.title}\n\n{card.summary}\n\n[原文链接]({card.source_url})\n"
        post = fm.Post(content=content)
        post.metadata.update({
            "abo-type": card.module_id,
            "relevance-score": round(card.score, 3),
            "tags": card.tags,
            **card.metadata,
        })

        tmp = path.with_suffix(".tmp")
        tmp.write_text(fm.dumps(post), encoding="utf-8")
        os.replace(tmp, path)
```

---

### Task B11：Module Discovery + Watchdog

**文件：** `abo/runtime/discovery.py`

```python
import importlib.util
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from ..sdk.base import Module


class ModuleRegistry:
    def __init__(self):
        self._modules: dict[str, Module] = {}

    def load_all(self):
        # 内置模块
        builtin_dir = Path(__file__).parent.parent / "default_modules"
        if builtin_dir.exists():
            for pkg in builtin_dir.iterdir():
                if pkg.is_dir() and (pkg / "__init__.py").exists():
                    self._load_pkg(pkg)

        # 用户自定义模块
        user_dir = Path.home() / ".abo" / "modules"
        user_dir.mkdir(parents=True, exist_ok=True)
        for pkg in user_dir.iterdir():
            if pkg.is_dir() and (pkg / "__init__.py").exists():
                self._load_pkg(pkg)

    def _load_pkg(self, pkg_dir: Path):
        try:
            spec = importlib.util.spec_from_file_location(
                f"abo_module_{pkg_dir.name}", pkg_dir / "__init__.py"
            )
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            for attr in vars(mod).values():
                if (isinstance(attr, type)
                        and issubclass(attr, Module)
                        and attr is not Module
                        and getattr(attr, "id", "")):
                    instance = attr()
                    self._modules[instance.id] = instance
                    print(f"[discovery] Loaded: {instance.name} ({instance.id})")
        except Exception as e:
            print(f"[discovery] Failed to load {pkg_dir.name}: {e}")

    def all(self) -> list[Module]:
        return list(self._modules.values())

    def enabled(self) -> list[Module]:
        return [m for m in self._modules.values() if m.enabled]

    def get(self, module_id: str) -> Module | None:
        return self._modules.get(module_id)


def start_watcher(registry: ModuleRegistry, on_change):
    class _Handler(FileSystemEventHandler):
        def on_created(self, event):
            if "__init__.py" in event.src_path:
                registry.load_all()
                on_change(registry)
                print(f"[discovery] Hot-reloaded after new module detected")

    user_dir = Path.home() / ".abo" / "modules"
    observer = Observer()
    observer.schedule(_Handler(), str(user_dir), recursive=True)
    observer.daemon = True
    observer.start()
    return observer
```

---

### Task B12：Module Scheduler

**文件：** `abo/runtime/scheduler.py`

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..sdk.base import Module
from .runner import ModuleRunner
from .discovery import ModuleRegistry


class ModuleScheduler:
    def __init__(self, runner: ModuleRunner):
        self._runner = runner
        self._scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")

    def start(self, modules: list[Module]):
        for m in modules:
            self._add_job(m)
        self._scheduler.start()
        print(f"[scheduler] Started with {len(modules)} module(s)")

    def _add_job(self, module: Module):
        self._scheduler.add_job(
            self._runner.run,
            CronTrigger.from_crontab(module.schedule),
            args=[module],
            id=module.id,
            replace_existing=True,
            misfire_grace_time=300,
        )

    def reschedule(self, modules: list[Module]):
        for m in modules:
            if not self._scheduler.get_job(m.id):
                self._add_job(m)

    async def run_now(self, module_id: str, registry: ModuleRegistry) -> bool:
        module = registry.get(module_id)
        if not module:
            return False
        await self._runner.run(module)
        return True

    def job_info(self) -> list[dict]:
        return [
            {
                "id": job.id,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            }
            for job in self._scheduler.get_jobs()
        ]

    def shutdown(self):
        self._scheduler.shutdown(wait=False)
```

**文件：** `abo/runtime/__init__.py`

```python
from .runner import ModuleRunner
from .broadcaster import broadcaster
from .discovery import ModuleRegistry, start_watcher
from .scheduler import ModuleScheduler

__all__ = ["ModuleRunner", "broadcaster", "ModuleRegistry", "start_watcher", "ModuleScheduler"]
```

```bash
git commit -m "feat(runtime): add Runner, Discovery, Scheduler, Broadcaster"
```

---

### Task B13：四个默认模块

> **可并行实现**，各模块互相独立。

---

#### B13-A：arXiv 追踪器

**文件：** `abo/default_modules/arxiv/__init__.py`

```python
import hashlib
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

import httpx

from abo.sdk import Module, Item, Card, claude_json


class ArxivTracker(Module):
    id       = "arxiv-tracker"
    name     = "arXiv 论文追踪"
    schedule = "0 8 * * *"
    icon     = "book-open"
    output   = ["obsidian", "ui"]

    _NS = {"a": "http://www.w3.org/2005/Atom"}

    async def fetch(self) -> list[Item]:
        from abo import config as cfg
        import json
        from pathlib import Path

        # 读取偏好中的 keywords（默认为空，用户可在 preferences.json 中配置）
        prefs_path = Path.home() / ".abo" / "preferences.json"
        keywords = ["machine learning"]
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            keywords = data.get("modules", {}).get("arxiv-tracker", {}).get(
                "keywords", keywords
            )

        query = "+OR+".join(f'all:{kw.replace(" ", "+")}' for kw in keywords)
        url = (
            f"http://export.arxiv.org/api/query"
            f"?search_query={query}&max_results=30"
            f"&sortBy=submittedDate&sortOrder=descending"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)

        root = ET.fromstring(resp.text)
        items = []
        cutoff = datetime.utcnow() - timedelta(days=2)

        for entry in root.findall("a:entry", self._NS):
            raw_id = entry.find("a:id", self._NS).text.strip()
            arxiv_id = raw_id.split("/abs/")[-1]

            published_str = entry.find("a:published", self._NS).text.strip()
            published = datetime.fromisoformat(published_str.replace("Z", "+00:00")).replace(tzinfo=None)
            if published < cutoff:
                continue

            items.append(Item(
                id=arxiv_id,
                raw={
                    "title": entry.find("a:title", self._NS).text.strip().replace("\n", " "),
                    "abstract": entry.find("a:summary", self._NS).text.strip(),
                    "authors": [
                        a.find("a:name", self._NS).text
                        for a in entry.findall("a:author", self._NS)
                    ],
                    "url": f"https://arxiv.org/abs/{arxiv_id}",
                    "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}",
                    "published": published.strftime("%Y-%m-%d"),
                },
            ))
        return items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards = []
        for item in items:
            p = item.raw
            prompt = (
                f"分析以下 arXiv 论文，返回 JSON（不要有其他文字）：\n"
                f'{{"score":<1-10整数，相关性>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"contribution":"<一句话核心创新>"}}\n\n'
                f"标题：{p['title']}\n摘要：{p['abstract'][:600]}"
            )
            try:
                result = await claude_json(prompt, prefs=prefs)
            except Exception:
                result = {}

            first_author = (p["authors"][0].split()[-1] if p["authors"] else "Unknown")
            year = p["published"][:4]
            slug = p["title"][:40].replace(" ", "-").replace("/", "-")

            cards.append(Card(
                id=item.id,
                title=p["title"],
                summary=result.get("summary", p["abstract"][:100]),
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
                },
            ))
        return cards
```

---

#### B13-B：RSS 聚合

**文件：** `abo/default_modules/rss/__init__.py`

```python
import json
from datetime import datetime
from pathlib import Path

from abo.sdk import Module, Item, Card, fetch_rss, claude_json


class RssAggregator(Module):
    id       = "rss-aggregator"
    name     = "RSS 聚合"
    schedule = "0 */2 * * *"
    icon     = "rss"
    output   = ["obsidian", "ui"]

    _DEFAULT_FEEDS = [
        "https://feeds.feedburner.com/PapersWithCode",
        "https://github.blog/feed/",
    ]

    async def fetch(self) -> list[Item]:
        prefs_path = Path.home() / ".abo" / "preferences.json"
        feed_urls = self._DEFAULT_FEEDS
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            feed_urls = data.get("modules", {}).get("rss-aggregator", {}).get(
                "feed_urls", feed_urls
            )

        items = []
        for url in feed_urls:
            try:
                entries = await fetch_rss(url)
                for e in entries[:10]:
                    items.append(Item(id=e["id"] or e["link"], raw=e))
            except Exception:
                pass
        return items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        if not items:
            return []

        titles = "\n".join(f"- {item.raw['title']}" for item in items[:20])
        prompt = (
            f"以下是今日 RSS 聚合标题，分析主要技术趋势，返回 JSON：\n"
            f'{{"score":8,"summary":"<200字以内中文趋势摘要>",'
            f'"tags":["<tag1>","<tag2>"],"highlights":["<亮点1>","<亮点2>"]}}\n\n'
            f"{titles}"
        )
        result = await claude_json(prompt, prefs=prefs)

        date_str = datetime.now().strftime("%Y-%m-%d")
        return [Card(
            id=f"rss-{date_str}",
            title=f"{date_str} RSS 技术趋势",
            summary=result.get("summary", "今日技术动态聚合"),
            score=result.get("score", 7) / 10,
            tags=result.get("tags", []),
            source_url="",
            obsidian_path=f"Trends/{date_str}-rss-digest.md",
            metadata={"highlights": result.get("highlights", [])},
        )]
```

---

#### B13-C：播客摘要

**文件：** `abo/default_modules/podcast/__init__.py`

```python
import json
from datetime import datetime
from pathlib import Path

from abo.sdk import Module, Item, Card, fetch_rss, download_audio, transcribe, claude_json


class PodcastDigest(Module):
    id       = "podcast-digest"
    name     = "播客摘要"
    schedule = "0 7 * * *"
    icon     = "headphones"
    output   = ["obsidian", "ui"]

    async def fetch(self) -> list[Item]:
        prefs_path = Path.home() / ".abo" / "preferences.json"
        podcast_urls: list[str] = []
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            podcast_urls = data.get("modules", {}).get("podcast-digest", {}).get(
                "podcast_urls", []
            )

        items = []
        for url in podcast_urls:
            try:
                entries = await fetch_rss(url)
                if entries:
                    # 只取最新一集
                    e = entries[0]
                    items.append(Item(id=e["id"] or e["link"], raw=e))
            except Exception:
                pass
        return items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards = []
        for item in items:
            audio_url = item.raw.get("link", "")
            if not audio_url:
                continue
            try:
                audio_path = await download_audio(audio_url)
                transcript = await transcribe(audio_path)

                prompt = (
                    f"这是一期播客的转录文字，生成结构化摘要，返回 JSON：\n"
                    f'{{"score":7,"summary":"<核心内容100字>","key_points":["<要点1>","<要点2>","<要点3>"],'
                    f'"quotes":["<金句1>"],"tags":["<tag1>","<tag2>"]}}\n\n'
                    f"标题：{item.raw['title']}\n\n转录（前2000字）：{transcript[:2000]}"
                )
                result = await claude_json(prompt, prefs=prefs)
            except Exception as e:
                result = {"score": 5, "summary": f"处理失败: {e}", "key_points": [], "tags": []}

            date_str = datetime.now().strftime("%Y-%m-%d")
            safe_title = item.raw["title"][:50].replace("/", "-").replace("\\", "-")
            cards.append(Card(
                id=item.id,
                title=item.raw["title"],
                summary=result.get("summary", ""),
                score=result.get("score", 5) / 10,
                tags=result.get("tags", []),
                source_url=item.raw.get("link", ""),
                obsidian_path=f"Podcasts/{date_str}-{safe_title}.md",
                metadata={
                    "key_points": result.get("key_points", []),
                    "quotes": result.get("quotes", []),
                },
            ))
        return cards
```

---

#### B13-D：本地文件夹监控

**文件：** `abo/default_modules/folder_monitor/__init__.py`

```python
import hashlib
import json
from datetime import datetime
from pathlib import Path

from abo.sdk import Module, Item, Card, claude_json


class FolderMonitor(Module):
    id       = "folder-monitor"
    name     = "文件夹监控"
    schedule = "*/5 * * * *"
    icon     = "folder-open"
    output   = ["obsidian", "ui"]

    _STATE_PATH = Path.home() / ".abo" / "data" / "folder_monitor_seen.json"

    def _load_seen(self) -> set[str]:
        if self._STATE_PATH.exists():
            return set(json.loads(self._STATE_PATH.read_text()))
        return set()

    def _save_seen(self, seen: set[str]):
        self._STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self._STATE_PATH.write_text(json.dumps(list(seen)))

    async def fetch(self) -> list[Item]:
        prefs_path = Path.home() / ".abo" / "preferences.json"
        watch_dirs: list[str] = [str(Path.home() / "Downloads")]
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            watch_dirs = data.get("modules", {}).get("folder-monitor", {}).get(
                "watch_dirs", watch_dirs
            )

        seen = self._load_seen()
        new_items = []

        for dir_str in watch_dirs:
            d = Path(dir_str)
            if not d.exists():
                continue
            for f in d.glob("*.pdf"):
                fid = hashlib.md5(str(f).encode()).hexdigest()
                if fid in seen:
                    continue
                seen.add(fid)
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(str(f))
                    text = "\n".join(
                        page.extract_text() or "" for page in reader.pages[:5]
                    )
                    new_items.append(Item(id=fid, raw={"path": str(f), "text": text[:3000], "filename": f.name}))
                except Exception:
                    pass

        self._save_seen(seen)
        return new_items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards = []
        for item in items:
            p = item.raw
            prompt = (
                f"分析以下 PDF 内容，返回 JSON：\n"
                f'{{"score":6,"title":"<文档标题>","summary":"<100字以内中文摘要>",'
                f'"type":"paper|report|notes|other","tags":["<tag1>","<tag2>"]}}\n\n'
                f"文件名：{p['filename']}\n\n内容（前3000字）：{p['text']}"
            )
            result = await claude_json(prompt, prefs=prefs)

            date_str = datetime.now().strftime("%Y-%m-%d")
            safe_name = Path(p["filename"]).stem[:50].replace(" ", "-")
            cards.append(Card(
                id=item.id,
                title=result.get("title", p["filename"]),
                summary=result.get("summary", ""),
                score=result.get("score", 6) / 10,
                tags=result.get("tags", []),
                source_url=f"file://{p['path']}",
                obsidian_path=f"Literature/{date_str}-{safe_name}.md",
                metadata={"source-file": p["path"], "doc-type": result.get("type", "unknown")},
            ))
        return cards
```

**文件：** `abo/default_modules/__init__.py`（空）

```bash
git commit -m "feat(modules): add 4 default modules — arXiv, RSS, Podcast, FolderMonitor"
```

---

### Task B14：FastAPI 入口（main.py）

**文件：** `abo/main.py`

```python
"""
ABO Backend — FastAPI 入口
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_vault_path, load as load_config, save as save_config
from .preferences.engine import PreferenceEngine
from .runtime.broadcaster import broadcaster
from .runtime.discovery import ModuleRegistry, start_watcher
from .runtime.runner import ModuleRunner
from .runtime.scheduler import ModuleScheduler
from .sdk.types import FeedbackAction
from .store.cards import CardStore

# ── 全局单例 ────────────────────────────────────────────────────
_registry = ModuleRegistry()
_card_store = CardStore()
_prefs = PreferenceEngine()
_scheduler: ModuleScheduler | None = None


def _write_sdk_readme():
    path = Path.home() / ".abo" / "sdk" / "README.md"
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "# ABO Module SDK\n\n"
        "ABO 自动发现 `~/.abo/modules/<name>/__init__.py` 中的模块。\n"
        "保存后立即热加载，无需重启。\n\n"
        "## 最小可用模块\n\n"
        "```python\n"
        "from abo.sdk import Module, Item, Card, claude_json\n\n"
        "class MyModule(Module):\n"
        "    id       = 'my-module'\n"
        "    name     = '我的模块'\n"
        "    schedule = '0 8 * * *'\n"
        "    icon     = 'rss'\n"
        "    output   = ['obsidian', 'ui']\n\n"
        "    async def fetch(self):\n"
        "        return [Item(id='1', raw={'title': '示例', 'url': ''})]\n\n"
        "    async def process(self, items, prefs):\n"
        "        result = await claude_json(f'评分并总结：{items[0].raw[\"title\"]}', prefs=prefs)\n"
        "        return [Card(id=items[0].id, title=items[0].raw['title'],\n"
        "                     summary=result.get('summary',''), score=result.get('score',5)/10,\n"
        "                     tags=result.get('tags',[]), source_url='', obsidian_path='Notes/test.md')]\n"
        "```\n"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    _registry.load_all()
    vault_path = get_vault_path()
    runner = ModuleRunner(_card_store, _prefs, broadcaster, vault_path)
    _scheduler = ModuleScheduler(runner)
    _scheduler.start(_registry.enabled())
    start_watcher(_registry, lambda reg: _scheduler.reschedule(reg.enabled()))
    _write_sdk_readme()
    yield
    if _scheduler:
        _scheduler.shutdown()


app = FastAPI(title="ABO Backend", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# ── WebSocket ────────────────────────────────────────────────────

@app.websocket("/ws/feed")
async def feed_ws(ws: WebSocket):
    await ws.accept()
    broadcaster.register(ws)
    try:
        while True:
            await ws.receive_text()
    except Exception:
        broadcaster.unregister(ws)


# ── Cards ────────────────────────────────────────────────────────

@app.get("/api/cards")
async def get_cards(module_id: str | None = None, unread_only: bool = False,
                    limit: int = 50, offset: int = 0):
    cards = _card_store.list(module_id=module_id, unread_only=unread_only,
                              limit=limit, offset=offset)
    return {"cards": [c.to_dict() for c in cards]}


@app.get("/api/cards/unread-counts")
async def unread_counts():
    return _card_store.unread_counts()


class FeedbackReq(BaseModel):
    action: FeedbackAction


@app.post("/api/cards/{card_id}/feedback")
async def feedback(card_id: str, body: FeedbackReq):
    card = _card_store.get(card_id)
    if not card:
        raise HTTPException(404, "Card not found")
    _prefs.record_feedback(card.tags, body.action.value)
    _card_store.record_feedback(card_id, body.action.value)
    module = _registry.get(card.module_id)
    if module:
        await module.on_feedback(card_id, body.action)
    return {"ok": True}


# ── Modules ──────────────────────────────────────────────────────

@app.get("/api/modules")
async def list_modules():
    job_map = {j["id"]: j for j in (_scheduler.job_info() if _scheduler else [])}
    return {
        "modules": [
            {**m.get_status(), "next_run": job_map.get(m.id, {}).get("next_run")}
            for m in _registry.all()
        ]
    }


@app.post("/api/modules/{module_id}/run")
async def run_module(module_id: str):
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


# ── Config ───────────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    return load_config()


@app.post("/api/config")
async def update_config(data: dict):
    save_config(data)
    return {"ok": True}


# ── Preferences ──────────────────────────────────────────────────

@app.get("/api/preferences")
async def get_prefs():
    return _prefs.all_data()


@app.post("/api/preferences")
async def update_prefs(data: dict):
    _prefs.update(data)
    return {"ok": True}
```

```bash
git commit -m "feat(api): complete FastAPI main.py with lifespan, feed routes, module management"
```

---

## 第三阶段：前端从零构建

> **调用 skill：** `frontend-design` 构建每个 UI 组件
> **调用 skill：** `superpowers:subagent-driven-development` 并行实现多个组件

---

### Task F1：基础文件

**`src/main.tsx`** — 不变，保留

**`src/index.css`** — 保留（含 Tailwind directives）

**`src/core/api.ts`** — 保留（已有 fetch 封装）

**`src/core/events.ts`** — 保留（已有事件总线）

---

### Task F2：Zustand Store（全新）

**文件：** `src/core/store.ts`

```typescript
import { create } from "zustand";

// ── 类型定义 ──────────────────────────────────────────────────────

export type ActiveTab =
  | "overview" | "literature" | "arxiv" | "meeting"
  | "ideas" | "health" | "podcast" | "trends"
  | "claude" | "settings";

export type ToastKind = "info" | "error" | "success";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface AppConfig {
  vault_path: string;
  version: string;
}

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

// ── Store ─────────────────────────────────────────────────────────

interface AboStore {
  // 导航
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // 配置
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;

  // Feed
  feedCards: FeedCard[];
  feedModules: FeedModule[];
  activeModuleFilter: string | null;
  unreadCounts: Record<string, number>;
  setFeedCards: (cards: FeedCard[]) => void;
  prependCard: (card: FeedCard) => void;
  setFeedModules: (modules: FeedModule[]) => void;
  setActiveModuleFilter: (id: string | null) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;

  // Toast
  toasts: Toast[];
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useStore = create<AboStore>((set) => ({
  activeTab: "overview",
  setActiveTab: (activeTab) => set({ activeTab }),

  config: null,
  setConfig: (config) => set({ config }),

  feedCards: [],
  feedModules: [],
  activeModuleFilter: null,
  unreadCounts: {},
  setFeedCards: (feedCards) => set({ feedCards }),
  prependCard: (card) => set((s) => ({ feedCards: [card, ...s.feedCards] })),
  setFeedModules: (feedModules) => set({ feedModules }),
  setActiveModuleFilter: (activeModuleFilter) => set({ activeModuleFilter }),
  setUnreadCounts: (unreadCounts) => set({ unreadCounts }),

  toasts: [],
  addToast: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
```

---

### Task F3：通用组件

#### `src/components/Toast.tsx`

```tsx
import { useEffect } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { useStore, ToastKind } from "../core/store";

const ICONS: Record<ToastKind, typeof X> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};
const COLORS: Record<ToastKind, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  info: "text-indigo-500",
};

export default function ToastContainer() {
  const { toasts, removeToast } = useStore();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-slate-800
                       border border-slate-200 dark:border-slate-700 shadow-lg min-w-[280px]"
          >
            <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${COLORS[t.kind]}`} aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.title}</p>
              {t.message && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <AutoDismiss id={t.id} />
          </div>
        );
      })}
    </div>
  );
}

function AutoDismiss({ id }: { id: string }) {
  const removeToast = useStore((s) => s.removeToast);
  useEffect(() => {
    const t = setTimeout(() => removeToast(id), 4000);
    return () => clearTimeout(t);
  }, [id, removeToast]);
  return null;
}
```

---

### Task F4：NavSidebar

**文件：** `src/modules/nav/NavSidebar.tsx`

设计规范：
- 始终深色背景（`bg-slate-900`）
- Logo 区域：`ABO` 文字 + 小版本号
- "主要" 组（overview/literature/ideas/claude）
- "自动化" 分组标签 + 5 个自动化模块
- 底部：settings
- overview 按钮旁显示总未读数 badge（indigo 背景）
- Vault 状态指示器（已连接/未配置）

```tsx
import { useStore, ActiveTab } from "../../core/store";
import {
  Inbox, BookOpen, Lightbulb, MessageSquare,
  Rss, Presentation, Heart, Headphones, TrendingUp,
  Settings, Zap
} from "lucide-react";

type NavItem = { id: ActiveTab; label: string; Icon: React.FC<{ className?: string }> };

const MAIN: NavItem[] = [
  { id: "overview",   label: "今日",     Icon: Inbox },
  { id: "literature", label: "文献库",   Icon: BookOpen },
  { id: "ideas",      label: "Idea",     Icon: Lightbulb },
  { id: "claude",     label: "Claude",   Icon: MessageSquare },
];

const AUTO: NavItem[] = [
  { id: "arxiv",   label: "arXiv",  Icon: Rss },
  { id: "meeting", label: "组会",   Icon: Presentation },
  { id: "health",  label: "健康",   Icon: Heart },
  { id: "podcast", label: "播客",   Icon: Headphones },
  { id: "trends",  label: "Trends", Icon: TrendingUp },
];

export default function NavSidebar() {
  const { activeTab, setActiveTab, unreadCounts, config } = useStore();
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const vaultOk = Boolean(config?.vault_path);

  function NavBtn({ id, label, Icon }: NavItem) {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm
          transition-colors duration-150 cursor-pointer
          ${active
            ? "bg-slate-700 text-white"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">{label}</span>
        {id === "overview" && totalUnread > 0 && (
          <span className="text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5 leading-none">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <nav className="w-48 shrink-0 h-full bg-slate-900 flex flex-col py-4 px-3 gap-1">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 mb-4">
        <Zap className="w-5 h-5 text-indigo-400" aria-hidden />
        <span className="font-heading text-lg text-white font-semibold">ABO</span>
        <span className="text-xs text-slate-600 ml-auto">v1.0</span>
      </div>

      {/* 主要 */}
      {MAIN.map((item) => <NavBtn key={item.id} {...item} />)}

      {/* 自动化分组 */}
      <div className="mt-3 mb-1 px-3">
        <span className="text-xs text-slate-600 uppercase tracking-wider">自动化</span>
      </div>
      {AUTO.map((item) => <NavBtn key={item.id} {...item} />)}

      {/* 底部 */}
      <div className="mt-auto">
        <div className={`flex items-center gap-1.5 px-3 py-1 mb-2 text-xs
          ${vaultOk ? "text-emerald-500" : "text-amber-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${vaultOk ? "bg-emerald-500" : "bg-amber-500"}`} />
          {vaultOk ? "Vault 已连接" : "请配置 Vault"}
        </div>
        <NavBtn id="settings" label="设置" Icon={Settings} />
      </div>
    </nav>
  );
}
```

---

### Task F5-F8：Feed 组件（见 AGENT-REBUILD-PROMPT.md）

完整实现参考 `AGENT-REBUILD-PROMPT.md` 的 Task 17-20 章节。
按顺序：CardView → Feed → ModulePanel → FeedSidebar。

---

### Task F9：App.tsx（主框架）

**文件：** `src/App.tsx`

```tsx
import { useEffect } from "react";
import NavSidebar from "./modules/nav/NavSidebar";
import MainContent from "./modules/MainContent";
import ToastContainer from "./components/Toast";
import { useStore } from "./core/store";
import { api } from "./core/api";

export default function App() {
  const setConfig = useStore((s) => s.setConfig);

  useEffect(() => {
    api.get<{ vault_path: string; version: string }>("/api/config")
      .then(setConfig)
      .catch(() => {});
  }, [setConfig]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <NavSidebar />
      <div className="flex-1 min-w-0 overflow-hidden">
        <MainContent />
      </div>
      <ToastContainer />
    </div>
  );
}
```

---

### Task F10：MainContent.tsx

**文件：** `src/modules/MainContent.tsx`

Overview tab 使用双栏布局（FeedSidebar + Feed）。
其他 tab 单栏，渲染对应模块组件。

```tsx
import { useStore } from "../core/store";
import Feed from "./feed/Feed";
import FeedSidebar from "./feed/FeedSidebar";
import ModulePanel from "./feed/ModulePanel";
import Literature from "./literature/Literature";
import MindMap from "./ideas/MindMap";
import ClaudePanel from "./claude-panel/ClaudePanel";
import Settings from "./settings/Settings";
// 自动化模块（暂时用占位组件，后续完整实现）
import ArxivTracker from "./arxiv/ArxivTracker";
import MeetingGenerator from "./meeting/MeetingGenerator";
import HealthDashboard from "./health/HealthDashboard";
import PodcastDigest from "./podcast/PodcastDigest";
import TrendTracker from "./trends/TrendTracker";

export default function MainContent() {
  const activeTab = useStore((s) => s.activeTab);

  if (activeTab === "overview") {
    return (
      <main className="flex-1 min-h-0 flex overflow-hidden h-full bg-slate-50 dark:bg-slate-950">
        <FeedSidebar />
        <div className="flex-1 min-w-0 overflow-hidden">
          <Feed />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
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

---

### Task F11：自动化模块占位组件（可并行）

为以下 5 个模块各创建占位组件，后续迭代完整实现：

```tsx
// src/modules/arxiv/ArxivTracker.tsx （示例格式，其他模块同理）
import { Rss } from "lucide-react";
import ModulePanel from "../feed/ModulePanel";

export default function ArxivTracker() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Rss className="w-5 h-5 text-indigo-500" aria-hidden />
          <h1 className="font-heading text-xl text-slate-800 dark:text-slate-100">
            arXiv 追踪器
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          订阅 arXiv 关键词，每日自动追踪新论文
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <ModulePanel filterModuleId="arxiv-tracker" />
      </div>
    </div>
  );
}
```

5 个模块：`ArxivTracker`、`MeetingGenerator`、`HealthDashboard`、`PodcastDigest`、`TrendTracker`

保留并迁移现有功能：`Literature`（复用已有代码）、`MindMap`（复用已有 React Flow 代码）、`ClaudePanel`（复用已有 WebSocket 代码）、`Settings`（重写，加偏好配置 UI）

```bash
git commit -m "feat(frontend): complete App skeleton — NavSidebar, Feed UI, MainContent, placeholder modules"
```

---

## 第四阶段：验收与发布

> **调用 skill：** `superpowers:verification-before-completion`
> **调用 skill：** `superpowers:requesting-code-review`

```bash
# 1. TypeScript 类型检查（必须零错误）
npx tsc --noEmit

# 2. 后端启动测试
python -m abo.main
# 期望日志：
# [discovery] Loaded: arXiv 论文追踪 (arxiv-tracker)
# [discovery] Loaded: RSS 聚合 (rss-aggregator)
# [discovery] Loaded: 播客摘要 (podcast-digest)
# [discovery] Loaded: 文件夹监控 (folder-monitor)
# [scheduler] Started with 4 module(s)
# INFO: Application startup complete.

# 3. API 验证
curl http://127.0.0.1:8765/api/modules | python3 -m json.tool
curl http://127.0.0.1:8765/api/cards/unread-counts

# 4. 手动触发模块（不等实际 LLM，测试流水线）
curl -X POST http://127.0.0.1:8765/api/modules/arxiv-tracker/run

# 5. 热加载验证
mkdir -p ~/.abo/modules/test-module && cat > ~/.abo/modules/test-module/__init__.py << 'EOF'
from abo.sdk import Module, Item, Card
class TestModule(Module):
    id = "test-module"; name = "测试"; schedule = "0 23 * * *"; icon = "flask-conical"
    output = ["ui"]
    async def fetch(self): return [Item(id="t1", raw={"title":"热加载OK"})]
    async def process(self, items, prefs):
        return [Card(id=i.id, title=i.raw["title"], summary="成功", score=0.9,
                     tags=["test"], source_url="", obsidian_path="") for i in items]
EOF
# 期望：2秒内后端日志出现 [discovery] Loaded: 测试 (test-module)

# 6. 前端启动
npm run dev
# 打开 http://localhost:1420

# 7. 最终 commit & push
git add -A
git commit -m "feat: complete ABO rebuild — Intelligence Feed, 4 default modules, full UI"
git push origin main
```

---

## 验收清单

```
[ ] npx tsc --noEmit 零错误
[ ] python -m abo.main 启动无 ERROR 日志，4 个模块加载成功
[ ] GET /api/modules 返回 4 个模块，含 schedule 和 next_run
[ ] POST /api/modules/arxiv-tracker/run 无报错
[ ] ~/.abo/sdk/README.md 自动生成
[ ] ~/.abo/preferences.json 存在
[ ] 热加载：新模块无需重启即被发现
[ ] 前端 Feed 双栏布局正常
[ ] 键盘 j/k/s/x/f/d 正常工作
[ ] 反馈后 preferences.json 权重更新
[ ] 深色/浅色模式切换正常
[ ] Literature / MindMap / ClaudePanel 功能正常（复用旧代码）
[ ] git log 每个 Task 均有 commit
[ ] git push origin main 成功
```

---

## 附：保留/迁移文件对照表

| 文件 | 操作 | 说明 |
|------|------|------|
| `abo/claude_bridge/runner.py` | 保留 | stream_call + batch_call，直接复用 |
| `abo/claude_bridge/context_builder.py` | 保留 | 上下文注入工具 |
| `abo/vault/reader.py` | 保留 | frontmatter 读取 |
| `abo/vault/writer.py` | 保留 | 原子写入 |
| `abo/literature/importer.py` | 保留 | PDF/DOI 导入逻辑 |
| `abo/literature/indexer.py` | 保留 | SQLite FTS5 |
| `abo/obsidian/` | 保留 | URI scheme 工具 |
| `src/core/api.ts` | 保留 | HTTP fetch 封装 |
| `src/core/events.ts` | 保留 | 事件总线 |
| `src/modules/literature/Literature.tsx` | 迁移 | 复制到新目录结构 |
| `src/modules/mindmap/` | 迁移 | 重命名为 `src/modules/ideas/` |
| `src/modules/claude-panel/ClaudePanel.tsx` | 迁移 | 直接复用 |
| `src/modules/settings/Settings.tsx` | 重写 | 加偏好配置 UI |
| `abo/game/` | 删除 | 彻底废弃 |
| `abo/journal/` | 删除 | 被 health 模块接管 |
| `abo/mindmap/` | 删除 | 前端直接管理画布状态 |
| `abo/main.py` | 重写 | 新 lifespan + 新路由 |
| `abo/config.py` | 重写 | 更简洁 |
| `src/core/store.ts` | 重写 | 去掉游戏化，加 Feed 状态 |
| `src/App.tsx` | 重写 | 更简洁 |
