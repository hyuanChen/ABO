# ABO 重新开发 — Agent 工作模板

> 把这整个文件的内容作为 prompt 发给 Claude Code Agent，启动全量重建。
> 所有设计细节见同目录 `ABO-完整产品需求说明.md`。

---

## 你的任务

你是一个负责从零重新构建 **ABO（Agent Boost OS）** 的开发 Agent。
工作目录：`/Users/huanc/Desktop/ABO/`（直接在此目录操作，禁止使用 git worktree）。

完整需求和架构设计已写在：
```
/Users/huanc/Desktop/ABO/all/ABO-完整产品需求说明.md
```

**开始前必须先读这份需求文档，然后按照下面的工作流程逐步执行。**

---

## 工作流程规范

### 第一步：理解需求（必须）

```
调用 skill: superpowers:using-superpowers
```

读取并理解以下文件：
1. `/Users/huanc/Desktop/ABO/all/ABO-完整产品需求说明.md` — 完整产品需求
2. `/Users/huanc/Desktop/ABO/CLAUDE.md` — 项目规范和技术栈
3. 当前 `src/` 和 `abo/` 目录结构（已有的代码可以复用）

理解以下核心概念后再开始编码：
- Intelligence Feed 的数据流：`fetch() → process(prefs) → Card → Vault + UI`
- Module Runtime 的热加载机制（watchdog）
- Preference Engine 的权重更新逻辑
- Claude CLI 的两种调用模式（stream vs batch）

### 第二步：制定实现计划（必须）

```
调用 skill: superpowers:writing-plans
```

根据需求文档第十二章「开发路线图」制定分阶段计划。
**计划必须包含：**

- Phase 5（清理游戏化）具体文件操作列表
- Phase 6（Intelligence Feed）按模块的实现顺序
- 每个任务的依赖关系（哪些必须先做）
- 每个任务的验收标准

**计划审批后才能开始编码。**

### 第三步：按计划并行执行（Phase 5 → Phase 6）

```
调用 skill: superpowers:subagent-driven-development
```

独立任务组可以并行，有依赖的必须串行。
参考下面的「任务依赖图」章节。

### 第四步：每个 Phase 完成后验收

```
调用 skill: superpowers:verification-before-completion
调用 skill: superpowers:requesting-code-review
```

验收内容：
- `npx tsc --noEmit` 零错误
- Python 后端 `python -m abo.main` 启动无报错
- `/api/modules` 接口返回 4 个默认模块
- WebSocket `/ws/feed` 可连接

---

## Phase 5：清理游戏化 UI

### 必须删除的文件

```bash
rm src/modules/sidebar/Sidebar.tsx        # 旧版游戏化侧边栏
rm src/modules/skilltree/SkillTree.tsx    # 技能树
```

### 必须从 store.ts 清除的字段

删除所有与游戏化相关的 interface 和 state：
- `GameState`（xp, level, title, energy, energy_max）
- `EnergyState`
- `SkillDef`、`SkillNode`
- Toast kind 中的 `xp`、`achievement`、`level_up`
- `/api/game/state` 的初始化 fetch（在 App.tsx 中）

### store.ts 重建后的核心字段

```typescript
export type ActiveTab =
  | "overview" | "literature" | "arxiv" | "meeting"
  | "ideas" | "health" | "podcast" | "trends"
  | "claude" | "settings";

export type ToastKind = "info" | "error" | "success";

export interface FeedCard {
  id: string;
  title: string;
  summary: string;
  score: number;         // 0-1
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

// AboStore 新增字段（追加，不替换现有 config/toast 字段）：
feedCards: FeedCard[];
feedModules: FeedModule[];
activeModuleFilter: string | null;
unreadCounts: Record<string, number>;
setFeedCards: (cards: FeedCard[]) => void;
prependCard: (card: FeedCard) => void;
setFeedModules: (modules: FeedModule[]) => void;
setActiveModuleFilter: (id: string | null) => void;
setUnreadCounts: (counts: Record<string, number>) => void;
```

### NavSidebar.tsx 重建规范

