# ABO v2.0 自动化科研助手系统 - 主实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** 构建完整的自动化科研情报系统，集成多源爬虫、智能推荐、游戏化激励，实现真正的个人知识助手

**Architecture:** 模块化爬虫 → 偏好学习引擎 → 游戏化状态系统 → 智能推送，所有数据流向统一的情报Feed并支持用户反馈闭环

**Tech Stack:** Python + FastAPI + APScheduler + SQLite, React + Zustand + WebSocket, Claude CLI for AI processing

---

## 阶段总览

| Phase | 名称 | 预计时间 | 核心产出 |
|-------|------|----------|----------|
| P0 | Bug修复 & 立即优化 | 2-3h | 命名规范、图片/PDF保存、定时调度 |
| P1 | 爬虫模块完成 | 4-6h | 小红书/哔哩哔哩/小宇宙/知乎可用 |
| P2 | 偏好学习系统 | 3-4h | 关键词库、优先级算法、推荐排序 |
| P3 | 游戏化数值系统 | 4-5h | SAN值、幸福度、奖励面板、数据绑定 |
| P4 | 系统集成 & 优化 | 3-4h | 全链路打通、性能优化、用户体验 |

---

# Phase 0 - Bug修复与立即优化

## P0-Task 1: 修复 Follow-up 论文命名规范

**Files:**
- Modify: `abo/main.py:save_s2_to_literature()`

- [ ] **Step 1: 分析当前命名问题**

Current structure: `{Prefix}_后续论文/{paper_id}/`
Target structure: `{SourceTitle}_FollowUp/{AuthorYear}-{ShortTitle}/`

- [ ] **Step 2: 重构命名逻辑**

```python
# 新的命名规则
source_slug = "".join(c for c in source_title[:8] if c.isalnum()).upper()  # VGGT -> VGGT
first_author = p["authors"][0].split()[-1] if p["authors"] else "Unknown"  # Wang
year = p.get("year", datetime.now().year)  # 2025
short_title = "".join(c for c in p["title"][:15] if c.isalnum()).upper()  # DEPTHREFINEMENT

# 文件夹结构
folder_name = f"{source_slug}_FollowUp"  # VGGT_FollowUp
paper_folder_name = f"{first_author}{year}-{short_title}"  # Wang2025-DEPTHREFINEMENT

# 最终路径
# FollowUps/VGGT_FollowUp/Wang2025-DEPTHREFINEMENT/
#   ├── Wang2025-DEPTHREFINEMENT.md
#   ├── figures/
#   │   ├── 01_overview.png
#   │   ├── 02_pipeline.png
#   │   └── 03_method.png
#   └── paper.pdf
```

- [ ] **Step 3: 实现代码修改**

在 `save_s2_to_literature()` 中替换文件夹创建逻辑：

```python
# Get source paper info for naming
source_title = meta.get("source_paper_title", "Unknown")
source_slug = "".join(c for c in source_title[:8] if c.isalnum()).upper() or "FOLLOWUP"

# Build paper folder name: AuthorYear-ShortTitle
first_author = meta.get("authors", ["Unknown"])[0].split()[-1].replace(",", "")
year = meta.get("year", datetime.now().year)
short_title = "".join(c for c in title[:20] if c.isalnum()).upper()
paper_folder_name = f"{first_author}{year}-{short_title}"

# Build target path
base_dir = lit_path / "FollowUps" / f"{source_slug}_FollowUp"
paper_dir = base_dir / paper_folder_name
paper_dir.mkdir(parents=True, exist_ok=True)

# Figures inside paper folder
figures_dir = paper_dir / "figures"
figures_dir.mkdir(exist_ok=True)

# Markdown filename matches folder
md_filename = f"{paper_folder_name}.md"
target_path = paper_dir / md_filename
```

- [ ] **Step 4: 测试验证**

```bash
curl -X POST http://127.0.0.1:8765/api/modules/semantic-scholar/save-to-literature \
  -H "Content-Type: application/json" \
  -d '{"paper": {...}}'

# Verify path contains: FollowUps/VGGT_FollowUp/Author2025-TITLE/
```

---

## P0-Task 2: 修复图片下载功能

**Files:**
- Modify: `abo/main.py:save_s2_to_literature()`

- [ ] **Step 1: 诊断当前图片获取失败原因**

当前问题：arXiv HTML 页面图片可能需要 JavaScript 或权限验证

