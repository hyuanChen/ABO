# ABO — Academic Buddy OS
### 研究生科研生活伴侣 · 本地 Mac 程序设计说明

> 核心理念：把科研生活变成一场 RPG——你不是在"完成任务"，你是在**升级**。

---

## 一、产品定位

| 维度 | 说明 |
|------|------|
| 用户 | 研究生（理工科为主，兼顾文社科） |
| 平台 | macOS 本地程序，无需联网 |
| 数据主权 | 全部数据存在本地，与 Obsidian Vault 共存 |
| 核心差异 | 游戏化 + 文献智能 + 思维可视化 + Claude Code 集成 |

---

## 二、技术架构

### 整体选型：Tauri（Shell）+ Python（后端）+ React（前端）

```
┌──────────────────────────────────────────────────────────────┐
│                    Tauri App Shell (macOS)                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                React Frontend (TypeScript)             │  │
│  │                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │  │
│  │  │  Sidebar   │  │  MindMap   │  │  Claude Code     │  │  │
│  │  │  Energy    │  │  A+B       │  │  Panel           │  │  │
│  │  │  SkillTree │  │  Canvas    │  │  (CLI Wrapper)   │  │  │
│  │  └────────────┘  └────────────┘  └──────────────────┘  │  │
│  └─────────────────────────┬──────────────────────────────┘  │
│                            │ HTTP REST + WebSocket            │
│  ┌─────────────────────────▼──────────────────────────────┐  │
│  │              Python Backend (FastAPI)                  │  │
│  │  ┌──────────────┐  ┌──────────┐  ┌─────────────────┐  │  │
│  │  │  Vault I/O   │  │ SQLite   │  │  CLI Bridge     │  │  │
│  │  │  (pathlib)   │  │ (FTS5)   │  │  (subprocess)   │  │  │
│  │  └──────────────┘  └──────────┘  └────────┬────────┘  │  │
│  └──────────────────────────────────────────  │  ─────────┘  │
└──────────────────────────────────────────────  │  ───────────┘
                                                 │
                    ┌────────────────────────────┼────────────┐
                    │        External CLIs        │            │
                    │  ┌─────────────────┐  ┌────▼─────────┐  │
                    │  │  obsidian://    │  │  claude CLI  │  │
                    │  │  URI scheme     │  │  (claude     │  │
                    │  │  + open cmd     │  │   code)      │  │
                    │  └─────────────────┘  └──────────────┘  │
                    └────────────────────────────────────────┘
```

### 为何这样分层

| 层 | 选择 | 理由 |
|----|------|------|
| App Shell | Tauri 2.x | 轻量原生壳，管理 Python 子进程生命周期，提供菜单栏/通知 |
| 前端 | React + TypeScript | 丰富的图形库生态（React Flow / D3.js），熟悉的开发体验 |
| 后端 | Python FastAPI | 开发速度快，PDF/NLP 生态最成熟，后期可换 Rust sidecar |
| 数据访问 | 结构化目录 + pathlib | 无需抽象层，文件夹路径即接口，Obsidian 直接兼容 |
| **LLM** | **claude CLI（本机 Claude Code）** | **唯一 LLM 后端**，无 Ollama/API Key，所有 AI 功能（笔记、撞击、对话）走 subprocess |
| 未来优化 | Rust sidecar | 热路径（PDF 解析、向量检索）瓶颈出现后再迁移 |

### Python 后端作为 Sidecar

Tauri 启动时自动拉起 Python 进程（打包时使用 PyInstaller 独立可执行文件）：

```
Tauri 启动 → spawn python abo_server.py --port 8765
前端请求  → fetch("http://127.0.0.1:8765/api/...")
Tauri 退出 → kill Python 进程
```

开发期间可直接 `python abo_server.py` 独立运行，方便调试。

---

## 三、CLI 优先设计原则

### 核心思想：文件夹结构 = 数据结构

ABO **不依赖数据库作为主要数据源**，所有用户数据以结构化目录 + Markdown 文件存储，Python 直接操作文件系统。

```
~/Documents/MyVault/               ← Obsidian Vault 根目录
│
├── Literature/                    ← 文献库（ABO + Obsidian 双用）
│   ├── 2023/                      # 按年份分组（可选）
│   │   └── Vaswani2017-Attention.md
│   └── _index.md                  # 文献库总览（自动生成）
│
├── Ideas/                         ← Idea 节点
│   ├── idea-20260320-quantum-ml.md
│   └── canvas-main.json           # React Flow 画布状态
│
├── Journal/                       ← 日记/精力记录
│   └── 2026-03-20.md
│
└── .abo/                          ← ABO 私有数据（Obsidian 排除）
    ├── config.json                # 用户配置（vault 路径等）
    ├── game-state.json            # 精力值、XP、技能树
    ├── literature.db              # 全文索引（SQLite）
    └── logs/                      # 操作日志
```