- 去掉用户头像、精力值、经验值、等级、称号卡片
- 保留：Logo、vault 状态指示器、10 个导航 Tab
- 新增："自动化"分组标签（arXiv、组会、健康、播客、Trends）
- overview Tab 旁边加未读 badge（从 `unreadCounts` 计算总数）
- 键盘快捷键：`Cmd+1` overview，`Cmd+2` literature，`Cmd+3` ideas，`Cmd+4` claude
- 始终深色背景：`bg-slate-900`

### NavSidebar Tab 定义

```typescript
const NAV_ITEMS = [
  { id: "overview",   label: "今日",     icon: Inbox },
  { id: "literature", label: "文献库",   icon: BookOpen },
  { id: "ideas",      label: "Idea 工坊", icon: Lightbulb },
  { id: "claude",     label: "Claude",   icon: MessageSquare },
];

const AUTOMATION_ITEMS = [
  { id: "arxiv",   label: "arXiv",  icon: Rss },
  { id: "meeting", label: "组会",   icon: Presentation },
  { id: "health",  label: "健康",   icon: Heart },
  { id: "podcast", label: "播客",   icon: Headphones },
  { id: "trends",  label: "Trends", icon: TrendingUp },
];

const BOTTOM_ITEMS = [
  { id: "settings", label: "设置", icon: Settings },
];
```

---

## Phase 6：Intelligence Feed 完整实现

### 任务依赖图

```
[Task 1] SDK Types (types.py)
    ↓
[Task 2] SDK Base Class (base.py)
    ↓
[Task 3] SDK Tools (tools.py)
    ↓
[Task 4] SDK __init__.py (导出所有符号)
    ↓
    ├──→ [Task 5] Preference Engine
    ├──→ [Task 6] Broadcaster (WebSocket 注册表)
    └──→ [Task 7] Card Store (SQLite)
              ↓ (Task 5, 6, 7 全部完成后)
         [Task 8] Module Runner (执行流水线)
              ↓
         [Task 9] Module Discovery (watchdog)
              ↓
         [Task 10] Module Scheduler (APScheduler)
              ↓
         [Task 11-14] 四个默认模块（可并行）
              ↓
         [Task 15] main.py 重写（lifespan + 路由）
              ↓
         [Task 16] store.ts 新增 Feed 字段
              ↓
         [Task 17-20] 四个 Feed UI 组件（CardView → Feed → ModulePanel → FeedSidebar）
              ↓
         [Task 21] MainContent.tsx 双栏布局
              ↓
         [Task 22] SDK README 写入逻辑
              ↓
         [Task 23] 端到端验收测试
```

### Task 1：SDK Types

**文件：** `abo/sdk/types.py`

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import time


@dataclass
class Item:
    id: str
    raw: dict[str, Any]


@dataclass
class Card:
    id: str
    title: str
    summary: str
    score: float              # 0.0 – 1.0
    tags: list[str]
    source_url: str
    obsidian_path: str        # 相对于 Vault 根目录的路径
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
    SAVE      = "save"
    SKIP      = "skip"
    STAR      = "star"
    DEEP_DIVE = "deep_dive"
```

### Task 2：SDK Base Class

**文件：** `abo/sdk/base.py`

关键点：
- 用 `__init_subclass__` 而不是 dataclass field 设置 `output` 默认值
- `output` 是类变量，不是实例变量

```python
from abc import ABC, abstractmethod
from .types import Item, Card, FeedbackAction


class Module(ABC):
    id: str = ""
    name: str = ""
    schedule: str = "0 8 * * *"
    icon: str = "rss"
    enabled: bool = True

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if not hasattr(cls, "output") or not isinstance(getattr(cls, "output", None), list):
            cls.output = ["obsidian", "ui"]

    @abstractmethod
    async def fetch(self) -> list[Item]: ...

    @abstractmethod
    async def process(self, items: list[Item], prefs: dict) -> list[Card]: ...

    async def on_feedback(self, card_id: str, action: FeedbackAction) -> None:
        pass

    def get_status(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "schedule": self.schedule,
            "icon": self.icon,
            "enabled": self.enabled,
            "output": self.output,
        }
```

### Task 3：SDK Tools

**文件：** `abo/sdk/tools.py`

所有工具函数异步，依赖本机工具（`claude` CLI、`yt-dlp`、`faster-whisper`）。

```python
import asyncio
import json
import re
from pathlib import Path
import httpx
import feedparser