- [ ] **Step 2: 实现多源图片获取策略**

```python
async def fetch_paper_figures(arxiv_id: str, max_figures: int = 5) -> list[dict]:
    """Try multiple sources to get paper figures"""
    figures = []

    # Strategy 1: arXiv HTML (current)
    figures = await _fetch_from_arxiv_html(arxiv_id, max_figures)
    if len(figures) >= 3:
        return figures[:max_figures]

    # Strategy 2: arXiv PDF extraction
    remaining = max_figures - len(figures)
    pdf_figures = await _extract_from_arxiv_pdf(arxiv_id, remaining)
    figures.extend(pdf_figures)

    # Strategy 3: Semantic Scholar API for figures
    if len(figures) < 2:
        s2_figures = await _fetch_from_semantic_scholar(arxiv_id, max_figures - len(figures))
        figures.extend(s2_figures)

    return figures[:max_figures]
```

- [ ] **Step 3: 实现 PDF 图片提取**

```python
async def _extract_from_arxiv_pdf(arxiv_id: str, max_figures: int) -> list[dict]:
    """Download PDF and extract figures using pdf2image"""
    import pdf2image
    from PIL import Image

    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(pdf_url)
        if resp.status_code != 200:
            return []

        # Save PDF temporarily
        temp_pdf = Path(f"/tmp/{arxiv_id}.pdf")
        temp_pdf.write_bytes(resp.content)

        # Convert first few pages to images
        images = pdf2image.convert_from_path(temp_pdf, first_page=1, last_page=5)

        figures = []
        for i, image in enumerate(images[:max_figures]):
            # Detect if page contains figure (simple heuristic: aspect ratio)
            width, height = image.size
            if height > width * 0.8:  # Likely a figure page
                fig_path = figures_dir / f"figure_{i+1:02d}.png"
                image.save(fig_path, "PNG")
                figures.append({
                    "filename": fig_path.name,
                    "caption": f"Page {i+1}",
                    "local_path": f"figures/{fig_path.name}",
                    "original_url": f"pdf_page_{i+1}"
                })

        temp_pdf.unlink()
        return figures
```

- [ ] **Step 4: 安装依赖并测试**

```bash
pip install pdf2image pillow
brew install poppler  # macOS
# 或 apt-get install poppler-utils  # Linux

# Test
curl -X POST ... | python3 -m json.tool
# Should return figures array with valid paths
```

---

## P0-Task 3: 修复 PDF 保存功能

**Files:**
- Modify: `abo/main.py:save_s2_to_literature()`

- [ ] **Step 1: 实现可靠的 PDF 下载**

```python
async def download_arxiv_pdf(arxiv_id: str, target_path: Path) -> str | None:
    """Download PDF from arXiv with retries"""
    import asyncio

    sources = [
        f"https://arxiv.org/pdf/{arxiv_id}.pdf",
        f"https://ar5iv.org/pdf/{arxiv_id}.pdf",
        f"https://r.jina.ai/http://arxiv.org/pdf/{arxiv_id}.pdf",
    ]

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        for url in sources:
            try:
                resp = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                })
                if resp.status_code == 200 and len(resp.content) > 10000:  # Valid PDF > 10KB
                    pdf_path = target_path / "paper.pdf"
                    pdf_path.write_bytes(resp.content)
                    return "paper.pdf"
                await asyncio.sleep(0.5)
            except Exception as e:
                print(f"[pdf] Failed to download from {url}: {e}")
                continue

    return None
```

- [ ] **Step 2: 集成到保存流程**

```python
# In save_s2_to_literature()
pdf_path = None
if arxiv_id:
    pdf_path = await download_arxiv_pdf(arxiv_id, paper_dir)
    if pdf_path:
        metadata["pdf-path"] = pdf_path
```

---

## P0-Task 4: 配置每日定时爬取

**Files:**
- Modify: `abo/default_modules/semantic_scholar_tracker/__init__.py`
- Modify: `abo/runtime/scheduler.py` (if needed)

- [ ] **Step 1: 确保模块调度配置正确**

```python
class SemanticScholarTracker(Module):
    id = "semantic-scholar-tracker"
    name = "Semantic Scholar 后续论文"
    schedule = "0 10 * * *"  # 每天10:00

    # Default queries to run
    DEFAULT_QUERIES = ["VGGT", "Gaussian Splatting", "NeRF"]

    async def fetch(self, **kwargs) -> list[Item]:
        # Support scheduled execution with default queries
        queries = kwargs.get("queries", self.DEFAULT_QUERIES)
        all_items = []
        for query in queries:
            items = await self.fetch_followups(query=query, max_results=10, days_back=1)
            all_items.extend(items)
        return all_items
```

