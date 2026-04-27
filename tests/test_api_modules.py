"""
API Module Endpoint Tests

Tests for FastAPI module endpoints:
- GET /api/modules
- POST /api/modules/{id}/run
- GET /api/status (scheduler info)

Note: Using TestClient instead of httpx.AsyncClient because TestClient
properly handles the FastAPI lifespan context manager, which initializes
the module registry and scheduler.
"""
import asyncio
import time
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from abo.main import app
import abo.main as main_module
from abo.sdk.types import Card
from abo.store.cards import CardStore


@pytest.fixture
def client():
    """Create a TestClient with lifespan support."""
    with TestClient(app) as c:
        yield c


def test_get_modules(client):
    """Test GET /api/modules returns module list with status."""
    response = client.get("/api/modules")

    assert response.status_code == 200
    data = response.json()

    # Assert response has "modules" list with >= 7 items
    assert "modules" in data
    assert isinstance(data["modules"], list)
    assert len(data["modules"]) >= 7, f"Expected at least 7 modules, got {len(data['modules'])}"

    # Assert each module has: id, name, schedule, enabled, next_run
    required_fields = {"id", "name", "schedule", "enabled", "next_run"}
    for module in data["modules"]:
        missing = required_fields - set(module.keys())
        assert not missing, f"Module {module.get('id', 'unknown')} missing fields: {missing}"

        # Verify field types
        assert isinstance(module["id"], str)
        assert isinstance(module["name"], str)
        assert isinstance(module["schedule"], str)
        assert isinstance(module["enabled"], bool)
        # next_run can be string (ISO datetime) or None
        assert module["next_run"] is None or isinstance(module["next_run"], str)


def test_run_module_endpoint(client):
    """Test POST /api/modules/{module_id}/run triggers execution."""
    # First GET /api/modules to get a real module_id
    modules_response = client.get("/api/modules")
    assert modules_response.status_code == 200
    modules_data = modules_response.json()

    # Get the first enabled module
    enabled_modules = [m for m in modules_data["modules"] if m.get("enabled", True)]
    if not enabled_modules:
        pytest.skip("No enabled modules found to test")

    module_id = enabled_modules[0]["id"]

    # Mock the scheduler's run_now to avoid making real network calls
    with patch("abo.main._scheduler.run_now") as mock_run_now:
        mock_run_now.return_value = True

        # POST /api/modules/{module_id}/run
        run_response = client.post(f"/api/modules/{module_id}/run")

        # Assert 200 status and {"ok": True}
        assert run_response.status_code == 200
        run_data = run_response.json()
        assert run_data == {"ok": True}

        # Verify run_now was called with correct arguments
        mock_run_now.assert_called_once()
        call_args = mock_run_now.call_args
        assert call_args[0][0] == module_id  # First positional argument


def test_run_module_not_found(client):
    """Test POST /api/modules/{id}/run returns 404 for unknown module."""
    # POST /api/modules/nonexistent-module/run
    response = client.post("/api/modules/nonexistent-module/run")

    # Assert 404 status
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "not found" in data["detail"].lower() or "Module" in data["detail"]


def test_status_includes_scheduler_info(client):
    """Test /api/status returns scheduler job information."""
    response = client.get("/api/status")

    # Assert 200 status
    assert response.status_code == 200
    data = response.json()

    # Assert response has "scheduler" with "active_jobs" and "jobs"
    assert "scheduler" in data
    scheduler = data["scheduler"]
    assert isinstance(scheduler, dict)

    assert "active_jobs" in scheduler
    assert isinstance(scheduler["active_jobs"], int)
    # active_jobs should be >= 0
    assert scheduler["active_jobs"] >= 0

    assert "jobs" in scheduler
    assert isinstance(scheduler["jobs"], list)

    # Assert each job has "id" and "next_run"
    for job in scheduler["jobs"]:
        assert "id" in job, "Job missing 'id' field"
        assert "next_run" in job, "Job missing 'next_run' field"
        assert isinstance(job["id"], str)
        # next_run can be string or None
        assert job["next_run"] is None or isinstance(job["next_run"], str)


