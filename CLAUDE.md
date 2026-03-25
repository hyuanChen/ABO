# ABO — Academic Buddy OS · CLAUDE.md

> Obsidian 驱动的研究自动化伴侣。设计文档见 `DESIGN.md`。

---

## 工作目录规范（重要）

**所有代码修改必须直接在主目录 `/Users/huanc/Desktop/ABO/` 进行，禁止使用 git worktree。**

- 开发服务器：`cd /Users/huanc/Desktop/ABO && npm run dev`
- 后端：`cd /Users/huanc/Desktop/ABO && python -m abo.main`
- 不得创建新的 worktree（`.worktrees/` 已加入 `.gitignore`）
- 提交和推送直接在主目录操作：`git add / git commit / git push origin main`

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| App Shell | Tauri 2.x | macOS wrapper，管理 Python sidecar 生命周期 |
| Frontend | React + TypeScript + Tailwind | UI 模块 |
| Backend | Python + FastAPI | sidecar 进程，port 8765 |
| Scheduler | APScheduler | 内嵌 Python 调度器，cron/interval 任务 |
| Data | Markdown + YAML frontmatter + SQLite FTS5 | Vault is source of truth |
| LLM | `claude --print` / `--output-format stream-json` | **唯一 LLM 后端**，本机 Claude Code CLI，无 API Key |
| State (frontend) | Zustand | 轻量全局状态 |
| Canvas | React Flow (`@xyflow/react`) | Idea 工坊画布 |

---

## Project Structure

```
ABO/
├── DESIGN.md                  # 完整设计规格（权威来源）
├── CLAUDE.md                  # 本文件
│
├── src/                       # React 前端 (TypeScript)
│   ├── App.tsx                # 主布局
│   ├── core/
│   │   ├── api.ts             # fetch 封装 → http://127.0.0.1:8765
│   │   ├── store.ts           # Zustand 全局状态
│   │   └── events.ts          # 模块间事件总线
│   ├── modules/
│   │   ├── nav/               # 导航侧边栏（调度状态指示器）
│   │   ├── arxiv/             # ArXiv 追踪器 UI
│   │   ├── meeting/           # 组会生成器 UI
│   │   ├── ideas/             # Idea 工坊（React Flow 画布 + AI 拆解）
│   │   ├── health/            # 健康仪表盘（打卡 + D3 趋势图）
│   │   ├── podcast/           # 播客代听（队列 + 进度）
│   │   ├── trends/            # Trend 追踪 Feed
│   │   ├── literature/        # 文献库（PDF/DOI 导入、FTS 搜索）
│   │   ├── claude-panel/      # Claude 对话面板（WebSocket 流式）
│   │   └── settings/          # 设置（Vault 路径、调度配置）
│   └── components/            # Toast、Modal、MarkdownRenderer 等通用组件
│
├── abo/                       # Python 后端包
│   ├── main.py                # FastAPI 入口 + APScheduler 启动
│   ├── config.py              # vault 路径持久化（~/.abo-config.json）
│   ├── scheduler.py           # APScheduler 配置
│   ├── arxiv/                 # arXiv API 爬取 + Claude 摘要 + 订阅管理
│   ├── meeting/               # Claude 大纲生成 + HTML/PPTX 渲染
│   ├── ideas/                 # React Flow 画布 JSON + Idea 拆解
│   ├── health/                # 健康打卡 + Journal 写入 + SQLite 统计
│   ├── podcast/               # yt-dlp 下载 + faster-whisper 转录 + Claude 摘要
│   ├── trends/                # RSS + GitHub Trending + Claude 分析
│   ├── literature/            # PDF/DOI 导入 + SQLite FTS5 索引
│   ├── claude_bridge/         # runner.py (subprocess) + context_builder.py
│   ├── vault/                 # frontmatter 读写（python-frontmatter + pathlib）
│   └── obsidian/              # URI scheme 调用
│
└── src-tauri/                 # Tauri shell
```

### Vault 目录约定