- [ ] **Step 2: 验证调度器日志**

```bash
# Check scheduler started correctly
grep "scheduler" /tmp/abo_backend.log
# Should see: [scheduler] Started with X module(s)
# And: semantic-scholar-tracker next run at 2026-04-04 10:00:00
```

---

# Phase 1 - 完成爬虫模块 (小红书/哔哩哔哩/小宇宙/知乎)

## P1-Task 1: 小红书爬虫实现

**Files:**
- Create: `abo/default_modules/xiaohongshu/__init__.py`
- Modify: `abo/main.py` (add routes)

- [ ] **Step 1: 调研小红书 API/网页结构**

```bash
# Check current module structure
cat abo/default_modules/xiaohongshu/__init__.py
```

- [ ] **Step 2: 实现小红书搜索爬虫**

```python
class XiaohongshuTracker(Module):
    id = "xiaohongshu-tracker"
    name = "小红书"
    schedule = "0 11 * * *"  # 每天11:00
    icon = "book-heart"

    SEARCH_KEYWORDS = ["科研工具", "论文写作", "学术日常"]

    async def fetch(self, **kwargs) -> list[Item]:
        """Fetch notes from Xiaohongshu search"""
        import httpx

        items = []
        keyword = kwargs.get("keyword", self.SEARCH_KEYWORDS[0])

        # Use web API or scraping
        url = f"https://www.xiaohongshu.com/search_result?keyword={quote(keyword)}"

        async with httpx.AsyncClient() as client:
            # Implementation depends on API availability
            # May need to use Playwright/Selenium for SPA
            pass

        return items
```

---

## P1-Task 2-4: 哔哩哔哩/小宇宙/知乎爬虫

类似结构，略...

---

# Phase 2 - 偏好学习与推荐系统

## P2-Task 1: 构建关键词偏好数据库

**Files:**
- Create: `abo/preferences/keywords.py`
- Modify: `abo/store/cards.py`

- [ ] **Step 1: 设计关键词偏好模型**

```python
@dataclass
class KeywordPreference:
    keyword: str
    score: float  # -1.0 to 1.0, accumulated from feedback
    count: int    # number of interactions
    source_modules: set[str]  # which modules this keyword came from
    last_updated: datetime
```

- [ ] **Step 2: 实现偏好存储**

```python
class PreferenceEngine:
    def __init__(self):
        self._keyword_prefs: dict[str, KeywordPreference] = {}
        self._load()

    def update_from_feedback(self, card_id: str, action: FeedbackAction, card_tags: list[str]):
        """Update keyword preferences based on user feedback"""
        delta = 0.3 if action == FeedbackAction.LIKE else -0.2 if action == FeedbackAction.DISLIKE else 0

        for tag in card_tags:
            if tag in self._keyword_prefs:
                pref = self._keyword_prefs[tag]
                pref.score = (pref.score * pref.count + delta) / (pref.count + 1)
                pref.count += 1
            else:
                self._keyword_prefs[tag] = KeywordPreference(
                    keyword=tag, score=delta, count=1,
                    source_modules=set(), last_updated=datetime.now()
                )

        self._save()
```

---

## P2-Task 2: 实现内容优先级排序

**Files:**
- Modify: `abo/store/cards.py`

```python
def get_prioritized_cards(self, prefs: PreferenceEngine, limit: int = 50) -> list[Card]:
    """Return cards sorted by user preference score"""
    cards = self.get_recent(limit=limit * 2)  # Get more for filtering

    def score_card(card: Card) -> float:
        base_score = card.score  # AI relevance score
        pref_score = sum(prefs.get_score(tag) for tag in card.tags)
        return base_score * 0.6 + pref_score * 0.4  # Weighted combination

    cards.sort(key=score_card, reverse=True)
    return cards[:limit]
```

---

# Phase 3 - 游戏化数值系统

## P3-Task 1: 扩展游戏状态模型

**Files:**
- Modify: `abo/profile/stats.py`

- [ ] **Step 1: 添加 SAN 值和幸福度**