### Python CLI 命令（可独立使用）

所有功能都能通过 CLI 调用，GUI 只是调用这些命令的前端：

```bash
# 文献操作
abo paper import paper.pdf              # 导入 PDF
abo paper import --doi 10.48550/1706   # 从 DOI 导入
abo paper digest Vaswani2017 --level 2 # 升级吃透等级
abo paper search "attention mechanism" # 全文搜索

# Idea 操作
abo idea new "量子计算辅助蛋白折叠"    # 创建 Idea
abo idea collide "扩散模型" "蛋白折叠" # A+B 撞击

# 精力值操作
abo energy log --type rest --min 25   # 记录休息
abo energy status                     # 查看当前精力

# 技能树
abo skill list                        # 列出技能
abo skill xp add critical-reading 40  # 手动加 XP（调试用）

# Obsidian 联动
abo obsidian open Literature/Vaswani2017.md
abo obsidian search "transformer"
```

Python 后端接收前端 HTTP 请求后，本质上是在执行这些相同的操作。

---

## 四、Obsidian 兼容与 CLI 集成

### Obsidian URI Scheme（Python subprocess 调用）

```python
import subprocess

def open_in_obsidian(vault_name: str, file_path: str):
    uri = f"obsidian://open?vault={vault_name}&file={file_path}"
    subprocess.run(["open", uri])  # macOS open 命令

def search_in_obsidian(vault_name: str, query: str):
    uri = f"obsidian://search?vault={vault_name}&query={query}"
    subprocess.run(["open", uri])
```

### Markdown 规范（YAML Frontmatter）

文件本身是标准 Markdown，ABO 通过 frontmatter 存储元数据：

```markdown
---
abo-type: literature
title: "Attention Is All You Need"
authors: [Vaswani, Shazeer, Parmar]
year: 2017
doi: 10.48550/arXiv.1706.03762
digest-level: 3
tags: [transformer, attention, nlp]
abo-skills: [critical-reading, deep-learning]
abo-xp: 120
---

## 核心贡献

## 方法论

## 与我研究的关联

## 金句摘录
```

Python 用 `python-frontmatter` 库解析：

```python
import frontmatter

def read_paper(path: Path) -> dict:
    post = frontmatter.load(path)
    return {"meta": post.metadata, "content": post.content}

def update_digest_level(path: Path, level: int):
    post = frontmatter.load(path)
    post["digest-level"] = level
    frontmatter.dump(post, path)
```

---

## 五、Claude Code 集成（LLM 统一入口）

### 核心设计：claude CLI 是唯一 LLM 后端

ABO **不依赖 Ollama 或任何远程 API**。所有 AI 能力通过本机已安装的 `claude` CLI 调用。Python 后端提供两种调用模式：

```
┌─────────────────────────────────────────────────┐
│              Python claude_bridge/              │
│                                                 │
│  runner.py                                      │
│  ├── stream_call(prompt, ws)  → WebSocket 流式  │
│  └── batch_call(prompt)       → 返回完整字符串   │
│                                                 │
│  context_builder.py                             │
│  └── build_context(vault, current_file, game)  │
└────────────────────┬────────────────────────────┘
                     │ subprocess
              ┌──────▼──────┐
              │  claude CLI  │  (本机 Claude Code)
              └─────────────┘
```

**流式模式**（`stream-json`）：用于前端 Claude Panel，实时展示生成过程。
**批处理模式**（`--print` 纯文本输出）：用于后端内部任务，等待完整结果后写入 Vault。

### 调用场景映射

| 功能 | 调用模式 | 触发时机 |
|------|----------|---------|
| Claude Code 面板对话 | 流式 | 用户发送消息 |
| 文献导入自动生成笔记 | 批处理 | `abo paper import` 后 |
| A+B 撞击生成假设 | 批处理 | 用户选中两节点后 |
| Lv.3 AI 问答吃透 | 流式 | 用户发起测试 |
| 查找研究缺口 | 批处理 | 快捷指令触发 |