def test_debug_feed_flow_runs_requested_scope_modules(client, monkeypatch):
    calls: list[str] = []

    class FakeScheduler:
        async def run_now_with_count(self, module_id, registry):
            calls.append(module_id)
            return 2

        async def run_now(self, module_id, registry):
            calls.append(module_id)
            return True

    original_all_data = main_module._prefs.all_data
    monkeypatch.setattr(
        main_module._prefs,
        "all_data",
        lambda: {
            **original_all_data(),
            "modules": {
                **(original_all_data().get("modules", {}) or {}),
                "arxiv-tracker": {
                    "keyword_monitors": [
                        {"id": "kw-1", "label": "Robotics", "query": "robotics", "enabled": True},
                    ],
                },
                "semantic-scholar-tracker": {
                    "followup_monitors": [
                        {"id": "fu-1", "label": "RT-2", "query": "RT-2", "enabled": True},
                    ],
                },
            },
        },
    )

    original_scheduler = main_module._scheduler
    main_module._scheduler = FakeScheduler()
    try:
        response = client.post("/api/debug/feed-flow", json={"scope": "papers"})
    finally:
        main_module._scheduler = original_scheduler

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["scope"] == "papers"
    assert data["completed"] == 2
    assert data["total"] == 2
    assert calls == ["arxiv-tracker", "semantic-scholar-tracker"]
    assert [item["module_id"] for item in data["results"]] == ["arxiv-tracker", "semantic-scholar-tracker"]
    assert all(item["status"] == "completed" for item in data["results"])
    assert [item["card_count"] for item in data["results"]] == [2, 2]


def test_debug_feed_flow_runs_bilibili_scope_only(client):
    calls: list[str] = []

    class FakeScheduler:
        async def run_now_with_count(self, module_id, registry):
            calls.append(module_id)
            return 3

    original_scheduler = main_module._scheduler
    main_module._scheduler = FakeScheduler()
    try:
        response = client.post("/api/debug/feed-flow", json={"scope": "bilibili"})
    finally:
        main_module._scheduler = original_scheduler

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["scope"] == "bilibili"
    assert data["completed"] == 1
    assert data["total"] == 1
    assert calls == ["bilibili-tracker"]
    assert [item["module_id"] for item in data["results"]] == ["bilibili-tracker"]
    assert data["results"][0]["card_count"] == 3


def test_debug_feed_flow_runs_social_scope_in_parallel(client):
    calls: list[str] = []
    active_runs = 0
    max_active_runs = 0

    class FakeScheduler:
        async def run_now_with_count(self, module_id, registry):
            nonlocal active_runs, max_active_runs
            calls.append(module_id)
            active_runs += 1
            max_active_runs = max(max_active_runs, active_runs)
            await asyncio.sleep(0.02)
            active_runs -= 1
            return 1

    original_scheduler = main_module._scheduler
    main_module._scheduler = FakeScheduler()
    try:
        response = client.post("/api/debug/feed-flow", json={"scope": "social"})
    finally:
        main_module._scheduler = original_scheduler

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["scope"] == "social"
    assert data["completed"] == 2
    assert data["total"] == 2
    assert set(calls) == {"xiaohongshu-tracker", "bilibili-tracker"}
    assert [item["module_id"] for item in data["results"]] == ["xiaohongshu-tracker", "bilibili-tracker"]
    assert max_active_runs >= 2


def test_bilibili_async_task_can_be_cancelled(client, monkeypatch):
    import abo.routes.tools as tools_module

    async def fake_fetch_followed_ups(sessdata: str, max_count: int = 5000, progress_callback=None):
        if progress_callback:
            progress_callback({"stage": "模拟抓取中", "current_page": 1, "page_size": 50, "fetched_count": 10})
        await asyncio.sleep(10)
        return {"total": 0, "groups": [], "ups": []}

    monkeypatch.setattr(tools_module, "bilibili_fetch_followed_ups", fake_fetch_followed_ups)
    tools_module._BILIBILI_TASKS.clear()
    tools_module._BILIBILI_ASYNC_TASKS.clear()

    response = client.post("/api/tools/bilibili/followed-ups/crawl", json={"sessdata": "sess-demo", "max_count": 30})
    assert response.status_code == 200
    task_id = response.json()["task_id"]

    cancel_response = client.post(f"/api/tools/bilibili/tasks/{task_id}/cancel")
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelling"

    task_payload = None
    deadline = time.time() + 1.5
    while time.time() < deadline:
        task_payload = client.get(f"/api/tools/bilibili/followed-ups/crawl/{task_id}").json()
        if task_payload["status"] == "cancelled":
            break
        time.sleep(0.05)

    assert task_payload is not None
    assert task_payload["status"] == "cancelled"
    assert "前端已离开页面" in str(task_payload.get("error") or "")


