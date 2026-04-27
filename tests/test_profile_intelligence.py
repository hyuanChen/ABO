from pathlib import Path
from fastapi.testclient import TestClient

from abo.activity.models import Activity, ActivityType, DailyTimeline
from abo.main import app
from abo.profile import routes, store
from abo.profile.intelligence import calculate_workbench, merge_generated_todos


def build_timeline() -> DailyTimeline:
    return DailyTimeline(
        date="2026-04-16",
        activities=[
            Activity(
                id="a1",
                type=ActivityType.CARD_VIEW,
                timestamp="2026-04-16T09:10:00",
                card_title="Diffusion Policy for Robot Manipulation",
                module_id="arxiv-tracker",
                metadata={"tags": ["机器人", "扩散策略"]},
            ),
            Activity(
                id="a2",
                type=ActivityType.CARD_SAVE,
                timestamp="2026-04-16T09:25:00",
                card_title="World Model Notes",
                module_id="arxiv-tracker",
                metadata={"tags": ["机器人", "world model"]},
            ),
            Activity(
                id="a3",
                type=ActivityType.CHAT_MESSAGE,
                timestamp="2026-04-16T14:10:00",
                chat_topic="讨论机器人 policy 学习",
                metadata={"context": "research"},
            ),
        ],
        summary="今天围绕机器人策略学习做了初步收敛。",
    )


def test_merge_generated_todos_deduplicates_and_enriches():
    existing = [{"id": "1", "text": "整理今天最重要的 2 条情报", "done": False}]
    generated = [
        {
            "text": "整理今天最重要的 2 条情报",
            "priority": "high",
            "reason": "需要沉淀成笔记",
            "evidence": ["机器人"],
        },
        {
            "text": "围绕机器人追一层原始来源",
            "priority": "medium",
            "reason": "补全依据",
            "evidence": ["Diffusion Policy"],
        },
    ]

    merged, created = merge_generated_todos(existing, generated)

    assert created == 1
    assert len(merged) == 2
    assert merged[0]["priority"] == "high"
    assert merged[0]["reason"] == "需要沉淀成笔记"
    assert merged[1]["source"] == "agent"


def test_calculate_workbench_reports_score_and_topics():
    timeline = build_timeline()
    todos = [
        {"id": "t1", "text": "整理笔记", "done": True, "duration_ms": 1_800_000},
        {"id": "t2", "text": "追原文", "done": False, "started_at": 1},
    ]
    keyword_prefs = {
        "机器人": {"keyword": "机器人", "score": 0.8, "count": 4},
        "扩散策略": {"keyword": "扩散策略", "score": 0.5, "count": 2},
    }

    workbench = calculate_workbench(
        timeline=timeline,
        todos=todos,
        keyword_prefs=keyword_prefs,
        energy=76,
        san=68,
        happiness=7,
        briefing_summary="今天机器人相关情报值得继续推进。",
    )

    assert workbench["score"]["value"] > 0
    assert len(workbench["metrics"]) == 4
    assert workbench["top_topics"][0]["tag"] == "机器人"
    assert workbench["top_topics"][0]["preferred"] is True
    assert workbench["recent_activity"][0]["time"] == "09:10"


def test_generate_persona_route_persists_profile(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(store, "_ABO_DIR", tmp_path)

    async def fake_agent_json(prompt: str, prefs=None):
        return {
            "summary": "你长期围绕机器人与研究工作流构建自己的知识系统。",
            "homepage": {
                "codename": "Policy Weaver",
                "long_term_goal": "把机器人方向的高价值输入稳定转化成研究产出",
                "one_liner": "擅长把零散线索织成研究路径。",
                "narrative": "你更像一个持续编织研究线索的整理者。",
                "strengths": ["持续追踪", "结构化整理"],
                "working_style": ["先广泛搜集，再抽象问题"],
                "preferred_topics": ["机器人", "策略学习"],
                "next_focus": ["收敛成一个具体研究问题"],
            },
            "sbti": {
                "type": "THINK",
                "confidence": 0.83,
                "reasoning": ["文本明显偏分析型", "喜欢整理与抽象"],
            },
        }

    monkeypatch.setattr(routes, "agent_json", fake_agent_json)

    with TestClient(app) as client:
        response = client.post("/api/profile/persona/generate", json={"wiki_text": "我主要做机器人和策略学习。"})

    assert response.status_code == 200
    data = response.json()["persona"]
    assert data["homepage"]["codename"] == "Policy Weaver"
    assert data["sbti"]["type"] == "THIN-K"

    saved = store.get_persona_profile()
    assert saved["summary"]
    assert store.get_identity()["codename"] == "Policy Weaver"


def test_generate_daily_briefing_route_keeps_manual_todos_separate(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(store, "_ABO_DIR", tmp_path)
    store.save_todos_today([{"id": "base", "text": "已有手动任务", "done": False}])

    class FakePreferenceEngine:
        def get_all_keyword_prefs(self):
            return {"机器人": {"keyword": "机器人", "score": 0.9, "count": 3}}

        def all_data(self):
            return {"derived_weights": {"机器人": 1.3}, "global": {"summary_language": "zh"}}

    class FakeActivityTracker:
        def get_timeline(self, date: str):
            return build_timeline()

    def fake_load_today_intel_cards(card_store, limit=12):
        return [
            {
                "id": "card-1",
                "module_id": "arxiv-tracker",
                "title": "Diffusion Policy",
                "summary": "机器人策略学习论文",
                "tags": ["机器人", "扩散策略"],
                "score": 0.91,
                "source_url": "",
                "created_at": 1.0,
            }
        ]

    async def fake_agent_json(prompt: str, prefs=None):
        return {
            "summary": "今天机器人方向值得优先收敛。",
            "focus": "把 Diffusion Policy 相关线索整理成一个具体问题",
            "todos": [
                {
                    "text": "整理 Diffusion Policy 与 world model 的差异",
                    "priority": "high",
                    "reason": "两条线已经在今天的阅读里出现交汇",
                    "evidence": ["Diffusion Policy", "World Model Notes"],
                }
            ],
        }

    monkeypatch.setattr(routes, "PreferenceEngine", FakePreferenceEngine)
    monkeypatch.setattr(routes, "ActivityTracker", FakeActivityTracker)
    monkeypatch.setattr(routes, "_load_today_intel_cards", fake_load_today_intel_cards)
    monkeypatch.setattr(routes, "agent_json", fake_agent_json)

    with TestClient(app) as client:
        response = client.post("/api/profile/daily-briefing/generate", json={})

    assert response.status_code == 200
    payload = response.json()
    assert payload["created_count"] == 1
    assert payload["daily_briefing"]["focus"].startswith("把 Diffusion Policy")
    assert payload["daily_briefing"]["intel_cards"][0]["title"] == "Diffusion Policy"

    todos = store.get_manual_todos_today()
    assert len(todos) == 1
    assert todos[0]["text"] == "已有手动任务"
    assert store.get_daily_briefing()["summary"] == "今天机器人方向值得优先收敛。"
    assert len(store.get_daily_briefing()["suggested_todos"]) == 1
