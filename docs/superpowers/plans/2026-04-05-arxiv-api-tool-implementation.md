# arXiv API Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an on-demand arXiv search tool using the official `arxiv` Python package (not scraper), with AND/OR keyword search modes, completely separate from the existing `arxiv-tracker` module.

**Architecture:** Create a new standalone tool under `abo/tools/arxiv_api/` that wraps the `arxiv` package, with FastAPI routes in `abo/routes/tools.py` and a new React component `src/modules/arxiv/ArxivAPITool.tsx`. This is a user-triggered search tool (not scheduled), similar to the Xiaohongshu/Bilibili tools.

**Tech Stack:** Python `arxiv` package, FastAPI, React + TypeScript, existing ABO tool patterns

---

## File Structure

**New Files:**
- `abo/tools/arxiv_api/__init__.py` - Core arXiv API wrapper with search logic
- `src/modules/arxiv/ArxivAPITool.tsx` - Frontend search interface (similar to XiaohongshuTool)
- Add arxiv API routes to `abo/routes/tools.py`
- Add navigation item in `src/modules/nav/NavSidebar.tsx`
- Add route in `src/modules/MainContent.tsx`

**Modified Files:**
- `abo/routes/tools.py` - Add arxiv search endpoints
- `src/modules/nav/NavSidebar.tsx` - Add nav item
- `src/modules/MainContent.tsx` - Add tab route
- `requirements.txt` - Add `arxiv>=2.0.0` dependency

---

## Prerequisites

The `arxiv` package provides a clean Python wrapper around the arXiv API:
- `arxiv.Client()` - reusable client with pagination
- `arxiv.Search()` - query builder with sorting options
- `arxiv.SortCriterion.SubmittedDate/Relevance` - sorting
- Results have `.title`, `.authors`, `.summary`, `.pdf_url`, `.published`, etc.

Documentation: https://lukasschwab.me/arxiv.py/

---

### Task 1: Install arxiv Package and Verify

**Files:**
- Modify: `requirements.txt` (or create if not exists)

- [ ] **Step 1: Add arxiv to dependencies**

Add to `requirements.txt`:
```
arxiv>=2.0.0
```

- [ ] **Step 2: Install and verify**

Run: `pip install arxiv`

Run: `python -c "import arxiv; print(arxiv.__version__)"`
Expected: Version number printed (e.g., `2.1.0`)

- [ ] **Step 3: Quick API test**

Run:
```python
import arxiv
client = arxiv.Client()
search = arxiv.Search(query="quantum computing", max_results=3)
for r in client.results(search):
    print(r.title, r.pdf_url)
```
Expected: 3 paper titles and PDF URLs printed

- [ ] **Step 4: Commit**

```bash
git add requirements.txt
git commit -m "deps: add arxiv package for API tool"
```

---

### Task 2: Create arXiv API Tool Backend

**Files:**
- Create: `abo/tools/arxiv_api/__init__.py`

- [ ] **Step 1: Write the complete arxiv_api module**

Create `abo/tools/arxiv_api/__init__.py`:

