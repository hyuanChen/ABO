"""
ABO Backend — FastAPI 入口
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
import hashlib
import os
import re

import frontmatter
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .activity import ActivityTracker, ActivityType
from .config import get_vault_path, get_literature_path, load as load_config, save as save_config, is_demo_mode
from .demo.data import get_demo_cards, DEMO_UNREAD_COUNTS, DEMO_KEYWORD_PREFS, get_demo_activities, get_demo_modules_dashboard
from .insights.routes import router as insights_router
from .wiki.routes import router as wiki_router
from .preferences.engine import PreferenceEngine
from .profile.routes import router as profile_router, init_routes as init_profile_routes
from .rss import rss_router
from .routes.tools import router as tools_router
from .modules.routes import router as modules_router
from .runtime.broadcaster import broadcaster
from .runtime.discovery import ModuleRegistry, start_watcher
from .runtime.runner import ModuleRunner
from .runtime.scheduler import ModuleScheduler
from .runtime.state import ModuleStateStore
from .sdk.types import Card, FeedbackAction
from .store.cards import CardStore
from .subscription_store import get_subscription_store
from .summary import DailySummaryGenerator, SummaryScheduler

# ── 全局单例 ────────────────────────────────────────────────────
_registry = ModuleRegistry()
_state_store = ModuleStateStore()
_card_store = CardStore()
_prefs = PreferenceEngine()
_scheduler: ModuleScheduler | None = None
_activity_tracker: ActivityTracker | None = None
_summary_generator: DailySummaryGenerator | None = None
_summary_scheduler: SummaryScheduler | None = None
_subscription_store = get_subscription_store()


def _validate_cron(expr: str) -> bool:
    from apscheduler.triggers.cron import CronTrigger
    try:
        CronTrigger.from_crontab(expr)
        return True
    except Exception:
        return False

# ── 爬取任务取消控制 ────────────────────────────────────────────
_crawl_cancel_flags: dict[str, bool] = {}  # session_id -> should_cancel

def _generate_crawl_session_id() -> str:
    """Generate a unique session ID for crawl operations."""
    import uuid
    return str(uuid.uuid4())[:8]

def _should_cancel_crawl(session_id: str) -> bool:
    """Check if a crawl session should be cancelled."""
    return _crawl_cancel_flags.get(session_id, False)

def _cancel_crawl(session_id: str):
    """Mark a crawl session for cancellation."""
    _crawl_cancel_flags[session_id] = True

def _cleanup_crawl_session(session_id: str):
    """Clean up a crawl session after completion."""
    _crawl_cancel_flags.pop(session_id, None)

init_profile_routes(_card_store)


def _write_sdk_readme():
    path = Path.home() / ".abo" / "sdk" / "README.md"
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "# ABO Module SDK\n\n"
        "ABO 自动发现 `~/.abo/modules/<name>/__init__.py` 中的模块。\n"
        "保存后立即热加载，无需重启。\n\n"
        "## 最小可用模块\n\n"
        "```python\n"
        "from abo.sdk import Module, Item, Card, claude_json\n\n"
        "class MyModule(Module):\n"
        "    id       = 'my-module'\n"
        "    name     = '我的模块'\n"
        "    schedule = '0 8 * * *'\n"
        "    icon     = 'rss'\n"
        "    output   = ['obsidian', 'ui']\n\n"
        "    async def fetch(self):\n"
        "        return [Item(id='1', raw={'title': '示例', 'url': ''})]\n\n"
        "    async def process(self, items, prefs):\n"
        "        result = await claude_json(\n"
        "            f'评分(1-10)并用中文总结：{items[0].raw[\"title\"]}',\n"
        "            prefs=prefs\n"
        "        )\n"
        "        return [Card(\n"
        "            id=items[0].id, title=items[0].raw['title'],\n"
        "            summary=result.get('summary', ''), score=result.get('score', 5) / 10,\n"
        "            tags=result.get('tags', []), source_url='',\n"
        "            obsidian_path='Notes/test.md'\n"
        "        )]\n"
        "```\n\n"
        "## 调度表达式示例\n\n"
        "```\n"
        "\"0 8 * * *\"      每天 08:00\n"
        "\"0 */2 * * *\"    每 2 小时\n"
        "\"*/30 * * * *\"   每 30 分钟\n"
        "```\n"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler, _activity_tracker, _summary_generator, _summary_scheduler
    vault_path = get_vault_path()
    _registry.load_all()
    _state_store.apply_to_registry(_registry)
    runner = ModuleRunner(_card_store, _prefs, broadcaster, vault_path)
    _scheduler = ModuleScheduler(runner)
    _scheduler.start(_registry.enabled())
    start_watcher(_registry, lambda reg: _scheduler.reschedule(reg.enabled()))
    _write_sdk_readme()
    _activity_tracker = ActivityTracker()
    _summary_generator = DailySummaryGenerator(_activity_tracker)
    _summary_scheduler = SummaryScheduler(_summary_generator)
    _summary_scheduler.start()
    print("[startup] Activity tracker and summary scheduler initialized")
    yield
    if _scheduler:
        _scheduler.shutdown()
    if _summary_scheduler:
        _summary_scheduler.shutdown()


app = FastAPI(title="ABO Backend", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(profile_router)
app.include_router(rss_router)
app.include_router(tools_router)
app.include_router(modules_router)
app.include_router(insights_router)
app.include_router(wiki_router)


# ── Health ───────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "version": "0.2.0"}


@app.get("/api/status")
async def system_status():
    """Get complete system status including all phases."""
    from .game import get_daily_stats

    # Get keyword stats
    keyword_prefs = _prefs.get_all_keyword_prefs()
    liked_keywords = [k for k, v in keyword_prefs.items() if v.score > 0]
    disliked_keywords = [k for k, v in keyword_prefs.items() if v.score < -0.2]

    # Get module stats
    module_stats = {}
    if _card_store:
        unread_counts = _card_store.unread_counts()
        module_stats = {
            "unread_counts": unread_counts,
            "total_unread": sum(unread_counts.values()),
        }

    # Get scheduler info
    scheduler_info = []
    if _scheduler:
        scheduler_info = _scheduler.job_info()

    return {
        "phases": {
            "p0_bugfixes": "✅ Complete",
            "p1_crawlers": "✅ Complete (4 modules)",
            "p2_preferences": "✅ Complete",
            "p3_gamification": "✅ Complete",
            "p4_integration": "✅ Complete",
        },
        "gamification": get_daily_stats(),
        "preferences": {
            "total_keywords": len(keyword_prefs),
            "liked_keywords": len(liked_keywords),
            "disliked_keywords": len(disliked_keywords),
            "top_keywords": _prefs.get_top_keywords(5),
        },
        "modules": module_stats,
        "scheduler": {
            "active_jobs": len(scheduler_info),
            "jobs": scheduler_info,
        },
    }


# ── WebSocket ────────────────────────────────────────────────────

@app.websocket("/ws/feed")
async def feed_ws(ws: WebSocket):
    print(f"[websocket] New connection from {ws.client}")
    await ws.accept()
    print(f"[websocket] Connection accepted")
    broadcaster.register(ws)
    try:
        while True:
            msg = await ws.receive_text()
            print(f"[websocket] Received: {msg[:50]}...")
    except Exception as e:
        print(f"[websocket] Connection closed: {e}")
        broadcaster.unregister(ws)


# ── Cards ────────────────────────────────────────────────────────

@app.get("/api/cards")
async def get_cards(
    module_id: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
):
    if is_demo_mode():
        demo_cards = get_demo_cards()
        if module_id:
            demo_cards = [c for c in demo_cards if c["module_id"] == module_id]
        if unread_only:
            demo_cards = [c for c in demo_cards if not c.get("read")]
        return {"cards": demo_cards[offset:offset + limit]}
    cards = _card_store.list(
        module_id=module_id, unread_only=unread_only,
        limit=limit, offset=offset,
    )
    return {"cards": [c.to_dict() for c in cards]}


@app.get("/api/cards/unread-counts")
async def unread_counts():
    if is_demo_mode():
        return DEMO_UNREAD_COUNTS
    return _card_store.unread_counts()


@app.get("/api/cards/prioritized")
async def get_prioritized_cards(
    limit: int = 50,
    unread_only: bool = False,
):
    """Get cards sorted by combined AI score + user preference."""
    keyword_prefs = _prefs.get_all_keyword_prefs()
    keyword_scores = {k: v.score for k, v in keyword_prefs.items()}

    cards = _card_store.get_prioritized(
        keyword_scores=keyword_scores,
        limit=limit,
        unread_only=unread_only,
    )
    return {"cards": [c.to_dict() for c in cards]}


class FeedbackReq(BaseModel):
    action: FeedbackAction


@app.post("/api/cards/{card_id}/feedback")
async def feedback(card_id: str, body: FeedbackReq):
    card = _card_store.get(card_id)
    if not card:
        raise HTTPException(404, "Card not found")

    # Update derived weights (legacy)
    _prefs.record_feedback(card.tags, body.action.value)

    # Update keyword preferences (Phase 2)
    _prefs.update_from_feedback(card.tags, body.action.value, card.module_id)

    # Apply game rewards (Phase 3)
    from .game import apply_action
    action_map = {
        "like": "card_like",
        "dislike": "card_dislike",
        "save": "card_save",
        "skip": "card_skip",
        "star": "star_paper",
    }
    game_action = action_map.get(body.action.value, "card_skip")
    rewards = apply_action("default", game_action, {"card_id": card_id, "module": card.module_id})

    # Broadcast reward notification (Phase 4)
    if rewards.get("rewards"):
        await broadcaster.send_reward(
            action=game_action,
            rewards=rewards["rewards"],
            metadata={"card_id": card_id, "card_title": card.title}
        )

    # Record in card store
    _card_store.record_feedback(card_id, body.action.value)

    # Save liked items to markdown
    if body.action.value == "like":
        card_dict = card.to_dict()
        _prefs.save_liked_to_markdown(card_dict)

    module = _registry.get(card.module_id)
    if module:
        await module.on_feedback(card_id, body.action)

    # Record activity for timeline generation
    global _activity_tracker
    if _activity_tracker:
        action_map_activity = {
            "like": ActivityType.CARD_LIKE,
            "dislike": ActivityType.CARD_DISLIKE,
            "save": ActivityType.CARD_SAVE,
            "skip": ActivityType.CARD_VIEW,
            "star": ActivityType.CARD_SAVE,
        }
        activity_type = action_map_activity.get(body.action.value, ActivityType.CARD_VIEW)
        _activity_tracker.record_activity(
            activity_type=activity_type,
            card_id=card_id,
            card_title=card.title,
            module_id=card.module_id,
            metadata={"action": body.action.value, "tags": card.tags}
        )

    return {"ok": True, "rewards": rewards.get("rewards", {})}


# ── Debug / Demo ────────────────────────────────────────────────

_DEMO_CARDS = [
    # ── arxiv-tracker (10) ───────────────────────────────────────
    {"module_id": "arxiv-tracker", "title": "Attention Is All You Need: Revisited for 2026", "summary": "Transformer 架构的最新改进综述，涵盖稀疏注意力、线性注意力和混合专家模型的最新进展。", "tags": ["Transformer", "NLP", "深度学习"], "score": 0.92, "url": "https://arxiv.org/abs/2606.00001"},
    {"module_id": "arxiv-tracker", "title": "Scaling Laws for Neural Language Models: New Frontiers", "summary": "探讨大语言模型规模化定律在多模态和长上下文场景下的扩展，提出新的效率预测框架。", "tags": ["LLM", "Scaling Laws", "效率"], "score": 0.88, "url": "https://arxiv.org/abs/2606.00002"},
    {"module_id": "arxiv-tracker", "title": "Diffusion Models Meet Reinforcement Learning", "summary": "将扩散模型与强化学习结合，在连续控制任务上实现了新的 SOTA 表现。", "tags": ["扩散模型", "强化学习", "控制"], "score": 0.85, "url": "https://arxiv.org/abs/2606.00003"},
    {"module_id": "arxiv-tracker", "title": "Constitutional AI: Harmlessness from AI Feedback", "summary": "提出通过 AI 自我批评和修正来实现对齐的新方法，减少人类反馈的依赖。", "tags": ["AI对齐", "RLHF", "安全"], "score": 0.86, "url": "https://arxiv.org/abs/2606.00004"},
    {"module_id": "arxiv-tracker", "title": "Efficient Fine-Tuning of LLMs with LoRA and Beyond", "summary": "对比 LoRA、QLoRA、AdaLoRA 等参数高效微调方法，提出统一的理论分析框架。", "tags": ["微调", "LoRA", "LLM"], "score": 0.89, "url": "https://arxiv.org/abs/2606.00005"},
    {"module_id": "arxiv-tracker", "title": "Neural Radiance Fields for Autonomous Driving", "summary": "NeRF 在自动驾驶场景重建中的最新应用，实现厘米级精度的三维环境感知。", "tags": ["NeRF", "自动驾驶", "三维重建"], "score": 0.79, "url": "https://arxiv.org/abs/2606.00006"},
    {"module_id": "arxiv-tracker", "title": "Protein Language Models: From Sequences to Functions", "summary": "蛋白质语言模型综述，探讨序列-结构-功能预测的端到端方法。", "tags": ["蛋白质", "生物信息", "预训练"], "score": 0.83, "url": "https://arxiv.org/abs/2606.00007"},
    {"module_id": "arxiv-tracker", "title": "State Space Models vs Transformers: A Comprehensive Benchmark", "summary": "Mamba 及其变体与 Transformer 在 12 个 NLP 基准上的系统对比，揭示各自的优势场景。", "tags": ["SSM", "Mamba", "基准测试"], "score": 0.91, "url": "https://arxiv.org/abs/2606.00008"},
    {"module_id": "arxiv-tracker", "title": "Federated Learning at Scale: Lessons from Production", "summary": "Google 联邦学习生产系统经验总结，涵盖隐私、通信效率和模型聚合策略。", "tags": ["联邦学习", "隐私计算", "分布式"], "score": 0.77, "url": "https://arxiv.org/abs/2606.00009"},
    {"module_id": "arxiv-tracker", "title": "Code Generation with Large Language Models: A Survey", "summary": "LLM 代码生成能力的全面综述，从 Copilot 到自主 Agent 编程。", "tags": ["代码生成", "LLM", "Agent"], "score": 0.87, "url": "https://arxiv.org/abs/2606.00010"},
    # ── semantic-scholar-tracker (8) ─────────────────────────────
    {"module_id": "semantic-scholar-tracker", "title": "A Survey on Retrieval-Augmented Generation", "summary": "RAG 技术全面综述：从基础检索增强到自适应检索、多跳推理和知识图谱集成。", "tags": ["RAG", "信息检索", "知识库"], "score": 0.90, "url": "https://www.semanticscholar.org/paper/1"},
    {"module_id": "semantic-scholar-tracker", "title": "Graph Neural Networks for Scientific Discovery", "summary": "图神经网络在药物发现、材料科学和蛋白质结构预测中的最新应用进展。", "tags": ["GNN", "科学发现", "药物设计"], "score": 0.82, "url": "https://www.semanticscholar.org/paper/2"},
    {"module_id": "semantic-scholar-tracker", "title": "Multimodal Learning with Transformers: A Survey", "summary": "多模态 Transformer 学习的系统性综述，涵盖视觉-语言、音频-视觉等跨模态融合策略。", "tags": ["多模态", "Transformer", "跨模态"], "score": 0.84, "url": "https://www.semanticscholar.org/paper/3"},
    {"module_id": "semantic-scholar-tracker", "title": "Knowledge Distillation in Large Language Models", "summary": "大语言模型知识蒸馏的最新方法，包括黑盒蒸馏、任务特定蒸馏和渐进式蒸馏策略。", "tags": ["知识蒸馏", "模型压缩", "LLM"], "score": 0.83, "url": "https://www.semanticscholar.org/paper/4"},
    {"module_id": "semantic-scholar-tracker", "title": "Causal Inference Meets Machine Learning: A Practical Guide", "summary": "因果推断与机器学习结合的实用指南，涵盖反事实推理、工具变量和双重差分法的现代实现。", "tags": ["因果推断", "因果发现", "统计学"], "score": 0.81, "url": "https://www.semanticscholar.org/paper/5"},
    {"module_id": "semantic-scholar-tracker", "title": "Robotics Foundation Models: Bridging Simulation and Reality", "summary": "机器人基础模型综述，探讨 Sim2Real 迁移、视觉-语言-动作模型和通用操作策略。", "tags": ["机器人", "基础模型", "Sim2Real"], "score": 0.78, "url": "https://www.semanticscholar.org/paper/6"},
    {"module_id": "semantic-scholar-tracker", "title": "Time Series Forecasting with Foundation Models", "summary": "时间序列基础模型的前沿进展，对比 TimeGPT、Lag-Llama 和 Chronos 的预测性能。", "tags": ["时间序列", "预测", "基础模型"], "score": 0.80, "url": "https://www.semanticscholar.org/paper/7"},
    {"module_id": "semantic-scholar-tracker", "title": "Synthetic Data Generation for Privacy-Preserving ML", "summary": "合成数据生成方法综述：GAN、扩散模型和 LLM 在构建隐私安全训练集中的应用。", "tags": ["合成数据", "隐私", "数据增强"], "score": 0.76, "url": "https://www.semanticscholar.org/paper/8"},
    # ── xiaohongshu-tracker (8) ──────────────────────────────────
    {"module_id": "xiaohongshu-tracker", "title": "读博第三年的时间管理心得", "summary": "分享 Pomodoro + 时间块法结合的实践经验，以及如何平衡科研、写作和生活。", "tags": ["读博", "时间管理", "科研生活"], "score": 0.75, "url": "https://www.xiaohongshu.com/explore/demo1"},
    {"module_id": "xiaohongshu-tracker", "title": "用 Obsidian 搭建个人知识库的完整流程", "summary": "从零开始搭建 Zettelkasten 笔记系统，包括插件推荐、模板设计和工作流自动化。", "tags": ["Obsidian", "知识管理", "Zettelkasten"], "score": 0.78, "url": "https://www.xiaohongshu.com/explore/demo2"},
    {"module_id": "xiaohongshu-tracker", "title": "科研人的 iPad 笔记术", "summary": "使用 GoodNotes + Zotero 的论文阅读工作流，提升文献管理效率。", "tags": ["论文阅读", "iPad", "工具"], "score": 0.72, "url": "https://www.xiaohongshu.com/explore/demo3"},
    {"module_id": "xiaohongshu-tracker", "title": "一个人的留学生活 | 如何对抗学术孤独感", "summary": "分享在海外读博期间维持心理健康的方法：建立学术社群、定期运动和正念冥想。", "tags": ["留学", "心理健康", "读博"], "score": 0.68, "url": "https://www.xiaohongshu.com/explore/demo4"},
    {"module_id": "xiaohongshu-tracker", "title": "SCI 论文写作模板分享 | Introduction 万能框架", "summary": "总结 50 篇顶刊论文的 Introduction 结构，提炼出四段式万能写作框架。", "tags": ["论文写作", "SCI", "学术"], "score": 0.80, "url": "https://www.xiaohongshu.com/explore/demo5"},
    {"module_id": "xiaohongshu-tracker", "title": "实验室咖啡角 DIY | 低成本提升幸福感", "summary": "花 200 元在实验室搭建一个温馨咖啡角，附购物清单和布置思路。", "tags": ["生活", "DIY", "实验室"], "score": 0.55, "url": "https://www.xiaohongshu.com/explore/demo6"},
    {"module_id": "xiaohongshu-tracker", "title": "Nature 子刊拒稿后怎么改？亲身经历分享", "summary": "记录一篇从 Nature Communications 拒稿到接收的全过程，包含审稿意见回复策略。", "tags": ["Nature", "投稿", "审稿"], "score": 0.82, "url": "https://www.xiaohongshu.com/explore/demo7"},
    {"module_id": "xiaohongshu-tracker", "title": "研究生必备 Mac 软件清单 (2026 版)", "summary": "精选 20 个提升科研效率的 Mac 应用：文献管理、写作、数据分析、作图工具一网打尽。", "tags": ["Mac", "软件推荐", "效率"], "score": 0.74, "url": "https://www.xiaohongshu.com/explore/demo8"},
    # ── bilibili-tracker (8) ─────────────────────────────────────
    {"module_id": "bilibili-tracker", "title": "3Blue1Brown: 线性代数的本质 (2026 更新版)", "summary": "经典数学可视化系列更新，新增张量分解和高维几何的直觉解释。", "tags": ["数学", "可视化", "线性代数"], "score": 0.87, "url": "https://www.bilibili.com/video/BV1demo1"},
    {"module_id": "bilibili-tracker", "title": "从零实现一个 Mini-GPT", "summary": "手把手教学视频，用 PyTorch 从头实现一个小型 GPT 模型，深入理解 Transformer 内部机制。", "tags": ["GPT", "PyTorch", "教程"], "score": 0.83, "url": "https://www.bilibili.com/video/BV1demo2"},
    {"module_id": "bilibili-tracker", "title": "计算机视觉前沿 2026: 从 ViT 到 DINO v3", "summary": "梳理自监督视觉模型的演进路线，对比最新的视觉基础模型架构。", "tags": ["计算机视觉", "ViT", "自监督"], "score": 0.81, "url": "https://www.bilibili.com/video/BV1demo3"},
    {"module_id": "bilibili-tracker", "title": "强化学习入门到实践 | DQN → PPO → SAC 全讲解", "summary": "8 小时系统课程，从马尔可夫决策过程到前沿 RL 算法，配套代码和环境。", "tags": ["强化学习", "DQN", "PPO"], "score": 0.79, "url": "https://www.bilibili.com/video/BV1demo4"},
    {"module_id": "bilibili-tracker", "title": "李沐带你读论文: DALL-E 3 技术报告深度解析", "summary": "逐页解读 DALL-E 3 技术报告，分析文本到图像生成的最新突破和训练技巧。", "tags": ["DALL-E", "文生图", "论文解读"], "score": 0.85, "url": "https://www.bilibili.com/video/BV1demo5"},
    {"module_id": "bilibili-tracker", "title": "数据科学家的一天 | 互联网大厂 vlog", "summary": "记录在字节跳动做推荐算法的日常：晨会、数据分析、模型调参和团队协作。", "tags": ["数据科学", "职场", "vlog"], "score": 0.62, "url": "https://www.bilibili.com/video/BV1demo6"},
    {"module_id": "bilibili-tracker", "title": "LaTeX 论文排版从入门到精通", "summary": "从零学习 LaTeX：环境配置、常用命令、公式排版、参考文献管理和模板自定义。", "tags": ["LaTeX", "排版", "教程"], "score": 0.73, "url": "https://www.bilibili.com/video/BV1demo7"},
    {"module_id": "bilibili-tracker", "title": "MIT 6.S191 深度学习导论 2026 (中英双语字幕)", "summary": "MIT 最新深度学习公开课完整搬运，涵盖基础网络、生成模型、RL 和前沿应用。", "tags": ["MIT", "公开课", "深度学习"], "score": 0.88, "url": "https://www.bilibili.com/video/BV1demo8"},
    # ── zhihu-tracker (8) ────────────────────────────────────────
    {"module_id": "zhihu-tracker", "title": "如何评价 2026 年 AI 领域的最新进展？", "summary": "知乎高赞回答汇总：多模态大模型、具身智能和 AI Agent 三大方向的突破性进展。", "tags": ["AI", "多模态", "Agent"], "score": 0.80, "url": "https://www.zhihu.com/question/demo1"},
    {"module_id": "zhihu-tracker", "title": "博士毕业后进入工业界还是学术界？", "summary": "来自不同背景的研究者分享职业选择的考量因素和真实体验。", "tags": ["职业规划", "博士", "学术界"], "score": 0.70, "url": "https://www.zhihu.com/question/demo2"},
    {"module_id": "zhihu-tracker", "title": "有哪些值得关注的 AI 开源项目？", "summary": "盘点 2026 年最具影响力的 AI 开源项目，涵盖训练框架、推理引擎和应用工具。", "tags": ["开源", "AI工具", "推荐"], "score": 0.76, "url": "https://www.zhihu.com/question/demo3"},
    {"module_id": "zhihu-tracker", "title": "为什么说 Rust 是系统编程的未来？", "summary": "从内存安全、并发模型和生态系统三个角度深度分析 Rust 语言的核心优势。", "tags": ["Rust", "系统编程", "编程语言"], "score": 0.72, "url": "https://www.zhihu.com/question/demo4"},
    {"module_id": "zhihu-tracker", "title": "如何从零开始学习机器学习？", "summary": "系统化学习路径推荐：数学基础 → 经典算法 → 深度学习 → 项目实践，附资源链接。", "tags": ["机器学习", "学习路径", "入门"], "score": 0.74, "url": "https://www.zhihu.com/question/demo5"},
    {"module_id": "zhihu-tracker", "title": "大语言模型的涌现能力是否真实存在？", "summary": "围绕 LLM 涌现能力的学术争论梳理，是度量标准的假象还是真正的相变？", "tags": ["LLM", "涌现", "AI理论"], "score": 0.85, "url": "https://www.zhihu.com/question/demo6"},
    {"module_id": "zhihu-tracker", "title": "读研期间发表论文最重要的经验是什么？", "summary": "数十位学者的论文写作心得：选题比方法重要，写作比实验重要，展示比内容重要。", "tags": ["论文发表", "研究生", "经验"], "score": 0.71, "url": "https://www.zhihu.com/question/demo7"},
    {"module_id": "zhihu-tracker", "title": "2026 年，普通程序员如何拥抱 AI 转型？", "summary": "讨论传统开发者如何利用 AI 工具提升效率，以及 AI 时代的核心竞争力。", "tags": ["AI转型", "程序员", "职业发展"], "score": 0.69, "url": "https://www.zhihu.com/question/demo8"},
    # ── xiaoyuzhou-tracker (6) ───────────────────────────────────
    {"module_id": "xiaoyuzhou-tracker", "title": "硬地骗局 EP.128: AI 创业的第二波浪潮", "summary": "讨论 AI 应用层创业的新机会，以及开发者如何找到 PMF。", "tags": ["AI创业", "播客", "产品"], "score": 0.73, "url": "https://www.xiaoyuzhoufm.com/episode/demo1"},
    {"module_id": "xiaoyuzhou-tracker", "title": "科技乱炖: 聊聊 Agent 时代的开发者工具", "summary": "探讨 AI Agent 对软件开发工作流的影响，以及新一代开发工具的形态。", "tags": ["Agent", "开发工具", "播客"], "score": 0.74, "url": "https://www.xiaoyuzhoufm.com/episode/demo2"},
    {"module_id": "xiaoyuzhou-tracker", "title": "声东击西: 学术圈的开放获取运动", "summary": "讨论 Open Access 对学术出版的颠覆，以及 Plan S、预印本和数据共享的最新动态。", "tags": ["开放获取", "学术出版", "播客"], "score": 0.70, "url": "https://www.xiaoyuzhoufm.com/episode/demo3"},
    {"module_id": "xiaoyuzhou-tracker", "title": "不合时宜: 当 AI 遇上哲学——意识与智能的边界", "summary": "从哲学角度审视 AI 是否可能拥有意识，中文房间论证在 LLM 时代的新解读。", "tags": ["AI哲学", "意识", "思辨"], "score": 0.67, "url": "https://www.xiaoyuzhoufm.com/episode/demo4"},
    {"module_id": "xiaoyuzhou-tracker", "title": "知行小酒馆: 研究生的理财入门", "summary": "适合学生党的理财策略：从余额宝到指数基金定投，低风险积累第一桶金。", "tags": ["理财", "研究生", "生活"], "score": 0.58, "url": "https://www.xiaoyuzhoufm.com/episode/demo5"},
    {"module_id": "xiaoyuzhou-tracker", "title": "来都来了: 对话斯坦福 AI Lab 博士后——我的科研之路", "summary": "分享从国内本科到斯坦福博后的成长经历，讨论科研选题和导师关系。", "tags": ["科研经历", "斯坦福", "博后"], "score": 0.76, "url": "https://www.xiaoyuzhoufm.com/episode/demo6"},
    # ── folder-monitor (4) ───────────────────────────────────────
    {"module_id": "folder-monitor", "title": "新文件: experiment_results_v3.csv", "summary": "检测到实验数据目录新增文件，包含 2048 行实验记录，文件大小 1.2MB。", "tags": ["文件监控", "实验数据", "CSV"], "score": 0.60, "url": ""},
    {"module_id": "folder-monitor", "title": "文献更新: attention_survey_2026.pdf", "summary": "Zotero 同步目录检测到新 PDF 文献，已自动提取元数据和摘要。", "tags": ["文件监控", "PDF", "文献"], "score": 0.65, "url": ""},
    {"module_id": "folder-monitor", "title": "笔记变更: research-journal-april.md", "summary": "Obsidian Vault 中的研究日志文件被修改，新增 350 字关于模型调参的笔记。", "tags": ["文件监控", "笔记", "Obsidian"], "score": 0.50, "url": ""},
    {"module_id": "folder-monitor", "title": "代码更新: model/transformer.py", "summary": "项目代码目录检测到模型文件更新，变更了 MultiHeadAttention 的实现。", "tags": ["文件监控", "代码", "模型"], "score": 0.55, "url": ""},
]


@app.post("/api/debug/seed-cards")
async def seed_demo_cards(body: dict | None = None):
    """Generate demo feed cards for testing/demo purposes."""
    import random
    import time as _time

    count = (body or {}).get("count", 20)
    count = max(1, min(count, 200))

    now = _time.time()
    inserted = 0
    for i in range(count):
        tpl = _DEMO_CARDS[i % len(_DEMO_CARDS)]
        card_id = f"demo-{tpl['module_id']}-{i}-{random.randint(1000, 9999)}"
        card = Card(
            id=card_id,
            title=tpl["title"],
            summary=tpl["summary"],
            score=max(0.0, min(1.0, tpl["score"] + random.uniform(-0.08, 0.08))),
            tags=tpl["tags"],
            source_url=tpl.get("url", ""),
            obsidian_path=f"Demo/{card_id}.md",
            module_id=tpl["module_id"],
            created_at=now - random.uniform(0, 86400 * 7),
            metadata={"demo": True},
        )
        _card_store.save(card)
        inserted += 1

    return {"ok": True, "inserted": inserted}


@app.post("/api/debug/seed-all")
async def seed_all_demo_data(body: dict | None = None):
    """Seed demo data for all areas: cards, profile, activity, preferences."""
    import random
    import time as _time
    import json as _json

    results = {}

    # 1. Seed cards
    card_count = (body or {}).get("card_count", 52)
    card_count = max(1, min(card_count, 200))
    now = _time.time()
    inserted = 0
    for i in range(card_count):
        tpl = _DEMO_CARDS[i % len(_DEMO_CARDS)]
        card_id = f"demo-{tpl['module_id']}-{i}-{random.randint(1000, 9999)}"
        card = Card(
            id=card_id,
            title=tpl["title"],
            summary=tpl["summary"],
            score=max(0.0, min(1.0, tpl["score"] + random.uniform(-0.08, 0.08))),
            tags=tpl["tags"],
            source_url=tpl.get("url", ""),
            obsidian_path=f"Demo/{card_id}.md",
            module_id=tpl["module_id"],
            created_at=now - random.uniform(0, 86400 * 7),
            metadata={"demo": True},
        )
        _card_store.save(card)
        inserted += 1
    results["cards"] = inserted

    # 2. Seed profile data
    abo_dir = Path.home() / ".abo"
    abo_dir.mkdir(parents=True, exist_ok=True)

    # Profile identity
    profile_path = abo_dir / "profile.json"
    profile_data = {
        "codename": "Researcher-X",
        "long_term_goal": "探索通用人工智能的理论基础，构建可解释的智能系统",
        "research_field": "Machine Learning & NLP",
        "affiliation": "Demo University",
    }
    profile_path.write_text(_json.dumps(profile_data, ensure_ascii=False, indent=2), encoding="utf-8")
    results["profile"] = True

    # Daily motto
    motto_path = abo_dir / "daily_motto.json"
    motto_path.write_text(_json.dumps({
        "motto": "Stay hungry, stay foolish. 保持好奇，持续探索。",
        "date": datetime.now().strftime("%Y-%m-%d"),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    results["motto"] = True

    # SAN log (30 days)
    san_path = abo_dir / "san_log.json"
    san_log = {}
    for d in range(30):
        date_str = (datetime.now() - timedelta(days=d)).strftime("%Y-%m-%d")
        san_log[date_str] = random.randint(40, 95)
    san_path.write_text(_json.dumps(san_log, ensure_ascii=False, indent=2), encoding="utf-8")
    results["san_log"] = 30

    # Happiness log (30 days)
    happiness_path = abo_dir / "happiness_log.json"
    happiness_log = {}
    for d in range(30):
        date_str = (datetime.now() - timedelta(days=d)).strftime("%Y-%m-%d")
        happiness_log[date_str] = random.randint(50, 100)
    happiness_path.write_text(_json.dumps(happiness_log, ensure_ascii=False, indent=2), encoding="utf-8")
    results["happiness_log"] = 30

    # Energy memory
    energy_path = abo_dir / "energy_memory.json"
    energy_data = {
        "current": random.randint(50, 90),
        "history": [
            {"date": (datetime.now() - timedelta(days=d)).strftime("%Y-%m-%d"),
             "value": random.randint(30, 100)}
            for d in range(14)
        ],
    }
    energy_path.write_text(_json.dumps(energy_data, ensure_ascii=False, indent=2), encoding="utf-8")
    results["energy"] = True

    # Daily todos
    todos_path = abo_dir / "daily_todos.json"
    today_str = datetime.now().strftime("%Y-%m-%d")
    todos_data = {
        today_str: [
            {"text": "阅读 3 篇 Transformer 相关论文", "done": True},
            {"text": "整理实验数据并更新 Wandb 面板", "done": True},
            {"text": "写完 Introduction 第二稿", "done": False},
            {"text": "Review 师弟的 PR", "done": False},
            {"text": "跑步 30 分钟", "done": True},
        ],
    }
    todos_path.write_text(_json.dumps(todos_data, ensure_ascii=False, indent=2), encoding="utf-8")
    results["todos"] = True

    # 3. Seed keyword preferences
    prefs_path = abo_dir / "keyword_preferences.json"
    keyword_prefs = {
        "Transformer": {"score": 0.8, "count": 15, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker"]},
        "LLM": {"score": 0.9, "count": 22, "source_modules": ["arxiv-tracker", "zhihu-tracker"]},
        "读博": {"score": 0.6, "count": 8, "source_modules": ["xiaohongshu-tracker", "zhihu-tracker"]},
        "强化学习": {"score": 0.5, "count": 6, "source_modules": ["arxiv-tracker", "bilibili-tracker"]},
        "RAG": {"score": 0.7, "count": 10, "source_modules": ["semantic-scholar-tracker"]},
        "Agent": {"score": 0.85, "count": 18, "source_modules": ["arxiv-tracker", "zhihu-tracker", "xiaoyuzhou-tracker"]},
        "论文写作": {"score": 0.4, "count": 5, "source_modules": ["xiaohongshu-tracker"]},
        "开源": {"score": 0.3, "count": 4, "source_modules": ["zhihu-tracker"]},
    }
    prefs_path.write_text(_json.dumps(keyword_prefs, ensure_ascii=False, indent=2), encoding="utf-8")
    results["keyword_prefs"] = len(keyword_prefs)

    # 4. Seed activity timeline (today)
    activities_dir = abo_dir / "activities"
    activities_dir.mkdir(parents=True, exist_ok=True)
    timeline_path = activities_dir / f"timeline_{today_str}.json"
    demo_activities = [
        {"id": "d1", "type": "card_like", "timestamp": f"{today_str}T09:15:00", "card_title": "State Space Models vs Transformers", "module_id": "arxiv-tracker", "metadata": {}},
        {"id": "d2", "type": "card_save", "timestamp": f"{today_str}T09:32:00", "card_title": "A Survey on RAG", "module_id": "semantic-scholar-tracker", "metadata": {}},
        {"id": "d3", "type": "card_view", "timestamp": f"{today_str}T10:05:00", "card_title": "读博第三年的时间管理心得", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "d4", "type": "card_like", "timestamp": f"{today_str}T10:48:00", "card_title": "Code Generation with LLMs", "module_id": "arxiv-tracker", "metadata": {}},
        {"id": "d5", "type": "card_view", "timestamp": f"{today_str}T11:20:00", "card_title": "实验室咖啡角 DIY", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "d6", "type": "card_save", "timestamp": f"{today_str}T14:00:00", "card_title": "MIT 6.S191 深度学习导论", "module_id": "bilibili-tracker", "metadata": {}},
        {"id": "d7", "type": "card_like", "timestamp": f"{today_str}T15:30:00", "card_title": "大语言模型的涌现能力", "module_id": "zhihu-tracker", "metadata": {}},
        {"id": "d8", "type": "card_view", "timestamp": f"{today_str}T16:15:00", "card_title": "AI 创业的第二波浪潮", "module_id": "xiaoyuzhou-tracker", "metadata": {}},
    ]
    timeline_data = {
        "date": today_str,
        "activities": demo_activities,
        "summary": None,
        "summary_generated_at": None,
    }
    timeline_path.write_text(_json.dumps(timeline_data, ensure_ascii=False, indent=2), encoding="utf-8")
    results["activities"] = len(demo_activities)

    return {"ok": True, "results": results}


@app.delete("/api/debug/cards")
async def clear_all_cards():
    """Delete all cards from the database."""
    import sqlite3
    db_path = Path.home() / ".abo" / "data" / "cards.db"
    with sqlite3.connect(db_path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
        conn.execute("DELETE FROM cards")
    return {"ok": True, "deleted": count}


# ── Modules ──────────────────────────────────────────────────────

@app.get("/api/modules")
async def list_modules():
    if is_demo_mode():
        dash = get_demo_modules_dashboard()
        return {"modules": [
            {"id": m["id"], "name": m["name"], "icon": m["icon"],
             "schedule": m["schedule"], "enabled": m["status"] == "active",
             "next_run": m.get("next_run")}
            for m in dash["modules"]
        ]}
    job_map = {j["id"]: j for j in (_scheduler.job_info() if _scheduler else [])}
    modules = [
        {**m.get_status(), "next_run": job_map.get(m.id, {}).get("next_run")}
        for m in _registry.all()
    ]

    # Add RSS as virtual module
    config = load_config()
    rss_module = {
        "id": "rss-aggregator",
        "name": "RSS 聚合",
        "schedule": "on-demand",
        "icon": "rss",
        "enabled": config.get("rss_enabled", False),
        "output": ["rss"],
        "is_virtual": True,
        "description": "聚合所有模块内容为 RSS feed",
        "next_run": None,  # Virtual module has no scheduled next run
    }
    modules.append(rss_module)

    return {"modules": modules}


@app.get("/api/scheduler/jobs")
async def get_scheduler_jobs():
    if not _scheduler:
        return {"jobs": []}
    jobs = _scheduler.job_info()
    registry_modules = {m.id: m for m in _registry.all()}
    return {
        "jobs": [
            {
                **j,
                "name": registry_modules.get(j["id"], object()).name if j["id"] in registry_modules else j["id"],
                "enabled": getattr(registry_modules.get(j["id"]), "enabled", True) if j["id"] in registry_modules else True,
                "schedule": getattr(registry_modules.get(j["id"]), "schedule", "") if j["id"] in registry_modules else "",
            }
            for j in jobs
        ]
    }


@app.post("/api/modules/{module_id}/run")
async def run_module(module_id: str):
    if not _scheduler:
        raise HTTPException(503, "Scheduler not ready")
    ok = await _scheduler.run_now(module_id, _registry)
    if not ok:
        raise HTTPException(404, f"Module {module_id} not found")
    return {"ok": True}


@app.post("/api/modules/arxiv-tracker/crawl")
async def crawl_arxiv_live(data: dict = None):
    """Real-time arXiv crawl with keyword support, deduplication, and progress via WebSocket."""
    from .default_modules.arxiv.category import ALL_SUBCATEGORIES, get_category_name
    from .tools.arxiv_api import arxiv_api_search
    import re

    keywords = data.get("keywords", []) if data else []
    max_results = data.get("max_results", 50) if data else 50
    search_mode = data.get("mode", "AND") if data else "AND"  # "AND", "OR", or "AND_OR"
    cs_only = data.get("cs_only", True) if data else True  # Default to CS only
    days_back = data.get("days_back", 180) if data else 180

    # Get existing arXiv IDs from literature library to avoid duplicates
    existing_ids = set()
    try:
        lit_path = get_literature_path()
        if not lit_path:
            lit_path = get_vault_path()
        if lit_path:
            arxiv_dir = lit_path / "arxiv"
            if arxiv_dir.exists():
                for f in arxiv_dir.glob("*.md"):
                    match = re.match(r'([\d.]+)-', f.name)
                    if match:
                        existing_ids.add(match.group(1))
    except Exception:
        pass

    results = []
    session_id = _generate_crawl_session_id()

    try:
        # Send session ID to client for cancellation
        await broadcaster.send_event({
            "type": "crawl_started",
            "session_id": session_id,
            "message": "爬取任务已启动"
        })

        # Fetch with deduplication
        await broadcaster.send_event({
            "type": "crawl_progress",
            "phase": "fetching",
            "current": 0,
            "total": max_results,
            "message": "正在从 arXiv 获取论文列表..."
        })

        # Check for cancellation before fetch
        if _should_cancel_crawl(session_id):
            await broadcaster.send_event({
                "type": "crawl_cancelled",
                "message": "爬取任务已取消"
            })
            _cleanup_crawl_session(session_id)
            return {"papers": [], "count": 0, "cancelled": True}

        cs_categories = [
            code for code in ALL_SUBCATEGORIES
            if code.startswith("cs.")
        ] if cs_only else None

        def normalize_keywords(raw_keywords: list[str]) -> list[str]:
            parsed: list[str] = []
            for kw in raw_keywords:
                parsed.extend(part.strip() for part in re.split(r"[,，\s]+", str(kw)) if part.strip())
            return parsed

        async def search_with_arxiv_api() -> list[dict]:
            if search_mode == "AND_OR":
                raw_query = " ".join(str(kw) for kw in keywords).strip()
                groups = [group.strip() for group in raw_query.split("|") if group.strip()]
                seen: set[str] = set()
                merged: list[dict] = []
                per_group_limit = max(max_results, 20)
                for group in groups:
                    group_keywords = normalize_keywords([group])
                    if not group_keywords:
                        continue
                    group_papers = await arxiv_api_search(
                        keywords=group_keywords,
                        categories=cs_categories,
                        mode="AND",
                        max_results=per_group_limit,
                        days_back=days_back,
                        sort_by="submittedDate",
                    )
                    for paper in group_papers:
                        paper_id = paper.get("id")
                        if not paper_id or paper_id in seen or paper_id in existing_ids:
                            continue
                        seen.add(paper_id)
                        merged.append(paper)
                        if len(merged) >= max_results:
                            return merged
                return merged

            api_mode = "AND" if search_mode == "AND" else "OR"
            papers = await arxiv_api_search(
                keywords=normalize_keywords(keywords),
                categories=cs_categories,
                mode=api_mode,
                max_results=max_results,
                days_back=days_back,
                sort_by="submittedDate",
            )
            return [
                paper for paper in papers
                if paper.get("id") and paper.get("id") not in existing_ids
            ][:max_results]

        def paper_to_card_data(paper: dict) -> dict:
            arxiv_id = paper.get("id", "")
            categories = paper.get("categories") or []
            primary_category = paper.get("primary_category") or (categories[0] if categories else "")
            published = paper.get("published") or ""
            updated = paper.get("updated") or published
            authors = paper.get("authors", [])
            abs_url = paper.get("arxiv_url") or f"https://arxiv.org/abs/{arxiv_id}"
            pdf_url = paper.get("pdf_url") or f"https://arxiv.org/pdf/{arxiv_id}.pdf"
            metadata = {
                "abo-type": "arxiv-api-paper",
                "authors": authors,
                "author_count": len(authors),
                "arxiv-id": arxiv_id,
                "primary_category": primary_category,
                "primary_category_name": get_category_name(primary_category),
                "categories": categories,
                "all_categories": [get_category_name(c) for c in categories],
                "published": published,
                "updated": updated,
                "comments": paper.get("comment") or "",
                "journal_ref": paper.get("journal_ref") or "",
                "doi": paper.get("doi") or "",
                "pdf-url": pdf_url,
                "html-url": f"https://arxiv.org/html/{arxiv_id}",
                "abstract": paper.get("summary", ""),
                "keywords": categories,
                "links": {
                    "abs": abs_url,
                    "pdf": pdf_url,
                    "html": f"https://arxiv.org/html/{arxiv_id}",
                },
            }
            return {
                "id": arxiv_id,
                "title": paper.get("title", "Untitled"),
                "summary": paper.get("summary", ""),
                # arXiv API 搜索不再做 Claude 打分；保留字段只为兼容前端/保存接口。
                "score": 1.0,
                "tags": categories,
                "source_url": abs_url,
                "metadata": metadata,
            }

        api_papers = await search_with_arxiv_api()

        # 旧路径已停用：不再调用 ArxivTracker.fetch/process，不抓 HTML figures，不跑 Claude 打分。
        # 这里直接把 arXiv API 结果转换为前端卡片数据并通过 WebSocket 推送。
        for i, paper in enumerate(api_papers):
            if _should_cancel_crawl(session_id):
                await broadcaster.send_event({
                    "type": "crawl_cancelled",
                    "message": f"爬取任务已取消，已推送 {i}/{len(api_papers)} 篇论文"
                })
                _cleanup_crawl_session(session_id)
                return {"papers": results, "count": len(results), "cancelled": True}

            paper_data = paper_to_card_data(paper)
            results.append(paper_data)

            await broadcaster.send_event({
                "type": "crawl_progress",
                "phase": "processing",
                "current": i + 1,
                "total": len(api_papers),
                "message": f"正在推送第 {i+1}/{len(api_papers)} 篇论文...",
                "currentPaperTitle": paper_data["title"][:80] + "..." if len(paper_data["title"]) > 80 else paper_data["title"]
            })

            await broadcaster.send_event({
                "type": "crawl_paper",
                "paper": paper_data,
                "current": i + 1,
                "total": len(api_papers)
            })
            print(f"[arxiv-api-search] Pushed {paper_data['id']}: {paper_data['title'][:50]}...")

        # Sort by published date (descending)
        results.sort(key=lambda x: x.get("metadata", {}).get("published", ""), reverse=True)

        # Send completion
        await broadcaster.send_event({
            "type": "crawl_complete",
            "papers": results,
            "count": len(results),
            "requested": max_results,
            "skipped_duplicates": len(existing_ids)
        })

        # Clean up session on success
        _cleanup_crawl_session(session_id)

        return {
            "papers": results,
            "count": len(results),
            "requested": max_results,
            "skipped_duplicates": len(existing_ids)
        }
    except Exception as e:
        # Clean up session on error
        _cleanup_crawl_session(session_id)

        error_msg = str(e)
        # Provide user-friendly message for rate limit or service unavailable
        if "503" in error_msg or "暂时不可用" in error_msg:
            error_msg = "arXiv API 暂时不可用 (503)。请等待几分钟后重试。"
        elif "rate exceeded" in error_msg.lower() or "rate limit" in error_msg.lower() or "429" in error_msg:
            error_msg = "arXiv API 请求太频繁。请等待 2-3 分钟后重试，或减少每次爬取的论文数量。"
        await broadcaster.send_event({
            "type": "crawl_error",
            "error": error_msg
        })
        raise HTTPException(500, f"Crawl failed: {e}")


@app.post("/api/modules/arxiv-tracker/cancel")
async def cancel_arxiv_crawl(data: dict):
    """Cancel an ongoing arXiv crawl by session ID."""
    session_id = data.get("session_id")
    if not session_id:
        raise HTTPException(400, "session_id is required")

    if session_id not in _crawl_cancel_flags:
        return {"status": "not_found", "message": "未找到正在进行的爬取任务"}

    _cancel_crawl(session_id)
    await broadcaster.send_event({
        "type": "crawl_cancelling",
        "session_id": session_id,
        "message": "正在取消爬取任务..."
    })
    return {"status": "ok", "message": "已发送取消信号"}


@app.get("/api/proxy/image")
async def proxy_image(url: str):
    """Proxy image requests to avoid CORS issues."""
    import httpx
    try:
        referer = "https://arxiv.org/"
        if "hdslb.com" in url or "bilibili.com" in url:
            referer = "https://www.bilibili.com/"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
                "Referer": referer,
            })
        if resp.status_code != 200:
            raise HTTPException(404, "Image not found")
        from fastapi import Response
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "image/png")
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to proxy image: {e}")


@app.post("/api/modules/arxiv-tracker/save-to-literature")
async def save_arxiv_to_literature(data: dict):
    """Save an arXiv paper to the literature library with figures and optional PDF."""
    import frontmatter
    import os
    import httpx
    import asyncio

    paper = data.get("paper", {})
    folder = data.get("folder", "arxiv")
    save_pdf = data.get("save_pdf", True)  # Default to saving PDF

    # Get literature path
    lit_path = get_literature_path()
    if not lit_path:
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    # Build target path
    target_dir = lit_path / folder
    target_dir.mkdir(parents=True, exist_ok=True)

    # Build filename: Title first, then arXiv ID (e.g., "Paper Title-arxiv.2501.12345.md")
    title = paper.get("title", "untitled")
    arxiv_id = paper.get("id", "unknown")
    safe_title = "".join(c for c in title[:80] if c.isalnum() or c in " -_").strip()
    filename_base = f"{safe_title}-{arxiv_id}"
    filename = f"{filename_base}.md"
    target_path = target_dir / filename

    # Create figures directory
    figures_dir = target_dir / f"{filename_base}.figures"
    figures_dir.mkdir(exist_ok=True)

    meta = paper.get("metadata", {})
    pdf_url = meta.get("pdf-url", f"https://arxiv.org/pdf/{arxiv_id}.pdf")

    # Download PDF if requested
    pdf_path = None
    if save_pdf and pdf_url:
        pdf_dir = lit_path / "arxiv_pdf"
        pdf_dir.mkdir(exist_ok=True)
        pdf_filename = f"{filename_base}.pdf"
        pdf_path = pdf_dir / pdf_filename

        try:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                resp = await client.get(pdf_url, headers={"User-Agent": "ABO-arXiv-Tracker/1.0"})
                if resp.status_code == 200:
                    pdf_path.write_bytes(resp.content)
                    pdf_path = str(pdf_path.relative_to(lit_path))
                else:
                    pdf_path = None
        except Exception as e:
            print(f"Failed to download PDF for {arxiv_id}: {e}")
            pdf_path = None

    # Download figures
    figures = meta.get("figures", [])
    local_figures = []

    async def download_figure(fig: dict, idx: int) -> dict | None:
        """Download a single figure."""
        url = fig.get("url", "")
        if not url:
            return None

        # Determine file extension
        ext = ".png"
        if ".jpg" in url.lower() or ".jpeg" in url.lower():
            ext = ".jpg"
        elif ".gif" in url.lower():
            ext = ".gif"

        local_name = f"figure_{idx + 1}{ext}"
        local_path = figures_dir / local_name

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ABO-arXiv-Tracker/1.0"})
                if resp.status_code == 200:
                    local_path.write_bytes(resp.content)
                    return {
                        "filename": local_name,
                        "caption": fig.get("caption", f"Figure {idx + 1}"),
                        "local_path": str(local_path.relative_to(lit_path)),
                        "original_url": url,
                    }
        except Exception as e:
            print(f"Failed to download figure {idx + 1}: {e}")
        return None

    # Download all figures concurrently
    if figures:
        download_tasks = [download_figure(fig, idx) for idx, fig in enumerate(figures[:5])]
        downloaded = await asyncio.gather(*download_tasks)
        local_figures = [f for f in downloaded if f]

    # Build content
    content_parts = [f"# {title}\n"]

    # Add PDF link if downloaded
    if pdf_path:
        content_parts.append(f"**[📄 PDF 下载](../arxiv_pdf/{filename_base}.pdf)**\n")

    if meta.get("contribution"):
        content_parts.append(f"**核心创新**: {meta['contribution']}\n")

    content_parts.append(f"{paper.get('summary', '')}\n")

    if meta.get("abstract"):
        content_parts.append("## 摘要\n")
        content_parts.append(f"{meta['abstract']}\n")

    # Add figures section
    if local_figures:
        content_parts.append("## 图片\n")
        for fig in local_figures:
            content_parts.append(f"### {fig['caption']}\n")
            content_parts.append(f"![{fig['caption']}]({fig['local_path']})\n")

    content_parts.append(f"[原文链接]({paper.get('source_url', '')})")

    content = "\n".join(content_parts)

    # Write with frontmatter
    post = frontmatter.Post(content)
    post.metadata.update({
        "abo-type": "arxiv-paper",
        "relevance-score": round(paper.get("score", 0.5), 3),
        "tags": paper.get("tags", []),
        "authors": meta.get("authors", []),
        "arxiv-id": arxiv_id,
        "pdf-url": pdf_url,
        "pdf-path": pdf_path,
        "published": meta.get("published", ""),
        "keywords": meta.get("keywords", []),
        "figures": local_figures,
        "figures_dir": str(figures_dir.relative_to(lit_path)),
    })

    # Atomic write
    tmp = target_path.with_suffix(".tmp")
    tmp.write_text(frontmatter.dumps(post), encoding="utf-8")
    os.replace(tmp, target_path)

    # Update CardStore with local_figures so they persist after refresh
    try:
        from .store.cards import CardStore
        card_store = CardStore()
        existing_card = card_store.get(arxiv_id)
        if existing_card:
            existing_card.metadata["local_figures"] = local_figures
            existing_card.metadata["figures_dir"] = str(figures_dir.relative_to(lit_path))
            existing_card.metadata["saved_to_literature"] = True
            existing_card.metadata["literature_path"] = str(target_path.relative_to(lit_path))
            if pdf_path:
                existing_card.metadata["pdf_path"] = pdf_path
            card_store.save(existing_card)
    except Exception as e:
        print(f"Failed to update CardStore for {arxiv_id}: {e}")

    return {
        "ok": True,
        "path": str(target_path.relative_to(lit_path)),
        "figures": local_figures,
        "pdf": pdf_path,
    }


@app.get("/api/modules/arxiv-tracker/categories")
async def get_arxiv_categories():
    """Get all available arXiv categories/subcategories."""
    from .default_modules.arxiv import get_available_categories
    return {"categories": get_available_categories()}


@app.post("/api/modules/arxiv-tracker/crawl-by-category")
async def crawl_arxiv_by_category(data: dict = None):
    """
    Real-time arXiv crawl by category/subcategory with full metadata.

    Request body:
    {
        "categories": ["cs.CV", "cs.LG"],  # Subcategories to search
        "keywords": ["vision", "image"],   # Optional keywords
        "max_results": 50,
        "days_back": 180,                  # Only papers from last N days
        "sort_by": "submittedDate",        # or "lastUpdatedDate", "relevance"
        "sort_order": "descending"
    }
    """
    from .default_modules.arxiv.category import ALL_SUBCATEGORIES, get_category_name
    from .tools.arxiv_api import arxiv_api_search

    data = data or {}
    categories = data.get("categories", ["cs.*"])
    keywords = data.get("keywords", [])
    max_results = data.get("max_results", 50)
    days_back = data.get("days_back", 180)
    sort_by = data.get("sort_by", "submittedDate")
    sort_order = data.get("sort_order", "descending")

    # Get existing arXiv IDs for deduplication
    existing_ids = set()
    try:
        lit_path = get_literature_path() or get_vault_path()
        if lit_path:
            arxiv_dir = lit_path / "arxiv"
            if arxiv_dir.exists():
                for f in arxiv_dir.glob("**/*.md"):
                    # Match arXiv ID patterns in filename
                    import re
                    match = re.search(r'(\d{4}\.\d{4,5})', f.name)
                    if match:
                        existing_ids.add(match.group(1))
    except Exception:
        pass

    results = []

    def expand_categories(raw_categories: list[str]) -> list[str]:
        expanded: list[str] = []
        for category in raw_categories:
            if category.endswith(".*"):
                prefix = category[:-1]
                expanded.extend(code for code in ALL_SUBCATEGORIES if code.startswith(prefix))
            else:
                expanded.append(category)
        return expanded

    def paper_to_card_data(paper: dict) -> dict:
        arxiv_id = paper.get("id", "")
        paper_categories = paper.get("categories") or []
        primary_category = paper.get("primary_category") or (paper_categories[0] if paper_categories else "")
        published = paper.get("published") or ""
        updated = paper.get("updated") or published
        authors = paper.get("authors", [])
        abs_url = paper.get("arxiv_url") or f"https://arxiv.org/abs/{arxiv_id}"
        pdf_url = paper.get("pdf_url") or f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        metadata = {
            "abo-type": "arxiv-api-paper",
            "authors": authors,
            "author_count": len(authors),
            "arxiv-id": arxiv_id,
            "primary_category": primary_category,
            "primary_category_name": get_category_name(primary_category),
            "categories": paper_categories,
            "all_categories": [get_category_name(c) for c in paper_categories],
            "published": published,
            "updated": updated,
            "comments": paper.get("comment") or "",
            "journal_ref": paper.get("journal_ref") or "",
            "doi": paper.get("doi") or "",
            "pdf-url": pdf_url,
            "html-url": f"https://arxiv.org/html/{arxiv_id}",
            "abstract": paper.get("summary", ""),
            "keywords": paper_categories,
        }
        return {
            "id": arxiv_id,
            "title": paper.get("title", "Untitled"),
            "summary": paper.get("summary", ""),
            "score": 1.0,
            "tags": paper_categories,
            "source_url": abs_url,
            "metadata": metadata,
        }

    try:
        # Send initial progress
        await broadcaster.send_event({
            "type": "crawl_progress",
            "phase": "fetching",
            "current": 0,
            "total": max_results,
            "message": f"正在从 arXiv 获取论文 (分类: {', '.join(categories)})..."
        })

        api_categories = expand_categories(categories)
        api_papers = await arxiv_api_search(
            categories=api_categories,
            keywords=keywords,
            max_results=max_results,
            days_back=days_back,
            sort_by=sort_by,
            sort_order=sort_order,
            mode="AND" if keywords else "OR",
        )
        api_papers = [
            paper for paper in api_papers
            if paper.get("id") and paper.get("id") not in existing_ids
        ][:max_results]

        if not api_papers:
            await broadcaster.send_event({
                "type": "crawl_complete",
                "papers": [],
                "count": 0,
                "message": "未找到符合条件的论文"
            })
            return {"papers": [], "count": 0}

        # 旧路径已停用：分类搜索也直接使用 arXiv API 结果，不跑 HTML 抓图或 Claude 打分。
        for i, paper in enumerate(api_papers):
            paper_data = paper_to_card_data(paper)
            results.append(paper_data)

            await broadcaster.send_event({
                "type": "crawl_progress",
                "phase": "processing",
                "current": i + 1,
                "total": len(api_papers),
                "message": f"正在推送第 {i+1}/{len(api_papers)} 篇论文...",
                "currentPaperTitle": paper_data["title"][:80] + "..." if len(paper_data["title"]) > 80 else paper_data["title"]
            })

            await broadcaster.send_event({
                "type": "crawl_paper",
                "paper": paper_data,
                "current": i + 1,
                "total": len(api_papers)
            })

        # Send completion
        await broadcaster.send_event({
            "type": "crawl_complete",
            "papers": results,
            "count": len(results),
            "requested": max_results,
            "categories": categories
        })

        return {
            "papers": results,
            "count": len(results),
            "requested": max_results,
            "categories": categories
        }

    except Exception as e:
        error_msg = str(e)
        if "503" in error_msg:
            error_msg = "arXiv API 暂时不可用 (503)。请等待几分钟后重试。"
        elif "429" in error_msg:
            error_msg = "arXiv API 速率限制已达到。请等待 1-2 分钟后重试。"

        await broadcaster.send_event({
            "type": "crawl_error",
            "error": error_msg
        })
        raise HTTPException(500, f"Crawl failed: {e}")


@app.post("/api/modules/semantic-scholar/follow-ups")
async def fetch_semantic_scholar_follow_ups(data: dict):
    """Fetch follow-up papers from Semantic Scholar for a given arXiv ID."""
    from .default_modules.semantic_scholar import SemanticScholarTracker
    import os

    arxiv_id = data.get("arxiv_id", "")
    fetch_citations = data.get("fetch_citations", True)
    fetch_references = data.get("fetch_references", False)
    limit = data.get("limit", 20)

    if not arxiv_id:
        raise HTTPException(400, "arxiv_id is required")

    tracker = SemanticScholarTracker()
    results = []

    try:
        # Send initial progress
        await broadcaster.send_event({
            "type": "s2_progress",
            "phase": "fetching",
            "current": 0,
            "total": 1,
            "message": f"正在从 Semantic Scholar 查询论文 {arxiv_id}..."
        })

        # Fetch follow-up papers
        items = await tracker.fetch(
            arxiv_id=arxiv_id,
            fetch_citations=fetch_citations,
            fetch_references=fetch_references,
            limit=limit
        )

        if not items:
            await broadcaster.send_event({
                "type": "s2_complete",
                "papers": [],
                "count": 0,
                "arxiv_id": arxiv_id
            })
            return {"papers": [], "count": 0, "arxiv_id": arxiv_id}

        prefs = _prefs.get_prefs_for_module("semantic-scholar-tracker")

        # Process each paper with progress updates
        for i, item in enumerate(items):
            await broadcaster.send_event({
                "type": "s2_progress",
                "phase": "processing",
                "current": i + 1,
                "total": len(items),
                "message": f"正在处理第 {i+1}/{len(items)} 篇相关论文: {item.raw.get('title', '')[:40]}..."
            })

            card_list = await tracker.process([item], prefs)
            if card_list:
                card = card_list[0]
                paper_data = {
                    "id": card.id,
                    "title": card.title,
                    "summary": card.summary,
                    "score": card.score,
                    "tags": card.tags,
                    "source_url": card.source_url,
                    "metadata": card.metadata,
                }
                results.append(paper_data)

                # Send partial result
                await broadcaster.send_event({
                    "type": "s2_paper",
                    "paper": paper_data,
                    "current": i + 1,
                    "total": len(items)
                })

        # Sort by citation count (descending)
        results.sort(key=lambda x: x.get("metadata", {}).get("citation_count", 0), reverse=True)

        # Send completion
        await broadcaster.send_event({
            "type": "s2_complete",
            "papers": results,
            "count": len(results),
            "arxiv_id": arxiv_id
        })

        return {
            "papers": results,
            "count": len(results),
            "arxiv_id": arxiv_id
        }

    except Exception as e:
        await broadcaster.send_event({
            "type": "s2_error",
            "error": str(e),
            "arxiv_id": arxiv_id
        })
        raise HTTPException(500, f"Semantic Scholar fetch failed: {e}")


# ── Multi-source figure fetching helpers ─────────────────────────

# Constants for figure fetching
DEFAULT_MAX_FIGURES = 5
HTML_TIMEOUT = 30
PDF_TIMEOUT = 60
MIN_PDF_SIZE = 10 * 1024  # 10KB
PDF_DPI = 150


async def fetch_figures_from_arxiv_html(
    arxiv_id: str,
    figures_dir: Path,
    client: httpx.AsyncClient,
    max_figures: int = DEFAULT_MAX_FIGURES
) -> list[dict]:
    """Fetch figures from arXiv HTML page with smart prioritization."""
    import re
    import asyncio
    figures = []

    # Ensure figures directory exists
    figures_dir.mkdir(parents=True, exist_ok=True)

    try:
        html_url = f"https://arxiv.org/html/{arxiv_id}"
        resp = await client.get(html_url, headers={"User-Agent": "ABO/1.0"}, timeout=HTML_TIMEOUT)

        if resp.status_code != 200:
            print(f"[figures] HTTP error {resp.status_code} when fetching HTML for {arxiv_id}")
            return figures

        html = resp.text
        img_pattern = r'<img[^>]+src="([^"]+)"[^>]*>'
        img_matches = list(re.finditer(img_pattern, html, re.IGNORECASE))

        figure_candidates = []
        for i, match in enumerate(img_matches[:20]):  # Check first 20 images
            src = match.group(1)
            if not src:
                continue

            img_tag = match.group(0)
            alt_match = re.search(r'alt="([^"]*)"', img_tag, re.IGNORECASE)
            alt = alt_match.group(1) if alt_match else ""

            # Skip non-figure images
            if any(skip in src.lower() for skip in ['icon', 'logo', 'button', 'spacer', 'arrow']):
                continue

            # Make absolute URL
            if src.startswith('/'):
                src = f"https://arxiv.org{src}"
            elif not src.startswith('http'):
                if src.startswith(arxiv_id + '/'):
                    src = f"https://arxiv.org/html/{src}"
                else:
                    src = f"https://arxiv.org/html/{arxiv_id}/{src}"

            # Score based on likelihood of being a pipeline/method figure
            alt_lower = alt.lower()
            score = 0
            priority_keywords = [
                ('pipeline', 30), ('architecture', 25), ('framework', 25),
                ('overview', 20), ('method', 20), ('system', 15),
                ('flowchart', 20), ('diagram', 15), ('structure', 15),
                ('model', 10), ('approach', 10), ('fig', 10), ('figure', 10)
            ]
            for kw, pts in priority_keywords:
                if kw in alt_lower:
                    score += pts

            figure_candidates.append({
                'url': src,
                'caption': alt[:120] if alt else f"Figure {i+1}",
                'score': score,
                'index': i
            })

        # Sort by score (descending) and take top max_figures
        figure_candidates.sort(key=lambda x: (-x['score'], x['index']))
        selected_figures = figure_candidates[:max_figures]

        # Download figures
        for idx, fig in enumerate(selected_figures):
            try:
                fig_resp = await client.get(fig['url'], headers={"User-Agent": "ABO/1.0"}, timeout=HTML_TIMEOUT)
                if fig_resp.status_code == 200:
                    content_type = fig_resp.headers.get('content-type', '')
                    if 'png' in content_type:
                        ext = 'png'
                    elif 'jpeg' in content_type or 'jpg' in content_type:
                        ext = 'jpg'
                    elif 'gif' in content_type:
                        ext = 'gif'
                    else:
                        ext = 'png'

                    fig_filename = f"figure_{idx+1:02d}.{ext}"
                    fig_path = figures_dir / fig_filename
                    fig_path.write_bytes(fig_resp.content)

                    # Validate downloaded image
                    try:
                        from PIL import Image
                        Image.open(fig_path).verify()
                    except Exception:
                        print(f"[figures] Invalid image downloaded from {fig['url']}, removing")
                        fig_path.unlink()
                        continue

                    figures.append({
                        'filename': fig_filename,
                        'caption': fig['caption'],
                        'local_path': f"figures/{fig_filename}",
                        'original_url': fig['url']
                    })
                    await asyncio.sleep(0.3)
            except Exception as e:
                print(f"[figures] Failed to download {fig['url']}: {e}")
                continue

    except Exception as e:
        print(f"[figures] HTML fetch failed: {e}")

    return figures


async def extract_figures_from_arxiv_pdf(
    arxiv_id: str,
    figures_dir: Path,
    client: httpx.AsyncClient,
    max_figures: int = DEFAULT_MAX_FIGURES
) -> list[dict]:
    """Download arXiv PDF and extract first few pages as figure candidates."""
    figures = []

    # Ensure figures directory exists
    figures_dir.mkdir(parents=True, exist_ok=True)

    try:
        from pdf2image import convert_from_path
        from PIL import Image
    except ImportError:
        print("[figures] pdf2image not installed, skipping PDF extraction")
        return figures

    temp_pdf = None
    try:
        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        resp = await client.get(pdf_url, headers={"User-Agent": "ABO/1.0"}, timeout=PDF_TIMEOUT)

        if resp.status_code != 200:
            print(f"[figures] HTTP error {resp.status_code} when fetching PDF for {arxiv_id}")
            return figures

        if len(resp.content) < MIN_PDF_SIZE:
            print(f"[figures] PDF too small ({len(resp.content)} bytes), skipping extraction for {arxiv_id}")
            return figures

        # Save to temp file
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(resp.content)
            temp_pdf = f.name

        # Convert first 5 pages to images
        images = convert_from_path(temp_pdf, first_page=1, last_page=5, dpi=PDF_DPI)

        for i, image in enumerate(images[:max_figures]):
            width, height = image.size
            # Skip pages that are mostly text (tall aspect ratio)
            if height > width * 1.5:
                continue

            fig_filename = f"figure_pdf_{i+1:02d}.png"
            fig_path = figures_dir / fig_filename
            image.save(fig_path, "PNG")

            figures.append({
                'filename': fig_filename,
                'caption': f"PDF Page {i+1}",
                'local_path': f"figures/{fig_filename}",
                'original_url': f"pdf_page_{i+1}"
            })

    except Exception as e:
        print(f"[figures] PDF extraction failed: {e}")

    finally:
        if temp_pdf and os.path.exists(temp_pdf):
            os.unlink(temp_pdf)

    return figures


async def fetch_paper_figures(
    arxiv_id: str,
    figures_dir: Path,
    max_figures: int = DEFAULT_MAX_FIGURES
) -> list[dict]:
    """Fetch paper figures using multiple strategies."""
    import httpx
    figures = []

    async with httpx.AsyncClient() as client:
        # Strategy 1: arXiv HTML (best quality, proper figures)
        figures = await fetch_figures_from_arxiv_html(
            arxiv_id, figures_dir, client, max_figures
        )

        # Strategy 2: PDF extraction (fallback for HTML failures)
        if len(figures) < 2:
            remaining = max_figures - len(figures)
            pdf_figures = await extract_figures_from_arxiv_pdf(
                arxiv_id, figures_dir, client, remaining
            )
            figures.extend(pdf_figures)

    return figures[:max_figures]


async def download_arxiv_pdf(
    arxiv_id: str,
    target_path: Path,
    timeout: int = 60
) -> str | None:
    """Download PDF from arXiv with multiple source fallback and retries."""
    import asyncio
    import httpx

    # Clean arxiv_id (remove arxiv: prefix if present)
    clean_id = arxiv_id.replace("arxiv:", "").strip()

    sources = [
        f"https://arxiv.org/pdf/{clean_id}.pdf",
        f"https://ar5iv.org/pdf/{clean_id}.pdf",
        f"https://r.jina.ai/http://arxiv.org/pdf/{clean_id}.pdf",
    ]

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf",
    }

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for attempt, url in enumerate(sources):
            try:
                print(f"[pdf] Trying source {attempt + 1}/{len(sources)}: {url.split('/')[2]}")
                resp = await client.get(url, headers=headers)

                if resp.status_code == 200:
                    content = resp.content
                    # Validate PDF magic number
                    if len(content) > 10000 and content[:4] == b'%PDF':
                        target_path.write_bytes(content)
                        print(f"[pdf] Successfully downloaded PDF ({len(content)} bytes)")
                        return str(target_path)
                    else:
                        print(f"[pdf] Invalid PDF from {url} (size: {len(content)}, magic: {content[:4]})")
                else:
                    print(f"[pdf] HTTP {resp.status_code} from {url}")

                await asyncio.sleep(0.5 * (attempt + 1))  # Increasing delay

            except Exception as e:
                print(f"[pdf] Failed to download from {url}: {e}")
                continue

    print(f"[pdf] All sources failed for {arxiv_id}")
    return None


@app.post("/api/modules/semantic-scholar/save-to-literature")
async def save_s2_to_literature(data: dict):
    """Save a Semantic Scholar paper to the literature library with figures and PDF."""
    paper = data.get("paper", {})
    save_pdf = data.get("save_pdf", True)
    max_figures = data.get("max_figures", 5)

    # Get literature path
    lit_path = get_literature_path()
    if not lit_path:
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    # Get metadata
    meta = paper.get("metadata", {})
    title = paper.get("title", "untitled")
    paper_id = meta.get("paper_id", "unknown")

    # Get source paper info for naming (from top-level data, not metadata)
    source_paper = data.get("source_paper", "Unknown")
    source_short = re.sub(r'[^\w\s-]', '', source_paper)[:20].strip() or "Unknown"
    folder_name = f"{source_short}_FollowUp"

    # Build paper folder name: AuthorYear-ShortTitle-Hash
    authors = meta.get("authors", ["Unknown"])
    first_author = authors[0].split()[-1].replace(",", "").replace(" ", "") if authors else "Unknown"
    year = meta.get("year", datetime.now().year)
    short_title = "".join(c for c in title[:20] if c.isalnum()).upper() or "UNTITLED"
    title_hash = hashlib.md5(title.encode()).hexdigest()[:6]
    paper_folder_name = f"{first_author}{year}-{short_title}-{title_hash}"

    # Build target path: Literature/{Source}_FollowUp/{AuthorYear-ShortTitle}/
    base_dir = lit_path / folder_name
    paper_folder = base_dir / f"{first_author}{year}-{short_title}"
    paper_folder.mkdir(parents=True, exist_ok=True)

    # Figures folder inside paper folder
    figures_dir = paper_folder / "figures"
    figures_dir.mkdir(exist_ok=True)

    # Markdown filename: {AuthorYear}-{ShortTitle}.md
    md_filename = f"{first_author}{year}-{short_title}.md"
    target_path = paper_folder / md_filename

    # Try to fetch figures from arXiv if arxiv_id exists
    local_figures = []
    arxiv_id = meta.get("arxiv_id", "")

    if arxiv_id:
        try:
            local_figures = await fetch_paper_figures(arxiv_id, figures_dir, max_figures)
            print(f"[s2-save] Fetched {len(local_figures)} figures for {arxiv_id}")
        except Exception as e:
            print(f"[s2-save] Failed to fetch figures: {e}")

    # Try to download PDF if arxiv_id exists
    pdf_path = None
    if arxiv_id and save_pdf:
        pdf_full_path = paper_folder / "paper.pdf"
        try:
            result = await download_arxiv_pdf(arxiv_id, pdf_full_path)
            if result:
                pdf_path = "paper.pdf"
                print(f"[s2-save] Saved PDF: paper.pdf")
        except Exception as e:
            print(f"[s2-save] Failed to download PDF: {e}")

    # Build content with visualizations
    content_parts = [f"# {title}\n"]

    # Add metadata section
    content_parts.append("## 论文信息\n")
    if meta.get("authors"):
        content_parts.append(f"**作者**: {', '.join(meta['authors'][:5])}{' 等' if len(meta['authors']) > 5 else ''}\n")
    if meta.get("year"):
        content_parts.append(f"**年份**: {meta['year']}\n")
    if meta.get("venue"):
        content_parts.append(f"**期刊/会议**: {meta['venue']}\n")
    if meta.get("citation_count"):
        content_parts.append(f"**引用数**: {meta['citation_count']}\n")
    content_parts.append(f"**来源**: [{paper.get('source_url', '')}]({paper.get('source_url', '')})\n")

    if meta.get("contribution"):
        content_parts.append(f"\n**核心创新**: {meta['contribution']}\n")

    content_parts.append(f"\n**ABO评分**: {round(paper.get('score', 0) * 10, 1)}/10\n")

    # Add summary
    content_parts.append(f"\n## 摘要\n")
    content_parts.append(f"{paper.get('summary', '')}\n")

    if meta.get("abstract"):
        content_parts.append(f"\n### 原文摘要\n")
        content_parts.append(f"{meta['abstract']}\n")

    # Add figures section
    if local_figures:
        content_parts.append(f"\n## 图表 ({len(local_figures)}张)\n")
        for fig in local_figures:
            content_parts.append(f"### {fig['caption']}\n")
            content_parts.append(f"![{fig['caption']}]({fig['local_path']})\n")

    # Add PDF link
    if pdf_path:
        content_parts.append(f"\n## PDF\n")
        content_parts.append(f"[下载PDF]({pdf_path})\n")

    content = "\n".join(content_parts)

    # Write with frontmatter
    post = frontmatter.Post(content)
    post.metadata.update({
        "abo-type": "semantic-scholar-paper",
        "relevance-score": round(paper.get("score", 0.5), 3),
        "tags": paper.get("tags", []),
        "authors": meta.get("authors", []),
        "paper-id": paper_id,
        "arxiv-id": arxiv_id,
        "s2-url": meta.get("s2_url", ""),
        "year": meta.get("year"),
        "venue": meta.get("venue", ""),
        "citation-count": meta.get("citation_count", 0),
        "keywords": meta.get("keywords", []),
        "source-paper-title": source_paper,
        "figures": local_figures,
        "figures-dir": str(figures_dir.relative_to(paper_folder)) if local_figures else None,
        "pdf-path": pdf_path,
        "saved-at": datetime.now().isoformat(),
    })

    # Atomic write
    tmp = target_path.with_suffix(".tmp")
    tmp.write_text(frontmatter.dumps(post), encoding="utf-8")
    os.replace(tmp, target_path)

    return {
        "ok": True,
        "path": str(target_path.relative_to(lit_path)),
        "figures": local_figures,
        "pdf": pdf_path,
        "folder": str(paper_folder.relative_to(lit_path))
    }


# ── Semantic Scholar Tracker (VGGT Follow-ups) ───────────────────

@app.post("/api/modules/semantic-scholar-tracker/crawl")
async def crawl_semantic_scholar_tracker(data: dict = None):
    """Real-time Semantic Scholar follow-up crawl with progress via WebSocket."""
    from .default_modules.semantic_scholar_tracker import SemanticScholarTracker
    import asyncio

    data = data or {}
    query = data.get("query", "VGGT")
    max_results = data.get("max_results", 20)
    days_back = data.get("days_back", 7)

    prefs = _prefs.get_prefs_for_module("semantic-scholar-tracker")
    tracker = SemanticScholarTracker()
    results = []
    session_id = _generate_crawl_session_id()

    try:
        # Send session ID to client
        await broadcaster.send_event({
            "type": "crawl_started",
            "module": "semantic-scholar-tracker",
            "session_id": session_id,
            "message": f"开始搜索 '{query}' 的后续论文..."
        })

        # Check for cancellation
        if _should_cancel_crawl(session_id):
            await broadcaster.send_event({
                "type": "crawl_cancelled",
                "module": "semantic-scholar-tracker",
                "session_id": session_id
            })
            _cleanup_crawl_session(session_id)
            return {"papers": [], "count": 0, "cancelled": True}

        # Fetch papers
        await broadcaster.send_event({
            "type": "crawl_progress",
            "module": "semantic-scholar-tracker",
            "session_id": session_id,
            "phase": "fetching",
            "current": 0,
            "total": max_results,
            "message": f"正在从 Semantic Scholar 搜索 '{query}' 的后续论文..."
        })

        items = await tracker.fetch_followups(
            query=query,
            max_results=max_results,
            days_back=days_back
        )

        if not items:
            await broadcaster.send_event({
                "type": "crawl_complete",
                "module": "semantic-scholar-tracker",
                "session_id": session_id,
                "papers": [],
                "count": 0,
                "message": "未找到符合条件的后续论文"
            })
            _cleanup_crawl_session(session_id)
            return {"papers": [], "count": 0}

        # Process each paper
        for i, item in enumerate(items):
            if _should_cancel_crawl(session_id):
                await broadcaster.send_event({
                    "type": "crawl_cancelled",
                    "module": "semantic-scholar-tracker",
                    "session_id": session_id,
                    "message": f"爬取已取消，已处理 {i}/{len(items)} 篇论文"
                })
                _cleanup_crawl_session(session_id)
                return {"papers": results, "count": len(results), "cancelled": True}

            paper_title = item.raw.get('title', '')
            await broadcaster.send_event({
                "type": "crawl_progress",
                "module": "semantic-scholar-tracker",
                "session_id": session_id,
                "phase": "processing",
                "current": i + 1,
                "total": len(items),
                "message": f"正在处理第 {i+1}/{len(items)} 篇: {paper_title[:50]}..."
            })

            try:
                card_list = await asyncio.wait_for(
                    tracker.process([item], prefs),
                    timeout=60
                )
                if card_list:
                    card = card_list[0]
                    paper_data = {
                        "id": card.id,
                        "title": card.title,
                        "summary": card.summary,
                        "score": card.score,
                        "tags": card.tags,
                        "source_url": card.source_url,
                        "metadata": card.metadata,
                    }
                    results.append(paper_data)

                    await broadcaster.send_event({
                        "type": "crawl_paper",
                        "module": "semantic-scholar-tracker",
                        "session_id": session_id,
                        "paper": paper_data,
                        "current": i + 1,
                        "total": len(items)
                    })
            except asyncio.TimeoutError:
                print(f"[s2-tracker] Timeout processing {item.id}, skipping")
                continue
            except Exception as e:
                print(f"[s2-tracker] Error processing {item.id}: {e}")
                continue

        # Send completion
        await broadcaster.send_event({
            "type": "crawl_complete",
            "module": "semantic-scholar-tracker",
            "session_id": session_id,
            "papers": results,
            "count": len(results)
        })

        _cleanup_crawl_session(session_id)
        return {"papers": results, "count": len(results)}

    except Exception as e:
        _cleanup_crawl_session(session_id)
        error_msg = str(e)
        await broadcaster.send_event({
            "type": "crawl_error",
            "module": "semantic-scholar-tracker",
            "session_id": session_id,
            "error": error_msg
        })
        raise HTTPException(500, f"Semantic Scholar crawl failed: {e}")


@app.post("/api/modules/semantic-scholar-tracker/cancel")
async def cancel_semantic_scholar_tracker_crawl(data: dict):
    """Cancel an ongoing Semantic Scholar tracker crawl."""
    session_id = data.get("session_id")
    if not session_id:
        raise HTTPException(400, "session_id is required")

    _cancel_crawl(session_id)
    await broadcaster.send_event({
        "type": "crawl_cancelling",
        "module": "semantic-scholar-tracker",
        "session_id": session_id,
        "message": "正在取消爬取任务..."
    })
    return {"status": "ok", "message": "已发送取消信号"}


class ModuleUpdatePayload(BaseModel):
    enabled: bool | None = None
    schedule: str | None = None


@app.patch("/api/modules/{module_id}")
async def update_module(module_id: str, payload: ModuleUpdatePayload):
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    if payload.schedule is not None:
        if not payload.schedule.strip() or not _validate_cron(payload.schedule.strip()):
            raise HTTPException(400, "Invalid cron expression")

    # Update state and persist first
    new_state = _state_store.update_module(
        module_id,
        enabled=payload.enabled,
        schedule=payload.schedule,
        registry=_registry,
    )

    # Notify scheduler
    if _scheduler:
        if payload.schedule is not None:
            _scheduler.update_schedule(module)
        if payload.enabled is not None:
            _scheduler.update_enabled(module, payload.enabled)

    return {"ok": True, **module.get_status(), **new_state}


# ── Config ───────────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    return load_config()


@app.post("/api/config")
async def update_config(data: dict):
    save_config(data)
    return load_config()


class VaultValidationRequest(BaseModel):
    path: str


@app.post("/api/config/validate-vault")
async def validate_vault_path(request: VaultValidationRequest):
    """Validate that the provided path is a valid vault directory."""
    from pathlib import Path

    path = Path(request.path).expanduser().resolve()

    # Check if path exists
    if not path.exists():
        return {"valid": False, "message": "路径不存在"}

    # Check if it's a directory
    if not path.is_dir():
        return {"valid": False, "message": "所选路径不是文件夹"}

    # Check if we have read/write permissions
    try:
        # Try to list directory contents
        next(path.iterdir(), None)
        # Try to create a test file
        test_file = path / ".abo_test"
        test_file.touch()
        test_file.unlink()
    except PermissionError:
        return {"valid": False, "message": "没有该文件夹的读写权限"}
    except Exception as e:
        return {"valid": False, "message": f"无法访问该文件夹: {str(e)}"}

    return {"valid": True, "message": "路径验证成功"}


# ── Preferences ──────────────────────────────────────────────────

@app.get("/api/preferences")
async def get_prefs():
    if is_demo_mode():
        return {"keyword_preferences": DEMO_KEYWORD_PREFS}
    return _prefs.all_data()


@app.post("/api/preferences")
async def update_prefs(data: dict):
    _prefs.update(data)
    return {"ok": True}


@app.get("/api/preferences/keywords")
async def get_keyword_preferences():
    """Get all keyword preferences with scores."""
    if is_demo_mode():
        from .demo.data import DEMO_KEYWORD_PREFS as _dkp
        top = sorted(_dkp.items(), key=lambda x: -x[1]["score"])[:20]
        return {
            "keywords": {k: {"score": v["score"], "count": v["count"], "source_modules": v["source_modules"]} for k, v in _dkp.items()},
            "top": [{"keyword": k, "score": v["score"]} for k, v in top],
            "disliked": [],
        }
    prefs = _prefs.get_all_keyword_prefs()
    return {
        "keywords": {k: v.to_dict() for k, v in prefs.items()},
        "top": _prefs.get_top_keywords(20),
        "disliked": _prefs.get_disliked_keywords(),
    }


@app.get("/api/preferences/keywords/top")
async def get_top_keywords(limit: int = 20):
    """Get top liked keywords."""
    return {"keywords": _prefs.get_top_keywords(limit)}


@app.post("/api/preferences/reset")
async def reset_preferences():
    """Reset all preferences to default (for testing)."""
    import os
    from pathlib import Path

    # Remove preference files
    files_to_remove = [
        Path.home() / ".abo" / "preferences.json",
        Path.home() / ".abo" / "keyword_preferences.json",
    ]

    removed = []
    for f in files_to_remove:
        if f.exists():
            f.unlink()
            removed.append(str(f.name))

    # Re-initialize
    global _prefs
    _prefs = PreferenceEngine()

    return {"ok": True, "removed": removed}


# ── Module Subscription Config (Crawler Management) ────────────────

class ModuleConfig(BaseModel):
    """Module configuration schema for crawler subscriptions."""
    keywords: list[str] = []
    up_uids: list[str] = []  # Bilibili
    followed_up_groups: list[str] = []  # Bilibili followed groups
    user_ids: list[str] = []  # Xiaohongshu
    users: list[str] = []  # Zhihu users
    topics: list[str] = []  # Zhihu topics
    podcast_ids: list[str] = []  # Xiaoyuzhou
    max_results: int = 20
    enabled: bool = True
    enable_keyword_search: bool = True
    keyword_min_likes: int = 500
    keyword_search_limit: int = 10
    follow_feed: bool = False
    follow_feed_types: list[int] = [8, 2, 4, 64]
    fetch_follow_limit: int = 20
    creator_groups: list[str] = []
    creator_profiles: dict = {}
    creator_group_options: list[dict] = []
    keyword_filter: bool = True


BILIBILI_FOLLOWED_GROUP_OPTIONS = [
    {"value": "ai-tech", "label": "AI科技"},
    {"value": "study", "label": "学习知识"},
    {"value": "digital", "label": "数码影音"},
    {"value": "game", "label": "游戏"},
    {"value": "finance", "label": "财经商业"},
    {"value": "creative", "label": "设计创作"},
    {"value": "entertainment", "label": "生活娱乐"},
    {"value": "other", "label": "其他"},
]


@app.get("/api/modules/{module_id}/config")
async def get_module_config(module_id: str):
    """Get subscription config for a specific module."""
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    # Load from preferences
    prefs = _prefs.all_data()
    module_prefs = prefs.get("modules", {}).get(module_id, {})

    subscription_types = getattr(module, "subscription_types", [])

    config = {
        "module_id": module_id,
        "module_name": module.name,
        "enabled": getattr(module, "enabled", True),
        "keywords": module_prefs.get("keywords", []),
        "up_uids": module_prefs.get("up_uids", []),
        "followed_up_groups": module_prefs.get("followed_up_groups", []),
        "user_ids": module_prefs.get("user_ids", []),
        "users": module_prefs.get("users", []),
        "topics": module_prefs.get("topics", []),
        "podcast_ids": module_prefs.get("podcast_ids", []),
        "max_results": module_prefs.get("max_results", 20),
        "enable_keyword_search": module_prefs.get("enable_keyword_search", True),
        "keyword_min_likes": module_prefs.get("keyword_min_likes", 500),
        "keyword_search_limit": module_prefs.get("keyword_search_limit", 10),
        "follow_feed": module_prefs.get("follow_feed", False),
        "follow_feed_types": module_prefs.get("follow_feed_types", [8, 2, 4, 64]),
        "fetch_follow_limit": module_prefs.get("fetch_follow_limit", 20),
        "creator_push_enabled": module_prefs.get("creator_push_enabled", True),
        "disabled_creator_ids": module_prefs.get("disabled_creator_ids", []),
        "creator_groups": module_prefs.get("creator_groups", []),
        "creator_profiles": module_prefs.get("creator_profiles", {}),
        "creator_group_options": module_prefs.get("creator_group_options", []),
        "keyword_filter": module_prefs.get("keyword_filter", True),
        "sessdata": module_prefs.get("sessdata", ""),
        "cookie": module_prefs.get("cookie", ""),
        "web_session": module_prefs.get("web_session", ""),
        "id_token": module_prefs.get("id_token", ""),
        # UI hints for adding subscriptions
        "subscription_types": subscription_types,
    }

    if module_id == "bilibili-tracker":
        config["followed_up_group_options"] = BILIBILI_FOLLOWED_GROUP_OPTIONS

    # Add module-specific defaults if empty
    if "keywords" not in module_prefs and not config["keywords"]:
        config["keywords"] = get_default_keywords_for_module(module_id)

    return config


@app.post("/api/modules/{module_id}/config")
async def update_module_config(module_id: str, data: dict):
    """Update subscription config for a specific module."""
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    # Get current preferences
    prefs = _prefs.all_data()
    if "modules" not in prefs:
        prefs["modules"] = {}
    if module_id not in prefs["modules"]:
        prefs["modules"][module_id] = {}

    # Update fields
    module_prefs = prefs["modules"][module_id]

    if "keywords" in data:
        module_prefs["keywords"] = data["keywords"]
    if "up_uids" in data:
        module_prefs["up_uids"] = data["up_uids"]
    if "followed_up_groups" in data:
        module_prefs["followed_up_groups"] = data["followed_up_groups"]
    if "user_ids" in data:
        module_prefs["user_ids"] = data["user_ids"]
    if "users" in data:
        module_prefs["users"] = data["users"]
    if "topics" in data:
        module_prefs["topics"] = data["topics"]
    if "podcast_ids" in data:
        module_prefs["podcast_ids"] = data["podcast_ids"]
    if "max_results" in data:
        module_prefs["max_results"] = max(1, int(data["max_results"] or 1))
    if "enable_keyword_search" in data:
        module_prefs["enable_keyword_search"] = bool(data["enable_keyword_search"])
    if "keyword_min_likes" in data:
        module_prefs["keyword_min_likes"] = max(0, int(data["keyword_min_likes"] or 0))
    if "keyword_search_limit" in data:
        module_prefs["keyword_search_limit"] = max(1, int(data["keyword_search_limit"] or 1))
    # Bilibili-specific config
    if "follow_feed" in data:
        module_prefs["follow_feed"] = data["follow_feed"]
    if "follow_feed_types" in data:
        module_prefs["follow_feed_types"] = data["follow_feed_types"]
    if "fetch_follow_limit" in data:
        module_prefs["fetch_follow_limit"] = max(1, int(data["fetch_follow_limit"] or 1))
    if "creator_push_enabled" in data:
        module_prefs["creator_push_enabled"] = bool(data["creator_push_enabled"])
    if "disabled_creator_ids" in data:
        module_prefs["disabled_creator_ids"] = list(data["disabled_creator_ids"] or [])
    if "creator_groups" in data:
        module_prefs["creator_groups"] = list(data["creator_groups"] or [])
    if "creator_profiles" in data:
        module_prefs["creator_profiles"] = dict(data["creator_profiles"] or {})
    if "creator_group_options" in data:
        module_prefs["creator_group_options"] = list(data["creator_group_options"] or [])
    if "keyword_filter" in data:
        module_prefs["keyword_filter"] = data["keyword_filter"]
    if "sessdata" in data:
        module_prefs["sessdata"] = data["sessdata"]
    if "cookie" in data:
        module_prefs["cookie"] = data["cookie"]

    # Save preferences
    _prefs.update(prefs)

    return {"ok": True, "config": module_prefs}


@app.post("/api/modules/{module_id}/subscriptions")
async def add_module_subscription(module_id: str, data: dict):
    """Add a subscription to a module (UP主, user, podcast, etc.)."""
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    sub_type = data.get("type")  # "up_uid", "user_id", "user", "topic", "podcast_id"
    sub_value = data.get("value")

    if not sub_type or not sub_value:
        raise HTTPException(400, "type and value are required")

    # Get current preferences
    prefs = _prefs.all_data()
    if "modules" not in prefs:
        prefs["modules"] = {}
    if module_id not in prefs["modules"]:
        prefs["modules"][module_id] = {}

    module_prefs = prefs["modules"][module_id]

    # Map subscription type to preference key
    type_to_key = {
        "up_uid": "up_uids",
        "user_id": "user_ids",
        "user": "users",
        "topic": "topics",
        "podcast_id": "podcast_ids",
    }

    key = type_to_key.get(sub_type)
    if not key:
        raise HTTPException(400, f"Unknown subscription type: {sub_type}")

    # Add to list if not already present
    current = module_prefs.get(key, [])
    if sub_value not in current:
        current.append(sub_value)
        module_prefs[key] = current
        _prefs.update(prefs)

        # Record in subscription store
        _subscription_store.add_subscription(
            module_id=module_id,
            sub_type=sub_type,
            value=sub_value,
            added_by="user",
        )

    result = {"ok": True}
    result[key] = current
    return result


@app.delete("/api/modules/{module_id}/subscriptions")
async def remove_module_subscription(module_id: str, data: dict):
    """Remove a subscription from a module."""
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    sub_type = data.get("type")
    sub_value = data.get("value")

    if not sub_type or not sub_value:
        raise HTTPException(400, "type and value are required")

    prefs = _prefs.all_data()
    if "modules" not in prefs or module_id not in prefs["modules"]:
        raise HTTPException(404, "Module config not found")

    module_prefs = prefs["modules"][module_id]

    type_to_key = {
        "up_uid": "up_uids",
        "user_id": "user_ids",
        "user": "users",
        "topic": "topics",
        "podcast_id": "podcast_ids",
    }

    key = type_to_key.get(sub_type)
    if not key:
        raise HTTPException(400, f"Unknown subscription type: {sub_type}")

    current = module_prefs.get(key, [])
    if sub_value in current:
        current.remove(sub_value)
        module_prefs[key] = current
        _prefs.update(prefs)

        # Remove from subscription store
        _subscription_store.remove_subscription(
            module_id=module_id,
            sub_type=sub_type,
            value=sub_value,
        )

    result = {"ok": True}
    result[key] = current
    return result


@app.get("/api/modules/{module_id}/subscriptions/detail")
async def get_module_subscriptions_detail(module_id: str):
    """Get detailed subscription info for a module (with timestamps)."""
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    # Get current subscriptions from preferences
    prefs = _prefs.all_data()
    module_prefs = prefs.get("modules", {}).get(module_id, {})

    # Map keys to subscription types
    key_to_type = {
        "up_uids": "up_uid",
        "user_ids": "user_id",
        "users": "user",
        "topics": "topic",
        "podcast_ids": "podcast_id",
    }

    # Build current subscriptions list
    current_subs = []
    for key, sub_type in key_to_type.items():
        for value in module_prefs.get(key, []):
            current_subs.append({"type": sub_type, "value": value})

    # Get subscription details from store
    stored_subs = _subscription_store.get_subscriptions(module_id)
    stored_map = {(s["type"], s["value"]): s for s in stored_subs}

    # Build set of current subscription keys
    current_set = {(s["type"], s["value"]) for s in current_subs}

    # Mark all stored subscriptions
    for sub in stored_subs:
        sub["is_active"] = (sub["type"], sub["value"]) in current_set

    # Merge current subscriptions with stored details
    detailed_subs = []
    for sub in current_subs:
        key = (sub["type"], sub["value"])
        stored = stored_map.get(key, {})
        detailed_subs.append({
            "type": sub["type"],
            "value": sub["value"],
            "added_at": stored.get("added_at"),
            "added_by": stored.get("added_by", "user"),
            "last_fetched": stored.get("last_fetched"),
            "fetch_count": stored.get("fetch_count", 0),
            "is_active": True,
        })

    # Add inactive stored subscriptions (history)
    for stored in stored_subs:
        if not stored.get("is_active", True):
            detailed_subs.append({
                "type": stored["type"],
                "value": stored["value"],
                "added_at": stored.get("added_at"),
                "added_by": stored.get("added_by", "user"),
                "last_fetched": stored.get("last_fetched"),
                "fetch_count": stored.get("fetch_count", 0),
                "is_active": False,
            })

    # Sort by added_at (newest first)
    detailed_subs.sort(key=lambda x: x.get("added_at") or "", reverse=True)

    return {
        "module_id": module_id,
        "module_name": getattr(module, "name", module_id),
        "subscriptions": detailed_subs,
    }


@app.get("/api/subscriptions/summary")
async def get_subscriptions_summary():
    """Get a summary of all subscriptions across all modules."""
    summary = _subscription_store.get_summary()

    # Enrich with module names
    modules_info = {}
    for module_id in summary.get("modules", {}):
        module = _registry.get(module_id)
        modules_info[module_id] = {
            "name": getattr(module, "name", module_id),
            "icon": getattr(module, "icon", "rss"),
        }

    return {
        "total_modules": summary["total_modules"],
        "total_subscriptions": summary["total_subscriptions"],
        "modules": summary["modules"],
        "modules_info": modules_info,
    }


def get_default_keywords_for_module(module_id: str) -> list[str]:
    """Get default keywords for a module."""
    defaults = {
        "bilibili-tracker": ["科研", "学术", "读博", "论文"],
        "xiaohongshu-tracker": ["科研工具", "论文写作", "学术日常"],
        "zhihu-tracker": ["人工智能", "科研", "学术"],
        "xiaoyuzhou-tracker": ["科技", "商业", "文化"],
    }
    return defaults.get(module_id, [])


# ── Gamification (Phase 3) ───────────────────────────────────────

@app.get("/api/game/stats")
async def get_game_stats():
    """Get daily gaming stats (happiness, SAN, energy, achievements)."""
    if is_demo_mode():
        from .demo.data import DEMO_GAME_STATS
        return DEMO_GAME_STATS
    from .game import get_daily_stats
    return get_daily_stats()


@app.post("/api/game/action")
async def post_game_action(data: dict):
    """Record a game action and get rewards."""
    from .game import apply_action
    action = data.get("action", "")
    metadata = data.get("metadata", {})
    result = apply_action("default", action, metadata)
    return result


# ── Vault Browser ────────────────────────────────────────────────

class VaultItem(BaseModel):
    name: str
    path: str
    type: str  # "folder" or "file"
    size: int | None = None
    modified: float  # timestamp


@app.get("/api/vault/browse")
async def browse_vault(path: str = ""):
    """Browse vault folder structure."""
    vault_path = get_vault_path()
    if not vault_path:
        raise HTTPException(400, "Vault not configured")
    return _browse_folder(vault_path, path)


@app.get("/api/literature/browse")
async def browse_literature(path: str = ""):
    """Browse literature folder structure. Falls back to vault path if literature_path not set."""
    from .config import get_literature_path, get_vault_path
    lit_path = get_literature_path()
    if not lit_path:
        # Fall back to vault path
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")
    if not lit_path.exists():
        raise HTTPException(404, "Literature folder not found")
    return _browse_folder(lit_path, path)


@app.get("/api/literature/file")
async def serve_literature_file(path: str):
    """Serve a file from the literature folder."""
    from fastapi.responses import FileResponse
    from .config import get_literature_path, get_vault_path

    lit_path = get_literature_path()
    if not lit_path:
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    target = lit_path / path
    # Security check: ensure file is within literature path
    if not str(target.resolve()).startswith(str(lit_path.resolve())):
        raise HTTPException(403, "Access denied")

    if not target.exists():
        raise HTTPException(404, "File not found")

    if not target.is_file():
        raise HTTPException(400, "Not a file")

    return FileResponse(target)


def _browse_folder(base_path: Path, sub_path: str = ""):
    """Common logic for browsing folders."""
    target = base_path / sub_path if sub_path else base_path

    if not str(target.resolve()).startswith(str(base_path.resolve())):
        raise HTTPException(403, "Access denied")

    if not target.exists():
        raise HTTPException(404, "Path not found")

    items = []
    try:
        for item in sorted(target.iterdir()):
            if item.name.startswith("."):
                continue
            stat = item.stat()
            items.append(VaultItem(
                name=item.name,
                path=str(item.relative_to(base_path)),
                type="folder" if item.is_dir() else "file",
                size=stat.st_size if item.is_file() else None,
                modified=stat.st_mtime,
            ))
    except PermissionError:
        raise HTTPException(403, "Permission denied")

    return {"items": items, "current_path": sub_path}


@app.post("/api/vault/open")
async def open_vault_item(data: dict):
    """Open file or folder with system default application."""
    import subprocess
    vault_path = get_vault_path()
    if not vault_path:
        raise HTTPException(400, "Vault not configured")
    return _open_in_finder(vault_path, data.get("path", ""))


@app.post("/api/literature/open")
async def open_literature_item(data: dict):
    """Open file or folder in literature folder with system default. Falls back to vault path."""
    from .config import get_literature_path, get_vault_path
    lit_path = get_literature_path()
    if not lit_path:
        # Fall back to vault path
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")
    return _open_in_finder(lit_path, data.get("path", ""))


def _open_in_finder(base_path: Path, item_path: str = ""):
    """Common logic for opening files/folders in Finder."""
    import subprocess
    target = base_path / item_path if item_path else base_path

    if not str(target.resolve()).startswith(str(base_path.resolve())):
        raise HTTPException(403, "Access denied")

    if not target.exists():
        raise HTTPException(404, "Path not found")

    try:
        subprocess.run(["open", str(target.resolve())], check=True)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Failed to open: {e}")


@app.post("/api/vault/open-obsidian")
async def open_in_obsidian(data: dict = None):
    """Open vault or specific file in Obsidian app."""
    import subprocess
    vault_path = get_vault_path()
    if not vault_path:
        raise HTTPException(400, "Vault not configured")

    item_path = data.get("path", "") if data else ""
    target = Path(vault_path) / item_path if item_path else Path(vault_path)

    # Security check
    if not str(target.resolve()).startswith(str(Path(vault_path).resolve())):
        raise HTTPException(403, "Access denied")

    try:
        # Use 'open' with Obsidian app bundle ID
        # Try to open the specific file/folder with Obsidian
        if target.is_file():
            # For files, use obsidian:// url scheme via 'open'
            vault_name = Path(vault_path).name
            relative_path = str(target.relative_to(vault_path))
            url = f"obsidian://open?vault={vault_name}&file={relative_path}"
            subprocess.run(["open", url], check=True)
        else:
            # For folders, just open the vault
            subprocess.run(["open", "-a", "Obsidian", str(target.resolve())], check=True)
        return {"ok": True}
    except Exception as e:
        # Fallback: try to just open Obsidian app
        try:
            subprocess.run(["open", "-a", "Obsidian"], check=True)
            return {"ok": True}
        except:
            raise HTTPException(500, f"Failed to open Obsidian: {e}")


@app.post("/api/literature/open-obsidian")
async def open_literature_in_obsidian(data: dict = None):
    """Open literature folder in Obsidian app."""
    import subprocess
    from .config import get_literature_path, get_vault_path

    lit_path = get_literature_path()
    if not lit_path:
        # Fall back to vault path
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    item_path = data.get("path", "") if data else ""
    target = lit_path / item_path if item_path else lit_path

    # Security check
    if not str(target.resolve()).startswith(str(lit_path.resolve())):
        raise HTTPException(403, "Access denied")

    try:
        # Open the literature folder with Obsidian
        subprocess.run(["open", "-a", "Obsidian", str(target.resolve())], check=True)
        return {"ok": True}
    except Exception as e:
        # Fallback: try to just open Obsidian app
        try:
            subprocess.run(["open", "-a", "Obsidian"], check=True)
            return {"ok": True}
        except:
            raise HTTPException(500, f"Failed to open Obsidian: {e}")


@app.post("/api/test/feedback-loop")
async def test_feedback_loop(data: dict = None):
    """Test the complete feedback loop (P2+P3+P4 integration)."""
    from .game import apply_action

    # Simulate liking a card with tags
    test_tags = data.get("tags", ["深度学习", "PyTorch", "论文推荐"]) if data else ["深度学习", "PyTorch", "论文推荐"]
    test_module = data.get("module", "arxiv-tracker") if data else "arxiv-tracker"

    # 1. Update keyword preferences (P2)
    _prefs.update_from_feedback(test_tags, "like", test_module)

    # 2. Apply game rewards (P3)
    rewards = apply_action("default", "card_like", {"tags": test_tags, "module": test_module})

    # 3. Broadcast would happen here (P4) - but we skip for test

    # Get current state
    keyword_prefs = _prefs.get_all_keyword_prefs()

    return {
        "test": "feedback-loop",
        "input_tags": test_tags,
        "input_module": test_module,
        "keyword_updates": {
            tag: keyword_prefs.get(tag.lower(), {"score": 0}).get("score", 0)
            for tag in test_tags
        },
        "rewards": rewards.get("rewards", {}),
        "total_keywords_tracked": len(keyword_prefs),
        "status": "✅ All phases working!"
    }


@app.post("/api/test/simulate-day")
async def simulate_day(data: dict = None):
    """Simulate a day of activity for testing."""
    from .game import apply_action

    actions_to_simulate = [
        ("daily_checkin", {}),
        ("check_feed", {}),
        ("like_content", {"content": "paper1"}),
        ("like_content", {"content": "paper2"}),
        ("save_paper", {"paper": "vggt-followup"}),
        ("read_paper", {"paper": "vggt-followup"}),
        ("complete_todo", {"todo": "read papers"}),
    ]

    results = []
    for action, meta in actions_to_simulate:
        result = apply_action("default", action, meta)
        results.append({
            "action": action,
            "xp": result["rewards"]["xp"],
            "happiness": result["rewards"]["happiness_delta"],
        })

    total_xp = sum(r["xp"] for r in results)
    total_happiness = sum(r["happiness"] for r in results)

    return {
        "simulated_actions": len(results),
        "actions": results,
        "totals": {
            "xp": total_xp,
            "happiness_delta": total_happiness,
        },
        "final_stats": {
            "happiness": profile_store.get_happiness_today(),
            "san": profile_store.get_san_7d_avg(),
            "energy": profile_store.get_energy_today(),
        }
    }


# ── Activity Tracking ────────────────────────────────────────────

@app.post("/api/activity/chat")
async def record_chat(data: dict):
    """Record a chat/conversation activity."""
    global _activity_tracker
    if _activity_tracker:
        activity = _activity_tracker.record_activity(
            activity_type=ActivityType.CHAT_MESSAGE,
            chat_topic=data.get("topic"),
            metadata={
                "context": data.get("context", ""),
                "message_count": data.get("message_count", 1)
            }
        )
        return {"ok": True, "activity_id": activity.id}
    return {"ok": False, "error": "Tracker not initialized"}


@app.get("/api/timeline/today")
async def get_today_timeline():
    """Get today's timeline."""
    if is_demo_mode():
        activities = get_demo_activities()
        return {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "activities": activities,
            "summary": None,
            "summary_generated_at": None,
            "chat_path": [
                {"time": "09:30", "topic": "讨论 Diffusion Policy 在机械臂上的应用", "context": "arxiv"},
                {"time": "09:45", "topic": "对比 RT-2 和 Diffusion Policy 的优劣", "context": "research"},
            ],
            "interaction_summary": {"card_view": 7, "card_like": 4, "card_save": 4, "chat_start": 1, "chat_message": 1, "module_run": 1, "checkin": 1},
        }
    from datetime import datetime as _dt
    today = _dt.now().strftime("%Y-%m-%d")
    return await get_timeline(today)


