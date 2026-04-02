# Semantic Scholar VGGT Follow-up 论文追踪器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Semantic Scholar API 集成，自动查找 VGGT 论文的后续研究（引用论文），每天早上10点定时爬取。

**Architecture:** 使用 ABO Module SDK 创建新的模块 `semantic-scholar-tracker`，通过 Semantic Scholar API 搜索论文并获取引用该论文的后续研究。模块遵循与其他追踪器（arXiv）相同的接口，支持 fetch/process 流程，并集成到调度系统中。

**Tech Stack:** Python + httpx (API调用), FastAPI (路由), APO Scheduler (定时任务), React + TypeScript (前端UI)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `abo/default_modules/semantic_scholar_tracker/__init__.py` | 模块主类，实现 Semantic Scholar API 调用 |
| `abo/default_modules/semantic_scholar_tracker/default_queries.py` | 默认查询配置（VGGT 等） |
| `abo/main.py` | FastAPI 路由：添加 `/api/modules/semantic-scholar-tracker/*` 端点 |
| `src/modules/arxiv/ArxivTracker.tsx` | 前端：添加 "后续论文" Tab 和 UI |
| `src/modules/settings/ModulesSettings.tsx` | 设置页：显示模块配置（如果需要） |

---

## Task 1: 创建 Semantic Scholar 追踪器模块

**Files:**
- Create: `abo/default_modules/semantic_scholar_tracker/__init__.py`

- [ ] **Step 1: 创建模块文件结构**

```bash
mkdir -p abo/default_modules/semantic_scholar_tracker
touch abo/default_modules/semantic_scholar_tracker/__init__.py
```

- [ ] **Step 2: 写入模块代码**

