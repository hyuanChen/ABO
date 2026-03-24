# ABO — Academic Buddy OS · CLAUDE.md

> 把科研生活变成一场 RPG，本地 Mac 程序。设计文档见 `DESIGN.md`。

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| App Shell | Tauri 2.x | macOS wrapper，管理 Python sidecar 生命周期 |
| Frontend | React + TypeScript + Tailwind | UI 模块 |
| Backend | Python + FastAPI | sidecar 进程，port 8765 |
| Data | Markdown + YAML frontmatter + SQLite FTS5 | Vault is source of truth |
| LLM | `claude --print --output-format stream-json` | **唯一 LLM 后端**，本机 Claude Code CLI；笔记生成、A+B 撞击、AI 面板均走此桥接，无 Ollama 依赖 |
| State (frontend) | Zustand | 轻量全局状态 |
| Canvas | React Flow | 思维导图 |
| Skill tree viz | D3.js | 力导向图 / 树状布局 |

---

## Project Structure

```
ABO/
├── DESIGN.md                  # 完整设计规格（权威来源）
├── CLAUDE.md                  # 本文件
│
├── src/                       # React 前端 (TypeScript)
│   ├── App.tsx                # 主布局（侧边栏 240px + 内容区）
│   ├── core/
│   │   ├── api.ts             # fetch 封装 → http://127.0.0.1:8765
│   │   ├── store.ts           # Zustand 全局状态
│   │   └── events.ts          # 模块间事件总线
│   ├── modules/
│   │   ├── sidebar/           # Overview 侧边栏（精力值、今日任务、技能进度）
│   │   ├── literature/        # 文献吃透引擎 UI
│   │   ├── mindmap/           # React Flow 画布
│   │   ├── energy/            # 精力值打卡 UI
│   │   ├── skilltree/         # 技能树 D3 可视化
│   │   └── claude-panel/      # Claude Code 包装（ClaudePanel / StreamOutput / QuickActions）
│   └── components/            # 通用 UI 组件
│
├── abo/                       # Python 后端包
│   ├── main.py                # FastAPI 入口
│   ├── config.py              # vault 路径、Ollama URL
│   ├── vault/                 # frontmatter 读写（python-frontmatter + pathlib）
│   ├── literature/            # importer / indexer / searcher / digest
│   ├── mindmap/               # canvas JSON 读写 + A+B collider
│   ├── game/                  # energy / skills / achievements
│   ├── claude_bridge/         # runner.py (subprocess) + context_builder.py
│   └── obsidian/              # URI scheme 调用
│
└── src-tauri/                 # Tauri shell
```

### Vault 目录约定

```
~/Documents/MyVault/
├── Literature/
│   └── AuthorYYYY-ShortTitle.md   # YAML frontmatter: abo-type, digest-level, abo-xp
├── Ideas/
│   ├── canvas-main.json           # React Flow 节点/边状态
│   └── nodes/idea-{uuid}.md
├── Journal/
│   └── YYYY-MM-DD.md
└── .abo/                          # ABO 私有数据（gitignore + Obsidian 排除）
    ├── config.json
    ├── game-state.json
    ├── skill-tree.yaml
    ├── literature.db              # SQLite FTS5
    └── logs/
```

---

## Dev Commands

```bash
# 后端（独立运行，无需 Tauri）
cd abo && python main.py              # FastAPI on :8765
uvicorn abo.main:app --reload --port 8765

# 前端开发
npm run dev                           # Vite dev server

# Tauri 完整开发模式
npm run tauri dev

# 打包
npm run tauri build                   # PyInstaller sidecar + Tauri bundle

# CLI 直接调用（调试）
python -m abo.cli paper import paper.pdf
python -m abo.cli energy status
python -m abo.cli skill xp add critical-reading 40
```

---

## Architecture Principles

1. **CLI 优先**：所有功能先有 Python CLI，GUI 是展示层，脱离 GUI 能独立运行。
2. **Vault is Source of Truth**：删除 ABO 后 Markdown 数据完好。SQLite 是索引，不是主存储。
3. **无文件系统抽象层**：直接用 `pathlib`，不封装虚拟路径。
4. **精力值不锁功能**：仅提示引导，不强制。
5. **XP 基于行为不基于时间**：鼓励深度质量。
6. **模块解耦**：FastAPI 路由隔离后端，事件总线解耦前端模块。
7. **Rust 是退路**：热路径（PDF、向量检索）瓶颈出现后再迁移。
8. **阶段性开发结束后**，同步到github仓库

---

## Key Patterns

### Python: Frontmatter 读写

```python
import frontmatter
post = frontmatter.load(path)
post["digest-level"] = 3
frontmatter.dump(post, path)
```

### Python: Claude CLI Bridge

两种调用模式，共用同一个 subprocess 封装：

```python
# ── 模式 A：流式（WebSocket 推送，AI 面板实时展示）──
async def run_claude_stream(prompt: str, ws: WebSocket):
    process = await asyncio.create_subprocess_exec(
        "claude", "--print", "--output-format", "stream-json", prompt,
        stdout=asyncio.subprocess.PIPE,
    )
    async for line in process.stdout:
        await ws.send_text(line.decode())
    await process.wait()

# ── 模式 B：批处理（后端内部调用，返回完整文本）──
async def run_claude_batch(prompt: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()
```

**适用场景**

| 场景 | 模式 |
|------|------|
| Claude Code 面板（用户可见对话） | 流式 A |
| 文献导入时自动生成结构化笔记 | 批处理 B |
| A+B 撞击生成研究假设 | 批处理 B |
| AI 问答吃透测试（Lv.3） | 流式 A |

