# ABO — Academic Buddy OS
## 完整产品需求与架构说明（重新开发参考文档）

> 本文档综合了全部设计迭代的最终版本，用于从零开始重新实现 ABO。

---

## 目录

1. [产品定位与核心价值](#一产品定位与核心价值)
2. [与竞品的差异化](#二与竞品的差异化)
3. [技术架构总览](#三技术架构总览)
4. [Intelligence Feed 系统（核心）](#四intelligence-feed-系统核心)
5. [功能模块详解](#五功能模块详解)
6. [Vault 目录约定](#六vault-目录约定)
7. [数据层设计](#七数据层设计)
8. [FastAPI 路由设计](#八fastapi-路由设计)
9. [前端架构](#九前端架构)
10. [UI 设计系统](#十ui-设计系统)
11. [关键代码模式](#十一关键代码模式)
12. [开发路线图](#十二开发路线图)
13. [完整依赖清单](#十三完整依赖清单)
14. [文件目录结构](#十四文件目录结构)

---

## 一、产品定位与核心价值

### 一句话定位

> **本地运行的个人情报引擎。** 默认提供实用模板，用 Claude Code 无限扩展，ABO UI 是轻量决策层，每次操作悄悄优化下次推送质量。数据永远在用户自己的机器和 Obsidian Vault 里。

### 目标用户

- 科研工作者（研究生、博士、独立研究者）
- 知识工作者（工程师、作者、独立研究者）
- macOS 用户，已使用或愿意使用 Obsidian

### 核心设计原则

1. **Obsidian 是 Source of Truth**：所有输出写入 Vault，Markdown 格式，ABO 删除后数据完整保留
2. **自动化优先**：能调度的不手动，能后台处理的不阻塞 UI
3. **Claude CLI 是唯一 LLM**：不依赖任何远程 API Key，只用本机已安装的 `claude` CLI
4. **CLI 优先**：所有核心逻辑先实现为 Python 函数，GUI 是调用层
5. **无游戏化**：不做 XP / 精力值 / 技能树，专注实用功能
6. **数据隐私**：所有处理本地完成，不上传用户数据到任何服务器
7. **渐进增强**：每个 Phase 独立交付价值

---

## 二、与竞品的差异化

### ABO vs. Obsidian Claude 插件

| 功能 | Obsidian Claude 插件 | ABO |
|------|---------------------|-----|
| 对话/问答 | ✅ | ✅ (Claude Panel) |
| 手动触发笔记生成 | ✅ | ✅ |
| **定时爬取 arXiv 新论文** | ❌ | ✅ |
| **自动跟踪某领域最新进展** | ❌ | ✅ |
| **一键生成组会 PPT/网页** | ❌ | ✅ |
| **播客本地转录 + 摘要** | ❌ | ✅ |
| **RSS/GitHub Trend 追踪** | ❌ | ✅ |
| **多步骤后台工作流** | ❌ | ✅ |
| **越用越智能的偏好引擎** | ❌ | ✅ |
| **无限扩展（Claude Code 写模块）** | ❌ | ✅ |

### ABO vs. 自配置 Claude Code（openclaw 模式）

openclaw = 原料 + 厨具，你自己做饭
ABO = 厨具 + 基础汤底 + 菜单模板，Claude Code 帮你加菜，每道菜自动越来越合你口味

| 维度 | ABO | 自配置 Claude Code |
|------|-----|------------------|
| 结构化输出 | ✅ Card → Vault frontmatter 自动格式化 | 需自己写解析管道 |
| 越用越聪明 | ✅ 偏好引擎积累，无状态→有记忆 | 每次调用无状态 |
| Push 而非 Pull | ✅ APScheduler 定时推送到 Feed | 需主动跑脚本 |
| 模块热加载 | ✅ 描述需求 → 生成 → 保存 → ABO 自动发现 | 需配 cron + shell + 解析 |
| 本地媒体处理 | ✅ faster-whisper + yt-dlp 已封装 | 需自己组装 |
| 偏好数据积累 | ✅ 不可迁移的用户画像 | 无 |

**真正的护城河**：积累的偏好数据 × 统一模块接口 × Obsidian 原生格式化 × Push 而非 Pull

### ABO vs. Readwise / Feedly AI

| 维度 | ABO | Readwise | Feedly AI | 自建 Claude Code |
|------|-----|---------|-----------|----------------|
| 本地隐私 | ✅ 全本地 | ❌ 云端 | ❌ 云端 | ✅ |
| 自动调度 | ✅ | ❌ | ✅ | 需自己配 |
| 无限扩展 | ✅ Claude Code | ❌ | ❌ | ✅ |
| 越用越聪明 | ✅ 偏好引擎 | 部分 | 部分 | 需自己做 |
| Obsidian 集成 | ✅ 原生 | 部分 | ❌ | 需自己做 |
| 开箱即用 | ✅ 4个模板 | ✅ | ✅ | ❌ 门槛高 |
| 音视频处理 | ✅ 本地 Whisper | ❌ | ❌ | 需自己配 |

---

## 三、技术架构总览

### 技术选型

| 层 | 选择 | 理由 |
|----|------|------|
| App Shell | Tauri 2.x | 轻量原生壳，系统托盘/通知，管理 Python sidecar |
| 前端 | React + TypeScript + Tailwind | 灵活图形库，熟悉生态 |
| 后端 | Python FastAPI | PDF/NLP 生态最成熟，爬虫/调度库丰富 |
| 调度 | APScheduler AsyncIO | 内嵌 Python 调度器，无需额外服务 |
| LLM | `claude` CLI subprocess | 唯一 LLM 后端，无 API Key，本机 Claude Code |
| 数据 | Markdown + YAML frontmatter | Obsidian 原生兼容 |
| 索引 | SQLite FTS5 | 全文搜索，内置 Python |
| 模块发现 | watchdog 目录监控 | 热加载，无需重启 |
| 偏好存储 | JSON 文件 | 用户可直接查看，Claude Code 可直接修改 |
| 前端状态 | Zustand | 轻量全局状态 |
| 画布 | React Flow (`@xyflow/react`) | Idea 工坊 |

### 整体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    Tauri App Shell (macOS)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              React Frontend (TypeScript)             │    │
│  │  NavSidebar │ Feed │ Literature │ Ideas │ Meeting     │    │
│  │             │      │ Health     │ Claude│ Settings    │    │
│  └─────────────────────────┬────────────────────────────┘    │
│                            │ HTTP REST + WebSocket            │
│  ┌─────────────────────────▼────────────────────────────┐    │
│  │           Python Backend (FastAPI :8765)             │    │
│  │                                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │    │
│  │  │  Module      │  │  Preference  │  │  Claude   │  │    │
│  │  │  Runtime     │  │  Engine      │  │  Bridge   │  │    │
│  │  │  (watchdog)  │  │  (JSON)      │  │  (subproc)│  │    │
│  │  └──────┬───────┘  └──────────────┘  └───────────┘  │    │
│  │         │                                            │    │
│  │  ┌──────▼───────┐  ┌──────────┐                     │    │
│  │  │ APScheduler  │  │  SQLite  │                     │    │
│  │  │ (cron jobs)  │  │  FTS5    │                     │    │
│  │  └──────────────┘  └──────────┘                     │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
         │ 写入
┌────────▼────────────────────────────────────────┐
│          Obsidian Vault (Source of Truth)        │
│  Literature/ · Ideas/ · Journal/ · Meetings/    │
│  Podcasts/ · Trends/ · .abo/                    │
└─────────────────────────────────────────────────┘

~/.abo/modules/<name>/  ← Claude Code 生成新模块，ABO 热加载
```

### 后端服务启动方式

```bash
# 独立运行（无需 Tauri）
python -m abo.main                        # FastAPI on :8765
uvicorn abo.main:app --reload --port 8765 # 热重载

# 前端开发
npm run dev                               # Vite dev server :1420

# Tauri 完整开发
npm run tauri dev
```

---

## 四、Intelligence Feed 系统（核心）

这是 ABO 的核心特性，将原来分散的模块（arXiv、RSS、播客等）统一为一个可扩展的信息处理管道。

### 整体数据流

```
模块 fetch() → 原始数据
    → process()（Claude 处理，含偏好画像注入）→ 结构化 Card
    → 写入 Obsidian Vault + WebSocket 推送到 ABO UI Feed
    → 用户操作（保存 S / 跳过 X / 精华 F / 深度 D）
    → on_feedback() → 更新偏好画像 JSON
    → 下次 Claude 调用行为改变（越用越智能）
```

### Python Module Runtime

每个模块存放在 `~/.abo/modules/<name>/__init__.py`，ABO 通过 watchdog 热发现，无需重启：

```python
# ~/.abo/modules/my-module/__init__.py
from abo.sdk import Module, Item, Card, FeedbackAction

class MyModule(Module):
    id       = "my-module"          # 唯一 ID，小写连字符
    name     = "模块名称"
    schedule = "0 8 * * *"          # cron 表达式
    icon     = "rss"                # lucide-react 图标名
    output   = ["obsidian", "ui"]   # 输出目标

    async def fetch(self) -> list[Item]:
        """拉取原始数据"""
        ...

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Claude 处理，prefs 自动注入偏好"""
        ...

    async def on_feedback(self, card_id: str, action: FeedbackAction) -> None:
        """用户操作回调（可选）"""
        pass
```

### SDK 核心类型

```python
# abo/sdk/types.py

@dataclass
class Item:
    id: str
    raw: dict              # 原始数据，模块自定义结构

@dataclass
class Card:
    id: str
    title: str
    summary: str           # Claude 生成的摘要
    score: float           # 相关性评分 0-1（经偏好调整）
    tags: list[str]
    source_url: str
    obsidian_path: str     # 写入 Vault 的相对路径
    module_id: str
    created_at: float      # time.time()
    metadata: dict = field(default_factory=dict)  # YAML frontmatter 附加字段

    def to_dict(self) -> dict: ...

class FeedbackAction(str, Enum):
    SAVE      = "save"      # 保存到 Obsidian
    SKIP      = "skip"      # 跳过，降低同类权重
    STAR      = "star"      # 精华，大幅提升权重
    DEEP_DIVE = "deep_dive" # 触发二次深度分析
```

### SDK 工具函数

```python
# abo/sdk/tools.py
from abo.sdk import claude, claude_json, fetch_rss, download_audio, transcribe

await claude("prompt", prefs=prefs)          # 返回文本，自动注入偏好
await claude_json("prompt", prefs=prefs)     # 返回解析后的 dict
await fetch_rss("https://...")               # feedparser 封装，返回 list[dict]
await download_audio("https://youtube...")   # yt-dlp 封装，返回 Path(mp3)
await transcribe(audio_path)                 # faster-whisper 封装，返回文本
```

### Preference Engine

**存储路径：** `~/.abo/preferences.json`

```json
{
  "global": {
    "summary_language": "zh",
    "detail_level": "medium",
    "max_cards_per_run": 20,
    "score_threshold": 0.4
  },
  "modules": {
    "arxiv-tracker": {
      "liked_topics": ["diffusion models", "RLHF"],
      "disliked_topics": ["graph neural networks"],
      "score_threshold": 0.6
    }
  },
  "feedback_history": [
    {"card_id": "...", "action": "star", "ts": 1234567890}
  ],
  "derived_weights": {
    "diffusion models": 1.4,
    "graph neural networks": 0.3
  }
}
```

**权重更新逻辑：**

| 操作 | 效果 |
|------|------|
| STAR | 所有 tag 权重 × 1.1 |
| SKIP | 主要 tag 权重 × 0.85 |
| SAVE | 所有 tag 权重 × 1.05 |
| DEEP_DIVE | 同 STAR + 触发二次 Claude 深度处理 |

**Prompt 注入格式：**

```
<user_preferences>
  偏好主题（权重高）：{liked_topics}
  不感兴趣（降权）：{disliked_topics}
  历史行为：最近 {n} 次操作中 {star_rate}% 标星
  评分阈值：低于 {threshold} 的内容不推送
</user_preferences>
```

### Module Runtime 内部组件

| 组件 | 职责 |
|------|------|
| `abo/runtime/discovery.py` | watchdog 监控 `~/.abo/modules/`，动态 import，注册到 Registry |
| `abo/runtime/scheduler.py` | APScheduler 包装，每个模块一个 cron job，支持 `run_now()` |
| `abo/runtime/runner.py` | 执行流水线：fetch → process → 写 Vault → 存 SQLite → 广播 |
| `abo/runtime/broadcaster.py` | WebSocket 客户端注册表，`send_card()` 推送到所有连接 |
| `abo/preferences/engine.py` | 加载/保存 JSON，`record_feedback()` 更新权重，`build_prompt_block()` |
| `abo/store/cards.py` | SQLite CRUD，Card 增删查，`unread_counts()` |

### Claude Code 扩展流程

```
用户：在 Claude Code 里描述需求
     "帮我写一个 ABO 模块，追踪 Hacker News 上关于 LLM 的讨论"
         ↓
Claude Code：读取 ~/.abo/sdk/README.md（接口文档）
            生成 ~/.abo/modules/hn-llm-tracker/__init__.py
            实现 fetch()（HN Algolia API）
            实现 process()（Claude 过滤评分）
         ↓
ABO watchdog：检测到新目录
             发送系统通知："发现新模块：HN LLM 追踪"
         ↓
用户：在 ABO 模块面板点击启用
     → 下次调度时自动运行，卡片出现在 Feed
```

---

## 五、功能模块详解

### 模块 1：Today Feed（主界面）

ABO 的默认主界面，展示所有模块推送的卡片流。

**UI 布局：**
```
┌─ 侧边栏 ──┬──────────────── 主 Feed ───────────────────────┐
│           │                                               │
│ 今日      │  ┌─ Card ──────────────────────────────────┐  │
│ arXiv (8) │  │ [相关性 ████████░░ 82%]  arXiv · 2h ago │  │
│ RSS (12)  │  │                                         │  │
│ 播客 (3)  │  │ **Diffusion Models for 3D Generation**  │  │
│           │  │ He et al. · Stanford                    │  │
│ ──────    │  │                                         │  │
│ 模块管理  │  │ 提出了一种基于扩散模型的 3D 内容生成框架，  │  │
│           │  │ 在 ShapeNet 上超越 SOTA 23%。            │  │
│           │  │                                         │  │
│           │  │ #diffusion #3D #generation              │  │
│           │  │                                         │  │
│           │  │ [S 保存] [X 跳过] [★ 精华] [↓ 深度]     │  │
│           │  └─────────────────────────────────────────┘  │
└───────────┴───────────────────────────────────────────────┘
```

**键盘快捷键：**

| 键 | 操作 |
|---|---|
| `S` | 保存到 Obsidian + 更新偏好 |
| `X` | 跳过 + 降低同类权重 |
| `F` | 标星精华 + 大幅提升权重 |
| `D` | 深度分析 → 二次 Claude + 完整 Obsidian 笔记 |
| `J/K` | 上下导航卡片 |
| `O` | 在 Obsidian 打开原文 |

---

### 模块 2：arXiv 追踪器

**解决问题：** 手动追踪领域最新论文耗时，Obsidian 插件无法定时自动拉取。

**功能：**
- 订阅关键词 / arXiv 分类（cs.LG, cs.CV 等）/ 特定作者
- 每日定时爬取（默认 08:00），检查新论文
- Claude 生成中文摘要 + 相关性评分（0-1）+ 核心贡献
- 高相关论文写入 `Literature/`，生成标准 frontmatter 笔记
- APP 内 Feed 展示，可一键深度分析

**数据流：**
```
APScheduler (每天 08:00)
  → arXiv API (export.arxiv.org/api/query)
  → 过滤已见论文 (seen_ids 存 SQLite)
  → Claude batch_call: 摘要 + 相关性评分 JSON
  → 写入 Literature/AuthorYYYY-Title.md
  → WebSocket 推送到 Feed
```

**Vault 笔记格式：**
```markdown
---
abo-type: arxiv-paper
source: arxiv
arxiv-id: 2403.12345
title: "Paper Title"
authors: [Author1, Author2]
year: 2026
tags: [diffusion-model, protein-folding]
relevance-score: 0.87
published: 2026-03-25
contribution: "提出了基于扩散模型的三维分子生成框架"
imported-at: 2026-03-25T08:05:00
---

## AI 摘要

{claude 生成的中文摘要，约 100 字}

## 核心贡献

{一句话核心创新}

## 笔记

（用户手动补充）
```

**订阅配置（存入 `~/.abo/preferences.json` modules 字段）：**
```json
{
  "arxiv-tracker": {
    "keywords": ["diffusion model", "protein structure"],
    "categories": ["cs.LG", "q-bio.BM"],
    "score_threshold": 0.6
  }
}
```

---

### 模块 3：RSS / Newsletter 聚合

**解决问题：** RSS 信息分散，手动整理耗时。

**功能：**
- 配置 RSS URL 列表（技术博客、arXiv weekly digest、YouTube 频道等）
- 每 2 小时检查更新，URL hash 去重
- Claude 按主题聚合提炼（不是逐条摘要，而是主题级别的趋势分析）
- 写入 `Trends/YYYY-MM-DD-digest.md`

---

### 模块 4：YouTube / 播客摘要

**解决问题：** 感兴趣的播客/视频太多听不完，需快速获取核心信息。

**处理流程：**
```
用户提交 RSS/URL（或自动发现订阅更新）
  → yt-dlp 下载仅音频流
  → faster-whisper 本地转录（隐私，无 API 费用）
  → Claude batch_call: 生成结构化摘要
  → 写入 Podcasts/YYYY-MM-DD-EpisodeTitle.md
  → 通知完成
```

**Vault 笔记格式：**
```markdown
---
abo-type: podcast
source-url: https://...
podcast: "播客名"
episode: "集数标题"
duration: "52min"
processed-at: 2026-03-25T10:00:00
tags: [ai, research, tools]
---

## 核心观点（3条）

## 金句摘录

## 与我研究的关联

## 时间戳目录

## 完整转录
（折叠，按需查看）
```

---

### 模块 5：本地文件夹监控

**解决问题：** 下载的 PDF 需要手动导入，希望自动处理。

**功能：**
- watchdog 监控指定目录（如 `~/Downloads`）
- 新 PDF/DOCX 触发处理流程
- Claude 判断内容类型 → 对应模板生成笔记
- 自动写入 `Literature/` 或 `Notes/`，frontmatter 含原文件路径

---

### 模块 6：组会生成器（Meeting Generator）

**解决问题：** 每次组会准备 PPT 耗费大量时间整理笔记。

**功能：**
- 从 Vault 选择文献笔记、想法节点、日记片段作为素材
- 选择模板：组会进展汇报 / 文献分享 / 研究提案
- 点击"生成"：Claude 分析素材 → 结构化大纲 → HTML 或 PPTX
- HTML 版：交互式单页，可直接在浏览器展示
- PPTX 版：标准 PowerPoint，可在 Office/Keynote 打开编辑
- 生成文件保存到 `Meetings/` 目录

**生成流程：**
```
用户选择素材
  → context_builder: 聚合素材内容
  → Claude batch_call: 生成幻灯片大纲 JSON
  → 渲染引擎：
      HTML → Jinja2 模板 + CSS 动画
      PPTX → python-pptx 生成 .pptx 文件
  → 保存到 Meetings/{date}-{title}.{html|pptx}
  → 前端预览 / 一键打开
```

---

### 模块 7：健康管理（Health Dashboard）

**解决问题：** 科研者长期忽视健康，数据应存在自己的 Vault 而非第三方 App。

**功能：**
- 每日打卡：睡眠时长、运动类型+时长、专注番茄钟数、心情（1-5）、水量
- 侧边栏快速录入，5 秒完成打卡
- D3 折线图展示睡眠、运动频率、专注时段周/月变化
- 每次打卡追加到 `Journal/YYYY-MM-DD.md` 的健康区块
- SQLite 辅助存储用于聚合统计

**Journal 健康区块格式：**
```markdown
## 健康记录

| 指标 | 数值 |
|------|------|
| 睡眠 | 7.5h |
| 运动 | 跑步 30min |
| 专注 | 4 个番茄钟 |
| 心情 | 4/5 |
| 水量 | 2.0L |
```

---

### 模块 8：文献库（Literature）

**保留现有功能（Phases 0-4 已实现）：**
- PDF / DOI 导入 → 自动生成结构化笔记
- SQLite FTS5 全文搜索
- 吃透等级（纯进度标记）：收录 → 扫读 → 精读 → 内化 → 融会
- 文献详情面板（Markdown 渲染笔记）
- Obsidian URI 跳转

---

### 模块 9：Claude 面板（Claude Panel）

**保留现有功能（Phases 0-4 已实现）：**
- WebSocket 流式对话
- 自动上下文注入（当前文献、当前模块）
- 快捷指令：总结文献、生成假设、批判分析、研究计划
- Markdown 渲染响应

---

## 六、Vault 目录约定

```
~/Documents/MyVault/              ← Obsidian Vault 根目录
│
├── Literature/                   ← 文献库（arXiv + PDF/DOI 导入 + 文件夹监控）
│   └── AuthorYYYY-ShortTitle.md  # YAML frontmatter: abo-type, source, relevance-score
│
├── Ideas/                        ← 想法与创意（Idea 工坊）
│   ├── canvas-main.json          # React Flow 画布状态
│   └── idea-{uuid}.md            # 每个 Idea 节点详情 + 拆解子任务
│
├── Journal/                      ← 日记（含健康日志）
│   └── YYYY-MM-DD.md             # 每日记录：任务、进展、健康数据
│
├── Meetings/                     ← 组会材料
│   ├── YYYY-MM-DD-weekly.md      # 组会笔记源
│   └── YYYY-MM-DD-weekly.html    # 生成的网页版汇报
│
├── Podcasts/                     ← 播客/YouTube 摘要
│   └── YYYY-MM-DD-EpisodeTitle.md
│
├── Trends/                       ← RSS 聚合 Trend 摘要
│   └── YYYY-MM-DD-digest.md
│
└── .abo/                         ← ABO 私有元数据（Obsidian 排除）
    ├── config.json               # Vault 路径、全局调度配置
    └── logs/                     # 操作日志
```

```
~/.abo/                           ← 用户级 ABO 数据目录
├── preferences.json              # 偏好权重（用户操作历史，越用越准）
├── data/
│   └── cards.db                  # SQLite: cards + feedback 表
├── modules/                      ← 用户自定义模块（Claude Code 生成后放这里）
│   └── <name>/__init__.py        # 实现 Module 接口
└── sdk/
    └── README.md                 # Claude Code 参考文档（首次启动自动生成）
```

---

## 七、数据层设计

### SQLite 表结构（`~/.abo/data/cards.db`）

```sql
CREATE TABLE cards (
    id          TEXT PRIMARY KEY,
    module_id   TEXT NOT NULL,
    title       TEXT NOT NULL,
    summary     TEXT,
    score       REAL,
    tags        TEXT,          -- JSON array
    source_url  TEXT,
    obsidian_path TEXT,
    metadata    TEXT,          -- JSON object
    created_at  REAL,
    read        INTEGER DEFAULT 0,
    feedback    TEXT           -- 'save'|'skip'|'star'|'deep_dive'|NULL
);

CREATE INDEX idx_cards_module ON cards(module_id);
CREATE INDEX idx_cards_unread ON cards(read, created_at DESC);
```

### preferences.json 完整 Schema

```json
{
  "global": {
    "summary_language": "zh",
    "detail_level": "medium",
    "max_cards_per_run": 20,
    "score_threshold": 0.4
  },
  "modules": {
    "<module_id>": {
      "liked_topics": ["..."],
      "disliked_topics": ["..."],
      "score_threshold": 0.6,
      "max_cards_per_run": 10,
      "<module-specific-config>": "..."
    }
  },
  "feedback_history": [
    {"card_id": "...", "action": "star", "ts": 1234567890}
  ],
  "derived_weights": {
    "<tag>": 1.4
  }
}
```

---

## 八、FastAPI 路由设计

```python
# abo/main.py 路由清单

# Feed WebSocket
@app.websocket("/ws/feed")            # 实时推送新 Card

# Cards
GET  /api/cards                       # 列出 cards（支持 module_id, unread_only, limit, offset 参数）
GET  /api/cards/unread-counts         # 每个 module 的未读数量 dict
POST /api/cards/{card_id}/feedback    # body: {"action": "save"|"skip"|"star"|"deep_dive"}

# Modules
GET  /api/modules                     # 列出所有模块 + 调度状态
POST /api/modules/{module_id}/run     # 立即运行指定模块
PATCH /api/modules/{module_id}/toggle # 启用/禁用模块

# Preferences
GET  /api/preferences                 # 读取偏好 JSON
POST /api/preferences                 # 更新偏好 JSON

# Literature（保留现有路由）
GET  /api/literature                  # 文献列表 + FTS
POST /api/literature/import           # PDF/DOI 导入

# Settings
GET  /api/config                      # Vault 路径等配置
POST /api/config                      # 保存配置

# Scheduler Status
GET  /api/scheduler/status            # 调度任务状态列表

# FastAPI lifespan（startup/shutdown）
@asynccontextmanager
async def lifespan(app):
    _registry.load_all()       # 加载 default_modules + ~/.abo/modules/
    runner = ModuleRunner(...)
    _scheduler = ModuleScheduler(runner)
    _scheduler.start(_registry.enabled())
    start_watcher(_registry, on_change)   # watchdog 热加载
    yield
    _scheduler.shutdown()
```

---

## 九、前端架构

### Tab 类型

```typescript
export type ActiveTab =
  | "overview"    // Today Feed（主界面）
  | "literature"  // 文献库
  | "arxiv"       // ArXiv 追踪器
  | "meeting"     // 组会生成器
  | "ideas"       // Idea 工坊
  | "health"      // 健康管理
  | "podcast"     // 播客代听
  | "trends"      // Trend 追踪
  | "claude"      // Claude 面板
  | "settings";   // 设置
```

### Zustand Store 核心字段

```typescript
// src/core/store.ts

interface FeedCard {
  id: string;
  title: string;
  summary: string;
  score: number;           // 0-1
  tags: string[];
  source_url: string;
  obsidian_path: string;
  module_id: string;
  created_at: number;
  read: boolean;
  metadata: Record<string, unknown>;
}

interface FeedModule {
  id: string;
  name: string;
  icon: string;
  schedule: string;
  enabled: boolean;
  next_run: string | null;
}

interface AboStore {
  // 导航
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

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

  // 设置
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;

  // Toast
  toasts: Toast[];
  addToast: (toast: Toast) => void;
  removeToast: (id: string) => void;
}
```

### 前端文件结构

```
src/
├── App.tsx                          # 主布局（NavSidebar + MainContent）
├── core/
│   ├── api.ts                       # fetch 封装 → http://127.0.0.1:8765
│   ├── store.ts                     # Zustand 全局状态
│   └── events.ts                    # 模块间事件总线
│
├── modules/
│   ├── nav/
│   │   └── NavSidebar.tsx           # 导航侧边栏（unread badge、调度状态）
│   ├── MainContent.tsx              # Tab 路由（switch activeTab）
│   │
│   ├── feed/                        # Today Feed（主界面）
│   │   ├── Feed.tsx                 # WebSocket 订阅 + 键盘导航 + 卡片列表
│   │   ├── CardView.tsx             # 单卡片（评分条 + 摘要 + 操作按钮）
│   │   ├── FeedSidebar.tsx          # 按模块过滤 + 未读数量
│   │   └── ModulePanel.tsx          # 模块管理列表（启用/禁用/立即运行）
│   │
│   ├── literature/                  # 文献库（已实现）
│   ├── ideas/                       # Idea 工坊（React Flow，已实现）
│   ├── claude-panel/                # Claude 对话（WebSocket，已实现）
│   ├── arxiv/                       # ArXiv 追踪器 UI
│   ├── meeting/                     # 组会生成器 UI
│   ├── health/                      # 健康管理 UI
│   ├── podcast/                     # 播客代听 UI
│   ├── trends/                      # Trend 追踪 UI
│   └── settings/                    # 设置（Vault 路径、调度、订阅管理）
│
└── components/                      # Toast、Modal、MarkdownRenderer 等通用组件
```

---

## 十、UI 设计系统

### 字体

```css
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Crimson+Pro:wght@400;500;600;700&display=swap');

font-family: 'Crimson Pro', Georgia, serif;       /* 标题 */
font-family: 'Atkinson Hyperlegible', sans-serif; /* 正文 */
```

### 颜色 Tokens

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

### Tailwind 暗色模式

```ts
// tailwind.config.ts
export default { darkMode: 'class' }
// Toggle: document.documentElement.classList.toggle('dark')
```

### 组件规范

| 元素 | Light | Dark |
|------|-------|------|
| 卡片 | `bg-white border border-slate-200` | `bg-slate-900 border border-slate-700` |
| 侧边栏 | `bg-slate-900`（始终深色） | — |
| 正文 | `text-slate-800` | `text-slate-100` |
| 辅助文字 | `text-slate-600` | `text-slate-400` |

### 交互规范

- 所有可点击元素：`cursor-pointer`
- Hover 过渡：`transition-colors duration-150`
- 微交互：150–300ms，仅用 `transform` + `opacity`
- 异步内容用 Skeleton loading
- 图标：Lucide React SVG（**禁止用 emoji 作 UI 图标**）
- Focus ring：`focus-visible:ring-2 focus-visible:ring-indigo-400`

---

## 十一、关键代码模式

### Claude Bridge：两种调用模式

```python
# abo/claude_bridge/runner.py

# 模式 A：流式（WebSocket 推送，Claude 面板实时展示）
async def stream_call(prompt: str, ws: WebSocket):
    process = await asyncio.create_subprocess_exec(
        "claude", "--print", "--output-format", "stream-json", prompt,
        stdout=asyncio.subprocess.PIPE,
    )
    async for line in process.stdout:
        await ws.send_text(line.decode())
    await ws.send_text('{"type":"done"}')
    await process.wait()

# 模式 B：批处理（后端内部调用，返回完整文本）
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
| arXiv 摘要 + 相关性评分 | 批处理 B |
| 组会大纲生成 | 批处理 B |
| 播客摘要生成 | 批处理 B |
| Trend 分析报告 | 批处理 B |
| SDK claude() / claude_json() | 批处理 B |

### APScheduler（嵌入 FastAPI lifespan）

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    _registry.load_all()
    runner = ModuleRunner(_card_store, _prefs, broadcaster, vault_path)
    _scheduler = ModuleScheduler(runner)
    _scheduler.start(_registry.enabled())
    start_watcher(_registry, lambda reg: _scheduler.reschedule(reg.enabled()))
    yield
    if _scheduler:
        _scheduler._scheduler.shutdown(wait=False)

app = FastAPI(title="ABO Backend", version="1.0.0", lifespan=lifespan)
```

### Frontmatter 写入（python-frontmatter 正确用法）

```python
import frontmatter as fm

post = fm.Post(content=f"# {card.title}\n\n{card.summary}\n\n[原文链接]({card.source_url})\n")
post.metadata.update({
    "abo-type": card.module_id,
    "relevance-score": round(card.score, 3),
    "tags": card.tags,
    **card.metadata
})
# 注意：不要用 fm.Post(content=..., **kwargs)，metadata 需通过 .metadata.update() 写入
```

### 原子文件写入

```python
def _atomic_write(path: Path, data: str) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(data, encoding="utf-8")
    os.replace(tmp, path)  # 原子替换，防止写入中断导致文件损坏
```

### Obsidian URI 跳转

```python
vault_name = path_to_vault.name
uri = f"obsidian://open?vault={vault_name}&file={file_path}"
subprocess.run(["open", uri])
```

### watchdog 热加载（模块发现）

```python
# abo/runtime/discovery.py
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class ModuleWatcher(FileSystemEventHandler):
    def on_created(self, event):
        if event.src_path.endswith("__init__.py"):
            self._registry.reload(Path(event.src_path).parent)
            send_notification("发现新模块：" + module.name)

def start_watcher(registry, on_change):
    observer = Observer()
    observer.schedule(ModuleWatcher(registry, on_change),
                      str(Path.home() / ".abo" / "modules"),
                      recursive=True)
    observer.start()
```

---

## 十二、开发路线图

| Phase | 内容 | 状态 |
|-------|------|------|
| 0 | Tauri 骨架 + FastAPI + Vault 配置 + 侧边栏框架 | ✅ 完成 |
| 1 | 精力值系统 + 技能树（旧版游戏化，已废弃） | ✅ 完成（需清理） |
| 2 | 文献引擎 MVP（PDF/DOI 导入、Claude 笔记、FTS） | ✅ 完成 |
| 3 | Claude Panel（WebSocket 流式 + 快捷指令） | ✅ 完成 |
| 4 | React Flow 思维导图 + A+B 撞击 | ✅ 完成 |
| 5 | 移除游戏化 UI，重构为自动化工具框架 | ⬜ 重新开发 |
| 6 | SDK + Module Runtime + Preference Engine + 4 默认模块 | ⬜ 待实现 |
| 7 | Feed UI（FeedSidebar + CardView + ModulePanel） | ⬜ 待实现 |
| 8 | 组会生成器（素材选择 + Claude 大纲 + HTML/PPTX） | ⬜ 待实现 |
| 9 | 健康管理（打卡 + Journal 写入 + D3 趋势图） | ⬜ 待实现 |
| 10 | SDK README + Claude Code 扩展体验完整闭环 | ⬜ 待实现 |

### Phase 5-6 重点（下一步实现）

**Phase 5 — 清理游戏化 UI**
- 删除 `src/modules/sidebar/Sidebar.tsx`、`src/modules/skilltree/SkillTree.tsx`
- 清理 `store.ts` 中的 `GameState`、`EnergyState`、`SkillDef` 等字段
- 重写 `NavSidebar.tsx`：去掉精力值/经验值，加调度状态指示器
- 重写 `Overview/MainContent.tsx`：10 个 Tab，今日 Feed 为主界面

**Phase 6 — Intelligence Feed 完整实现**

按顺序实现以下组件：

1. `abo/sdk/types.py` — Item, Card, FeedbackAction dataclasses
2. `abo/sdk/base.py` — Module ABC（__init_subclass__ 模式设置 output 默认值）
3. `abo/sdk/tools.py` — claude(), claude_json(), fetch_rss(), download_audio(), transcribe()
4. `abo/sdk/__init__.py` — 导出所有公开符号
5. `abo/preferences/engine.py` — PreferenceEngine（加载/保存/更新权重/build_prompt_block）
6. `abo/runtime/broadcaster.py` — WebSocket 客户端注册表 + send_card()
7. `abo/runtime/discovery.py` — 扫描 default_modules + ~/.abo/modules/ + watchdog
8. `abo/runtime/runner.py` — ModuleRunner（fetch → process → 写 Vault → 存 SQLite → 广播）
9. `abo/runtime/scheduler.py` — ModuleScheduler（APScheduler，一个模块一个 job，支持 run_now）
10. `abo/store/cards.py` — SQLite CRUD（cards 表 + feedback + unread_counts）
11. `abo/default_modules/arxiv/__init__.py` — arXiv 追踪器模块
12. `abo/default_modules/rss/__init__.py` — RSS 聚合模块
13. `abo/default_modules/podcast/__init__.py` — 播客摘要模块
14. `abo/default_modules/folder_monitor/__init__.py` — 本地文件夹监控模块
15. `abo/main.py` — 重写（lifespan + /api/cards + /api/modules + /ws/feed 路由）
16. `src/core/store.ts` — 新增 Feed 状态字段
17. `src/modules/feed/CardView.tsx` — 单卡片组件
18. `src/modules/feed/Feed.tsx` — Feed 容器（WebSocket + 键盘导航）
19. `src/modules/feed/ModulePanel.tsx` — 模块管理面板
20. `src/modules/feed/FeedSidebar.tsx` — 按模块过滤侧边栏
21. `src/modules/MainContent.tsx` — 双栏布局（FeedSidebar + Feed）
22. 首次启动写入 `~/.abo/sdk/README.md`

---

## 十三、完整依赖清单

### Python 后端

```
# requirements.txt
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
# sqlite3 内置，无需安装
# 无 Ollama、无 OpenAI、无 Anthropic SDK：所有 LLM 调用走本机 claude CLI subprocess
```

### 前端

```json
{
  "dependencies": {
    "react": "^18",
    "typescript": "^5",
    "zustand": "^4",
    "@xyflow/react": "^12",
    "d3": "^7",
    "tailwindcss": "^3",
    "lucide-react": "^0.400",
    "react-markdown": "^9",
    "remark-gfm": "^4"
  }
}
```

### 构建

- Tauri 2.x
- Vite 5.x
- PyInstaller（Python sidecar 打包）

---

## 十四、文件目录结构

### Python 后端完整结构

```
abo/
├── main.py                    # FastAPI 入口（lifespan + 所有路由）
├── config.py                  # ~/.abo-config.json 读写（vault 路径）
│
├── sdk/                       # 公开 SDK（供模块开发者使用）
│   ├── __init__.py            # 导出: Module, Item, Card, FeedbackAction, claude, claude_json, ...
│   ├── types.py               # Item, Card, FeedbackAction dataclasses
│   ├── base.py                # Module ABC（__init_subclass__ 默认 output）
│   └── tools.py               # claude(), claude_json(), fetch_rss(), download_audio(), transcribe()
│
├── runtime/                   # 模块运行时（内部使用）
│   ├── __init__.py
│   ├── discovery.py           # 扫描模块目录 + watchdog 热加载
│   ├── scheduler.py           # APScheduler 包装（一个模块一个 cron job）
│   ├── runner.py              # 执行流水线：fetch → process → 写 Vault → 存 SQLite → 广播
│   └── broadcaster.py         # WebSocket 客户端注册表
│
├── preferences/
│   ├── __init__.py
│   └── engine.py              # PreferenceEngine（加载/保存/更新权重/build_prompt_block）
│
├── store/
│   ├── __init__.py
│   └── cards.py               # SQLite CRUD（cards + feedback + unread_counts）
│
├── default_modules/            # 四个内置模块
│   ├── __init__.py
│   ├── arxiv/
│   │   └── __init__.py        # arXiv 追踪器
│   ├── rss/
│   │   └── __init__.py        # RSS 聚合
│   ├── podcast/
│   │   └── __init__.py        # 播客摘要（yt-dlp + faster-whisper）
│   └── folder_monitor/
│       └── __init__.py        # 本地文件夹监控
│
├── meeting/
│   ├── generator.py           # Claude 大纲生成
│   ├── html_renderer.py       # Jinja2 → HTML 汇报页
│   └── pptx_renderer.py       # python-pptx → .pptx
│
├── ideas/
│   ├── canvas.py              # React Flow 画布 JSON 读写
│   ├── collider.py            # A+B 撞击
│   └── splitter.py            # Idea 拆解 → 子任务
│
├── health/
│   ├── tracker.py             # 健康打卡记录
│   ├── journal_writer.py      # 写入 Journal markdown
│   └── stats.py               # 聚合统计（周/月）
│
├── literature/
│   ├── importer.py            # PDF / DOI 导入
│   ├── indexer.py             # SQLite FTS5 索引
│   └── digest.py              # 吃透等级状态机
│
├── claude_bridge/
│   ├── runner.py              # subprocess 封装（stream_call / batch_call）
│   └── context_builder.py     # 上下文注入
│
├── vault/
│   ├── reader.py              # frontmatter 读取
│   └── writer.py              # 原子写入 Markdown
│
└── obsidian/
    └── uri.py                 # obsidian:// URI scheme 调用
```

### 前端完整结构

```
src/
├── App.tsx
├── core/
│   ├── api.ts                 # fetch 封装 → http://127.0.0.1:8765
│   ├── store.ts               # Zustand 全局状态
│   └── events.ts              # 事件总线
│
├── modules/
│   ├── nav/NavSidebar.tsx
│   ├── MainContent.tsx
│   ├── feed/
│   │   ├── Feed.tsx
│   │   ├── CardView.tsx
│   │   ├── FeedSidebar.tsx
│   │   └── ModulePanel.tsx
│   ├── literature/Literature.tsx
│   ├── ideas/MindMap.tsx
│   ├── claude-panel/ClaudePanel.tsx
│   ├── arxiv/ArxivTracker.tsx
│   ├── meeting/MeetingGenerator.tsx
│   ├── health/HealthDashboard.tsx
│   ├── podcast/PodcastDigest.tsx
│   ├── trends/TrendTracker.tsx
│   └── settings/Settings.tsx
│
└── components/
    ├── Toast.tsx
    ├── Modal.tsx
    └── MarkdownRenderer.tsx
```

---

## 附录：SDK README（写入 `~/.abo/sdk/README.md`）

供 Claude Code 生成新模块时参考，设计原则：**极度简洁，30 行最小可用模块。**

```markdown
# ABO Module SDK

ABO 自动发现 `~/.abo/modules/<name>/__init__.py` 中的模块。
文件保存后立即热加载，无需重启。

## 最小可用模块（30行）

from abo.sdk import Module, Item, Card, claude_json

class MyModule(Module):
    id       = "my-module"          # 唯一 ID，小写连字符
    name     = "我的模块"
    schedule = "0 8 * * *"         # cron：每天8点
    icon     = "rss"               # lucide-react 图标名
    output   = ["obsidian", "ui"]  # 输出目标

    async def fetch(self) -> list[Item]:
        return [Item(id="unique-id", raw={"title": "...", "url": "..."})]

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
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

## 可用工具

from abo.sdk import claude, claude_json, fetch_rss, download_audio, transcribe

await claude("prompt", prefs=prefs)           # 返回文本
await claude_json("prompt", prefs=prefs)      # 返回解析后的 dict
await fetch_rss("https://...")                # 返回 list[dict]
await download_audio("https://youtube...")    # 返回 Path (mp3)
await transcribe(audio_path)                  # 返回转录文本

## 调度示例

"0 8 * * *"      每天 08:00
"0 */2 * * *"    每 2 小时
"*/30 * * * *"   每 30 分钟
"0 7 * * 1"      每周一 07:00

## 输出目标

- "obsidian" — 写入 Vault，路径由 card.obsidian_path 决定
- "ui"       — 推送到 ABO Feed 界面
```
