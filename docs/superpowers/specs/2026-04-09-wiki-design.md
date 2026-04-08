# Wiki 知识库 — 设计文档

> 基于 Obsidian 的双 Wiki 系统：情报库 Wiki + 文献库 Wiki
> 参考 ref/12-LLM-wiki.md 的 LLM Wiki 模式

---

## 核心理念

Wiki 不是 RAG，而是 **持久化的、递增式的知识编译产物**。LLM 自动维护交叉引用、矛盾标记和综合摘要。用户只需投喂源材料和提问，LLM 负责所有簿记工作。

两个 Wiki 共享同一套基础设施，但内容和数据源完全独立：
- **情报库 Wiki** — 从 Intelligence Feed 卡片自动/手动摘录，追踪行业动态、竞品、趋势
- **文献库 Wiki** — 从文献库论文自动/手动摘录，追踪研究主题、方法、关键发现

---

## 三层架构

```
┌─────────────────────────────────────────┐
│  Raw Sources (只读)                      │
│  - 情报库: Feed Cards (SQLite cards.db)  │
│  - 文献库: PDF/Markdown in Literature/   │
└──────────────┬──────────────────────────┘
               │ ingest (Claude 提取+综合)
┌──────────────▼──────────────────────────┐
│  Wiki Layer (LLM 维护)                   │
│  Obsidian Vault: Wiki/Intel/ + Wiki/Lit/ │
│  - index.md (目录+摘要)                   │
│  - entity pages (实体页)                  │
│  - concept pages (概念页)                 │
│  - log.md (操作日志)                      │
└──────────────┬──────────────────────────┘
               │ render
┌──────────────▼──────────────────────────┐
│  UI Layer                                │
│  - 双 Wiki 主页 (左右按钮)               │
│  - 侧边导航树                            │
│  - Markdown 页面渲染                      │
│  - React Flow 脑图                       │
│  - 搜索 + 反向链接                        │
└─────────────────────────────────────────┘
```

---

## Obsidian Vault 结构

```
{vault}/
├── Wiki/
│   ├── Intel/                  # 情报库 Wiki
│   │   ├── index.md            # 分类目录 + 每页摘要
│   │   ├── log.md              # 操作日志 (append-only)
│   │   ├── overview.md         # 全局综述
│   │   ├── entities/           # 实体页 (公司/产品/人物)
│   │   │   └── {slug}.md
│   │   └── concepts/           # 概念页 (趋势/技术/事件)
│   │       └── {slug}.md
│   └── Lit/                    # 文献库 Wiki
│       ├── index.md
│       ├── log.md
│       ├── overview.md
│       ├── papers/             # 单篇论文摘要页
│       │   └── {slug}.md
│       └── topics/             # 主题综合页 (方法/问题/领域)
│           └── {slug}.md
```

### 页面 Frontmatter 规范

```yaml
---
abo_type: wiki
wiki: intel          # intel | lit
category: entity     # entity | concept | paper | topic | overview
title: "页面标题"
created: 2026-04-09
updated: 2026-04-09
tags: [tag1, tag2]
sources:             # 原始来源 ID/URL
  - card:abc123
  - url:https://...
backlinks: []        # 自动维护的反向链接
---

正文内容，使用 [[wikilinks]] 双向链接。

## 来源
- [[Intel/entities/openai]] — 提到的关联实体
- [原文链接](https://...)
```

---

## 后端 API