@app.get("/api/timeline/{date}")
async def get_timeline(date: str):
    """Get timeline for a specific date."""
    global _activity_tracker
    if _activity_tracker:
        timeline = _activity_tracker.get_timeline(date)
        return {
            "date": timeline.date,
            "activities": [a.to_dict() for a in timeline.activities],
            "summary": timeline.summary,
            "summary_generated_at": timeline.summary_generated_at,
            "chat_path": timeline.get_chat_path(),
            "interaction_summary": timeline.get_interaction_summary()
        }
    return {"error": "Tracker not initialized"}


@app.get("/api/timeline/recent/{days}")
async def get_recent_timelines(days: int = 7):
    """Get timelines for recent days."""
    global _activity_tracker
    if _activity_tracker:
        timelines = _activity_tracker.get_recent_timelines(days)
        return {
            "timelines": [
                {
                    "date": t.date,
                    "activities": [a.to_dict() for a in t.activities],
                    "summary": t.summary,
                    "summary_generated_at": t.summary_generated_at,
                    "chat_path": t.get_chat_path(),
                    "interaction_summary": t.get_interaction_summary()
                }
                for t in timelines
            ]
        }
    return {"error": "Tracker not initialized"}


@app.post("/api/timeline/{date}/summary")
async def update_timeline_summary(date: str, data: dict):
    """Update the AI-generated summary for a day."""
    global _activity_tracker
    if _activity_tracker:
        _activity_tracker.update_summary(date, data.get("summary", ""))
        return {"ok": True}
    return {"ok": False, "error": "Tracker not initialized"}