```
~/Documents/MyVault/
├── Literature/
│   └── AuthorYYYY-ShortTitle.md   # YAML frontmatter: abo-type, source, relevance-score
├── Ideas/
│   ├── canvas-main.json           # React Flow 节点/边状态
│   └── idea-{uuid}.md
├── Journal/
│   └── YYYY-MM-DD.md              # 每日记录（含健康数据）
├── Meetings/
│   ├── YYYY-MM-DD-title.md
│   └── YYYY-MM-DD-title.html      # 生成的网页版汇报
├── Podcasts/
│   └── podcast-episode-title.md
├── Trends/
│   └── YYYY-MM-DD-trends.md
└── .abo/                          # ABO 私有元数据（Obsidian 排除）
    ├── config.json
    ├── scheduler.json
    ├── literature.db              # SQLite FTS5
    ├── health.db
    └── logs/
```

---

## Dev Commands

```bash
# 后端（独立运行，无需 Tauri）
python -m abo.main                        # FastAPI on :8765
uvicorn abo.main:app --reload --port 8765 # 热重载模式

# 前端开发
npm run dev                               # Vite dev server :1420

# Tauri 完整开发模式
npm run tauri dev

# 类型检查（提交前必跑）
npx tsc --noEmit

# 打包
npm run tauri build
```

---

## Architecture Principles

1. **Obsidian is Source of Truth**：所有输出写入 Vault Markdown，ABO 删除后数据完好。
2. **自动化优先**：能调度的不手动，能后台处理的不阻塞 UI。
3. **Claude CLI 是唯一 LLM**：不依赖任何远程 API Key，只用本机 `claude` CLI。
4. **CLI 优先**：所有核心逻辑先实现为 Python 函数/CLI，GUI 是调用层。
5. **无文件系统抽象层**：直接用 `pathlib`，不封装虚拟路径。
6. **模块解耦**：FastAPI 路由隔离后端，Zustand + 事件总线解耦前端模块。
7. **Rust 是退路**：热路径瓶颈出现后再迁移。
8. **阶段性开发完成后同步推送 GitHub main 分支**。

---

## Key Patterns

### Python: Claude CLI Bridge

```python
# ── 模式 A：流式（WebSocket 推送，Claude 面板实时展示）──
async def stream_call(prompt: str, ws: WebSocket):
    process = await asyncio.create_subprocess_exec(
        "claude", "--print", "--output-format", "stream-json", prompt,
        stdout=asyncio.subprocess.PIPE,
    )
    async for line in process.stdout:
        await ws.send_text(line.decode())
    await ws.send_text('{"type":"done"}')
    await process.wait()

# ── 模式 B：批处理（后端内部调用，返回完整文本）──
async def batch_call(prompt: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()
```

| 场景 | 模式 |
|------|------|
| Claude 面板（用户可见对话） | 流式 A |
| ArXiv 摘要 + 相关性评分 | 批处理 B |
| 组会大纲生成 | 批处理 B |
| Idea 拆解子任务 | 批处理 B |
| 播客摘要生成 | 批处理 B |
| Trend 分析报告 | 批处理 B |

### Python: APScheduler 定时任务

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()
scheduler.add_job(run_arxiv_crawl, CronTrigger(hour=6), id="arxiv-daily")
scheduler.start()
```

### Python: Frontmatter 读写

```python
import frontmatter
post = frontmatter.load(path)
post["digest-level"] = 3
frontmatter.dump(post, path)
```

### Python: 原子文件写入

```python
def _atomic_write(path: Path, data: str) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(data, encoding="utf-8")
    os.replace(tmp, path)