```python
"""
Semantic Scholar 论文追踪器 - 用于查找某篇论文的后续研究（引用该论文的论文）
API Key: fxlcd3addOaOHGTwYCVLF1kmJBA0hYVy62KShAP4
"""

import json
from datetime import datetime, timedelta
from typing import Literal

import httpx

from abo.sdk import Module, Item, Card, claude_json


class SemanticScholarTracker(Module):
    id       = "semantic-scholar-tracker"
    name     = "Semantic Scholar 后续论文"
    schedule = "0 10 * * *"  # 每天早上10点
    icon     = "git-branch"
    output   = ["obsidian", "ui"]

    # Semantic Scholar API Key
    API_KEY = "fxlcd3addOaOHGTwYCVLF1kmJBA0hYVy62KShAP4"
    BASE_URL = "https://api.semanticscholar.org/graph/v1"

    # Rate limiting
    _last_request_time = 0

    async def _rate_limited_request(self, client: httpx.AsyncClient, url: str, params: dict = None) -> httpx.Response:
        """Make a rate-limited request to Semantic Scholar API."""
        import time
        import asyncio

        # Semantic Scholar 限制: 100 requests/5 minutes
        min_interval = 1.0
        elapsed = time.time() - SemanticScholarTracker._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)

        headers = {
            "User-Agent": "ABO-SemanticScholar-Tracker/1.0",
        }
        if self.API_KEY:
            headers["x-api-key"] = self.API_KEY

        resp = await client.get(url, headers=headers, params=params, timeout=60)
        SemanticScholarTracker._last_request_time = time.time()

        return resp

    async def search_paper_by_title(self, client: httpx.AsyncClient, title: str) -> dict | None:
        """通过标题搜索论文"""
        url = f"{self.BASE_URL}/paper/search"
        params = {
            "query": title,
            "fields": "paperId,title,authors,year,citationCount,referenceCount,abstract,fieldsOfStudy,publicationDate",
            "limit": 5
        }

        resp = await self._rate_limited_request(client, url, params)
        if resp.status_code != 200:
            print(f"[s2] Search error: {resp.status_code}")
            return None

        data = resp.json()
        papers = data.get("data", [])
        return papers[0] if papers else None

    async def search_paper_by_arxiv_id(self, client: httpx.AsyncClient, arxiv_id: str) -> dict | None:
        """通过 arXiv ID 搜索论文"""
        arxiv_id_clean = arxiv_id.split("v")[0]
        url = f"{self.BASE_URL}/paper/search"
        params = {
            "query": f"arxiv:{arxiv_id_clean}",
            "fields": "paperId,title,authors,year,citationCount,referenceCount,abstract,fieldsOfStudy,publicationDate,externalIds",
            "limit": 3
        }

        resp = await self._rate_limited_request(client, url, params)
        if resp.status_code != 200:
            return None

        data = resp.json()
        papers = data.get("data", [])
        return papers[0] if papers else None

    async def get_citing_papers(self, client: httpx.AsyncClient, paper_id: str, limit: int = 20) -> list[dict]:
        """获取引用该论文的论文列表"""
        url = f"{self.BASE_URL}/paper/{paper_id}/citations"
        params = {
            "fields": "paperId,title,authors,year,citationCount,referenceCount,abstract,fieldsOfStudy,publicationDate,venue",
            "limit": limit
        }

        resp = await self._rate_limited_request(client, url, params)
        if resp.status_code != 200:
            print(f"[s2] Get citations error: {resp.status_code}")
            return []

        data = resp.json()
        citing = data.get("data", [])

        papers = []
        for item in citing:
            paper = item.get("citingPaper", {})
            if paper:
                papers.append(paper)
        return papers

    async def fetch_followups(
        self,
        query: str,
        max_results: int = 20,
        days_back: int = 7,
        existing_ids: set[str] = None,
    ) -> list[Item]:
        """查找某篇论文的后续研究"""
        import asyncio

        print(f"[s2] Searching for follow-ups of: {query}")

        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            # Step 1: 找到源论文
            if len(query) < 15 and (query[0:4].isdigit() or "." in query):
                source_paper = await self.search_paper_by_arxiv_id(client, query)
            else:
                source_paper = await self.search_paper_by_title(client, query)

            if not source_paper:
                print(f"[s2] Source paper not found: {query}")
                return []

            paper_id = source_paper.get("paperId")
            paper_title = source_paper.get("title", "Unknown")
            print(f"[s2] Found source paper: {paper_title}")

            # Step 2: 获取引用该论文的论文
            citing_papers = await self.get_citing_papers(client, paper_id, limit=max_results * 2)
            print(f"[s2] Found {len(citing_papers)} citing papers")

            # Step 3: 过滤和转换
            items = []
            cutoff = datetime.utcnow() - timedelta(days=days_back)
            existing_ids = existing_ids or set()

            for paper in citing_papers:
                paper_id_new = paper.get("paperId", "")
                if paper_id_new in existing_ids:
                    continue

                # 时间过滤
                pub_date = paper.get("publicationDate", "")
                if pub_date:
                    try:
                        pub_dt = datetime.fromisoformat(pub_date.replace("Z", "+00:00")).replace(tzinfo=None)
                        if pub_dt < cutoff:
                            continue
                    except ValueError:
                        pass

                items.append(self._paper_to_item(paper, source_paper_title=paper_title))

                if len(items) >= max_results:
                    break

            print(f"[s2] Filtered to {len(items)} recent follow-up papers")
            return items

    def _paper_to_item(self, paper: dict, source_paper_title: str = "") -> Item:
        """将 Semantic Scholar 论文转换为 Item"""
        paper_id = paper.get("paperId", "")
        title = paper.get("title", "Untitled")
        abstract = paper.get("abstract", "")

        authors = []
        for author in paper.get("authors", []):
            name = author.get("name", "")
            if name:
                authors.append(name)

        year = paper.get("year", "")
        venue = paper.get("venue", "")
        citation_count = paper.get("citationCount", 0)
        pub_date = paper.get("publicationDate", "")
        fields = paper.get("fieldsOfStudy", [])

        s2_url = f"https://www.semanticscholar.org/paper/{paper_id}"

        # 尝试获取 arXiv ID
        arxiv_id = ""
        external_ids = paper.get("externalIds", {})
        if external_ids:
            arxiv_id = external_ids.get("ArXiv", "")

        arxiv_url = f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else ""
        item_id = arxiv_id if arxiv_id else f"s2_{paper_id}"

        return Item(
            id=item_id,
            raw={
                "title": title,
                "abstract": abstract,
                "authors": authors,
                "author_count": len(authors),
                "year": year,
                "venue": venue,
                "published": pub_date,
                "citation_count": citation_count,
                "fields_of_study": fields,
                "paper_id": paper_id,
                "arxiv_id": arxiv_id,
                "source_paper_title": source_paper_title,
                "s2_url": s2_url,
                "arxiv_url": arxiv_url,
                "url": arxiv_url if arxiv_url else s2_url,
                "external_ids": external_ids,
            },
        )

    async def fetch(self, **kwargs) -> list[Item]:
        """Module SDK 兼容的 fetch 方法"""
        return await self.fetch_followups(**kwargs)

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Process papers into Cards with Claude analysis"""
        import asyncio
        cards = []

        for item in items:
            p = item.raw
            source_title = p.get("source_paper_title", "")
            fields_str = ", ".join(p.get("fields_of_study", [])[:3])

            prompt = (
                f'分析以下后续研究论文（引用了 "{source_title}"），返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"contribution":"<一句话核心创新>"}}\n\n'
                f"标题：{p['title']}\n"
                f"领域：{fields_str}\n"
                f"摘要：{p['abstract'][:800] if p.get('abstract') else 'No abstract available'}"
            )

            try:
                result = await asyncio.wait_for(claude_json(prompt, prefs=prefs), timeout=30)
            except asyncio.TimeoutError:
                result = {}
            except Exception as e:
                print(f"[s2] Claude error: {e}")
                result = {}

            first_author = p["authors"][0].split()[-1] if p["authors"] else "Unknown"
            year = p.get("year", datetime.now().year)
            slug = p["title"][:40].replace(" ", "-").replace("/", "-")
            source_slug = source_title[:20].replace(" ", "-").replace("/", "-") if source_title else "unknown"

            metadata = {
                "abo-type": "semantic-scholar-paper",
                "authors": p["authors"],
                "author_count": p.get("author_count", len(p["authors"])),
                "paper_id": p.get("paper_id", ""),
                "arxiv_id": p.get("arxiv_id", ""),
                "year": year,
                "venue": p.get("venue", ""),
                "published": p.get("published", ""),
                "citation_count": p.get("citation_count", 0),
                "fields_of_study": p.get("fields_of_study", []),
                "source_paper_title": source_title,
                "contribution": result.get("contribution", ""),
                "abstract": p.get("abstract", ""),
                "keywords": result.get("tags", []),
                "s2_url": p.get("s2_url", ""),
                "arxiv_url": p.get("arxiv_url", ""),
            }

            cards.append(Card(
                id=item.id,
                title=p["title"],
                summary=result.get("summary", p.get("abstract", "")[:150]),
                score=min(result.get("score", 5), 10) / 10,
                tags=result.get("tags", []) + ["follow-up"] + (p.get("fields_of_study", [])[:1]),
                source_url=p.get("url", p.get("s2_url", "")),
                obsidian_path=f"Literature/FollowUps/{source_slug}/{first_author}{year}-{slug}.md",
                metadata=metadata,
            ))

        return cards


# 默认查询配置
DEFAULT_FOLLOWUP_QUERIES = [
    {"name": "VGGT", "query": "VGGT Visual Geometry Grounded Transformer", "description": "VGGT 后续研究"},
    {"name": "SAM", "query": "Segment Anything Model", "description": "SAM 后续研究"},
]


def get_default_queries() -> list[dict]:
    """获取默认的 follow-up 查询列表"""
    return DEFAULT_FOLLOWUP_QUERIES
```

