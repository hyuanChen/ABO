# ABO — Academic Buddy OS
### Obsidian 驱动的研究自动化伴侣 · 本地 Mac 程序设计说明

> 核心理念：做 Obsidian Claude 插件做不到的事情——自动化、调度、多步工作流、外部数据接入。

---

## 一、产品定位

| 维度 | 说明 |
|------|------|
| 用户 | 科研工作者（研究生、博士、独立研究者） |
| 平台 | macOS 本地程序，支持离线核心功能 |
| 数据主权 | 全部数据以 Markdown 存入 Obsidian Vault，ABO 删除后数据完好 |
| 核心差异 | **自动化调度** + **外部数据接入** + **多步 AI 工作流**，补充 Obsidian 插件无法完成的事 |

### 与 Obsidian Claude 插件的边界

| 功能 | Obsidian Claude 插件 | ABO |
|------|---------------------|-----|
| 对话/问答 | ✅ | ✅ (Claude Panel) |
| 手动触发笔记生成 | ✅ | ✅ |
| **定时爬取 arXiv 新论文** | ❌ | ✅ |
| **自动跟踪某领域最新进展** | ❌ | ✅ |
| **一键生成组会 PPT/网页** | ❌ | ✅ |
| **Idea 拆解为可执行子任务** | ❌ | ✅ |
| **健康数据追踪 + 图表** | ❌ | ✅ |
| **播客转录 + 摘要** | ❌ | ✅ |
| **小红书/RSS Trend 追踪** | ❌ | ✅ |
| **多步骤后台工作流** | ❌ | ✅ |

---

## 二、技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Tauri App Shell (macOS)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              React Frontend (TypeScript)             │    │
│  │                                                      │    │
│  │  NavSidebar │ ArXiv │ Meeting │ Ideas │ Health       │    │
│  │             │ Podcast│ Trends │ Lit   │ Claude       │    │
│  └─────────────────────────┬────────────────────────────┘    │
│                            │ HTTP REST + WebSocket            │
│  ┌─────────────────────────▼────────────────────────────┐    │
│  │           Python Backend (FastAPI :8765)             │    │
│  │                                                      │    │
│  │  ┌──────────────┐  ┌──────────┐  ┌───────────────┐  │    │
│  │  │  APScheduler │  │ SQLite   │  │ Claude Bridge │  │    │
│  │  │  (定时任务)   │  │ (索引)   │  │ (subprocess)  │  │    │
│  │  └──────┬───────┘  └──────────┘  └───────────────┘  │    │
│  └─────────│────────────────────────────────────────────┘    │
└────────────│─────────────────────────────────────────────────┘
             │ 调度触发
    ┌─────────▼──────────────────────────────────────┐
    │            自动化工作流引擎                       │
    │  arxiv API · RSS · yt-dlp · Whisper · httpx    │
    │  python-pptx · 小红书爬虫 · CrossRef API        │
    └────────────────────────────────────────────────┘
             │ 结果写入
    ┌─────────▼──────────────────────────────────────┐
    │          Obsidian Vault (Source of Truth)       │
    │  Literature/ · Ideas/ · Journal/ · Meeting/    │
    │  Health/ · Podcast/ · Trends/ · .abo/          │
    └────────────────────────────────────────────────┘
