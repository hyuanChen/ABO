# ABO — Agent Boost OS · CLAUDE.md

> 本地个人情报引擎 + 研究者角色成长系统。设计文档见 `DESIGN.md`。
> 开发参考指南见 `ref/` 目录（模块化、渐进式披露）。每次进行大的修改任务完成后记得git commit。

---

## 工作目录规范

**所有代码修改在 `/Users/huanc/Desktop/ABO/` 进行，禁止使用 git worktree。**

```bash
python -m abo.main          # 后端 FastAPI :8765
npm run dev                 # 前端 Vite :1420
npx tsc --noEmit            # 类型检查
npx vite build              # 构建
git push origin main        # 推送
```

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| App Shell | Tauri 2.x |
| Frontend | React + TypeScript + Tailwind + Zustand |
| Backend | Python FastAPI + APScheduler |
| Data | Markdown + YAML frontmatter + SQLite FTS5 + JSON (`~/.abo/`) |
| LLM | `claude --print` (本机 CLI subprocess，无 API Key) |
| Canvas | React Flow (`@xyflow/react`) |

---

## Project Structure

```
ABO/
├── DESIGN.md
├── CLAUDE.md
├── ref/                         # 开发参考指南（模块化，subagent 友好）
│   ├── README.md               # 指南索引 + 使用方法
│   ├── 00-architecture.md      # 技术栈 + 项目结构 + 设计系统
│   ├── 01-module-sdk.md        # Module ABC + Runtime + 新模块编写
│   ├── 02-frontend-patterns.md # React 组件 + Zustand + api.ts 模式
│   ├── 03-profile-gamification.md # 角色主页 + 六维 + 像素小人 + 精力系统
│   ├── 04-feed-system.md       # Intelligence Feed + Card + 反馈
│   ├── 05-literature.md        # 文献库 + Digest + FTS5
│   ├── 06-ideas-mindmap.md     # React Flow + A+B 撞击
│   ├── 07-claude-panel.md      # Claude 面板 + WebSocket 流式
│   ├── 08-pending-features.md  # 待实现功能 spec (health)
│   └── 09-new-feature-checklist.md # 新功能端到端 checklist
├── src/                         # React 前端
│   ├── App.tsx
│   ├── core/
│   │   ├── api.ts               # fetch → http://127.0.0.1:8765
│   │   ├── store.ts             # Zustand (ActiveTab, FeedCard, ProfileStats)
│   │   └── events.ts
│   ├── modules/
│   │   ├── nav/NavSidebar.tsx   # 侧边栏 + 顶部缩略卡
│   │   ├── profile/             # 角色主页（RoleCard, HexagonRadar, SkillGrid, etc.）
│   │   ├── feed/                # Intelligence Feed (CardView, Feed, FeedSidebar, ModulePanel)
│   │   ├── arxiv/               # ArXiv 追踪器
│   │   ├── literature/          # 文献库
│   │   ├── ideas/               # Idea 工坊 (React Flow)
│   │   ├── claude-panel/        # Claude 对话面板
│   │   ├── health/              # 健康管理 (placeholder)
│   │   └── settings/
│   └── components/              # 共享组件
│       ├── Toast.tsx
│       ├── SetupWizard.tsx
│       ├── GamePanel.tsx        # 游戏状态面板
│       ├── KeywordPreferences.tsx # 偏好学习面板
│       ├── ModuleConfigPanel.tsx  # 爬虫模块管理
│       ├── TimelineView.tsx       # 今日时间线
│       ├── RewardNotification.tsx # 奖励通知
│       └── FeedSortControl.tsx    # Feed 排序控制
├── abo/                         # Python 后端
│   ├── main.py                  # FastAPI 入口 + profile router + uvicorn
│   ├── config.py                # ~/.abo-config.json 读写
│   ├── sdk/                     # Module ABC, Item/Card/FeedbackAction, tools
│   ├── runtime/                 # discovery, scheduler, runner, broadcaster
│   ├── default_modules/         # 7个默认模块（见下）
│   ├── preferences/engine.py    # 偏好权重引擎
│   ├── store/cards.py           # SQLite Card CRUD
│   ├── profile/                 # store.py, stats.py, routes.py
│   ├── activity/                # 活动追踪 (timeline.py, models.py)
│   ├── summary/                 # 每日总结 (generator.py, scheduler.py)
│   ├── literature/              # importer, indexer
│   ├── claude_bridge/           # runner.py (stream_call/batch_call)
│   ├── vault/                   # reader.py, writer.py
│   └── obsidian/                # uri.py

**默认模块（7个）:**
- `arxiv-tracker` — 每天 8:00 运行
- `semantic-scholar-tracker` — 每天 10:00 运行
- `xiaohongshu-tracker` — 每天 10:00 运行
- `bilibili-tracker` — 每天 11:00 运行
- `xiaoyuzhou-tracker` — 每天 10:00 运行
- `zhihu-tracker` — 每天 13:00 运行
- `folder-monitor` — 每5分钟运行
└── src-tauri/
```