```python
"""arXiv API tool - on-demand paper search using the official arxiv package"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal, Optional
import asyncio

import arxiv


@dataclass
class ArxivPaper:
    """Standardized arXiv paper result"""
    id: str
    title: str
    authors: list[str]
    summary: str
    published: datetime
    updated: datetime
    categories: list[str]
    primary_category: str
    pdf_url: str
    arxiv_url: str
    doi: Optional[str]
    journal_ref: Optional[str]
    comment: Optional[str]


class ArxivAPITool:
    """Wrapper around the arxiv package for ABO integration"""

    def __init__(self):
        self.client = arxiv.Client(
            page_size=100,  # Papers per API call
            delay_seconds=3.0,  # Be nice to arXiv servers
            num_retries=3
        )

    def _build_query(
        self,
        keywords: list[str],
        categories: Optional[list[str]] = None,
        mode: Literal["AND", "OR"] = "OR",
        author: Optional[str] = None,
        title: Optional[str] = None,
    ) -> str:
        """
        Build arXiv search query string.

        Args:
            keywords: List of keywords to search
            categories: arXiv category codes (e.g., ["cs.CV", "cs.LG"])
            mode: "AND" (all keywords must match) or "OR" (any keyword matches)
            author: Filter by author name
            title: Filter by title words
        """
        parts = []

        # Keywords
        if keywords:
            if mode == "AND":
                # AND mode: all keywords must be in title or abstract
                kw_query = " AND ".join(f'"{kw}"' for kw in keywords)
                parts.append(f"({kw_query})")
            else:
                # OR mode: any keyword match
                kw_query = " OR ".join(f'"{kw}"' for kw in keywords)
                parts.append(f"({kw_query})")

        # Categories
        if categories:
            cat_query = " OR ".join(f"cat:{cat}" for cat in categories)
            parts.append(f"({cat_query})")

        # Author filter
        if author:
            parts.append(f'au:"{author}"')

        # Title filter
        if title:
            parts.append(f'ti:"{title}"')

        return " AND ".join(parts) if parts else "all:*"

    async def search(
        self,
        keywords: list[str],
        categories: Optional[list[str]] = None,
        mode: Literal["AND", "OR"] = "OR",
        max_results: int = 50,
        days_back: Optional[int] = None,
        sort_by: Literal["submittedDate", "relevance", "lastUpdatedDate"] = "submittedDate",
        sort_order: Literal["descending", "ascending"] = "descending",
        author: Optional[str] = None,
        title: Optional[str] = None,
    ) -> list[ArxivPaper]:
        """
        Search arXiv papers using the official API.

        Args:
            keywords: Keywords to search in title/abstract
            categories: arXiv categories (e.g., ["cs.CV", "cs.LG"])
            mode: "AND" or "OR" keyword matching
            max_results: Maximum papers to return
            days_back: Only return papers from last N days
            sort_by: Sort criterion
            sort_order: Sort direction
            author: Filter by author name
            title: Filter by title words
        """
        # Build query
        query = self._build_query(keywords, categories, mode, author, title)

        # Map sort strings to arxiv SortCriterion
        sort_map = {
            "submittedDate": arxiv.SortCriterion.SubmittedDate,
            "relevance": arxiv.SortCriterion.Relevance,
            "lastUpdatedDate": arxiv.SortCriterion.LastUpdatedDate,
        }
        sort_criterion = sort_map.get(sort_by, arxiv.SortCriterion.SubmittedDate)

        # Map sort order
        sort_dir_map = {
            "descending": arxiv.SortOrder.Descending,
            "ascending": arxiv.SortOrder.Ascending,
        }
        sort_direction = sort_dir_map.get(sort_order, arxiv.SortOrder.Descending)

        # Create search
        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=sort_criterion,
            sort_order=sort_direction,
        )

        # Execute search (arxiv package is sync, run in thread)
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, lambda: list(self.client.results(search)))

        # Convert to ArxivPaper and filter by date
        papers = []
        cutoff = datetime.utcnow() - timedelta(days=days_back) if days_back else None

        for result in results:
            # Date filter
            if cutoff and result.published.replace(tzinfo=None) < cutoff:
                continue

            papers.append(ArxivPaper(
                id=result.get_short_id(),
                title=result.title,
                authors=[str(a) for a in result.authors],
                summary=result.summary,
                published=result.published,
                updated=result.updated,
                categories=result.categories,
                primary_category=result.primary_category,
                pdf_url=result.pdf_url,
                arxiv_url=result.entry_id,
                doi=result.doi,
                journal_ref=result.journal_ref,
                comment=result.comment,
            ))

        return papers

    def to_dict(self, paper: ArxivPaper) -> dict:
        """Convert ArxivPaper to dict for JSON serialization"""
        return {
            "id": paper.id,
            "title": paper.title,
            "authors": paper.authors,
            "summary": paper.summary,
            "published": paper.published.isoformat() if paper.published else None,
            "updated": paper.updated.isoformat() if paper.updated else None,
            "categories": paper.categories,
            "primary_category": paper.primary_category,
            "pdf_url": paper.pdf_url,
            "arxiv_url": paper.arxiv_url,
            "doi": paper.doi,
            "journal_ref": paper.journal_ref,
            "comment": paper.comment,
        }


# Convenience function for direct import
async def arxiv_api_search(
    keywords: list[str],
    categories: Optional[list[str]] = None,
    mode: Literal["AND", "OR"] = "OR",
    max_results: int = 50,
    days_back: Optional[int] = None,
    sort_by: Literal["submittedDate", "relevance", "lastUpdatedDate"] = "submittedDate",
    sort_order: Literal["descending", "ascending"] = "descending",
) -> list[dict]:
    """
    Convenience function for arXiv API search.
    Returns list of paper dicts.
    """
    tool = ArxivAPITool()
    papers = await tool.search(
        keywords=keywords,
        categories=categories,
        mode=mode,
        max_results=max_results,
        days_back=days_back,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return [tool.to_dict(p) for p in papers]
```