def test_bilibili_followed_crawl_task_returns_result(client, monkeypatch):
    import abo.routes.tools as tools_module

    async def fake_fetch_followed(**kwargs):
        await asyncio.sleep(0.02)
        return {
            "total_found": 36,
            "fetch_stats": {
                "pages_scanned": 9,
                "matched_count_before_keep": 36,
                "kept_count": 20,
            },
            "dynamics": [
                {
                    "id": "bili-dyn-1",
                    "dynamic_id": "1",
                    "title": "测试动态",
                    "content": "测试内容",
                    "author": "UP主A",
                    "author_id": "1001",
                    "url": "https://t.bilibili.com/1",
                    "published_at": "2026-04-28T10:00:00",
                    "dynamic_type": "video",
                    "pic": "",
                    "images": [],
                    "bvid": "BV1xx411c7mD",
                    "tags": ["测试"],
                    "matched_keywords": ["测试"],
                    "matched_tags": [],
                    "monitor_label": "",
                    "monitor_subfolder": "",
                    "crawl_source": "",
                    "crawl_source_label": "",
                }
            ],
        }

    monkeypatch.setattr(tools_module, "bilibili_fetch_followed", fake_fetch_followed)
    tools_module._BILIBILI_TASKS.clear()
    tools_module._BILIBILI_ASYNC_TASKS.clear()

    response = client.post(
        "/api/tools/bilibili/followed/crawl",
        json={"sessdata": "sess-demo", "keywords": ["测试"], "limit": 20, "days_back": 7},
    )
    assert response.status_code == 200
    task_id = response.json()["task_id"]

    task_payload = None
    deadline = time.time() + 1.5
    while time.time() < deadline:
        task_payload = client.get(f"/api/tools/bilibili/followed/crawl/{task_id}").json()
        if task_payload["status"] == "completed":
            break
        time.sleep(0.05)

    assert task_payload is not None
    assert task_payload["status"] == "completed"
    assert task_payload["total_found"] == 36
    assert task_payload["pages_scanned"] == 9
    assert task_payload["matched_count_before_keep"] == 36
    assert task_payload["kept_count"] == 1
    assert task_payload["result"]["total_found"] == 36
    assert len(task_payload["result"]["dynamics"]) == 1
    assert task_payload["result"]["dynamics"][0]["author"] == "UP主A"


def test_bilibili_followed_crawl_task_can_be_cancelled(client, monkeypatch):
    import abo.routes.tools as tools_module

    async def fake_fetch_followed(**kwargs):
        await asyncio.sleep(10)
        return {"total_found": 0, "fetch_stats": {}, "dynamics": []}

    monkeypatch.setattr(tools_module, "bilibili_fetch_followed", fake_fetch_followed)
    tools_module._BILIBILI_TASKS.clear()
    tools_module._BILIBILI_ASYNC_TASKS.clear()

    response = client.post(
        "/api/tools/bilibili/followed/crawl",
        json={"sessdata": "sess-demo", "keywords": ["测试"], "limit": 20, "days_back": 7},
    )
    assert response.status_code == 200
    task_id = response.json()["task_id"]

    cancel_response = client.post(f"/api/tools/bilibili/tasks/{task_id}/cancel")
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelling"

    task_payload = None
    deadline = time.time() + 1.5
    while time.time() < deadline:
        task_payload = client.get(f"/api/tools/bilibili/followed/crawl/{task_id}").json()
        if task_payload["status"] == "cancelled":
            break
        time.sleep(0.05)

    assert task_payload is not None
    assert task_payload["status"] == "cancelled"
    assert "前端已离开页面" in str(task_payload.get("error") or "")