async def claude(prompt: str, prefs: dict | None = None) -> str:
    """调用本机 claude CLI，返回完整文本响应"""
    full_prompt = prompt
    if prefs:
        pref_block = _build_pref_block(prefs)
        full_prompt = f"{pref_block}\n\n{prompt}"
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", full_prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()


async def claude_json(prompt: str, prefs: dict | None = None) -> dict:
    """调用 claude 并解析 JSON 响应（自动剥离 markdown code fence）"""
    raw = await claude(prompt, prefs=prefs)
    # 剥离 ```json ... ``` fence
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    text = match.group(1) if match else raw
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {}


async def fetch_rss(url: str) -> list[dict]:
    """feedparser 封装，返回 entry dict 列表"""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
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
        "--output", str(out / "%(id)s.%(ext)s"),
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()
    # 找最新的 mp3
    files = sorted(out.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise FileNotFoundError(f"yt-dlp 下载失败：{url}")
    return files[0]


async def transcribe(audio_path: Path) -> str:
    """faster-whisper 本地转录，返回文本"""
    import asyncio
    loop = asyncio.get_event_loop()
    def _run():
        from faster_whisper import WhisperModel
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(str(audio_path), beam_size=5)
        return " ".join(s.text.strip() for s in segments)
    return await loop.run_in_executor(None, _run)


def _build_pref_block(prefs: dict) -> str:
    global_prefs = prefs.get("global", {})
    weights = prefs.get("derived_weights", {})
    liked = [t for t, w in weights.items() if w > 1.0]
    disliked = [t for t, w in weights.items() if w < 0.8]
    return (
        "<user_preferences>\n"
        f"  偏好主题（权重高）：{', '.join(liked) or '未设置'}\n"
        f"  不感兴趣（降权）：{', '.join(disliked) or '未设置'}\n"
        f"  摘要语言：{global_prefs.get('summary_language', 'zh')}\n"
        f"  详细程度：{global_prefs.get('detail_level', 'medium')}\n"
        "</user_preferences>"
    )
```

### Task 4：SDK `__init__.py`

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

### Task 5：Preference Engine

**文件：** `abo/preferences/engine.py`

核心逻辑：
- `record_feedback(card, action)` → 更新 `derived_weights`
- `build_prompt_block(module_id)` → 返回 `<user_preferences>` 字符串
- `get_prefs_for_module(module_id)` → 合并 global + module 偏好

权重更新规则：
```
STAR      → 所有 tag 权重 × 1.1
SAVE      → 所有 tag 权重 × 1.05
SKIP      → 主 tag（第一个）权重 × 0.85
DEEP_DIVE → 等同 STAR
```

权重值范围 clamp 到 [0.1, 5.0]，超过 100 条 feedback_history 时 FIFO 截断。

### Task 6：WebSocket Broadcaster

**文件：** `abo/runtime/broadcaster.py`

```python
import json
from fastapi import WebSocket
from ..sdk.types import Card


class Broadcaster:
    def __init__(self):
        self._clients: list[WebSocket] = []

    def register(self, ws: WebSocket) -> None:
        self._clients.append(ws)

    def unregister(self, ws: WebSocket) -> None:
        self._clients = [c for c in self._clients if c is not ws]

    async def send_card(self, card: Card) -> None:
        payload = json.dumps({"type": "new_card", "card": card.to_dict()})
        await self._broadcast(payload)

    async def send_event(self, event: dict) -> None:
        await self._broadcast(json.dumps(event))

    async def _broadcast(self, payload: str) -> None:
        dead = []
        for ws in self._clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister(ws)


broadcaster = Broadcaster()  # 模块级单例
```

### Task 7：Card Store（SQLite）

**文件：** `abo/store/cards.py`

表结构：
```sql
CREATE TABLE IF NOT EXISTS cards (
    id            TEXT PRIMARY KEY,
    module_id     TEXT NOT NULL,
    title         TEXT NOT NULL,
    summary       TEXT,
    score         REAL,
    tags          TEXT,         -- JSON
    source_url    TEXT,
    obsidian_path TEXT,
    metadata      TEXT,         -- JSON
    created_at    REAL,
    read          INTEGER DEFAULT 0,
    feedback      TEXT
);
CREATE INDEX IF NOT EXISTS idx_module ON cards(module_id);
CREATE INDEX IF NOT EXISTS idx_unread ON cards(read, created_at DESC);
```

必须实现的方法：
- `save(card: Card) → None`（upsert）
- `get(card_id: str) → Card | None`
- `list(module_id=None, unread_only=False, limit=50, offset=0) → list[Card]`
- `mark_read(card_id: str) → None`
- `record_feedback(card_id: str, action: str) → None`
- `unread_counts() → dict[str, int]`（按 module_id 分组的未读数）

数据库路径：`Path.home() / ".abo" / "data" / "cards.db"`，初始化时自动创建目录。

### Task 8：Module Runner

**文件：** `abo/runtime/runner.py`

执行流水线（每次调度触发）：

```python
async def run(self, module: Module) -> int:
    """返回生成的 Card 数量"""
    vault_path = self._get_vault_path()
    prefs = self._prefs.get_prefs_for_module(module.id)

    # 1. fetch
    items = await module.fetch()

    # 2. process（含偏好注入）
    cards = await module.process(items, prefs)

    # 3. 评分过滤
    threshold = self._prefs.threshold(module.id)
    cards = [c for c in cards if c.score >= threshold]

    # 4. 数量限制
    max_n = self._prefs.max_cards(module.id)
    cards = sorted(cards, key=lambda c: c.score, reverse=True)[:max_n]

    count = 0
    for card in cards:
        card.module_id = module.id

        # 5. 写入 Obsidian Vault（如果 output 包含 "obsidian"）
        if "obsidian" in module.output and vault_path and card.obsidian_path:
            await self._write_vault(card, vault_path)

        # 6. 存入 SQLite
        self._store.save(card)

        # 7. WebSocket 广播（如果 output 包含 "ui"）
        if "ui" in module.output:
            await self._broadcaster.send_card(card)

        count += 1

    return count
```

Vault 写入使用原子写入（`.tmp` → `os.replace`），frontmatter 用 `python-frontmatter`：
```python
import frontmatter as fm
post = fm.Post(content=f"# {card.title}\n\n{card.summary}\n\n[原文]({card.source_url})\n")
post.metadata.update({"abo-type": card.module_id, "relevance-score": round(card.score, 3),
                       "tags": card.tags, **card.metadata})
```

### Task 9：Module Discovery

**文件：** `abo/runtime/discovery.py`

两个扫描源：
1. `abo/default_modules/` — 内置模块（随 ABO 安装）
2. `~/.abo/modules/` — 用户自定义模块（Claude Code 生成后热加载）

```python
import importlib.util
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class ModuleRegistry:
    def __init__(self):
        self._modules: dict[str, Module] = {}

    def load_all(self):
        """扫描并加载所有模块"""
        # 内置模块
        builtin = Path(__file__).parent.parent / "default_modules"
        for pkg_dir in builtin.iterdir():
            if pkg_dir.is_dir() and (pkg_dir / "__init__.py").exists():
                self._load_from_dir(pkg_dir)

        # 用户模块
        user_dir = Path.home() / ".abo" / "modules"
        user_dir.mkdir(parents=True, exist_ok=True)
        for pkg_dir in user_dir.iterdir():
            if pkg_dir.is_dir() and (pkg_dir / "__init__.py").exists():
                self._load_from_dir(pkg_dir)

    def _load_from_dir(self, pkg_dir: Path):
        """动态 import 并找到 Module 子类"""
        spec = importlib.util.spec_from_file_location(
            pkg_dir.name, pkg_dir / "__init__.py"
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for attr in vars(mod).values():
            if (isinstance(attr, type)
                    and issubclass(attr, Module)
                    and attr is not Module
                    and attr.id):
                instance = attr()
                self._modules[instance.id] = instance

    def all(self) -> list[Module]:
        return list(self._modules.values())

    def enabled(self) -> list[Module]:
        return [m for m in self._modules.values() if m.enabled]

    def get(self, module_id: str) -> Module | None:
        return self._modules.get(module_id)


def start_watcher(registry: ModuleRegistry, on_change):
    """监控 ~/.abo/modules/，新模块热加载"""
    class _Handler(FileSystemEventHandler):
        def on_created(self, event):
            if "__init__.py" in event.src_path:
                registry.load_all()
                on_change(registry)

    observer = Observer()
    watch_dir = Path.home() / ".abo" / "modules"
    observer.schedule(_Handler(), str(watch_dir), recursive=True)
    observer.daemon = True
    observer.start()
```

### Task 10：Module Scheduler

**文件：** `abo/runtime/scheduler.py`

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

class ModuleScheduler:
    def __init__(self, runner: ModuleRunner):
        self._runner = runner
        self._scheduler = AsyncIOScheduler()

    def start(self, modules: list[Module]):
        for module in modules:
            self._add_job(module)
        self._scheduler.start()

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
        """watchdog 发现新模块后调用"""
        for module in modules:
            if not self._scheduler.get_job(module.id):
                self._add_job(module)

    async def run_now(self, module_id: str, registry: ModuleRegistry) -> bool:
        module = registry.get(module_id)
        if not module:
            return False
        await self._runner.run(module)
        return True

    def job_info(self) -> list[dict]:
        return [
            {"id": job.id, "next_run": job.next_run_time.isoformat() if job.next_run_time else None}
            for job in self._scheduler.get_jobs()
        ]

    def shutdown(self):
        self._scheduler.shutdown(wait=False)
```

### Task 11-14：四个默认模块

#### arXiv 追踪器（`abo/default_modules/arxiv/__init__.py`）

`fetch()` 调用 arXiv Atom API：
```
http://export.arxiv.org/api/query?search_query={query}&max_results=50&sortBy=submittedDate&sortOrder=descending
```
- 解析 Atom XML（`xml.etree.ElementTree`）
- 从 preferences 读取 `keywords`、`categories`、`score_threshold`
- 过滤已处理的 arxiv-id（用 Card Store 的 `exists()` 方法，或在 metadata 中存 seen_ids）

`process()` 调用 `claude_json()`，要求返回：
```json
{
  "score": 7,
  "summary": "50字以内中文摘要",
  "tags": ["tag1", "tag2", "tag3"],
  "contribution": "一句话核心创新"
}
```
`obsidian_path` 格式：`Literature/{FirstAuthorLastName}{Year}-{Title[:40]}.md`

#### RSS 聚合（`abo/default_modules/rss/__init__.py`）

- `fetch()` 调用 `fetch_rss()` 遍历 preferences 中的 `feed_urls` 列表
- 用 URL hash 去重（存入 Card Store）
- `process()` 让 Claude 聚合分析，而不是逐条摘要
- `obsidian_path`：`Trends/{date}-rss-digest.md`
- `schedule`：`"0 */2 * * *"`（每 2 小时）

#### 播客摘要（`abo/default_modules/podcast/__init__.py`）

- `fetch()` 检查 preferences 中的 `podcast_urls`，调用 feedparser 获取新集
- `process()` 调用 `download_audio()` → `transcribe()` → `claude()` 生成结构化摘要
- 注意：音视频处理耗时长（15-30分钟），必须在 `process()` 内部处理，不阻塞 scheduler
- `obsidian_path`：`Podcasts/{date}-{episode_title[:50]}.md`

#### 文件夹监控（`abo/default_modules/folder_monitor/__init__.py`）

- `fetch()` 扫描 preferences 中的 `watch_dirs` 下的新 PDF/DOCX 文件
- 用 SQLite 记录已处理文件的 mtime + path hash，避免重复处理
- `process()` 用 pypdf 提取文本 → `claude()` 判断类型并生成摘要
- `schedule`：`"*/5 * * * *"`（每 5 分钟轮询）

### Task 15：main.py 重写

**关键点：**

1. 使用 lifespan context manager（不使用已废弃的 `@app.on_event`）
2. 三个模块级全局变量：`_registry`、`_card_store`、`_scheduler`、`_prefs`
3. 删除所有游戏化路由（`/api/game/*`）
4. 新增路由见需求文档第八章

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .runtime.discovery import ModuleRegistry, start_watcher
from .runtime.broadcaster import broadcaster
from .runtime.runner import ModuleRunner
from .runtime.scheduler import ModuleScheduler
from .preferences.engine import PreferenceEngine
from .store.cards import CardStore
from .sdk.types import FeedbackAction

_registry = ModuleRegistry()
_card_store = CardStore()
_prefs = PreferenceEngine()
_scheduler: ModuleScheduler | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    vault_path = _get_vault_path()

    _registry.load_all()
    runner = ModuleRunner(_card_store, _prefs, broadcaster, vault_path)
    _scheduler = ModuleScheduler(runner)
    _scheduler.start(_registry.enabled())
    start_watcher(_registry, lambda reg: _scheduler.reschedule(reg.enabled()))
    _write_sdk_readme()    # 首次启动写入 ~/.abo/sdk/README.md
    yield
    if _scheduler:
        _scheduler.shutdown()


app = FastAPI(title="ABO Backend", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
```

**必须保留的现有路由（勿删除）：**
- `/api/literature/*`（文献库）
- `/api/config`（Vault 路径配置）
- `/ws/claude`（Claude 面板 WebSocket）

### Task 16：Frontend Store 更新

在 `src/core/store.ts` 中**追加**（不替换已有代码），添加：
1. `FeedCard` interface
2. `FeedModule` interface
3. `AboStore` 中追加 feedCards、feedModules、activeModuleFilter、unreadCounts 字段和 actions
4. `create()` 初始值中追加对应字段

**不要动已有的** `config`、`activeTab`、`toast` 相关字段。

### Task 17-20：Feed UI 组件

调用：
```
skill: frontend-design
```

四个组件按顺序实现（有依赖关系）：

#### CardView.tsx

单卡片组件，props：
```typescript
interface Props {
  card: FeedCard;
  focused: boolean;
  onClick: () => void;
  onFeedback: (action: string) => void;
}
```

视觉规范：
- 相关性条：indigo 渐变，`card.score` 驱动宽度
- 操作按钮：S=Bookmark(emerald), X=X(slate), F=Star(amber), D=ChevronDown(indigo)
- focused 状态：`ring-2 ring-indigo-400` 边框
- tags：`bg-slate-100 dark:bg-slate-700` 小徽章

#### Feed.tsx

主 Feed 容器：
- `useEffect` 初始加载：`GET /api/cards?unread_only=true`
- WebSocket 连接：`ws://127.0.0.1:8765/ws/feed`，`new_card` 事件 → `prependCard()`
- 键盘导航：j/k 移动焦点，s/x/f/d 触发 feedback
- 空状态：Inbox 图标 + "今日 Feed 已清空" + 快捷键说明
- `filteredCards()` 根据 `activeModuleFilter` 过滤

#### ModulePanel.tsx

模块管理面板（Settings 风格，而不是 Feed 视图）：
- 初始化：`GET /api/modules` → `setFeedModules()`
- 每个模块行：状态指示点（绿/灰）+ 名称 + 未读数 badge + cron 表达式 + 下次运行时间 + 立即运行按钮
- "+ 新建模块"按钮：显示引导文案（告诉用户用 Claude Code 生成）

#### FeedSidebar.tsx

左侧过滤侧边栏：
- "全部" 按钮（`activeModuleFilter === null`）+ 总未读 badge
- 每个模块按钮 + 各模块未读数
- 宽度：`w-44`，始终可见（不折叠）

### Task 21：MainContent.tsx 双栏布局

`overview` tab 使用两栏布局：

```tsx
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
```

其他 tab 保持单栏，新增所有自动化模块的路由。

### Task 22：SDK README 写入

在 `abo/main.py` 的 lifespan 中调用 `_write_sdk_readme()`：
- 路径：`Path.home() / ".abo" / "sdk" / "README.md"`
- 如果文件已存在则跳过（不覆盖用户修改）
- 内容见需求文档「附录：SDK README」

### Task 23：端到端验收

```bash
# 1. TypeScript 类型检查
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit
# 期望：零错误

# 2. 后端启动
python -m abo.main
# 期望日志：
# [discovery] Loaded: arXiv 论文追踪 (arxiv-tracker)
# [discovery] Loaded: RSS 聚合 (rss-aggregator)
# [discovery] Loaded: 播客摘要 (podcast-digest)
# [discovery] Loaded: 文件夹监控 (folder-monitor)
# [scheduler] Started with 4 module(s)
# INFO: Application startup complete.

# 3. 模块 API
curl http://127.0.0.1:8765/api/modules | python -m json.tool
# 期望：4个模块，各有 id, name, schedule, next_run 字段

# 4. 手动触发 arXiv
curl -X POST http://127.0.0.1:8765/api/modules/arxiv-tracker/run
# 等待 30 秒后检查 cards：
curl http://127.0.0.1:8765/api/cards | python -m json.tool | head -80

# 5. 热加载测试
mkdir -p ~/.abo/modules/test-module
# 写入最小可用模块代码...
# 期望：后端日志出现 "[discovery] Loaded: 测试模块 (test-module)"，无需重启

# 6. 前端验证
npm run dev
# 打开 http://localhost:1420，导航到今日 Tab，验证 Feed UI 正常
```

---

## 编码规范（必须遵守）

### Python

- **Python 3.11+** 语法（`str | None`，`list[str]`，match/case 语法）
- 所有 I/O 操作使用 `async def` + `await`
- 文件写入必须用原子写入（`.tmp` → `os.replace`）
- Frontmatter 写入必须用 `post.metadata.update({})` 而不是 `fm.Post(content=..., **kwargs)`
- 不使用 `@app.on_event`（已废弃），使用 lifespan context manager
- LLM 调用只走 `subprocess claude --print`，禁止 import anthropic / openai
- Claude JSON 解析必须处理 code fence 剥离（`claude_json()` 工具函数已实现）

### TypeScript / React

- 所有 API 调用通过 `src/core/api.ts` 的封装，不直接 `fetch`
- Zustand store 字段只追加，不删除现有有效字段
- 组件命名：PascalCase；文件名与组件名一致
- 图标全部用 Lucide React，禁止用 emoji 作 UI 图标
- 可点击元素：`cursor-pointer` + `transition-colors duration-150`
- Focus ring：`focus-visible:ring-2 focus-visible:ring-indigo-400`
- 深色模式：始终使用 `dark:` 变体，不内联条件样式

### Git

- 每个 Task 完成后 commit（`feat:` / `fix:` / `refactor:` 前缀）
- 直接在 `/Users/huanc/Desktop/ABO/` 操作，禁止 git worktree
- Phase 完成后 push：`git push origin main`
- commit message 格式：`feat(sdk): add Module ABC and types`

---

## 调试指南

遇到问题时调用：
```
skill: superpowers:systematic-debugging
```

常见问题及处理方式：

| 问题 | 诊断方式 | 解决方案 |
|------|---------|---------|
| `claude_json()` 返回空 dict | 打印 `raw` 响应看 fence 格式 | 检查 regex 模式是否匹配 |
| watchdog 不触发 | 检查路径是否存在 | `watch_dir.mkdir(parents=True, exist_ok=True)` |
| APScheduler 时区错误 | 打印 `job.next_run_time` | `AsyncIOScheduler(timezone="Asia/Shanghai")` |
| WebSocket 断连 | 检查 broadcaster `_clients` 列表 | 确保 `unregister` 在 except 中执行 |
| faster-whisper import 报错 | 检查是否安装 | `pip install faster-whisper` |
| frontmatter 写入只有内容没有 metadata | 检查写入方式 | 必须用 `post.metadata.update({})` |
| TypeScript `FeedCard` 类型找不到 | 检查导入路径 | `import { useStore, FeedCard } from "../../core/store"` |

---

## 最终交付检查清单

```
[ ] npx tsc --noEmit 零错误
[ ] python -m abo.main 启动无 ERROR 日志
[ ] GET /api/modules 返回 4 个默认模块
[ ] POST /api/modules/arxiv-tracker/run 触发执行，30s 后 /api/cards 有数据
[ ] ~/.abo/sdk/README.md 已自动生成
[ ] 热加载测试：新增用户模块后无需重启即被发现
[ ] 前端 Feed 双栏布局正常（FeedSidebar + 卡片列表）
[ ] 键盘 j/k/s/x/f/d 操作正常工作
[ ] 反馈操作后 ~/.abo/preferences.json 权重更新
[ ] 深色/浅色模式切换正常
[ ] git log 显示每个 Task 的 commit
[ ] git push origin main 完成
```