- [ ] **Step 2: Create empty __init__ for tools directory if needed**

Ensure `abo/tools/__init__.py` exists (it should already exist based on xiaohongshu/bilibili tools).

- [ ] **Step 3: Test the module standalone**

Create a quick test script:
```python
import asyncio
from abo.tools.arxiv_api import arxiv_api_search

async def test():
    # Test OR mode
    results = await arxiv_api_search(
        keywords=["transformer", "attention"],
        mode="OR",
        max_results=5
    )
    print(f"OR mode found {len(results)} papers")
    for r in results[:2]:
        print(f"  - {r['title'][:60]}...")

    # Test AND mode
    results2 = await arxiv_api_search(
        keywords=["vision", "language"],
        mode="AND",
        max_results=5
    )
    print(f"AND mode found {len(results2)} papers")

asyncio.run(test())
```

Expected output showing papers found in both modes.

- [ ] **Step 4: Commit**

```bash
git add abo/tools/arxiv_api/__init__.py
git commit -m "feat(tools): add arxiv_api backend with AND/OR search"
```

---

### Task 3: Add arXiv API Routes

**Files:**
- Modify: `abo/routes/tools.py`

- [ ] **Step 1: Add imports and models at top of file**

After the existing imports, add:

```python
from typing import Optional

# arXiv API tool
from abo.tools.arxiv_api import arxiv_api_search
```

- [ ] **Step 2: Add request/response models**

Add after the existing Zhihu models:

```python
# ===== arXiv API Tool Models =====

class ArxivAPISearchRequest(BaseModel):
    keywords: list[str]
    categories: Optional[list[str]] = None  # e.g., ["cs.CV", "cs.LG"]
    mode: str = "OR"  # "AND" or "OR"
    max_results: int = 50
    days_back: Optional[int] = None
    sort_by: str = "submittedDate"  # "submittedDate", "relevance", "lastUpdatedDate"
    sort_order: str = "descending"  # "descending" or "ascending"


class ArxivAPISearchResponse(BaseModel):
    total: int
    papers: list[dict]
    query: str
    search_time_ms: float
```

- [ ] **Step 3: Add the API endpoint**

Add at the end of the file:

```python
# ===== arXiv API Tool =====

@router.post("/arxiv/search")
async def api_arxiv_search(req: ArxivAPISearchRequest):
    """
    Search arXiv papers using the official API.

    - keywords: List of search keywords
    - mode: "AND" (all keywords must match) or "OR" (any keyword matches)
    - categories: Optional arXiv categories like ["cs.CV", "cs.LG"]
    - max_results: Max papers to return (default 50)
    - days_back: Only papers from last N days
    - sort_by: "submittedDate", "relevance", or "lastUpdatedDate"
    """
    import time
    start_time = time.time()

    # Validate mode
    if req.mode not in ("AND", "OR"):
        raise HTTPException(status_code=400, detail="mode must be 'AND' or 'OR'")

    try:
        papers = await arxiv_api_search(
            keywords=req.keywords,
            categories=req.categories,
            mode=req.mode,  # type: ignore
            max_results=req.max_results,
            days_back=req.days_back,
            sort_by=req.sort_by,  # type: ignore
            sort_order=req.sort_order,  # type: ignore
        )

        search_time_ms = (time.time() - start_time) * 1000

        return {
            "total": len(papers),
            "papers": papers,
            "query": " ".join(req.keywords),
            "search_time_ms": round(search_time_ms, 2),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"arXiv API error: {str(e)}")


@router.get("/arxiv/categories")
async def get_arxiv_categories():
    """Get list of common arXiv categories"""
    from abo.default_modules.arxiv.category import ALL_SUBCATEGORIES

    return {
        "categories": [
            {"code": code, "name": name, "main": code.split(".")[0]}
            for code, name in ALL_SUBCATEGORIES.items()
        ]
    }
```

