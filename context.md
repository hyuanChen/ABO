# ABO 开发进度 Context

保存时间：2026-03-24

---

## 当前任务：Phase 0 — 项目骨架搭建

### 已完成

| 步骤 | 状态 | 说明 |
|------|------|------|
| Rust 安装 | ✅ | rustc 1.94.0, cargo 1.94.0 |
| Tauri 2.x + React + TS 脚手架 | ✅ | 在 `.worktrees/phase-0` |
| 前端依赖安装 | ✅ | zustand, @xyflow/react, d3, lucide-react, gray-matter, @types/d3 |
| Tailwind CSS v4 配置 | ✅ | @tailwindcss/vite 插件 + tailwind.config.ts |
| CSS 设计 Token | ✅ | src/index.css — light/dark 变量，符合 CLAUDE.md 规范 |
| Google Fonts | ✅ | Crimson Pro (标题) + Atkinson Hyperlegible (正文) |
| git worktree 初始化 | ✅ | `.worktrees/phase-0` → branch: `feature/phase-0` |

### 待完成

| 步骤 | 状态 | 说明 |
|------|------|------|
| **git commit Task A** | ⏳ | scaffold 文件尚未提交（untracked） |
| **Task B: Python 后端** | ⏳ | abo/ 包 + FastAPI + config + game-state |
| **Task C: 前端实现** | ⏳ | core/, App.tsx, SetupWizard, Sidebar, MainContent, Tauri config |

---

## 文件结构（当前 worktree）

```
.worktrees/phase-0/
├── index.html
├── package.json          ← 含所有前端依赖
├── package-lock.json
├── vite.config.ts        ← tailwindcss() plugin 已加入
├── tailwind.config.ts    ← darkMode: 'class', abo.* 颜色 token
├── tsconfig.json
├── tsconfig.node.json
├── src/
│   ├── App.tsx           ← 仍是 Tauri 默认模板，Task C 会替换
│   ├── main.tsx
│   ├── index.css         ← 设计 token + Google Fonts ✅
│   ├── App.css           ← 默认，Task C 会清空
│   └── assets/
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json   ← 需要 Task C 中添加 beforeDevCommand
│   ├── capabilities/default.json   ← 需要加 dialog 权限
│   └── src/main.rs
└── public/
```

---

## Git 状态（worktree phase-0）

```
 M .gitignore
 D CLAUDE.md          ← worktree 中删除是正常的（主分支有）
 D DESIGN.md          ← 同上
?? .vscode/
?? README.md
?? index.html
?? package-lock.json
?? package.json
?? public/
?? src-tauri/
?? src/
?? tailwind.config.ts
?? tsconfig.json / tsconfig.node.json / vite.config.ts
```

所有 `??` 文件需要 `git add` 后 commit（Task A 的收尾工作）。

---

## Task B 需要创建的文件

```
abo/
├── __init__.py
├── main.py               # FastAPI, CORS (localhost:1420), 路由注册
├── config.py             # ~/.abo-config.json 读写
├── vault/
│   ├── __init__.py
│   ├── reader.py         # frontmatter.load(), path utils
│   └── writer.py         # 创建目录，写 markdown
├── game/
│   ├── __init__.py
│   └── state.py          # game-state.json 默认值 + R/W
└── claude_bridge/
    ├── __init__.py
    └── runner.py         # stream_call + batch_call stubs
requirements.txt
```

FastAPI 路由（Phase 0 scope）：
- `GET  /api/health`
- `GET  /api/config`
- `POST /api/config`  → 创建 .abo/ 目录结构
- `GET  /api/game/state`
- `POST /api/game/state`

---

## Task C 需要创建的文件

```
src/
├── App.tsx               # 替换默认，加载 config → SetupWizard or Layout
├── core/
│   ├── api.ts            # get<T>/post<T> → http://127.0.0.1:8765
│   ├── store.ts          # Zustand store (config, gameState, activeTab, darkMode)
│   └── events.ts         # EventEmitter (energy-change, xp-gain, vault-change)
├── modules/
│   ├── sidebar/
│   │   └── Sidebar.tsx   # 240px, 精力条 + 任务占位 + 技能占位
│   └── MainContent.tsx   # 标签页: 文献库 / 思维导图 / Claude
└── components/
    └── SetupWizard.tsx   # Vault 路径选择 + POST /api/config
```

Tauri 配置修改：
- `src-tauri/tauri.conf.json` → 添加 `beforeDevCommand`
- `src-tauri/capabilities/default.json` → 添加 `dialog:allow-open`

---

## 关键路径

| 目的 | 路径 |
|------|------|
| Worktree (phase-0) | `/Users/huanc/Desktop/ABO/.worktrees/phase-0` |
| 主仓库 | `/Users/huanc/Desktop/ABO` |
| 开发计划文件 | `/Users/huanc/.claude/plans/eager-weaving-naur.md` |
| 内存文件 | `/Users/huanc/.claude/projects/-Users-huanc-Desktop-ABO/memory/MEMORY.md` |

---

## 继续开发的命令

```bash
# 进入 worktree
cd /Users/huanc/Desktop/ABO/.worktrees/phase-0

# 提交 Task A
git add -A
git commit -m "feat(phase-0): scaffold Tauri+React+TS, Tailwind, design tokens"

# 安装 Python 依赖（回到主目录）
cd /Users/huanc/Desktop/ABO/.worktrees/phase-0
pip3 install -r requirements.txt  # 在创建 requirements.txt 之后

# 验证前端
npm run dev  # 需要先 python3 abo/main.py 在另一个终端

# 完整验证
npm run tauri dev
```

---

## 注意事项

- `node_modules/` 在 `.gitignore` 里（需要确认）— rsync 时不知道是否被复制进来了
- Python 3.14 已安装，pip3 可用
- Claude CLI 在 `/opt/homebrew/bin/claude`
- Subagent API 目前 503，需要直接在当前 session 实现