@pytest.mark.anyio
async def test_bilibili_async_task_auto_cancels_without_heartbeat(monkeypatch):
    import abo.routes.tools as tools_module

    cancelled = {"called": False}

    class FakeRunningTask:
        def done(self):
            return False

        def cancel(self):
            cancelled["called"] = True

    monkeypatch.setattr(tools_module, "_BILIBILI_TASK_WATCHDOG_INTERVAL_SECONDS", 0.05)
    tools_module._BILIBILI_TASKS.clear()
    tools_module._BILIBILI_ASYNC_TASKS.clear()

    task_id = tools_module._create_bilibili_task(
        "followed-ups",
        {
            "heartbeat_timeout_seconds": 1,
            "current_page": 1,
            "page_size": 50,
            "fetched_count": 10,
        },
    )
    tools_module._BILIBILI_ASYNC_TASKS[task_id] = FakeRunningTask()
    tools_module._BILIBILI_TASKS[task_id]["heartbeat_at"] = "2000-01-01T00:00:00+00:00"

    watcher = asyncio.create_task(tools_module._watch_bilibili_task_lease(task_id))
    await asyncio.sleep(0.12)
    await watcher

    task_payload = tools_module._BILIBILI_TASKS[task_id]
    assert cancelled["called"] is True
    assert task_payload["status"] == "cancelling"
    assert "未继续轮询" in str(task_payload.get("error") or "")


def test_debug_feed_flow_skips_semantic_scholar_without_enabled_monitors(client, monkeypatch):
    calls: list[str] = []

    class FakeScheduler:
        async def run_now_with_count(self, module_id, registry):
            calls.append(module_id)
            return 1

    original_all_data = main_module._prefs.all_data
    monkeypatch.setattr(
        main_module._prefs,
        "all_data",
        lambda: {
            **original_all_data(),
            "modules": {
                **(original_all_data().get("modules", {}) or {}),
                "semantic-scholar-tracker": {
                    "followup_monitors": [],
                },
            },
        },
    )

    original_scheduler = main_module._scheduler
    main_module._scheduler = FakeScheduler()
    try:
        response = client.post(
            "/api/debug/feed-flow",
            json={"module_ids": ["semantic-scholar-tracker"]},
        )
    finally:
        main_module._scheduler = original_scheduler

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert data["completed"] == 0
    assert data["total"] == 1


def test_get_xiaohongshu_module_config_exposes_following_scan_monitors_and_safe_creator_default(client, monkeypatch):
    original_all_data = main_module._prefs.all_data
    monkeypatch.setattr(
        main_module._prefs,
        "all_data",
        lambda: {
            **original_all_data(),
            "modules": {
                **(original_all_data().get("modules", {}) or {}),
                "xiaohongshu-tracker": {
                    "creator_push_enabled": True,
                    "creator_groups": ["research"],
                    "following_scan": {
                        "label": "关注流扫描",
                        "enabled": True,
                        "keywords": ["科研"],
                        "fetch_limit": 12,
                    },
                    "following_scan_monitors": [
                        {
                            "id": "xhs-fm-1",
                            "label": "科研",
                            "keywords": ["科研"],
                            "enabled": True,
                            "fetch_limit": 12,
                            "recent_days": 7,
                            "sort_by": "time",
                            "keyword_filter": False,
                            "include_comments": False,
                            "comments_limit": 20,
                            "comments_sort_by": "likes",
                        }
                    ],
                    "creator_monitors": [
                        {
                            "id": "xhs-cm-1",
                            "user_id": "user-1",
                            "label": "科研博主",
                            "author": "科研博主",
                            "enabled": True,
                            "per_user_limit": 3,
                            "recent_days": 14,
                            "sort_by": "time",
                            "include_comments": True,
                            "comments_limit": 15,
                            "comments_sort_by": "time",
                            "smart_groups": ["research"],
                            "smart_group_labels": ["科研学习"],
                        }
                    ],
                    "creator_profiles": {
                        "user-1": {
                            "author": "科研博主",
                            "author_id": "user-1",
                            "smart_groups": ["research"],
                        }
                    },
                    "user_ids": ["user-1"],
                },
            },
        },
    )

    response = client.get("/api/modules/xiaohongshu-tracker/config")

    assert response.status_code == 200
    data = response.json()
    assert data["creator_push_enabled"] is True
    assert data["creator_groups"] == ["research"]
    assert len(data["following_scan_monitors"]) == 1
    assert data["following_scan_monitors"][0]["keywords"] == ["科研"]
    assert data["following_scan_monitors"][0]["keyword_filter"] is False
    assert len(data["creator_monitors"]) == 1
    assert data["creator_monitors"][0]["recent_days"] == 14
    assert data["creator_monitors"][0]["comments_sort_by"] == "time"
    assert data["creator_monitors"][0]["smart_group_labels"] == ["科研学习"]