- [ ] **Step 4: Verify imports at top of file**

Ensure the imports include `HTTPException`:
```python
from fastapi import APIRouter, HTTPException
```

- [ ] **Step 5: Test the API**

Start backend: `python -m abo.main`

Test with curl:
```bash
curl -X POST http://127.0.0.1:8765/api/tools/arxiv/search \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["transformer"], "mode": "OR", "max_results": 3}'
```

Expected: JSON response with papers array.

- [ ] **Step 6: Commit**

```bash
git add abo/routes/tools.py
git commit -m "feat(api): add arxiv search endpoints"
```

---

### Task 4: Create Frontend ArxivAPITool Component

**Files:**
- Create: `src/modules/arxiv/ArxivAPITool.tsx`

- [ ] **Step 1: Write the complete React component**

Create `src/modules/arxiv/ArxivAPITool.tsx`:

```tsx
import { useState, useEffect } from "react";
import {
  Search,
  BookOpen,
  ExternalLink,
  Download,
  Calendar,
  User,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clock,
  Tag,
  FileText,
  Layers,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card } from "../../components/Layout";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";

interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  updated: string;
  categories: string[];
  primary_category: string;
  pdf_url: string;
  arxiv_url: string;
  doi?: string;
  journal_ref?: string;
  comment?: string;
}

const SORT_OPTIONS = [
  { value: "submittedDate", label: "提交日期", order: "descending" },
  { value: "relevance", label: "相关度", order: "descending" },
  { value: "lastUpdatedDate", label: "更新日期", order: "descending" },
];

const MAX_RESULTS_OPTIONS = [10, 20, 50, 100];

const DAYS_BACK_OPTIONS = [
  { value: null, label: "全部时间" },
  { value: 7, label: "最近7天" },
  { value: 30, label: "最近30天" },
  { value: 90, label: "最近90天" },
  { value: 365, label: "最近一年" },
];

export default function ArxivAPITool() {
  const [keywords, setKeywords] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [mode, setMode] = useState<"AND" | "OR">("OR");
  const [maxResults, setMaxResults] = useState(50);
  const [daysBack, setDaysBack] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState("submittedDate");
  const [sortOrder, setSortOrder] = useState("descending");
  const [loading, setLoading] = useState(false);
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [expandedPaper, setExpandedPaper] = useState<string | null>(null);
  const [availableCategories, setAvailableCategories] = useState<{code: string; name: string}[]>([]);
  const { showToast } = useToast();

  // Load categories on mount
  useEffect(() => {
    api.get<{categories: {code: string; name: string}[]}>("/api/tools/arxiv/categories")
      .then(data => setAvailableCategories(data.categories.slice(0, 50))) // Top 50 categories
      .catch(() => {});
  }, []);

  async function handleSearch() {
    const keywordList = keywords.split(/[,\s]+/).filter(k => k.trim());
    if (keywordList.length === 0) {
      showToast("请输入搜索关键词", "error");
      return;
    }

    setLoading(true);
    setPapers([]);
    setSearchTime(null);

    try {
      const startTime = performance.now();
      const result = await api.post<{
        total: number;
        papers: ArxivPaper[];
        query: string;
        search_time_ms: number;
      }>("/api/tools/arxiv/search", {
        keywords: keywordList,
        categories: categories.length > 0 ? categories : undefined,
        mode,
        max_results: maxResults,
        days_back: daysBack,
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      setPapers(result.papers);
      setSearchTime(result.search_time_ms);

      if (result.papers.length === 0) {
        showToast("未找到相关论文", "info");
      }
    } catch (e) {
      showToast("搜索失败: " + String(e), "error");
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(cat: string) {
    setCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="arXiv API 搜索"
        subtitle="使用官方 arXiv API 搜索论文，支持 AND/OR 多关键词组合"
        icon={BookOpen}
      />

      <PageContent maxWidth="1200px">
        {/* Search Panel */}
        <Card style={{ marginBottom: "24px" }}>
          {/* Keywords Input */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "8px",
            }}>
              关键词 (用空格或逗号分隔)
            </label>
            <div style={{ display: "flex", gap: "12px" }}>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="例如: transformer attention"
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "1rem",
                }}
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                style={{
                  padding: "12px 24px",
                  borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                  color: "white",
                  border: "none",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {loading ? (
                  <Loader2 style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
                ) : (
                  <Search style={{ width: "18px", height: "18px" }} />
                )}
                搜索
              </button>
            </div>
          </div>

          {/* Mode Toggle */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "8px",
            }}>
              关键词匹配模式
            </label>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setMode("OR")}
                style={{
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  background: mode === "OR" ? "var(--color-primary)" : "var(--bg-hover)",
                  color: mode === "OR" ? "white" : "var(--text-secondary)",
                  border: "none",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                OR (任一匹配)
              </button>
              <button
                onClick={() => setMode("AND")}
                style={{
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  background: mode === "AND" ? "var(--color-primary)" : "var(--bg-hover)",
                  color: mode === "AND" ? "white" : "var(--text-secondary)",
                  border: "none",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                AND (全部匹配)
              </button>
            </div>
            <p style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              marginTop: "8px",
            }}>
              {mode === "OR"
                ? "匹配包含任一关键词的论文"
                : "只匹配包含所有关键词的论文"}
            </p>
          </div>

          {/* Options Row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "20px",
          }}>
            {/* Max Results */}
            <div>
              <label style={{
                display: "block",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "6px",
              }}>
                最大结果数
              </label>
              <select
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                }}
              >
                {MAX_RESULTS_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Time Range */}
            <div>
              <label style={{
                display: "block",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "6px",
              }}>
                时间范围
              </label>
              <select
                value={daysBack ?? ""}
                onChange={(e) => setDaysBack(e.target.value ? Number(e.target.value) : null)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                }}
              >
                {DAYS_BACK_OPTIONS.map(opt => (
                  <option key={opt.label} value={opt.value ?? ""}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label style={{
                display: "block",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "6px",
              }}>
                排序方式
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                }}
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Categories */}
          <div>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "10px",
              cursor: "pointer",
            }}>
              <Filter style={{ width: "14px", height: "14px" }} />
              分类筛选 (可选)
            </label>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              maxHeight: "120px",
              overflow: "auto",
              padding: "4px",
            }}>
              {availableCategories.map(cat => (
                <button
                  key={cat.code}
                  onClick={() => toggleCategory(cat.code)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-full)",
                    background: categories.includes(cat.code)
                      ? "var(--color-primary)"
                      : "var(--bg-hover)",
                    color: categories.includes(cat.code) ? "white" : "var(--text-secondary)",
                    border: "none",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  title={cat.name}
                >
                  {cat.code}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Results */}
        {papers.length > 0 && (
          <div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}>
              <h3 style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "var(--text-main)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}>
                <FileText style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />
                搜索结果 ({papers.length})
              </h3>
              {searchTime && (
                <span style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}>
                  <Clock style={{ width: "14px", height: "14px" }} />
                  {searchTime.toFixed(0)}ms
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {papers.map((paper) => (
                <Card
                  key={paper.id}
                  style={{
                    padding: "20px",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedPaper(expandedPaper === paper.id ? null : paper.id)}
                >
                  {/* Header */}
                  <div style={{ marginBottom: "12px" }}>
                    <h4 style={{
                      fontSize: "1.0625rem",
                      fontWeight: 700,
                      color: "var(--text-main)",
                      marginBottom: "8px",
                      lineHeight: 1.4,
                    }}>
                      {paper.title}
                    </h4>
                    <div style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "12px",
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <User style={{ width: "14px", height: "14px" }} />
                        {paper.authors.slice(0, 3).join(", ")}
                        {paper.authors.length > 3 && ` +${paper.authors.length - 3}`}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Calendar style={{ width: "14px", height: "14px" }} />
                        {formatDate(paper.published)}
                      </span>
                      <span style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        background: "rgba(188, 164, 227, 0.15)",
                        color: "var(--color-primary)",
                        fontWeight: 600,
                      }}>
                        <Tag style={{ width: "12px", height: "12px" }} />
                        {paper.primary_category}
                      </span>
                    </div>
                  </div>

                  {/* Abstract (collapsible) */}
                  {expandedPaper === paper.id && (
                    <div style={{
                      marginTop: "16px",
                      padding: "16px",
                      background: "var(--bg-hover)",
                      borderRadius: "var(--radius-md)",
                    }}>
                      <p style={{
                        fontSize: "0.9375rem",
                        lineHeight: 1.7,
                        color: "var(--text-secondary)",
                        whiteSpace: "pre-wrap",
                      }}>
                        {paper.summary}
                      </p>

                      {paper.categories.length > 1 && (
                        <div style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px",
                          marginTop: "12px",
                        }}>
                          {paper.categories.map(cat => (
                            <span key={cat} style={{
                              fontSize: "0.75rem",
                              padding: "2px 8px",
                              borderRadius: "var(--radius-full)",
                              background: "var(--bg-card)",
                              color: "var(--text-muted)",
                            }}>
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}

                      {paper.comment && (
                        <p style={{
                          fontSize: "0.8125rem",
                          color: "var(--text-muted)",
                          marginTop: "12px",
                          fontStyle: "italic",
                        }}>
                          {paper.comment}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginTop: "12px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--border-light)",
                  }}>
                    <a
                      href={paper.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--color-primary)",
                        color: "white",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      <Download style={{ width: "14px", height: "14px" }} />
                      PDF
                    </a>
                    <a
                      href={paper.arxiv_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-hover)",
                        color: "var(--text-secondary)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      <ExternalLink style={{ width: "14px", height: "14px" }} />
                      arXiv
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedPaper(expandedPaper === paper.id ? null : paper.id);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "transparent",
                        border: "1px solid var(--border-light)",
                        color: "var(--text-secondary)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        marginLeft: "auto",
                      }}
                    >
                      {expandedPaper === paper.id ? (
                        <>
                          <ChevronUp style={{ width: "14px", height: "14px" }} />
                          收起
                        </>
                      ) : (
                        <>
                          <ChevronDown style={{ width: "14px", height: "14px" }} />
                          摘要
                        </>
                      )}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && papers.length === 0 && !searchTime && (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--text-muted)",
          }}>
            <Layers style={{ width: "48px", height: "48px", marginBottom: "16px", opacity: 0.5 }} />
            <p style={{ fontSize: "1rem", marginBottom: "8px" }}>
              输入关键词开始搜索 arXiv 论文
            </p>
            <p style={{ fontSize: "0.875rem", opacity: 0.8 }}>
              支持 AND/OR 多关键词组合，可筛选分类和时间范围
            </p>
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Add CSS animation for spinner**

Add to `src/index.css` (or ensure it exists):

```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Test TypeScript compilation**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/arxiv/ArxivAPITool.tsx
git commit -m "feat(frontend): add arxiv API tool component"
```

---

### Task 5: Add Navigation and Routing

**Files:**
- Modify: `src/modules/nav/NavSidebar.tsx`
- Modify: `src/modules/MainContent.tsx`
- Modify: `src/core/store.ts` (if ActiveTab type needs extension)

- [ ] **Step 1: Add icon import in NavSidebar.tsx**

Add `BookOpen` to the imports from lucide-react:

```typescript
import {
  Inbox, BookOpen, FileText, MessageSquare,
  Rss, Heart, Settings, Zap, User, Menu, X, Moon, Sun, LayoutGrid, FolderOpen,
  ChevronDown, BookHeart, Tv
} from "lucide-react";
```

- [ ] **Step 2: Find the TOOLS section and add arXiv item**

Look for the TOOLS section in NavSidebar.tsx (around line 150-200), and add the arXiv tool:

```typescript
const TOOLS: NavItem[] = [
  // ... existing tools
  { id: "arxiv", label: "arXiv API", Icon: BookOpen },
  // ... other tools
];
```

- [ ] **Step 3: Add route in MainContent.tsx**

Add import:
```typescript
import ArxivAPITool from "./arxiv/ArxivAPITool";
```

Add to the switch statement:
```typescript
{activeTab === "arxiv" && <ArxivTracker />}
{activeTab === "arxiv-api" && <ArxivAPITool />}
```

- [ ] **Step 4: Update store.ts if needed**

Check `src/core/store.ts` for the `ActiveTab` type. Add `"arxiv-api"` to the union if it's explicitly typed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/nav/NavSidebar.tsx src/modules/MainContent.tsx
git commit -m "feat(nav): add arxiv-api tool to navigation"
```