### AI 面板 UI

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code Panel                                    [─][x] │
├─────────────────────────────────────────────────────────────┤
│  上下文注入（自动）：                                          │
│  ▸ 当前 Vault 路径: ~/Documents/MyVault                      │
│  ▸ 当前文献: Vaswani2017-Attention.md                        │
│  ▸ 精力值: 78/100 · 技能: critical-reading Lv.5             │
├─────────────────────────────────────────────────────────────┤
│  [对话区域 - 流式输出]                                         │
│                                                             │
│  > 帮我分析这篇文献的方法论，并与我现有的研究联系...           │
│                                                             │
│  Claude: 好的，基于 Vaswani et al. (2017) 的方法论...        │
│                                                             │
│  ████████████████░░░░░ 生成中...                            │
├─────────────────────────────────────────────────────────────┤
│  快捷指令：                                                   │
│  [分析当前文献]  [生成摘要笔记]  [A+B 创意撞击]  [自由输入]   │
└─────────────────────────────────────────────────────────────┘
```

### Python 后端：CLI Bridge

```python
# abo/claude_bridge/runner.py
import asyncio
from fastapi import WebSocket

async def stream_call(prompt: str, context: str, websocket: WebSocket):
    """流式模式：通过 WebSocket 实时推送输出（AI 面板）"""
    full_prompt = f"{context}\n\n---\n\n{prompt}"
    process = await asyncio.create_subprocess_exec(
        "claude", "--print", "--output-format", "stream-json", full_prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    async for line in process.stdout:
        await websocket.send_text(line.decode())
    await process.wait()

async def batch_call(prompt: str, context: str = "") -> str:
    """批处理模式：等待完整结果，用于后端内部任务（笔记生成、A+B 撞击）"""
    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", full_prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()
```

### 上下文自动注入

```python
def build_context(vault_path: str, current_file: str | None) -> str:
    ctx_parts = [f"Vault 路径: {vault_path}"]

    if current_file:
        paper_path = Path(vault_path) / current_file
        post = frontmatter.load(paper_path)
        ctx_parts.append(f"当前文献: {post['title']}")
        ctx_parts.append(f"内容摘要:\n{post.content[:2000]}")

    game_state = load_game_state(vault_path)
    ctx_parts.append(f"用户精力值: {game_state['energy']['current']}/100")

    return "\n".join(ctx_parts)
```

### 快捷指令模板

| 按钮 | 实际调用 |
|------|---------|
| 分析当前文献 | `claude --print "请分析以下文献的核心贡献、方法论和局限性：{paper_content}"` |
| 生成摘要笔记 | `claude --print "基于以下内容，生成 Obsidian Markdown 格式的结构化笔记..."` |
| A+B 撞击 | `claude --print "请分析概念A和概念B的深层共性，生成5个研究假设..."` |
| 查找研究缺口 | `claude --print "基于以下文献列表，识别研究空白和潜在创新点..."` |

---

## 六、功能模块详解

---

### 模块 1：文献库"吃透"引擎

#### 吃透等级系统

| 等级 | 名称 | 解锁条件 | XP 奖励 | 精力消耗 |
|------|------|----------|---------|---------|
| Lv.0 | 收录 | 导入 PDF / DOI | 5 | -5 |
| Lv.1 | 扫读 | 标记摘要关键词 | 15 | -8 |
| Lv.2 | 精读 | 完成结构化笔记 | 40 | -20 |
| Lv.3 | 内化 | 通过 AI 问答 | 80 | -15 |
| Lv.4 | 融会 | 建立3条跨文献连接 | 120 | -10 |

#### Python 后端核心逻辑

```python
# abo/literature.py
from pathlib import Path
import subprocess
import frontmatter
import httpx  # 拉取 CrossRef 元数据

class LiteratureEngine:

    def import_pdf(self, pdf_path: Path, vault_path: Path) -> str:
        """PDF → 提取文本 → Claude CLI 生成笔记 → 写入 Vault"""
        # 1. 用 pdfminer / pypdf 提取文本
        text = extract_pdf_text(pdf_path)

        # 2. 调用 claude CLI（批处理模式）生成结构化笔记模板
        prompt = f"请为以下学术论文生成 Obsidian Markdown 格式的结构化笔记，包含：核心贡献、方法论、实验结果、局限性、与我研究的关联：\n\n{text[:6000]}"
        notes = asyncio.run(batch_call(prompt))

        # 3. 写入 Vault，使用约定路径格式
        md_path = vault_path / "Literature" / f"{paper_id}.md"
        write_paper_note(md_path, metadata, notes)

        # 4. 更新 SQLite 全文索引
        self.index_paper(paper_id, text, md_path)

        return paper_id

    def import_doi(self, doi: str, vault_path: Path) -> str:
        """DOI → CrossRef API 拉取元数据 → 创建笔记"""
        meta = httpx.get(f"https://api.crossref.org/works/{doi}").json()
        # ...

    def upgrade_digest(self, paper_id: str, vault_path: Path, target_level: int):
        """升级吃透等级，触发 XP + 精力变化"""
        md_path = self.find_paper(paper_id, vault_path)
        post = frontmatter.load(md_path)
        post["digest-level"] = target_level
        frontmatter.dump(post, md_path)
        # 触发事件：game_engine.award_xp(skill, xp)
```

#### SQLite 全文索引

```python
# 使用 Python 内置 sqlite3，FTS5 扩展
import sqlite3

def setup_db(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts
        USING fts5(paper_id, title, full_text, tokenize='unicode61')
    """)

def search_papers(db_path: Path, query: str) -> list[dict]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT paper_id, title, snippet(papers_fts, 2, '<b>', '</b>', '...', 32) "
        "FROM papers_fts WHERE papers_fts MATCH ? ORDER BY rank",
        (query,)
    ).fetchall()
    return rows
```

---

### 模块 2：Idea 思维导图（A+B 创意引擎）

#### 数据存储：JSON + Markdown 双轨

```
Ideas/
├── canvas-main.json        ← React Flow 画布完整状态（节点坐标、边）
├── canvas-main.md          ← Obsidian Canvas 兼容版（可选）
└── nodes/
    └── idea-{uuid}.md      ← 每个 Idea 节点的详细内容
```

`canvas-main.json` 结构（React Flow 原生格式）：

```json
{
  "nodes": [
    {
      "id": "a1b2c3",
      "type": "concept",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "扩散模型",
        "source": "Literature/Ho2020-DDPM.md",
        "aboType": "concept"
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "a1b2c3",
      "target": "d4e5f6",
      "data": { "relation": "inspires" }
    }
  ]
}
```

#### A+B 撞击后端

```python
# abo/mindmap/collider.py
from abo.claude_bridge.runner import batch_call

async def collide(node_a: str, node_b: str) -> list[str]:
    """调用 claude CLI（批处理）生成创意连接假设，返回 JSON 数组"""
    prompt = f"""
概念A：{node_a}
概念B：{node_b}

请分析这两个概念的深层结构共性，生成3-5个具体的研究假设。
每个假设应当：1）可验证 2）新颖 3）结合两个概念的核心特征
以JSON数组格式返回，每项包含 "hypothesis" 和 "rationale" 字段。
"""
    result = await batch_call(prompt)
    return parse_hypotheses(result)
```

---

### 模块 3：Overview 侧边栏 + 游戏化系统

#### 布局

```
┌──────────────────────────────────────────────────────────────┐
│  侧边栏（240px）         │  主内容区（可切换：文献/导图/Claude）  │
│ ┌────────────────────┐   │                                     │
│ │  角色头像 + 称号    │   │   ┌─────────────────────────────┐  │
│ │  Lv.12 博士候选人  │   │   │                             │  │
│ ├────────────────────┤   │   │    [当前模块内容]            │  │
│ │  ⚡ 精力值          │   │   │                             │  │
│ │  ████████░░ 78/100 │   │   └─────────────────────────────┘  │
│ │  状态：高效模式     │   │                                     │
│ ├────────────────────┤   │                                     │
│ │  今日任务           │   │                                     │
│ │  ✓ 读完 Smith2023  │   │                                     │
│ │  ○ 写实验报告       │   │                                     │
│ │  ○ 组会准备         │   │                                     │
│ ├────────────────────┤   │                                     │
│ │  活跃技能进度       │   │                                     │
│ │  文献阅读 ████ 67% │   │                                     │
│ │  批判思维 ██░░ 34% │   │                                     │
│ ├────────────────────┤   │                                     │
│ │  🏆 最近成就        │   │                                     │
│ │  "初窥门径"         │   │                                     │
│ └────────────────────┘   │                                     │
└──────────────────────────────────────────────────────────────┘
```

---

### 子系统 A：精力值系统

#### 精力值模型

```
基础精力池：100 点/天（可通过技能树升级上限至 150）

消耗（自动计算 or 任务完成时触发）：
  高专注任务（写作、编程、文献精读）：-15/小时
  中等任务（整理笔记、复习）：-8/小时
  轻松任务（浏览、规划）：-3/小时
  文献 AI 测试：-15/次
  开会汇报：-20/次

恢复（手动打卡，CLI or GUI）：
  午休 ≥ 20min   → +20
  运动 ≥ 30min   → +25
  正念冥想       → +15
  睡眠 7-9h      → 恢复满值
  咖啡           → +15 临时（2h 后 -10 反弹）

状态分级与效果：
  80-100  高效模式  → XP 获取 ×1.5
  50-79   正常模式  → XP 获取 ×1.0
  20-49   疲惫模式  → XP 获取 ×0.7，侧边栏高亮提示
  <20     耗尽状态  → 弹出温和提醒，建议休息
```

#### 精力值数据结构（`game-state.json`）

```json
{
  "energy": {
    "current": 78,
    "max": 100,
    "lastUpdated": "2026-03-20T14:30:00",
    "log": [
      { "time": "12:00", "delta": 20, "reason": "午休 25min" },
      { "time": "09:30", "delta": -15, "reason": "文献精读 1h" }
    ]
  }
}
```

---

### 子系统 B：技能树系统

#### 技能树定义（YAML，用户可编辑）

```yaml
# .abo/skill-tree.yaml
skills:
  - id: literature-search
    name: 文献检索
    category: academic-foundation
    max_level: 10
    xp_curve: [100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000, 20000]
    unlocks: []

  - id: critical-reading
    name: 批判性阅读
    category: academic-foundation
    unlocks: [literature-search]   # 需要先解锁父技能
    unlock_condition:
      papers_digested: 10          # 吃透 10 篇文献自动解锁

  - id: idea-generation
    name: 创意联想
    category: creativity
    unlock_condition:
      ab_collisions: 5             # A+B 撞击 5 次解锁

  - id: custom-skill-template      # 用户可添加领域技能
    name: "[自定义]"
    category: domain
```

#### 技能树可视化

- React + D3.js 力导向图 或 固定树状布局（用户可选）
- 已解锁技能：亮色节点 + 进度环
- 未解锁：灰色 + 锁定图标 + 悬停显示解锁条件
- 点击技能：显示历史 XP 记录、关联任务、推荐行动

#### 称号系统

| 称号 | 解锁条件 |
|------|----------|
| "文献猎手" | 吃透 50 篇文献（Lv.2+） |
| "创意连接器" | A+B 撞击 20 次 |
| "深夜代码人" | 连续 7 天有操作记录 |
| "高产学者" | 单月完成 15 个任务 |
| "平衡大师" | 连续 14 天精力值均衡（50-90） |
| "AI 共创者" | 使用 Claude Code 面板 30 次 |

---

## 七、Python 后端目录结构

```
abo/                          ← Python 包
├── main.py                   # FastAPI 入口，路由注册
├── config.py                 # 配置加载（vault 路径、Ollama URL 等）
│
├── vault/
│   ├── reader.py             # frontmatter 读取、路径工具
│   └── writer.py             # 写入 Markdown、创建目录
│
├── literature/
│   ├── importer.py           # PDF / DOI 导入
│   ├── indexer.py            # SQLite FTS 索引
│   ├── searcher.py           # 全文搜索
│   └── digest.py             # 吃透等级状态机
│
├── mindmap/
│   ├── canvas.py             # canvas JSON 读写
│   └── collider.py           # A+B 撞击逻辑
│
├── game/
│   ├── energy.py             # 精力值计算
│   ├── skills.py             # XP / 技能树状态机
│   └── achievements.py       # 成就检查
│
├── claude_bridge/
│   ├── runner.py             # claude CLI subprocess 封装
│   └── context_builder.py    # 上下文自动注入
│
└── obsidian/
    └── uri.py                # obsidian:// 协议调用
```

---

## 八、前端目录结构

```
src/
├── App.tsx                   # 主布局（侧边栏 + 内容区）
├── core/
│   ├── api.ts                # fetch 封装，统一调用 Python 后端
│   ├── store.ts              # Zustand 全局状态
│   └── events.ts             # 模块间事件总线
│
├── modules/
│   ├── sidebar/              # Overview 侧边栏
│   ├── literature/           # 文献吃透引擎 UI
│   ├── mindmap/              # React Flow 画布
│   ├── energy/               # 精力值打卡 UI
│   ├── skilltree/            # 技能树可视化
│   └── claude-panel/         # Claude Code 包装 UI
│       ├── ClaudePanel.tsx
│       ├── ContextBadge.tsx  # 显示自动注入的上下文
│       ├── QuickActions.tsx  # 快捷指令按钮
│       └── StreamOutput.tsx  # WebSocket 流式输出展示
└── components/               # 通用 UI 组件
```

### 扩展接口（每个模块实现）

```typescript
interface AboModule {
  id: string
  name: string
  // 接收游戏事件，决定如何响应
  onEnergyChange?: (current: number, max: number) => void
  onXPGain?: (skill: string, xp: number) => void
  onVaultChange?: (changedPath: string) => void
}
```

---

## 九、关键技术依赖

### Python 后端

| 库 | 用途 |
|----|------|
| `fastapi` + `uvicorn` | HTTP API 服务 |
| `python-frontmatter` | Markdown YAML 读写 |
| `pypdf` / `pdfminer.six` | PDF 文本提取 |
| `httpx` | CrossRef API 元数据拉取 |
| `sqlite3` (内置) | FTS5 全文索引 |
| `sentence-transformers` | 本地语义嵌入（Phase 5） |
| `watchdog` | Vault 文件变化监听 |

> **LLM 依赖**：无第三方 LLM 库，所有 AI 调用通过 `subprocess` 执行本机 `claude` CLI（Claude Code 需已安装并登录）。

### 前端

| 库 | 用途 |
|----|------|
| `react` + `typescript` | UI 框架 |
| `zustand` | 轻量全局状态 |
| `react-flow` | 思维导图画布 |
| `d3` | 技能树 / 引用关系图 |
| `tailwindcss` | 样式 |
| `gray-matter` | 前端 Markdown frontmatter 解析 |
| `xterm.js` | Claude Code 面板终端展示（可选） |

### 打包

| 工具 | 用途 |
|------|------|
| `tauri 2.x` | App 壳，管理 Python sidecar |
| `pyinstaller` | Python 打包为独立可执行文件 |

---

## 十、开发路线图

### Phase 0：骨架搭建（1-2 周）
- [ ] Tauri 项目初始化 + React 前端脚手架
- [ ] FastAPI 基础服务 + Tauri 启动 Python sidecar
- [ ] 配置界面：选择 Obsidian Vault 路径
- [ ] 基础侧边栏布局框架
- [ ] `game-state.json` 读写接口

### Phase 1：游戏化核心（2-3 周）
- [ ] **精力值系统**：打卡 UI + 消耗计算 + 状态分级展示
- [ ] **技能树**：读取 YAML 定义 + D3 可视化 + XP 计算
- [ ] **日记/任务**：今日任务列表 + 完成触发 XP

### Phase 2：文献引擎 MVP（3-4 周）
- [ ] PDF 导入 + pdfminer 文本提取
- [ ] DOI 导入 + CrossRef 元数据
- [ ] 生成结构化笔记（调用 Ollama）
- [ ] 吃透等级 Lv.0-2（收录 + 扫读 + 精读）
- [ ] SQLite FTS 全文搜索

### Phase 3：Claude Code 集成（1-2 周）
- [ ] Python `claude --print` subprocess 封装 + WebSocket 流式
- [ ] 上下文自动注入（当前文献 + 精力状态）
- [ ] 前端 Claude Panel UI + 快捷指令按钮
- [ ] Obsidian URI 跳转

### Phase 4：思维导图（2-3 周）
- [ ] React Flow 无限画布
- [ ] 节点类型：Concept / Paper / Idea / Question
- [ ] A+B 撞击（Ollama 生成假设）
- [ ] canvas.json 持久化

### Phase 5：打磨与扩展（持续）
- [ ] 本地嵌入向量语义搜索
- [ ] 文献引用关系图（D3 力导向）
- [ ] 吃透 Lv.3 AI 问答测试
- [ ] 成就系统完整实现
- [ ] 统计报告自动生成
- [ ] Rust sidecar 性能优化（热路径）

---

## 十一、设计原则

1. **CLI 优先**：所有功能先有 Python CLI，GUI 是 CLI 的展示层。脱离 GUI 也能工作。
2. **Vault 是 Source of Truth**：ABO 删除后，所有笔记数据完好，`game-state.json` 只是锦上添花。
3. **精力值不是惩罚机制**：提示和引导，不强制，不锁功能。
4. **XP 基于行为，不基于时间**：鼓励深度质量，而非刷时长。
5. **模块解耦**：通过 FastAPI 路由隔离后端逻辑，通过事件总线解耦前端模块。
6. **渐进增强**：Phase 0 的骨架就可用，每个 Phase 独立交付价值。
7. **Rust 是退路，不是起点**：性能瓶颈出现时再迁移，不提前优化。