- [ ] **Step 3: 验证模块加载**

重启后端，检查模块是否被正确加载：

```bash
# 在终端 1 重启后端
pkill -f "python.*abo.main"
python3 -m abo.main
```

Expected output: `[discovery] Loaded: Semantic Scholar 后续论文 (semantic-scholar-tracker)`

---

## Task 2: 添加 API 路由支持

**Files:**
- Modify: `abo/main.py` (添加 Semantic Scholar 相关路由)

- [ ] **Step 1: 添加 API 请求模型**

在 `abo/main.py` 中找到其他 CrawlRequest 类定义的地方，添加：

```python
class SemanticScholarCrawlRequest(BaseModel):
    query: str = "VGGT"
    max_results: int = 20
    days_back: int = 7
    session_id: str | None = None
```

- [ ] **Step 2: 添加 API 路由**

在 `abo/main.py` 的 arXiv 路由之后添加：

```python
@app.post("/api/modules/semantic-scholar-tracker/crawl")
async def crawl_semantic_scholar(data: SemanticScholarCrawlRequest):
    """运行 Semantic Scholar follow-up 爬取"""
    import asyncio
    from abo.default_modules.semantic_scholar_tracker import SemanticScholarTracker

    session_id = data.session_id or _generate_crawl_session_id()
    _cleanup_crawl_session(session_id)

    tracker = SemanticScholarTracker()

    async def run_with_progress():
        try:
            await broadcaster.broadcast({
                "type": "crawl_started",
                "module": "semantic-scholar-tracker",
                "session_id": session_id,
                "query": data.query,
                "phase": "searching"
            })

            items = await tracker.fetch_followups(
                query=data.query,
                max_results=data.max_results,
                days_back=data.days_back
            )

            if _should_cancel_crawl(session_id):
                await broadcaster.broadcast({
                    "type": "crawl_cancelled",
                    "module": "semantic-scholar-tracker",
                    "session_id": session_id
                })
                _cleanup_crawl_session(session_id)
                return []

            await broadcaster.broadcast({
                "type": "crawl_progress",
                "module": "semantic-scholar-tracker",
                "session_id": session_id,
                "phase": "processing",
                "total": len(items),
                "processed": 0
            })

            prefs = _prefs.get_all()
            cards = await tracker.process(items, prefs)

            # 保存到 CardStore
            for card in cards:
                _card_store.save_card(card)

            await broadcaster.broadcast({
                "type": "crawl_complete",
                "module": "semantic-scholar-tracker",
                "session_id": session_id,
                "count": len(cards)
            })

            _cleanup_crawl_session(session_id)
            return cards

        except Exception as e:
            print(f"[s2] Crawl error: {e}")
            await broadcaster.broadcast({
                "type": "crawl_error",
                "module": "semantic-scholar-tracker",
                "session_id": session_id,
                "error": str(e)
            })
            _cleanup_crawl_session(session_id)
            raise

    asyncio.create_task(run_with_progress())

    return {
        "status": "started",
        "session_id": session_id,
        "message": f"开始搜索 '{data.query}' 的后续论文"
    }


@app.post("/api/modules/semantic-scholar-tracker/cancel")
async def cancel_semantic_scholar_crawl(data: dict):
    """取消 Semantic Scholar 爬取"""
    session_id = data.get("session_id")
    if session_id:
        _cancel_crawl(session_id)
        return {"status": "cancelled", "session_id": session_id}
    return {"status": "error", "message": "No session_id provided"}
```