def test_get_xiaohongshu_module_config_defaults_creator_push_and_following_scan_to_disabled(client, monkeypatch):
    original_all_data = main_module._prefs.all_data
    monkeypatch.setattr(
        main_module._prefs,
        "all_data",
        lambda: {
            **original_all_data(),
            "modules": {
                **(original_all_data().get("modules", {}) or {}),
                "xiaohongshu-tracker": {},
            },
        },
    )

    response = client.get("/api/modules/xiaohongshu-tracker/config")

    assert response.status_code == 200
    data = response.json()
    assert data["creator_push_enabled"] is False
    assert data["creator_groups"] == []
    assert data["following_scan"]["enabled"] is False
    assert data["following_scan_monitors"] == []


def test_get_xiaohongshu_module_config_marks_global_cookie_auth_ready(client, monkeypatch):
    original_all_data = main_module._prefs.all_data
    monkeypatch.setattr(
        main_module._prefs,
        "all_data",
        lambda: {
            **original_all_data(),
            "modules": {
                **(original_all_data().get("modules", {}) or {}),
                "xiaohongshu-tracker": {},
            },
        },
    )
    monkeypatch.setattr(
        main_module,
        "load_config",
        lambda: {"xiaohongshu_cookie": "web_session=global-cookie"},
    )

    response = client.get("/api/modules/xiaohongshu-tracker/config")

    assert response.status_code == 200
    data = response.json()
    assert data["auth_ready"] is True
    assert data["auth_source"] == "global"


def test_get_bilibili_module_config_exposes_daily_monitors_group_monitors_and_fixed_ups(client, monkeypatch):
    original_all_data = main_module._prefs.all_data
    monkeypatch.setattr(
        main_module._prefs,
        "all_data",
        lambda: {
            **original_all_data(),
            "modules": {
                **(original_all_data().get("modules", {}) or {}),
                "bilibili-tracker": {
                    "up_uids": ["1567748478", "208259"],
                    "follow_feed_types": [8, 64],
                    "fetch_follow_limit": 12,
                    "fixed_up_monitor_limit": 33,
                    "followed_up_filter_mode": "smart_only",
                    "followed_up_original_groups": [3, 9],
                    "daily_dynamic_monitors": [
                        {
                            "id": "bili-dm-1",
                            "label": "科研监控",
                            "keywords": ["科研"],
                            "tag_filters": ["agent"],
                            "enabled": True,
                            "days_back": 14,
                            "limit": 18,
                            "page_limit": 6,
                        }
                    ],
                    "followed_up_group_monitors": [
                        {
                            "id": "bili-gm-1",
                            "group_value": "ai-tech",
                            "label": "AI科技",
                            "enabled": True,
                            "days_back": 3,
                            "limit": 30,
                            "page_limit": 8,
                        }
                    ],
                },
            },
        },
    )

    response = client.get("/api/modules/bilibili-tracker/config")

    assert response.status_code == 200
    data = response.json()
    assert data["up_uids"] == ["1567748478", "208259"]
    assert len(data["daily_dynamic_monitors"]) == 1
    assert data["daily_dynamic_monitors"][0]["keywords"] == ["科研"]
    assert data["daily_dynamic_monitors"][0]["tag_filters"] == ["agent"]
    assert data["daily_dynamic_monitors"][0]["limit"] == 18
    assert data["daily_dynamic_monitors"][0]["page_limit"] == 6
    assert len(data["followed_up_group_monitors"]) == 1
    assert data["followed_up_group_monitors"][0]["group_value"] == "ai-tech"
    assert data["followed_up_group_monitors"][0]["days_back"] == 3
    assert data["followed_up_group_monitors"][0]["limit"] == 30
    assert data["followed_up_group_monitors"][0]["page_limit"] == 8
    assert data["followed_up_groups"] == ["ai-tech"]
    assert data["follow_feed_types"] == [8, 64]
    assert data["fetch_follow_limit"] == 12
    assert data["fixed_up_monitor_limit"] == 33
    assert data["followed_up_filter_mode"] == "smart_only"
    assert data["followed_up_original_groups"] == [3, 9]