---

### Task 6: Integration Test

**Files:**
- None (testing only)

- [ ] **Step 1: Start backend**

```bash
python -m abo.main
```

- [ ] **Step 2: Start frontend**

```bash
npm run dev
```

- [ ] **Step 3: Test OR mode search**

1. Navigate to "arXiv API" in the sidebar
2. Enter keywords: "transformer attention"
3. Select "OR (任一匹配)" mode
4. Click search
5. Verify results load quickly (< 5 seconds for 50 results)
6. Check search time displayed

- [ ] **Step 4: Test AND mode search**

1. Same keywords
2. Select "AND (全部匹配)" mode
3. Click search
4. Verify fewer results than OR mode (more restrictive)

- [ ] **Step 5: Test category filter**

1. Select "cs.CV" category
2. Search with keyword "diffusion"
3. Verify all results are in cs.CV category

- [ ] **Step 6: Test time range filter**

1. Select "最近7天"
2. Search
3. Verify all papers are recent

- [ ] **Step 7: Test PDF links**

1. Click PDF button on any result
2. Verify PDF opens in new tab

- [ ] **Step 8: Performance check**

Measure and record:
- Search with max_results=100, note response time
- Check if UI feels responsive during loading
- Verify no freezing or lag when expanding abstracts

Expected: Search should complete in 2-5 seconds for 100 results. UI should remain responsive.