```

### Python: Obsidian URI

```python
uri = f"obsidian://open?vault={vault_name}&file={file_path}"
subprocess.run(["open", uri])
```

### TypeScript: 后端调用（只走 api.ts）

```typescript
import { api } from "../core/api";
const result = await api.get<{ papers: Paper[] }>("/api/literature");
const updated = await api.post("/api/health/checkin", { sleep: 7.5 });
```

---

## Feature Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Tauri 骨架 + FastAPI + Vault 配置 + 侧边栏框架 | `[x]` |
| 1 | 精力值系统 + 技能树 + 日记/任务（旧版） | `[x]` |
| 2 | 文献引擎 MVP（PDF/DOI 导入、Claude 笔记、FTS） | `[x]` |
| 3 | Claude Code 面板（WebSocket 流式 + 快捷指令） | `[x]` |
| 4 | React Flow 思维导图 + A+B 撞击 | `[x]` |
| 5 | 移除游戏化 UI，重构为自动化工具框架 | `[ ]` |
| 6 | ArXiv 追踪器（定时爬取 + Claude 摘要 + 相关性评分） | `[ ]` |
| 7 | 组会生成器（素材选择 + Claude 大纲 + HTML/PPTX） | `[ ]` |
| 8 | 健康管理（打卡 + Journal 写入 + D3 趋势图） | `[ ]` |
| 9 | 播客代听（yt-dlp + faster-whisper + Claude 摘要） | `[ ]` |
| 10 | Trend 追踪（RSS + GitHub Trending + Claude 分析） | `[ ]` |

---

## UI Design System

### Fonts (Google Fonts)

```css
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Crimson+Pro:wght@400;500;600;700&display=swap');

font-family: 'Crimson Pro', Georgia, serif;       /* 标题 font-heading */
font-family: 'Atkinson Hyperlegible', sans-serif; /* 正文 body */
```

### Color Tokens

```css
:root {
  --bg:          #F8FAFC;
  --surface:     #FFFFFF;
  --surface-2:   #F1F5F9;
  --border:      #E2E8F0;
  --text:        #1E293B;
  --text-muted:  #475569;
  --primary:     #6366F1;
  --primary-dim: #818CF8;
  --cta:         #10B981;
  --danger:      #EF4444;
}
.dark {
  --bg:          #020617;
  --surface:     #0F172A;
  --surface-2:   #1E293B;
  --border:      #334155;
  --text:        #F8FAFC;
  --text-muted:  #94A3B8;
  --primary:     #818CF8;
  --cta:         #22C55E;
}
```

### Tailwind Dark Mode

```ts
// tailwind.config.ts
export default { darkMode: 'class' }
```

Toggle: `document.documentElement.classList.toggle('dark')`

### Component Conventions

| Context | Light | Dark |
|---------|-------|------|
| Card background | `bg-white border border-slate-200` | `bg-slate-900 border border-slate-700` |
| Sidebar bg | `bg-slate-900` (always dark) | — |
| Body text | `text-slate-800` | `text-slate-100` |
| Muted text | `text-slate-600` | `text-slate-400` |

### Interaction Standards

- 所有可点击元素：`cursor-pointer`
- Hover 过渡：`transition-colors duration-150`
- 微交互：150–300ms，仅用 `transform` + `opacity`
- 异步内容用 Skeleton loading（预留空间，防布局跳动）
- 尊重 `prefers-reduced-motion`

### Icon Rule

使用 SVG 图标（Lucide React），**禁止用 emoji 作为 UI 图标**。

### Accessibility Checklist

- [ ] 文字对比度 ≥ 4.5:1（light mode: text-slate-600 最低）
- [ ] 所有表单 input 有 label 或 aria-label
- [ ] 可交互元素有 focus ring：`focus-visible:ring-2 focus-visible:ring-indigo-400`
- [ ] Tab 顺序与视觉顺序一致
- [ ] 图标按钮有 `aria-label`

---

## Key Dependencies

### Python

```
fastapi>=0.115  uvicorn[standard]>=0.34
python-frontmatter>=1.1  pypdf>=5.0  pdfminer.six>=20231228
httpx>=0.28  feedparser  apscheduler
yt-dlp  faster-whisper  python-pptx  jinja2
pyyaml  sqlite3(builtin)
# 无 Ollama 依赖：所有 LLM 调用走本机 claude CLI subprocess
```

### Frontend

```
react  typescript  zustand  @xyflow/react  d3
tailwindcss  lucide-react  react-markdown  remark-gfm
```

### Build

```
tauri@2.x  pyinstaller
```