### 路由 (`abo/wiki/routes.py`)

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/wiki/{wiki_type}/index` | 获取 index (wiki_type: intel/lit) |
| GET | `/api/wiki/{wiki_type}/pages` | 分页列表 + 搜索 |
| GET | `/api/wiki/{wiki_type}/page/{slug}` | 获取单页内容 |
| POST | `/api/wiki/{wiki_type}/page/{slug}` | 创建/更新页面 |
| DELETE | `/api/wiki/{wiki_type}/page/{slug}` | 删除页面 |
| GET | `/api/wiki/{wiki_type}/graph` | 获取脑图数据 (nodes + edges) |
| POST | `/api/wiki/{wiki_type}/ingest` | 从源材料摘录到 wiki |
| POST | `/api/wiki/{wiki_type}/lint` | 健康检查 |
| GET | `/api/wiki/{wiki_type}/backlinks/{slug}` | 获取反向链接 |

### 数据模型

```python
class WikiPage:
    slug: str           # URL-safe identifier
    wiki_type: str      # "intel" | "lit"
    category: str       # "entity" | "concept" | "paper" | "topic" | "overview"
    title: str
    content: str        # Markdown body
    tags: list[str]
    sources: list[str]  # card:id / url:... / paper:id
    backlinks: list[str]  # slugs of pages that link here
    created: str
    updated: str

class WikiGraph:
    nodes: list[dict]   # {id, label, category, size}
    edges: list[dict]   # {source, target, label?}

class IngestRequest:
    source_type: str    # "card" | "url" | "paper" | "text"
    source_id: str      # card ID / URL / paper path
    source_content: str # optional raw text