### Python: Obsidian URI

```python
uri = f"obsidian://open?vault={vault_name}&file={file_path}"
subprocess.run(["open", uri])
```

### TypeScript: Module Interface

```typescript
interface AboModule {
  id: string; name: string
  onEnergyChange?: (current: number, max: number) => void
  onXPGain?: (skill: string, xp: number) => void
  onVaultChange?: (changedPath: string) => void
}
```

---

## Feature Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Tauri 骨架 + FastAPI + Vault 配置 + 侧边栏框架 | `[x]` |
| 1 | 精力值系统 + 技能树 + 日记/任务 | `[x]` |
| 2 | 文献引擎 MVP（PDF/DOI 导入、Claude 笔记、FTS 搜索、Lv.0-4） | `[x]` |
| 3 | Claude Code 面板（WebSocket 流式 + 快捷指令） | `[x]` |
| 4 | React Flow 思维导图 + A+B 撞击 | `[x]` |
| 5 | 语义搜索、引用关系图、成就系统、Rust 优化 | `[ ]` |

---

## UI Design System

### Fonts (Google Fonts)

```css
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Crimson+Pro:wght@400;500;600;700&display=swap');

font-family: 'Crimson Pro', Georgia, serif;    /* 标题 heading */
font-family: 'Atkinson Hyperlegible', sans-serif; /* 正文 body */
```

### Color Tokens

```css
:root {
  /* ── Light Mode ── */
  --bg:          #F8FAFC;   /* slate-50 */
  --surface:     #FFFFFF;
  --surface-2:   #F1F5F9;   /* slate-100 */
  --border:      #E2E8F0;   /* slate-200 */
  --text:        #1E293B;   /* slate-800 */
  --text-muted:  #475569;   /* slate-600 (min for contrast) */
  --primary:     #6366F1;   /* indigo-500 */
  --primary-dim: #818CF8;   /* indigo-400 */
  --cta:         #10B981;   /* emerald-500 */
  --xp:          #F59E0B;   /* amber (XP/成就) */
  --danger:      #EF4444;

  /* ── Dark Mode (OLED) ── */
  --bg-dark:          #020617;   /* slate-950 */
  --surface-dark:     #0F172A;   /* slate-900 */
  --surface-2-dark:   #1E293B;   /* slate-800 */
  --border-dark:      #334155;   /* slate-700 */
  --text-dark:        #F8FAFC;
  --text-muted-dark:  #94A3B8;   /* slate-400 */
  --primary-dark:     #818CF8;   /* brighter on dark bg */
  --cta-dark:         #22C55E;   /* green-500 */
  --xp-dark:          #FBBF24;   /* amber-400 */
}
```

### Tailwind Dark Mode Setup

```ts
// tailwind.config.ts
export default {
  darkMode: 'class',   // 切换 <html class="dark">
  // ...
}
```

Toggle via: `document.documentElement.classList.toggle('dark')`

### Component Conventions

| Context | Light | Dark |
|---------|-------|------|
| Card background | `bg-white border border-slate-200` | `bg-slate-900 border border-slate-700` |
| Sidebar bg | `bg-slate-50` | `bg-slate-950` |
| Body text | `text-slate-800` | `text-slate-100` |
| Muted text | `text-slate-600` | `text-slate-400` |
| Progress bar (精力) | `bg-indigo-500` | `bg-indigo-400` |
| Progress bar (XP) | `bg-amber-500` | `bg-amber-400` |
| Skill locked | `text-slate-400 opacity-50` | `text-slate-600 opacity-40` |
| Glass panel | `bg-white/80 backdrop-blur-sm` | `bg-slate-900/80 backdrop-blur-sm` |

### Interaction Standards

- All clickable elements: `cursor-pointer`
- Transitions: `transition-colors duration-150` (hover) / `duration-300` (panel open/close)
- Micro-interactions: 150–300ms, use `transform` + `opacity` only
- Skeleton loading for async content (reserve space to avoid layout jump)
- Respect `prefers-reduced-motion`: wrap animations in `@media (prefers-reduced-motion: no-preference)`

### Gamification UI Patterns

```
精力值 Progress Bar:
  High (80-100): bg-emerald-500  → "高效模式"
  Normal (50-79): bg-indigo-500  → "正常模式"
  Low (20-49): bg-amber-500      → 侧边栏高亮提示
  Critical (<20): bg-red-500     → 弹出温和提醒

XP 经验条: amber/yellow 系
技能树节点: 已解锁 = 亮色 + 进度环 | 未解锁 = 灰色 + 锁图标
成就 Toast: 右下角，dark:bg-slate-800，light:bg-white，持续 3s
```

### Icon Rule

使用 SVG 图标（Lucide React 或 Heroicons），**禁止用 emoji 作为 UI 图标**。

### Accessibility Checklist

- [ ] 文字对比度 ≥ 4.5:1（light mode: text-slate-600 最低）
- [ ] 所有表单 input 有 label
- [ ] 可交互元素有 focus ring（`focus-visible:ring-2 ring-indigo-500`）
- [ ] Tab 顺序与视觉顺序一致
- [ ] 图标按钮有 `aria-label`

---

## Key Dependencies

### Python

```
fastapi uvicorn python-frontmatter pypdf pdfminer.six
httpx sqlite3(builtin) watchdog sentence-transformers(phase5)
# 无 Ollama 依赖：所有 LLM 调用走本机 claude CLI subprocess
```

### Frontend

```
react typescript zustand react-flow d3 tailwindcss
gray-matter lucide-react
```

### Build

```
tauri@2.x pyinstaller
```