---

## Architecture Principles

1. **Obsidian 是 Source of Truth** — 产出写入 Vault Markdown
2. **自动化优先** — APScheduler + Module Runtime
3. **Claude CLI 唯一 LLM** — `subprocess claude --print`
4. **模块解耦** — FastAPI 路由隔离，Zustand + 事件总线解耦前端
5. **本地隐私** — 不上传数据

---

## User Experience Principles

1. **Zero-config start** — 新用户无需配置即可看到示例数据
2. **Progressive disclosure** — 功能分层展示，避免信息过载
3. **Immediate feedback** — 所有操作有即时视觉反馈
4. **Graceful degradation** — 部分功能失效时，其他功能正常可用
5. **Smart defaults** — 所有配置项都有基于用户行为的智能默认值

---

## Development Guidelines

### Adding New Features

1. 阅读 `ref/10-user-experience.md` 了解 UX 规范
2. 阅读 `ref/09-new-feature-checklist.md` 按步骤实现
3. 确保新功能有合理的空状态
4. 添加错误边界（Error Boundary）
5. 为新功能添加 Tour Guide 步骤

### Module Development

1. 阅读 `ref/01-module-sdk.md` 了解 SDK
2. 阅读 `ref/11-module-management.md` 了解模块管理规范
3. 确保模块有清晰的配置界面
4. 提供 Cookie/认证验证功能
5. 添加诊断和自助修复功能

---

## Key Patterns

### Claude CLI Bridge
```python
# 流式（WebSocket）
async def stream_call(prompt, ws): ...
# 批处理（返回文本）
async def batch_call(prompt) -> str: ...
```

### Module SDK
```python
from abo.sdk import Module, Item, Card, claude_json, fetch_rss
class MyModule(Module):
    id = "my-module"; name = "..."; schedule = "0 8 * * *"
    async def fetch(self) -> list[Item]: ...
    async def process(self, items, prefs) -> list[Card]: ...
```

### 原子文件写入
```python
tmp = path.with_suffix(".tmp")
tmp.write_text(data, encoding="utf-8")
os.replace(tmp, path)
```

---

## Feature Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 0-4 | 基础骨架 + 文献 + Claude 面板 + Ideas | done |
| 5 | 模块运行时 + Intelligence Feed + 7个爬虫模块 | done |
| 6 | ArXiv 追踪器（后端 + 前端） | done |
| 7 | 社交爬虫（小红书/哔哩哔哩/小宇宙/知乎） | done |
| 8 | 游戏化 + 奖励通知 + 偏好学习 | done |
| 9 | 模块配置面板 + Feed排序控制 | done |
| 10 | 集成测试 + 性能优化 | done |
| 11 | 角色主页（六边形、像素小人、技能节点、SAN值） | done |
| 12 | 今日时间线 + 每日总结（11AM自动生成） | done |
| 13 | 健康管理（打卡 + Journal + D3 图表） | pending |

---

## API Routes

**Feed:** `GET /api/cards` · `GET /api/cards/unread-counts` · `POST /api/cards/{id}/feedback`
**Modules:** `GET /api/modules` · `POST /api/modules/{id}/run` · `PATCH /api/modules/{id}/toggle`
**Profile:** `GET /api/profile` · `GET /api/profile/stats` · `POST /api/profile/identity` · `POST /api/profile/san` · `POST /api/profile/happiness` · `POST /api/profile/energy` · `POST /api/profile/todos` · `POST /api/profile/generate-motto`
**Activity:** `GET /api/timeline/today` · `GET /api/timeline/{date}` · `POST /api/activity/chat`
**Summary:** `GET /api/summary/today/status` · `GET /api/summary/{date}` · `POST /api/summary/generate`
**Config:** `GET /api/config` · `POST /api/config`
**Preferences:** `GET /api/preferences` · `POST /api/preferences`
**Health:** `GET /api/health`
**WebSocket:** `ws://127.0.0.1:8765/ws/feed`

---

## 爬虫开发方案

> 开发优先级：先使用 Playwright 实现，如遇反爬或稳定性问题，再考虑备选方案或者上网搜索。

### 方案一：Playwright + Cookie（首选）

**原理：**
使用 Playwright 模拟浏览器行为，通过 `page.on("response")` 拦截知乎搜索 API 的 XHR 响应，获取结构化 JSON 数据。
