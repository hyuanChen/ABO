# ABO — Agent Boost OS · DESIGN.md

> 本地运行的个人情报引擎 + 研究者角色成长系统。

---

## 一、产品定位

| 维度 | 说明 |
|------|------|
| 用户 | 科研工作者（研究生、博士、独立研究者） |
| 平台 | macOS 本地程序（Tauri 2.x） |
| 数据主权 | 全部数据以 Markdown 存入 Obsidian Vault + JSON 存入 `~/.abo/`，ABO 删除后数据完好 |
| 核心差异 | **自动化模块运行时** + **Intelligence Feed** + **角色游戏化** + **Claude CLI 唯一 LLM** |

---

## 二、技术架构

```
┌────────────────────────────────────────────────────────────┐
│                  Tauri App Shell (macOS)                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           React Frontend (TypeScript + Tailwind)     │  │
│  │  NavSidebar │ Profile │ Feed │ Literature │ Ideas    │  │
│  │  ArXiv │ Claude │ Meeting │ Health │ Podcast │ Trends│  │
│  └───────────────────────┬──────────────────────────────┘  │
│                          │ HTTP REST + WebSocket :8765      │
│  ┌───────────────────────▼──────────────────────────────┐  │
│  │         Python Backend (FastAPI + APScheduler)       │  │
│  │  ┌──────────┐ ┌────────────┐ ┌────────────────────┐ │  │
│  │  │ Module   │ │ Preference │ │ Claude Bridge      │ │  │
│  │  │ Runtime  │ │ Engine     │ │ (subprocess CLI)   │ │  │
│  │  └────┬─────┘ └────────────┘ └────────────────────┘ │  │
│  │       │ discovery + scheduler + runner + broadcaster │  │
│  └───────│──────────────────────────────────────────────┘  │
└──────────│─────────────────────────────────────────────────┘
           │
  ┌────────▼───────────────────────────────────────┐
  │   ~/.abo/ (JSON persistence)                   │
  │   data/cards.db · preferences.json · profile   │
  │   san_log · energy_memory · daily_todos        │
  └────────────────────────────────────────────────┘
           │
  ┌────────▼───────────────────────────────────────┐
  │   Obsidian Vault (Source of Truth)             │
  │   Literature/ · Ideas/ · Journal/ · Meetings/  │
  │   Podcasts/ · Trends/                          │
  └────────────────────────────────────────────────┘
```

---

## 三、模块运行时（Module Runtime）

ABO 核心是一个可扩展的模块运行时。每个模块实现 `Module` ABC：

```python
class Module(ABC):
    id: str              # 唯一标识
    name: str            # 显示名
    schedule: str        # cron 表达式
    icon: str            # lucide-react 图标名
    output: list[str]    # ["obsidian", "ui"]

    async def fetch(self) -> list[Item]
    async def process(self, items, prefs) -> list[Card]
```

**运行时组件：**

| 组件 | 职责 |
|------|------|
| `abo/runtime/discovery.py` | 扫描 `abo/default_modules/` + `~/.abo/modules/`，watchdog 热加载 |
| `abo/runtime/scheduler.py` | APScheduler 按 cron 调度每个模块 |
| `abo/runtime/runner.py` | fetch → process → 评分过滤 → 写 Vault → 存 SQLite → WebSocket 推送 |
| `abo/runtime/broadcaster.py` | WebSocket 广播 Card 到前端 Feed |
| `abo/preferences/engine.py` | 用户偏好积累，STAR/SAVE/SKIP/DEEP_DIVE 调整 tag 权重 |
| `abo/store/cards.py` | SQLite CRUD，Card 存储 + feedback 记录 |

**内置模块（4个）：**
- `arxiv` — arXiv API 爬取 + Claude 评分摘要
- `rss` — RSS 聚合 + Claude 趋势分析
- `podcast` — yt-dlp + faster-whisper + Claude 摘要
- `folder_monitor` — 监控 ~/Downloads 新 PDF

---

## 四、Intelligence Feed

前端 overview tab 展示所有模块产出的 Card 流：

```
Card = {id, title, summary, score(0-1), tags, source_url,
        obsidian_path, module_id, created_at, metadata}
```