- [ ] **Step 3: 测试 API 路由**

```bash
curl -X POST http://127.0.0.1:8765/api/modules/semantic-scholar-tracker/crawl \
  -H "Content-Type: application/json" \
  -d '{"query": "VGGT", "max_results": 5, "days_back": 30}'
```

Expected: `{"status":"started","session_id":"...","message":"开始搜索..."}`

---

## Task 3: 配置定时调度（每天早上10点）

**Files:**
- Modify: `abo/default_modules/semantic_scholar_tracker/__init__.py`（已包含 schedule）

- [ ] **Step 1: 验证模块调度配置**

模块类中已包含：`schedule = "0 10 * * *"`

- [ ] **Step 2: 配置默认查询参数**

在模块类中添加默认参数配置方法：

```python
    def get_default_params(self) -> dict:
        """获取默认查询参数（用于定时调度）"""
        return {
            "query": "VGGT",
            "max_results": 20,
            "days_back": 7  # 最近一周的论文
        }
```

- [ ] **Step 3: 重启后端并验证调度器**

```bash
pkill -f "python.*abo.main"
python3 -m abo.main
```

Expected output: `[scheduler] Started with X module(s)` 包含 semantic-scholar-tracker

---

## Task 4: 前端 UI 更新

**Files:**
- Modify: `src/modules/arxiv/ArxivTracker.tsx`

