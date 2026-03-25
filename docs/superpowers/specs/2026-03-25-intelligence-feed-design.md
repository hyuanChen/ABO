# ABO Intelligence Feed — Product Design Spec
**Date:** 2026-03-25
**Status:** Approved by user

---

## 核心定位

> **本地运行的个人情报引擎。** 默认提供 4 个实用模板，用 Claude Code 无限扩展，ABO UI 是轻量决策层，每次操作悄悄优化下次推送质量。数据永远在用户自己的机器和 Obsidian Vault 里。

---

## 关键设计决策（用户确认）

| 问题 | 决策 |
|------|------|
| 产品给谁用？ | 从自己用出发，同类知识工作者为主 |
| 如何扩展功能？ | 用户描述需求 → Claude Code 生成 Python 模块 → ABO 自动发现运行 |
| 内容输出到哪？ | 默认写入 Obsidian；ABO UI 提供预览和决策层；模块可声明多个输出目标 |
| 反馈如何影响系统？ | 极简操作（保存/跳过/精华）→ 后台更新偏好画像 → 影响评分和 Claude Prompt |
| 默认模板？ | arXiv 追踪、RSS 聚合、YouTube/播客摘要、本地文件夹监控 |
| 模块架构？ | Python Package Runtime（实现简单接口，热加载） |

---

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      ABO 运行时                          │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ Module        │    │  Preference  │    │  ABO UI   │ │
│  │ Runtime       │───▶│  Engine      │───▶│  Feed     │ │
│  │               │    │              │    │  Reader   │ │
│  │ 发现/调度/     │    │ 偏好画像      │    │           │ │
│  │ 热加载模块    │    │ 注入 Prompt  │    │ 卡片+决策 │ │
│  └──────┬───────┘    └──────────────┘    └─────┬─────┘ │
│         │                    ▲                  │       │
│         ▼                    │ 反馈信号          ▼       │
│  ┌──────────────┐            └──────────  ┌───────────┐ │
│  │ 每个模块      │                         │  Obsidian │ │
│  │ fetch()      │                         │  Vault    │ │
│  │ process()    │────────────────────────▶│  写入 .md │ │
│  │ on_feedback()│                         └───────────┘ │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
         ▲
         │  Claude Code 生成新模块（热加载，无需重启）
  ~/.abo/modules/<name>/
```

**数据流：**
```
模块 fetch() → 原始数据
    → Claude process()（含偏好画像注入）→ 结构化 Card
    → 写入 Obsidian + WebSocket 推送到 ABO UI
    → 用户操作（保存/跳过/标星/深度）
    → on_feedback() → 更新偏好画像 JSON
    → 下次 Claude 调用行为改变
```

---

## 模块接口（Python Package Runtime）

每个模块是 `~/.abo/modules/<name>/` 下的一个 Python 包：

```python
from abo.sdk import Module, Item, Card, FeedbackAction