用户操作：SAVE / SKIP / STAR / DEEP_DIVE → 反馈写入 PreferenceEngine → 下次模块运行时 prompt 注入偏好。

---

## 五、角色主页 + 游戏化（Profile）

### 导航结构

```
NavSidebar
├── [顶部缩略卡] 像素小人 + 精力条 + 今日座右铭  → 点击进入 profile
├── MAIN: profile / overview / literature / ideas / claude
├── AUTO: arxiv / meeting / health / podcast / trends
└── settings
```

### Profile 页面区块

1. **角色卡** — 手动填写预期目标 + Claude 每日生成近期画像 + 今日座右铭
2. **今日待办** — 内嵌 to-do，完成率影响精力修正分
3. **六边形雷达图** — JoJo 替身面板风格，E→D→C→B→A 对应 0-19/20-39/40-59/60-79/80-100
4. **技能节点** — 6 维度各 3-5 个里程碑，显示进度百分比
5. **成就徽章** — 跨维度稀有成就横向滚动

### 六维能力

| 维度 | 数据来源 |
|------|---------|
| 研究力 | 文献保存数 + ArXiv star 数 |
| 产出力 | 组会生成次数 + Idea 节点数 |
| 健康力 | 打卡连续天数 + 睡眠均分（待实现） |
| 学习力 | 播客完成数 + Trend deep_dive 数 |
| SAN 值 | 每日手动打分 7 日均值 × 10 |
| 幸福指数 | 主观打分 × 0.6 + 精力均值 × 0.4 |

### 像素小人（4 种状态）

| 状态 | 条件 | 表现 |
|------|------|------|
| 满血 | SAN≥7, 精力≥70% | 昂首挺胸，头顶星星 |
| 疲惫 | SAN≥7, 精力<40% | 打哈欠，冒 zzz |
| 焦虑 | SAN<5, 精力≥60% | 身体抖动，头顶问号 |
| 崩溃 | SAN<5, 精力<40% | 趴在地上 |

后续扩展：Deadline 模式、摸鱼模式

### 精力值（行为推算）

```
精力 = 基础分(睡眠) × 0.6 + 修正分(待办完成率) × 0.4
```
健康模块未实现时基础分默认 70。

### 数据持久化

所有游戏化数据存 `~/.abo/` JSON 文件：
`profile.json` · `daily_motto.json` · `san_log.json` · `happiness_log.json` · `energy_memory.json` · `daily_todos.json` · `skills.json` · `achievements.json` · `stats_cache.json`

---

## 六、其他功能模块

### 文献库（Literature）
PDF/DOI 导入 → Claude 笔记 → SQLite FTS5 全文搜索 → Obsidian 跳转

### Idea 工坊（Ideas）
React Flow 画布 → A+B 撞击 → Claude 拆解子任务

### Claude 面板
WebSocket 流式对话 → 上下文注入 → 快捷指令

### 待实现
- 组会生成器（Claude 大纲 → HTML/PPTX）
- 健康管理（打卡 → Journal → D3 图表）
- 播客代听（yt-dlp → whisper → Claude 摘要）
- Trend 追踪（RSS → Claude 分析）

---

## 七、Vault 目录约定

```
~/Documents/MyVault/
├── Literature/          # AuthorYYYY-ShortTitle.md
├── Ideas/               # canvas-main.json + idea-{uuid}.md
├── Journal/             # YYYY-MM-DD.md
├── Meetings/            # YYYY-MM-DD-title.md/.html
├── Podcasts/            # podcast-episode-title.md
├── Trends/              # YYYY-MM-DD-trends.md
└── .abo/                # ABO 私有元数据
    ├── config.json
    ├── literature.db    # SQLite FTS5
    └── logs/
```

---

## 八、设计原则

1. **Obsidian 是 Source of Truth** — 所有产出写入 Vault Markdown
2. **自动化优先** — 能调度的不手动
3. **Claude CLI 唯一 LLM** — 无 API Key，`subprocess claude --print`
4. **CLI 优先** — Python 函数先行，GUI 是调用层
5. **模块解耦** — FastAPI 路由隔离后端，Zustand + 事件总线解耦前端
6. **本地隐私** — 不上传用户数据