```python
@dataclass
class GameState:
    # Existing
    energy: EnergyState
    level: int
    title: str

    # New metrics
    san: float  # 0-100, sanity/mental health
    happiness: float  # 0-100
    productivity: float  # 0-100, daily productivity score

    # Streaks
    daily_login_streak: int
    research_streak: int  # consecutive days with research activity

    # Achievements tracking
    achievements: list[Achievement]
    unlocked_skills: list[str]
```

---

## P3-Task 2: 实现行为-数值映射

**Files:**
- Create: `abo/game/actions.py`

```python
ACTION_REWARDS = {
    # Research actions
    "save_paper": {"xp": 10, "happiness": 2, "productivity": 5},
    "read_paper": {"xp": 15, "san": -2, "productivity": 8},
    "like_content": {"xp": 5, "happiness": 3},
    "complete_crawl": {"xp": 20, "productivity": 10},

    # Daily actions
    "daily_login": {"xp": 5, "happiness": 1},
    "check_feed": {"xp": 2},
    "save_to_literature": {"xp": 15, "productivity": 5},
}

def apply_action(user_id: str, action: str, metadata: dict = None):
    """Apply action rewards to user game state"""
    rewards = ACTION_REWARDS.get(action, {})
    state = load_game_state(user_id)

    for key, delta in rewards.items():
        if key == "xp":
            state.add_xp(delta)
        elif hasattr(state, key):
            setattr(state, key, min(100, getattr(state, key) + delta))

    state.save()
    return state
```

---

## P3-Task 3: 前端数值面板

**Files:**
- Modify: `src/modules/profile/Profile.tsx`

```tsx
// Add to profile page
function StatsPanel({ stats }: { stats: ProfileStats }) {
  return (
    <div className="stats-grid">
      <StatCard
        label="SAN值"
        value={stats.san}
        icon={Brain}
        color={stats.san > 70 ? "green" : stats.san > 30 ? "yellow" : "red"}
        description="精神状态，过低会影响效率"
      />
      <StatCard
        label="幸福度"
        value={stats.happiness}
        icon={Heart}
        color={stats.happiness > 70 ? "pink" : "gray"}
        description="基于喜欢的内容和互动"
      />
      <StatCard
        label="今日效率"
        value={stats.productivity}
        icon={Zap}
        color="blue"
        description="研究行为和产出的量化"
      />
    </div>
  );
}
```

---

# Phase 4 - 系统集成与优化

## P4-Task 1: Feed-游戏化绑定

**Files:**
- Modify: `src/modules/feed/Feed.tsx`
- Modify: `abo/main.py` (feedback routes)

```python
@app.post("/api/cards/{card_id}/feedback")
async def submit_feedback(card_id: str, data: FeedbackRequest):
    # 1. Save feedback
    card_store.add_feedback(card_id, data.action)

    # 2. Update keyword preferences
    card = card_store.get(card_id)
    prefs.update_from_feedback(card_id, data.action, card.tags)

    # 3. Apply game rewards
    game.apply_action(user_id, f"card_{data.action}")

    # 4. Broadcast update
    await broadcaster.send_event({
        "type": "feedback_recorded",
        "card_id": card_id,
        "rewards": calculate_rewards(data.action)
    })
```

---

## P4-Task 2: 奖励面板机制

**Files:**
- Create: `src/modules/profile/RewardsPanel.tsx`

```tsx
function RewardsPanel() {
  const { rewards, claimReward } = useRewards();

  return (
    <div className="rewards-panel">
      <h3>今日奖励</h3>
      {rewards.map(reward => (
        <RewardCard
          key={reward.id}
          title={reward.title}
          description={reward.description}
          icon={reward.icon}
          unlocked={reward.unlocked}
          claimed={reward.claimed}
          onClaim={() => claimReward(reward.id)}
        />
      ))}
    </div>
  );
}
```

---

# 执行建议

**推荐执行顺序:**
1. **P0** (Bug修复) - 立即执行，2-3小时
2. **P1** (爬虫完成) - 可以并行开发各平台
3. **P2+P3** (偏好+游戏化) - 可并行，核心功能
4. **P4** (集成) - 最后统一联调

**每个Phase完成后应:**
- 运行完整测试
- 提交Git commit
- 验证功能可用

---

**Plan created at:** 2026-04-03
**Estimated total time:** 16-22 hours
**Recommended approach:** Subagent-Driven Development (fresh agent per phase)