```

### 后端核心 (`abo/wiki/store.py`)

- 读写 Obsidian Vault 中的 Markdown 文件
- 维护 index.md 和 log.md
- 解析 `[[wikilinks]]` 构建反向链接图
- 提供搜索 (frontmatter tags + 全文)

### 后端 ingest (`abo/wiki/builder.py`)

- `ingest_card(card_id)` — 从 Feed 卡片提取信息，更新/创建 wiki 页面
- `ingest_paper(paper_path)` — 从文献提取信息，更新/创建 wiki 页面
- `ingest_text(text, wiki_type)` — 从自由文本提取信息
- 每次 ingest 调用 Claude: 识别实体/概念 → 更新现有页面或创建新页面 → 更新 index → 写 log

---

## 前端设计

### 页面结构

```
┌────────────────────────────────────────────────────┐
│  Wiki 知识库                              [搜索] [脑图] │
├──────────────┬─────────────────────────────────────┤
│              │                                     │
│  侧边导航树   │     内容区域                          │
│              │                                     │
│  ▼ 情报库     │  ┌─────────────────────────────┐    │
│    概览       │  │  页面标题                     │    │
│    ▼ 实体     │  │  tags: [tag1] [tag2]         │    │
│      OpenAI   │  │                              │    │
│      Google   │  │  Markdown 渲染内容             │    │
│    ▼ 概念     │  │  包含 [[wikilinks]] 可点击     │    │
│      LLM趋势  │  │                              │    │
│              │  │  ## 来源                       │    │
│  ▼ 文献库     │  │  - [原文链接]                  │    │
│    概览       │  │  - [[关联页面]]                │    │
│    ▼ 论文     │  └─────────────────────────────┘    │
│    ▼ 主题     │                                     │
│              │  反向链接: [页面A] [页面B]             │
├──────────────┴─────────────────────────────────────┤
│  状态栏: 情报库 32 页 | 文献库 18 页 | 上次更新 2h前    │
└────────────────────────────────────────────────────┘
```

### Wiki 主页 (首次进入)

```
┌────────────────────────────────────────────────────┐
│                Wiki 知识库                           │
│                                                     │
│   ┌──────────────────┐  ┌──────────────────┐       │
│   │                  │  │                  │       │
│   │   📊 情报库 Wiki  │  │   📚 文献库 Wiki  │       │
│   │                  │  │                  │       │
│   │  行业动态·竞品·趋势│  │  论文·方法·领域   │       │
│   │                  │  │                  │       │
│   │  32 页 · 5 实体   │  │  18 页 · 3 主题   │       │
│   │                  │  │                  │       │
│   └──────────────────┘  └──────────────────┘       │
│                                                     │
│   最近更新: OpenAI 页面 (2h前) | LLM趋势 (5h前)      │
└────────────────────────────────────────────────────┘
```

点击后展开为带侧边栏的完整 wiki 视图。

### 脑图视图 (React Flow)

- 节点 = wiki 页面，大小 = 链接数
- 边 = `[[wikilinks]]` 关系
- 颜色区分 category: entity(蓝) / concept(绿) / paper(紫) / topic(橙)
- 点击节点 → 跳转到对应页面
- 支持情报库/文献库切换

### 组件清单

| 组件 | 文件 | 说明 |
|------|------|------|
| Wiki | `Wiki.tsx` | 主容器，管理 wikiType + activePage 状态 |
| WikiHome | `WikiHome.tsx` | 首页，左右两个 Wiki 入口按钮 |
| WikiView | `WikiView.tsx` | Wiki 内容布局 (sidebar + content) |
| WikiSidebar | `WikiSidebar.tsx` | 侧边导航树，按 category 分组 |
| WikiPageView | `WikiPageView.tsx` | 单页 Markdown 渲染 + 反向链接 |
| WikiMindMap | `WikiMindMap.tsx` | React Flow 脑图 |
| WikiSearch | `WikiSearch.tsx` | 搜索面板 |
| WikiIngestModal | `WikiIngestModal.tsx` | 摘录到 Wiki 的弹窗 |

---

## 用户体验设计

### Zero-config 启动
- 首次进入显示空状态引导："从情报卡片或文献中摘录第一条知识开始"
- 提供示例数据按钮，一键生成 3-5 个示例页面

### 低成本维护
- **自动 ingest**: Feed 卡片的 "star" 和 "save" 操作可选自动摘录到 Wiki
- **批量 ingest**: 选择多张卡片一键摘录
- **Claude 自动维护**: ingest 时自动更新相关页面的交叉引用
- **lint 提醒**: 定期提示用户进行 wiki 健康检查

### 导航到原文
- 每个 wiki 页面的 `sources` 字段记录来源
- Card 来源: 点击跳转到 Feed 中的原始卡片
- URL 来源: 新窗口打开原始链接
- Paper 来源: 在 Obsidian 中打开论文
- 反向链接区域: 显示所有引用当前页面的其他页面

### 可扩展性
- Wiki 类型通过配置扩展 (未来可加 "读书笔记 Wiki" 等)
- 页面 category 可自定义
- Schema 文件 (`Wiki/{type}/SCHEMA.md`) 控制 LLM 行为

---

## 实现步骤

### Step 1: 后端基础设施
1. 创建 `abo/wiki/__init__.py`
2. 创建 `abo/wiki/store.py` — WikiStore (读写 Vault Markdown, 解析 wikilinks, 构建图)
3. 创建 `abo/wiki/routes.py` — FastAPI 路由
4. 创建 `abo/wiki/builder.py` — Claude ingest 逻辑
5. 在 `abo/main.py` 注册路由

### Step 2: 前端 Wiki 主页 + 导航
1. 添加 `"wiki"` 到 store ActiveTab
2. 创建 `src/modules/wiki/Wiki.tsx` — 主容器
3. 创建 `src/modules/wiki/WikiHome.tsx` — 双 Wiki 入口
4. 创建 `src/modules/wiki/WikiSidebar.tsx` — 侧边导航树
5. 更新 NavSidebar + MainContent 注册

### Step 3: 前端页面渲染 + 交互
1. 创建 `src/modules/wiki/WikiView.tsx` — 布局容器
2. 创建 `src/modules/wiki/WikiPageView.tsx` — Markdown 渲染 + wikilink 解析
3. 创建 `src/modules/wiki/WikiSearch.tsx` — 搜索
4. 创建 `src/modules/wiki/WikiIngestModal.tsx` — 摘录弹窗

### Step 4: 脑图
1. 创建 `src/modules/wiki/WikiMindMap.tsx` — React Flow 脑图
2. 节点/边从 graph API 获取
3. 点击节点跳转页面

### Step 5: 集成 + 联调
1. Feed CardView 添加 "摘录到 Wiki" 按钮
2. Literature 添加 "摘录到 Wiki" 按钮
3. 端到端测试