def test_get_bilibili_module_config_marks_global_cookie_auth_ready(client, monkeypatch):
    original_all_data = main_module._prefs.all_data
    monkeypatch.setattr(
        main_module._prefs,
        "all_data",
        lambda: {
            **original_all_data(),
            "modules": {
                **(original_all_data().get("modules", {}) or {}),
                "bilibili-tracker": {},
            },
        },
    )
    monkeypatch.setattr(
        main_module,
        "load_config",
        lambda: {"bilibili_cookie": '[{"name":"SESSDATA","value":"global-sess"}]'},
    )

    response = client.get("/api/modules/bilibili-tracker/config")

    assert response.status_code == 200
    data = response.json()
    assert data["auth_ready"] is True
    assert data["auth_source"] == "global"


def test_get_crawl_records_returns_persisted_metadata(client, tmp_path, monkeypatch):
    store = CardStore(tmp_path / "cards.db")
    store.save(
        Card(
            id="arxiv-monitor:2501.00001",
            module_id="arxiv-tracker",
            title="Persistent Crawl Record",
            summary="summary",
            score=0.92,
            tags=["robotics"],
            source_url="https://arxiv.org/abs/2501.00001",
            obsidian_path="Literature/Persistent.md",
            metadata={
                "arxiv_id": "2501.00001",
                "authors": ["Alice Author"],
                "published": "2026-04-25",
                "crawl_source": "keyword",
            },
            created_at=1714000000.0,
        )
    )

    monkeypatch.setattr(main_module, "_card_store", store)

    response = client.get("/api/crawl-records?limit=5")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["records"]) == 1
    assert data["records"][0]["module_id"] == "arxiv-tracker"
    assert data["records"][0]["content_id"] == "2501.00001"
    assert data["records"][0]["author"] == "Alice Author"
    assert data["records"][0]["crawl_source"] == "keyword"