```

### 技术选型

| 层 | 选择 | 理由 |
|----|------|------|
| App Shell | Tauri 2.x | 轻量原生壳，系统托盘/通知，管理 Python sidecar |
| 前端 | React + TypeScript + Tailwind | 灵活图形库（React Flow / D3），熟悉生态 |
| 后端 | Python FastAPI | PDF/NLP 生态最成熟，爬虫/调度库丰富 |
| 调度 | APScheduler | 内嵌 Python 调度器，无需额外服务，支持 cron/interval |
| LLM | claude CLI subprocess | 唯一 LLM 后端，无 API Key，本机 Claude Code |
| 数据 | Markdown + YAML frontmatter | Obsidian 原生兼容，数据永久可读 |
| 索引 | SQLite FTS5 | 全文搜索，内置 Python，无额外依赖 |

---

## 三、Vault 目录约定

```
~/Documents/MyVault/              ← Obsidian Vault 根目录
│
├── Literature/                   ← 文献库（ABO 管理 + Obsidian 可直接浏览）
│   └── AuthorYYYY-ShortTitle.md  # YAML frontmatter: title, authors, year, doi, tags
│
├── Ideas/                        ← 想法与创意
│   ├── canvas-main.json          # React Flow 画布状态
│   └── idea-{uuid}.md            # 每个 Idea 节点详情 + 拆解子任务
│
├── Journal/                      ← 日记（含健康日志）
│   └── YYYY-MM-DD.md             # 每日记录：健康数据、工作进展
│
├── Meetings/                     ← 组会材料
│   ├── 2026-03-25-weekly.md      # 组会笔记源
│   └── 2026-03-25-weekly.html    # 生成的网页版汇报
│
├── Podcasts/                     ← 播客摘要
│   └── podcast-episode-title.md
│
├── Trends/                       ← Trend 追踪摘要
│   └── 2026-03-25-trends.md
│
└── .abo/                         ← ABO 私有元数据（Obsidian 排除）
    ├── config.json               # vault 路径、调度配置
    ├── scheduler.json            # 调度任务状态
    ├── literature.db             # SQLite 全文索引
    ├── health.db                 # 健康数据（结构化，同时写 Journal）
    └── logs/                     # 操作日志