class MyModule(Module):
    # 元数据
    id       = "my-module"
    name     = "模块名称"
    schedule = "0 8 * * *"        # cron 表达式
    icon     = "rss"              # Lucide 图标名
    output   = ["obsidian", "ui"] # 输出目标

    async def fetch(self) -> list[Item]:
        """拉取原始数据"""
        ...

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Claude 处理，prefs 自动注入"""
        ...

    async def on_feedback(self, card_id: str, action: FeedbackAction):
        """用户操作回调（可选，基类有默认处理）"""
        ...
```

**核心 SDK 类型：**

```python
@dataclass
class Item:
    id: str
    raw: dict          # 原始数据，模块自定义结构

@dataclass
class Card:
    id: str
    title: str
    summary: str       # Claude 生成的摘要
    score: float       # 相关性评分 0-1（经偏好调整）
    tags: list[str]
    source_url: str
    obsidian_path: str # 写入 Vault 的相对路径
    metadata: dict     # YAML frontmatter 附加字段

class FeedbackAction(Enum):
    SAVE      = "save"
    SKIP      = "skip"
    STAR      = "star"
    DEEP_DIVE = "deep_dive"
```

**SDK 工具函数：**

```python
from abo.sdk import claude, fetch_rss, download_audio, transcribe

result = await claude(prompt, prefs=prefs)   # 自动注入偏好
feed   = await fetch_rss(url)               # feedparser 封装
audio  = await download_audio(youtube_url)  # yt-dlp 封装
text   = await transcribe(audio)            # faster-whisper 封装
```

---

## Preference Engine

**存储：** `~/.abo/preferences.json`

```json
{
  "global": {
    "summary_language": "zh",
    "detail_level": "medium",
    "max_cards_per_run": 20
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
| STAR | card 所有 tag 权重 × 1.1 |
| SKIP | card 主要 tag 权重 × 0.85 |
| SAVE | card 所有 tag 权重 × 1.05 |
| DEEP_DIVE | 同 STAR，触发二次 Claude 深度处理 |

**Prompt 注入：**

```
<user_preferences>
  偏好主题（权重高）：{liked_topics}
  不感兴趣（降权）：{disliked_topics}
  历史行为：最近 {n} 次操作中 {star_rate}% 标星
  评分阈值：低于 {threshold} 的内容不推送
</user_preferences>
```

---

## ABO UI 设计

### 主 Feed 视图

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
│ 偏好设置  │  │ 在 ShapeNet 上超越 SOTA 23%。            │  │
│           │  │                                         │  │
│           │  │ #diffusion #3D #generation              │  │
│           │  │                                         │  │
│           │  │ [S 保存] [X 跳过] [★ 精华] [↓ 深度]     │  │
│           │  └─────────────────────────────────────────┘  │
└───────────┴───────────────────────────────────────────────┘
```

### 键盘快捷键

| 键 | 操作 |
|---|---|
| `S` | 保存到 Obsidian + 更新偏好 |
| `X` | 跳过 + 降低同类权重 |
| `F` | 标星精华 + 大幅提升权重 |
| `D` | 深度分析 → 二次 Claude + 完整 Obsidian 笔记 |
| `J/K` | 上下导航卡片 |
| `O` | 在 Obsidian 打开原文 |

### 模块管理面板

```
┌─ 我的模块 ──────────────────────────────────────────────┐
│                                          [+ 新建模块]   │
│ ✓ arXiv 追踪器     上次运行: 08:02  下次: 明日 08:00    │
│ ✓ RSS 聚合         上次运行: 09:15  下次: 1小时后       │
│ ✓ 播客摘要         上次运行: 昨日   下次: 明日 07:00    │
│ ✓ 文件夹监控       实时监控中       ~/Downloads/papers  │
│ ○ HN LLM 追踪     已安装，未启用                        │
└─────────────────────────────────────────────────────────┘
```

点击 **[+ 新建模块]** 显示提示引导用户打开 Claude Code。

---

## 四个默认模板

### A. arXiv 追踪器
- **配置：** 关键词列表、作者列表、最低相关性阈值
- **调度：** 每日 08:00
- **fetch：** arXiv API → 过去 24h 新论文
- **process：** Claude 评分（0-1）+ 中文摘要 + 核心贡献
- **输出：** `Literature/YYYY-MM-DD-arxiv-digest.md` + 每篇单独 `Literature/AuthorYYYY-Title.md`

### B. RSS / Newsletter 聚合
- **配置：** RSS URL 列表，每个 URL 可设置独立权重
- **调度：** 每 2 小时
- **fetch：** feedparser 拉取所有源，URL hash 去重
- **process：** Claude 按主题聚合提炼（不是逐条摘要）
- **输出：** `Trends/YYYY-MM-DD-digest.md`

### C. YouTube / 播客摘要
- **配置：** 频道 URL 或播客 RSS
- **调度：** 检测到新内容时触发
- **fetch：** yt-dlp 下载仅音频流
- **process：** faster-whisper 本地转录 → Claude 结构化摘要 + 时间戳索引
- **输出：** `Podcasts/YYYY-MM-DD-EpisodeTitle.md`（含摘要、关键观点、时间戳目录、原始转录）

### E. 本地文件夹监控
- **配置：** 监控目录路径，文件类型（PDF/DOCX）
- **调度：** watchdog 实时监控，新文件触发
- **fetch：** pypdf 提取文本
- **process：** Claude 判断内容类型 → 对应模板生成摘要
- **输出：** `Literature/` 或 `Notes/`，按内容类型自动分类，frontmatter 含原文件路径

---

## Claude Code 扩展体验

这是产品核心护城河，全流程：

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
用户：在 ABO 点击启用
     → 下次调度时自动运行，卡片出现在 Feed
```

**SDK 文档** `~/.abo/sdk/README.md` 设计原则：极度简洁，30 行最小可用模块，让 Claude Code 能可靠生成。

---

## 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 模块发现 | watchdog 目录监控 | 热加载，无需重启 |
| 调度 | APScheduler AsyncIO | 复用现有 FastAPI |
| 偏好存储 | JSON 文件 | 用户可直接查看，Claude Code 可直接修改 |
| Card 缓存 | SQLite | 快速查询已读/未读/评分 |
| 转录 | faster-whisper（本地） | 隐私，无 API 费用 |
| 实时推送 | FastAPI WebSocket | 模块运行时实时推送卡片到 UI |
| 前端状态 | Zustand | 复用现有 |
| 前端 UI | React + Tailwind + Tauri | 复用现有 |

---

## 竞品对比

| 维度 | ABO | Readwise | Feedly AI | 自建 Claude Code |
|------|-----|---------|-----------|----------------|
| 本地隐私 | ✅ 全本地 | ❌ 云端 | ❌ 云端 | ✅ |
| 自动调度 | ✅ | ❌ | ✅ | 需自己配 |
| 无限扩展 | ✅ Claude Code | ❌ | ❌ | ✅ |
| 越用越聪明 | ✅ 偏好引擎 | 部分 | 部分 | 需自己做 |
| Obsidian 集成 | ✅ 原生 | 部分 | ❌ | 需自己做 |
| 开箱即用 | ✅ 4个模板 | ✅ | ✅ | ❌ 门槛高 |
| 音视频处理 | ✅ 本地 Whisper | ❌ | ❌ | 需自己配 |

**ABO 的独特位置：** 开箱即用的低门槛 × Claude Code 带来的无限天花板 × 全本地隐私 × Obsidian 作为永久知识资产。