- [ ] **Step 1: 添加 Semantic Scholar 状态**

在组件中找到状态定义区域（约第 120 行附近），添加：

```typescript
// Semantic Scholar states
const [s2Papers, setS2Papers] = useState<SemanticScholarPaper[]>([]);
const [s2Crawling, setS2Crawling] = useState(false);
const [s2Progress, setS2Progress] = useState<any>(null);
const [s2Keywords, setS2Keywords] = useState("VGGT");
const [arxivIdInput, setArxivIdInput] = useState("");
```

- [ ] **Step 2: 添加 SemanticScholarPaper 接口**

在文件开头的 interface 区域添加：

```typescript
interface SemanticScholarPaper {
  id: string;
  title: string;
  summary: string;
  score: number;
  tags: string[];
  source_url: string;
  metadata: {
    authors?: string[];
    year?: number;
    citation_count?: number;
    contribution?: string;
    abstract?: string;
    keywords?: string[];
    paper_id?: string;
    s2_url?: string;
    arxiv_id?: string;
    arxiv_url?: string;
    source_paper_title?: string;
    published?: string;
  };
}
```

- [ ] **Step 3: 添加 "后续论文" Tab 按钮**

在 Tab 按钮区域（约第 580 行）添加第三个 Tab：

```tsx
<button
  onClick={() => setActiveTab("followups")}
  style={{
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "16px 24px",
    borderRadius: "var(--radius-lg)",
    background: activeTab === "followups" ? "var(--color-primary)" : "var(--bg-card)",
    border: `1px solid ${activeTab === "followups" ? "transparent" : "var(--border-light)"}`,
    color: activeTab === "followups" ? "white" : "var(--text-secondary)",
    fontSize: "0.9375rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.3s ease",
  }}
>
  <GitBranch style={{ width: "18px", height: "18px" }} />
  后续论文
  <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(Semantic Scholar)</span>
</button>
```

- [ ] **Step 4: 添加 followups Tab UI 内容**

在搜索卡片区域的条件渲染中添加 followups 情况：

```tsx
{activeTab === "followups" ? (
  // Follow-ups Tab UI
  <>
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <GitBranch style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />
      <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>
        Semantic Scholar 后续论文
      </span>
      <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginLeft: "8px" }}>
        基于论文标题查找引用该论文的后续研究
      </span>
    </div>

    <div style={{ display: "flex", gap: "12px", alignItems: "stretch" }}>
      <input
        type="text"
        value={s2Keywords}
        onChange={(e) => setS2Keywords(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !s2Crawling && fetchS2FollowUps()}
        placeholder="输入论文标题或 arXiv ID，如：VGGT"
        disabled={s2Crawling}
        style={{
          flex: 1,
          padding: "12px 16px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-light)",
          background: "var(--bg-app)",
          color: "var(--text-main)",
          fontSize: "0.9375rem",
          outline: "none",
        }}
      />
      {s2Crawling ? (
        <button
          onClick={stopS2Crawl}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 24px",
            borderRadius: "var(--radius-full)",
            background: "linear-gradient(135deg, #EF4444, #DC2626)",
            border: "none",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Square style={{ width: "16px", height: "16px" }} />
          停止爬取
        </button>
      ) : (
        <button
          onClick={fetchS2FollowUps}
          disabled={s2Crawling}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 24px",
            borderRadius: "var(--radius-full)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
            border: "none",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <RefreshCw style={{ width: "16px", height: "16px" }} />
          查找后续论文
        </button>
      )}
    </div>
  </>
) : (
  // 原有的 AND/OR Tab UI 保持不变
  ...
)}
```

- [ ] **Step 5: 添加 fetchS2FollowUps 函数**

在组件中添加 Semantic Scholar 爬取函数：