```

---

## 四、功能模块详解

---

### 模块 1：ArXiv 追踪器（ArXiv Tracker）

**解决问题**：手动追踪领域最新论文耗时、容易遗漏；Obsidian 插件无法定时自动拉取。

#### 功能
- 订阅关键词 / arXiv 分类（cs.LG, cs.CV 等）/ 特定作者
- 每日定时爬取（默认 06:00），检查新论文
- 对新论文调用 Claude 生成 100 字摘要 + 与订阅关键词的相关性评分
- 高相关论文推送到 `Literature/`，生成标准 frontmatter 笔记
- 在 APP 内显示今日 Feed，可一键导入完整笔记

#### 数据流
```
APScheduler (每天 06:00)
  → arxiv API (http://export.arxiv.org/api/query)
  → 过滤已见论文 (seen_ids 存入 .abo/scheduler.json)
  → Claude batch_call: 生成摘要 + 相关性评分
  → 写入 Literature/{AuthorYYYY}-{Title}.md
  → 通知前端 (WebSocket push)
```

#### Vault 笔记格式
```markdown
---
abo-type: literature
source: arxiv
arxiv-id: 2403.12345
title: "Paper Title"
authors: [Author1, Author2]
year: 2026
tags: [diffusion-model, protein-folding]
relevance-score: 0.87
auto-summary: "本文提出..."
digest-level: 0
imported-at: 2026-03-25T06:05:00
---

## AI 摘要（自动生成）

{claude 生成的 100 字摘要}

## 笔记

（用户手动补充）
```

#### 订阅配置（存入 `.abo/config.json`）
```json
{
  "arxiv_subscriptions": [
    {
      "id": "sub-1",
      "name": "扩散模型",
      "query": "diffusion model protein",
      "categories": ["cs.LG", "q-bio.BM"],
      "schedule": "0 6 * * *",
      "min_relevance": 0.6
    }
  ]
}
```

---

### 模块 2：组会生成器（Meeting Generator）

**解决问题**：每次组会准备 PPT 耗费大量时间整理笔记；Obsidian 插件无法生成可发布的 PPT/网页。

#### 功能
- 从 Vault 中选择文献笔记、想法节点、日记片段作为素材
- 选择模板：组会进展汇报 / 文献分享 / 研究提案
- 点击"生成"：Claude 分析素材 → 生成结构化大纲 → 渲染成 HTML 或 PPTX
- HTML 版：精美交互式单页（可直接在浏览器展示）
- PPTX 版：标准 PowerPoint，可在 Office/Keynote 打开编辑
- 生成文件保存到 `Meetings/` 目录

#### 生成流程
```
用户选择素材（文献/笔记/Idea）
  → context_builder: 聚合素材内容
  → Claude batch_call: 生成幻灯片大纲 JSON
  → 渲染引擎选择：
      HTML → Jinja2 模板 + 自定义 CSS 动画
      PPTX → python-pptx 生成 .pptx 文件
  → 保存到 Meetings/{date}-{title}.{html|pptx}
  → 前端预览 / 一键打开
```

#### PPTX 结构（python-pptx）
```python
# abo/meeting/generator.py
from pptx import Presentation
from pptx.util import Inches, Pt

def generate_pptx(slides: list[SlideContent], output_path: Path):
    prs = Presentation()
    for slide_data in slides:
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = slide_data.title
        slide.placeholders[1].text = slide_data.body
    prs.save(output_path)
```

---

### 模块 3：Idea 工坊（Idea Workshop）

**解决问题**：大想法难以拆解为可执行步骤；创意连接缺乏系统化工具。

#### 功能（基于现有 MindMap 扩展）
- **可视化画布**：React Flow 无限画布，节点类型：Concept / Problem / Hypothesis / Task
- **Idea 拆解**：选中节点 → 点击"AI 拆解" → Claude 生成子任务树 → 自动创建子节点
- **A+B 撞击**：选中两节点 → 生成研究假设（现有功能保留）
- **任务导出**：将 Task 节点导出为 Obsidian 任务列表（`- [ ] task`）写入对应日记

#### Idea 拆解提示词
```
概念/问题：{idea_label}
背景内容：{idea_note_content}

请将这个想法拆解为 3-5 个具体可执行的子任务或子问题。
每个子任务应当：
1. 明确可操作（有具体行动步骤）
2. 独立可完成（不过度依赖其他子任务）
3. 有明确的完成标准

以 JSON 格式返回，字段：title, description, type(task/question/experiment)
```

---

### 模块 4：健康管理（Health Dashboard）

**解决问题**：科研者长期忽视健康，缺乏简单的追踪工具；数据应存在自己的 Vault 中而非第三方 App。

#### 功能
- **每日打卡**：睡眠时长、运动类型+时长、专注时段数量、心情（1-5）、水量
- **快速录入**：侧边栏小组件，5 秒完成今日健康打卡
- **周/月趋势图**：折线图展示睡眠、运动频率、专注时段变化
- **数据写入 Journal**：每次打卡追加到当日 `Journal/YYYY-MM-DD.md` 的健康区块
- **SQLite 辅助**：健康数值写入 `.abo/health.db` 用于聚合统计

#### Journal 健康区块格式
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

### 模块 5：播客代听（Podcast Digest）

**解决问题**：感兴趣的播客太多听不完；需要快速获取核心信息并存入 Vault。

#### 功能
- 输入播客 RSS feed URL 或单集链接（YouTube/Spotify/小宇宙）
- 后台自动下载音频 → Whisper 本地转录 → Claude 生成结构化摘要
- 摘要写入 `Podcasts/{title}.md`，包含：核心观点、金句、与我研究的关联
- 订阅模式：定时检查新集，自动处理

#### 处理流程
```
用户提交 RSS/URL
  → yt-dlp 下载音频（仅音频流）
  → faster-whisper 本地转录（无需 API）
  → Claude batch_call: 生成结构化摘要
  → 写入 Podcasts/{date}-{title}.md
  → 通知完成
```

#### 摘要 Frontmatter
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

## 完整转录

（折叠，按需查看）
```

---

### 模块 6：Trend 追踪（Trend Tracker）

**解决问题**：小红书/Twitter/RSS 的行业 Trend 分散，手动整理耗时；需要每天聚合摘要存入 Vault。

#### 功能
- 配置追踪关键词 + 数据源（RSS feeds / 小红书关键词 / GitHub Trending）
- 每日定时聚合：抓取 → 去重 → Claude 分析趋势 → 生成摘要报告
- 写入 `Trends/YYYY-MM-DD-trends.md`
- 可标记某条内容"值得深入" → 自动创建 Idea 节点

#### 支持数据源（v1）
- 任意 RSS feed（技术博客、arXiv weekly digest、YouTube 频道）
- GitHub Trending（按语言/话题）
- 自定义 HTTP 接口（用户提供爬虫脚本）

#### 小红书（v2，复杂度较高）
- 基于 httpx 模拟请求 + 关键词搜索（需处理反爬）
- 或接入 RSSHub 的小红书源（如有）

---

### 模块 7：文献库（Literature）

**保留现有功能，移除游戏化元素**

- PDF / DOI 导入 → 自动生成结构化笔记
- SQLite FTS5 全文搜索
- 吃透等级（纯进度标记，不与 XP 挂钩）：收录 → 扫读 → 精读 → 内化 → 融会
- 文献详情面板（点击展开，markdown 渲染笔记）
- Obsidian 跳转

---

### 模块 8：Claude 面板（Claude Panel）

**保留现有功能**

- WebSocket 流式对话
- 自动上下文注入（当前文献、当前模块）
- 快捷指令：总结文献、生成假设、批判分析、研究计划
- Markdown 渲染响应

---

## 五、自动化调度引擎

所有定时任务由 Python APScheduler 管理，内嵌在 FastAPI 进程中：

```python
# abo/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()

def setup_scheduler(config: dict):
    # ArXiv 追踪任务
    for sub in config["arxiv_subscriptions"]:
        scheduler.add_job(
            run_arxiv_crawl,
            CronTrigger.from_crontab(sub["schedule"]),
            args=[sub],
            id=f"arxiv-{sub['id']}",
            replace_existing=True,
        )

    # 播客新集检查（每天 07:00）
    scheduler.add_job(
        check_podcast_feeds,
        CronTrigger(hour=7),
        id="podcast-check",
    )

    # Trend 聚合（每天 08:00）
    scheduler.add_job(
        run_trend_aggregation,
        CronTrigger(hour=8),
        id="trend-daily",
    )

    scheduler.start()
```

### 任务状态推送
任务执行状态通过 WebSocket 推送到前端，侧边栏显示运行中的任务：

```
FastAPI startup → scheduler.start()
任务执行中 → WebSocket broadcast {"type": "job_progress", "job_id": "...", "status": "running", "msg": "..."}
任务完成 → WebSocket broadcast {"type": "job_done", "job_id": "...", "result": {...}}
```

---

## 六、Python 后端目录结构

```
abo/
├── main.py                    # FastAPI 入口 + scheduler 启动
├── config.py                  # 配置加载/保存
├── scheduler.py               # APScheduler 配置
│
├── arxiv/
│   ├── crawler.py             # arXiv API 爬取
│   ├── summarizer.py          # Claude 生成摘要 + 相关性评分
│   └── subscription.py        # 订阅配置管理
│
├── meeting/
│   ├── generator.py           # 调用 Claude 生成大纲
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
├── podcast/
│   ├── downloader.py          # yt-dlp 封装
│   ├── transcriber.py         # faster-whisper 转录
│   └── summarizer.py          # Claude 生成摘要
│
├── trends/
│   ├── rss_reader.py          # RSS feed 读取
│   ├── github_trending.py     # GitHub Trending 爬取
│   └── aggregator.py          # Claude 趋势分析 + 写入 Vault
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
    └── uri.py                 # obsidian:// URI scheme
```

---

## 七、前端目录结构

```
src/
├── App.tsx                    # 主布局
├── core/
│   ├── api.ts                 # fetch 封装（HTTP + WebSocket）
│   ├── store.ts               # Zustand 全局状态（无游戏化字段）
│   └── events.ts              # 事件总线
│
├── modules/
│   ├── nav/                   # 导航侧边栏（调度状态、快速健康打卡入口）
│   ├── arxiv/                 # ArXiv 追踪器 UI
│   ├── meeting/               # 组会生成器 UI
│   ├── ideas/                 # Idea 工坊（MindMap + 拆解）
│   ├── health/                # 健康仪表盘
│   ├── podcast/               # 播客代听
│   ├── trends/                # Trend 追踪
│   ├── literature/            # 文献库
│   ├── claude-panel/          # Claude 对话面板
│   └── settings/              # 设置（Vault路径、调度配置、订阅管理）
│
└── components/                # Toast、Modal、MarkdownRenderer 等通用组件
```

---

## 八、关键技术依赖

### Python 后端

| 库 | 用途 |
|----|------|
| `fastapi` + `uvicorn` | HTTP API + WebSocket 服务 |
| `apscheduler` | 定时任务调度 |
| `python-frontmatter` | Markdown YAML frontmatter 读写 |
| `pypdf` / `pdfminer.six` | PDF 文本提取 |
| `httpx` | CrossRef API / arXiv API / HTTP 爬取 |
| `feedparser` | RSS feed 解析 |
| `yt-dlp` | 播客/YouTube 音频下载 |
| `faster-whisper` | 本地语音转录（无需 API） |
| `python-pptx` | PPTX 文件生成 |
| `jinja2` | HTML 汇报页模板渲染 |
| `sqlite3` (内置) | FTS5 全文索引 + 健康数据 |
| `pyyaml` | YAML 配置解析 |

> **LLM**：无第三方 LLM 库，全部通过 `subprocess claude --print` 调用本机 Claude Code CLI。

### 前端

| 库 | 用途 |
|----|------|
| `react` + `typescript` | UI 框架 |
| `zustand` | 轻量全局状态 |
| `@xyflow/react` | Idea 工坊画布 |
| `d3` | 健康趋势图表 |
| `react-markdown` + `remark-gfm` | Markdown 渲染 |
| `tailwindcss` | 样式 |
| `lucide-react` | 图标 |

---

## 九、开发路线图

### Phase 5（当前）：重构为自动化工具
- [ ] 移除游戏化 UI（energy bar、XP、skill tree、achievements、level/title）
- [ ] 重构 NavSidebar：去掉游戏化字段，增加调度状态指示器
- [ ] 重构 Overview → 替换为「今日 Feed」（ArXiv 新论文 + Trend 摘要 + 健康快速打卡）

### Phase 6：ArXiv 追踪器
- [ ] `abo/arxiv/` 模块：arXiv API 爬取 + Claude 摘要 + 相关性评分
- [ ] APScheduler 集成
- [ ] ArXiv UI：订阅管理 + 每日 Feed 展示

### Phase 7：组会生成器
- [ ] `abo/meeting/` 模块：素材选择 + Claude 大纲生成
- [ ] HTML 渲染（复用现有 meeting skill 逻辑）
- [ ] PPTX 生成（python-pptx）
- [ ] Meeting UI

### Phase 8：健康管理
- [ ] `abo/health/` 模块：打卡 + Journal 写入 + SQLite 统计
- [ ] Health UI：打卡表单 + D3 趋势图

### Phase 9：播客代听
- [ ] `abo/podcast/` 模块：yt-dlp + faster-whisper + Claude 摘要
- [ ] Podcast UI：订阅管理 + 处理队列

### Phase 10：Trend 追踪
- [ ] `abo/trends/` 模块：RSS + GitHub Trending + Claude 分析
- [ ] Trends UI：Feed 展示 + 一键创建 Idea

---

## 十、设计原则

1. **Obsidian 是 Source of Truth**：所有输出写入 Vault，Markdown 格式，ABO 删除后数据完整保留。
2. **自动化优先**：能调度的不手动，能后台处理的不阻塞 UI。
3. **Claude CLI 是唯一 LLM**：不依赖任何远程 API Key，只用本机已安装的 claude CLI。
4. **CLI 优先**：所有核心逻辑先实现为 Python 函数/CLI，GUI 是调用层。
5. **渐进增强**：每个 Phase 独立交付价值，不依赖其他 Phase。
6. **无游戏化**：不做 XP / 精力值 / 技能树，专注实用功能。
7. **数据隐私**：所有处理本地完成，不上传用户数据到任何服务器。