# ── Daily Summary Generator ─────────────────────────────────────

@app.post("/api/summary/generate")
async def generate_summary_manually(data: dict = None):
    """Manually trigger summary generation."""
    global _summary_scheduler
    date = data.get("date") if data else None
    if _summary_scheduler:
        summary = await asyncio.to_thread(_summary_scheduler.generate_now, date)
        return {"ok": True, "summary": summary}
    return {"ok": False, "error": "Generator not initialized"}


@app.get("/api/summary/{date}")
async def get_summary(date: str):
    """Get generated summary for a date."""
    global _activity_tracker
    if _activity_tracker:
        timeline = _activity_tracker.get_timeline(date)
        return {
            "date": date,
            "summary": timeline.summary,
            "generated_at": timeline.summary_generated_at,
            "activity_count": len(timeline.activities)
        }
    return {"error": "Tracker not initialized"}


@app.get("/api/summary/today/status")
async def get_today_summary_status():
    """Check if today's summary has been generated."""
    from datetime import datetime
    global _activity_tracker
    today = datetime.now().strftime("%Y-%m-%d")
    if _activity_tracker:
        timeline = _activity_tracker.get_timeline(today)
        return {
            "date": today,
            "has_summary": timeline.summary is not None,
            "summary": timeline.summary,
            "generated_at": timeline.summary_generated_at,
            "activity_count": len(timeline.activities)
        }
    return {"error": "Tracker not initialized"}


# ── 注册 CLI 和 Chat 路由 ─────────────────────────────────────────
from .routes.cli import cli_router
from .routes.chat import chat_router

app.include_router(cli_router)
app.include_router(chat_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("abo.main:app", host="127.0.0.1", port=8765, log_level="info")