```typescript
async function fetchS2FollowUps() {
  if (!s2Keywords.trim()) {
    showToast("请输入论文标题或 arXiv ID", "warning");
    return;
  }

  setS2Crawling(true);
  setS2Progress({ phase: "searching", total: 0, processed: 0 });

  try {
    // 生成 session ID
    const sessionId = Math.random().toString(36).substring(2, 10);
    s2SessionIdRef.current = sessionId;

    const resp = await api.post("/api/modules/semantic-scholar-tracker/crawl", {
      query: s2Keywords,
      max_results: 20,
      days_back: 7,
      session_id: sessionId,
    });

    if (resp.status === "started") {
      showToast(`开始搜索 "${s2Keywords}" 的后续论文`, "info");
    } else {
      throw new Error(resp.message || "启动失败");
    }
  } catch (e: any) {
    showToast(e.message || "启动失败", "error");
    setS2Crawling(false);
    setS2Progress(null);
  }
}

async function stopS2Crawl() {
  if (s2SessionIdRef.current) {
    try {
      await api.post("/api/modules/semantic-scholar-tracker/cancel", {
        session_id: s2SessionIdRef.current,
      });
      showToast("已停止爬取", "info");
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  }
}
```

- [ ] **Step 6: 更新 WebSocket 消息处理**

在 WebSocket onmessage 处理中添加 Semantic Scholar 的消息处理：

```typescript
} else if (data.module === "semantic-scholar-tracker") {
  if (data.type === "crawl_complete") {
    setS2Crawling(false);
    setS2Progress(null);
    showToast(`✓ 找到 ${data.count} 篇后续论文`, "success");
    // 刷新论文列表
    loadS2Papers();
  } else if (data.type === "crawl_progress") {
    setS2Progress(data);
  } else if (data.type === "crawl_error") {
    setS2Crawling(false);
    setS2Progress(null);
    showToast(`爬取失败: ${data.error}`, "error");
  } else if (data.type === "crawl_cancelled") {
    setS2Crawling(false);
    setS2Progress(null);
    showToast("已取消爬取", "info");
  }
}
```

---

## Task 5: 测试和验证

- [ ] **Step 1: 测试模块加载**

重启后端，确认模块被正确加载：

```bash
pkill -f "python.*abo.main"
python3 -m abo.main 2>&1 | grep -E "(discovery|scheduler)"
```

Expected:
- `[discovery] Loaded: Semantic Scholar 后续论文 (semantic-scholar-tracker)`
- `[scheduler] Started with X module(s)`

- [ ] **Step 2: 测试 API 端点**

```bash
curl -X POST http://127.0.0.1:8765/api/modules/semantic-scholar-tracker/crawl \
  -H "Content-Type: application/json" \
  -d '{"query": "VGGT", "max_results": 3, "days_back": 30}'
```

Expected: `{"status":"started",...}`

- [ ] **Step 3: 测试前端 UI**

1. 打开 Tauri 应用
2. 进入 ArXiv 追踪器页面
3. 点击 "后续论文" Tab
4. 输入 "VGGT" 并点击 "查找后续论文"
5. 确认能看到进度更新和结果

- [ ] **Step 4: 验证定时调度**

检查调度器日志，确认每天早上10点会执行：

```bash
# 查看调度器下次执行时间
# 应该在日志中看到类似: [scheduler] Next run for semantic-scholar-tracker: ...
```

---

## Completion Checklist

- [ ] 后端模块 `semantic-scholar-tracker` 创建完成
- [ ] API 路由 `/api/modules/semantic-scholar-tracker/crawl` 工作正常
- [ ] API 路由 `/api/modules/semantic-scholar-tracker/cancel` 工作正常
- [ ] 前端 "后续论文" Tab 显示正常
- [ ] 能成功搜索 VGGT 的后续论文
- [ ] 定时调度配置为每天早上10点
- [ ] 论文格式与 arXiv 模块一致

---

## Notes

1. **API Key**: 模块中硬编码了 API key `fxlcd3addOaOHGTwYCVLF1kmJBA0hYVy62KShAP4`
2. **Rate Limit**: Semantic Scholar 免费 API 限制 100 requests/5分钟，代码中已实现 1秒间隔限制
3. **VGGT 搜索**: 模块默认搜索 VGGT，也可以搜索其他论文
4. **输出格式**: 和 arXiv 一样生成 Card，保存到 SQLite 和 Obsidian