- [ ] **Step 9: Commit test results**

Document findings in a simple markdown file:

```bash
cat > docs/superpowers/plans/arxiv-api-test-results.md << 'EOF'
# arXiv API Tool Test Results

Date: 2026-04-05

## Performance Test Results

| Test Case | Results | Time |
|-----------|---------|------|
| OR mode, 50 results | PASSED | X ms |
| AND mode, 50 results | PASSED | X ms |
| 100 results | PASSED | X ms |
| Category filter | PASSED | X ms |
| 7-day time filter | PASSED | X ms |

## Comparison with arxiv-tracker module

| Aspect | arxiv-tracker (scraper) | arxiv-api (new) |
|--------|------------------------|-----------------|
| Speed | Slower (12s delay) | Faster (3s delay built-in) |
| Rate limiting | Manual handling | Built-in retry |
| Reliability | Can get blocked | Official API, more reliable |

## Conclusion

The arxiv-api tool is [faster/slower/similar] compared to the crawler-based tracker.
EOF
git add docs/superpowers/plans/arxiv-api-test-results.md
git commit -m "docs: add arxiv-api test results"
```

---

## Summary

This implementation creates a completely separate arXiv search tool:

1. **Backend**: New `abo/tools/arxiv_api/` module using the official `arxiv` package
2. **API**: New endpoints in `/api/tools/arxiv/*`
3. **Frontend**: New `ArxivAPITool` component accessible via sidebar
4. **No conflicts**: Different IDs, different routes, different from `arxiv-tracker`

The key differences from the existing `arxiv-tracker`:
- Uses `pip install arxiv` instead of direct HTTP requests
- User-triggered searches (not scheduled)
- Simpler codebase leveraging the arxiv package
- Built-in rate limiting and retry logic