def test_batch_feedback_skips_visible_cards(client, tmp_path, monkeypatch):
    store = CardStore(tmp_path / "cards.db")
    store.save(
        Card(
            id="card-1",
            module_id="test-module",
            title="First card",
            summary="summary",
            score=0.8,
            tags=["robotics"],
            source_url="https://example.com/1",
            obsidian_path="Feed/First.md",
            created_at=1714000001.0,
        )
    )
    store.save(
        Card(
            id="card-2",
            module_id="test-module",
            title="Second card",
            summary="summary",
            score=0.7,
            tags=["robotics"],
            source_url="https://example.com/2",
            obsidian_path="Feed/Second.md",
            created_at=1714000002.0,
        )
    )

    monkeypatch.setattr(main_module, "_card_store", store)
    monkeypatch.setattr(main_module._prefs, "record_feedback", lambda tags, action: None)
    monkeypatch.setattr(main_module._prefs, "update_from_feedback", lambda tags, action, module_id="": None)
    monkeypatch.setattr(main_module._registry, "get", lambda module_id: None)

    recorded_activities: list[dict[str, str]] = []

    class FakeActivityTracker:
        def record_activity(self, activity_type, card_id, card_title, module_id, metadata):
            recorded_activities.append(
                {
                    "activity_type": activity_type.value,
                    "card_id": card_id,
                    "card_title": card_title,
                    "module_id": module_id,
                    "action": str(metadata.get("action", "")),
                }
            )

    monkeypatch.setattr(main_module, "_activity_tracker", FakeActivityTracker())

    response = client.post(
        "/api/cards/feedback/batch",
        json={
            "card_ids": ["card-1", "card-1", "card-2", "missing-card"],
            "action": "skip",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["updated"] == 2
    assert data["card_ids"] == ["card-1", "card-2"]
    assert data["missing"] == ["missing-card"]
    assert store.count_feedback("test-module", "skip") == 2
    assert store.list(unread_only=True, limit=10) == []
    assert recorded_activities == [
        {
            "activity_type": "card_view",
            "card_id": "card-1",
            "card_title": "First card",
            "module_id": "test-module",
            "action": "skip",
        },
        {
            "activity_type": "card_view",
            "card_id": "card-2",
            "card_title": "Second card",
            "module_id": "test-module",
            "action": "skip",
        },
    ]


def test_single_feedback_returns_affected_duplicate_card_ids(client, tmp_path, monkeypatch):
    store = CardStore(tmp_path / "cards.db")
    store.save(
        Card(
            id="xhs-keyword:note-1",
            module_id="xiaohongshu-tracker",
            title="科研工作流",
            summary="关键词版本",
            score=0.8,
            tags=["科研"],
            source_url="https://www.xiaohongshu.com/explore/note-1",
            obsidian_path="xhs/keyword/note-1.md",
            metadata={"note_id": "note-1"},
            created_at=1714000001.0,
        )
    )
    store.save(
        Card(
            id="xhs-following:note-1",
            module_id="xiaohongshu-tracker",
            title="科研工作流",
            summary="关注流版本",
            score=0.79,
            tags=["科研"],
            source_url="https://www.xiaohongshu.com/explore/note-1",
            obsidian_path="xhs/following/note-1.md",
            metadata={"note_id": "note-1"},
            created_at=1714000002.0,
        )
    )

    monkeypatch.setattr(main_module, "_card_store", store)
    monkeypatch.setattr(main_module._prefs, "record_feedback", lambda tags, action: None)
    monkeypatch.setattr(main_module._prefs, "update_from_feedback", lambda tags, action, module_id="": None)
    monkeypatch.setattr(main_module._registry, "get", lambda module_id: None)
    monkeypatch.setattr(main_module, "_activity_tracker", None)

    response = client.post(
        "/api/cards/xhs-keyword:note-1/feedback",
        json={"action": "skip"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["affected_card_ids"] == ["xhs-keyword:note-1", "xhs-following:note-1"]
    assert store.count_feedback("xiaohongshu-tracker", "skip") == 1
    assert store.list(unread_only=True, limit=10) == []


def test_paper_monitor_config_persists_four_monitors_and_defaults_non_empty(client, monkeypatch):
    class FakePrefs:
        def __init__(self):
            self.data = {"modules": {}}

        def all_data(self):
            return self.data

        def update(self, data):
            self.data = data

    fake_prefs = FakePrefs()
    monkeypatch.setattr(main_module, "_prefs", fake_prefs)

    arxiv_payload = {
        "keyword_monitors": [
            {
                "id": "a1",
                "label": "Vision-Language",
                "query": "vision,language",
                "categories": ["cs.CV"],
                "enabled": True,
            },
            {
                "id": "a2",
                "label": "Robotics",
                "query": "robot,manipulation",
                "categories": ["cs.RO"],
                "enabled": True,
            },
        ],
        "max_results": "",
        "days_back": "",
    }
    followup_payload = {
        "followup_monitors": [
            {
                "id": "f1",
                "label": "RT-2",
                "query": "RT-2",
                "enabled": True,
            },
            {
                "id": "f2",
                "label": "OpenVLA",
                "query": "OpenVLA",
                "enabled": True,
            },
        ],
        "max_results": "",
        "days_back": "",
        "sort_by": "recency",
    }

    arxiv_response = client.post("/api/modules/arxiv-tracker/config", json=arxiv_payload)
    semantic_response = client.post("/api/modules/semantic-scholar-tracker/config", json=followup_payload)

    assert arxiv_response.status_code == 200
    assert semantic_response.status_code == 200

    arxiv_config = client.get("/api/modules/arxiv-tracker/config").json()
    semantic_config = client.get("/api/modules/semantic-scholar-tracker/config").json()

    assert arxiv_config["max_results"] == 20
    assert arxiv_config["days_back"] == 30
    assert [monitor["label"] for monitor in arxiv_config["keyword_monitors"]] == ["Vision-Language", "Robotics"]
    assert [monitor["categories"] for monitor in arxiv_config["keyword_monitors"]] == [["cs.CV"], ["cs.RO"]]

    assert semantic_config["max_results"] == 20
    assert semantic_config["days_back"] == 365
    assert [monitor["label"] for monitor in semantic_config["followup_monitors"]] == ["RT-2", "OpenVLA"]
    assert semantic_config["sort_by"] == "recency"
