"""Assistant workspace aggregation routes."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .store import assistant_session_store
from ..activity import ActivityTracker
from ..chat import conversation_runtime_manager
from ..chat.runtime_manager import BACKEND_SESSION_ID_KEY
from ..config import get_ai_provider, get_literature_path, get_vault_path, is_demo_mode
from ..demo.data import get_demo_cards, get_demo_overview, get_demo_today, get_demo_wiki_stats
from ..preferences.engine import PreferenceEngine
from ..store.cards import CardStore
from ..store.conversations import Conversation, conversation_store
from ..wiki.store import WikiStore

router = APIRouter(prefix="/api/assistant")

_card_store = CardStore()
_prefs = PreferenceEngine()


class DeleteAssistantSessionRequest(BaseModel):
    rawConversationId: str | None = None
    rawSessionId: str | None = None


def _provider_label(provider: str) -> str:
    return "Codex" if provider == "codex" else "Claude"


def _reading_streak(activity_tracker: ActivityTracker) -> int:
    streak = 0
    today = datetime.now().date()
    for index in range(365):
        current_date = today - timedelta(days=index)
        timeline = activity_tracker.get_timeline(current_date.strftime("%Y-%m-%d"))
        if timeline.activities:
            streak += 1
            continue
        if index > 0:
            break
    return streak


def _cards_this_week(card_store: CardStore) -> int:
    today = datetime.now().date()
    monday = today - timedelta(days=today.weekday())
    monday_ts = datetime.combine(monday, datetime.min.time()).timestamp()
    with card_store._conn() as conn:  # noqa: SLF001 - repo already uses store internals for derived queries
        row = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE created_at >= ?",
            (monday_ts,),
        ).fetchone()
    return int(row[0]) if row else 0


def _total_cards(card_store: CardStore) -> int:
    with card_store._conn() as conn:  # noqa: SLF001
        row = conn.execute("SELECT COUNT(*) FROM cards").fetchone()
    return int(row[0]) if row else 0


def _wiki_snapshot(vault_path, wiki_type: str) -> dict[str, Any]:
    if not vault_path:
        return {
            "ready": False,
            "total": 0,
            "byCategory": {},
        }

    WikiStore.ensure_structure(vault_path, wiki_type)
    stats = WikiStore.get_stats(vault_path, wiki_type)
    return {
        "ready": True,
        "total": stats.get("total", 0),
        "byCategory": stats.get("by_category", {}),
    }


def _build_spotlight_cards(cards: list[Any]) -> list[dict[str, Any]]:
    spotlight = []
    for card in cards:
        spotlight.append(
            {
                "id": card.id,
                "title": card.title,
                "summary": card.summary,
                "moduleId": card.module_id,
                "score": card.score,
                "tags": card.tags,
                "sourceUrl": card.source_url,
                "createdAt": card.created_at,
            }
        )
    return spotlight


def _summarize_categories(snapshot: dict[str, Any]) -> str:
    categories = snapshot.get("byCategory", {})
    if not categories:
        return "暂无分类沉淀"
    ranked = sorted(categories.items(), key=lambda item: item[1], reverse=True)[:2]
    return "，".join(f"{name} {count}" for name, count in ranked)


def _assistant_raw_session_id(conv: Conversation) -> str:
    metadata = conversation_store.parse_metadata(conv.metadata)
    return str(metadata.get(BACKEND_SESSION_ID_KEY) or "").strip() or conv.session_id


def _parse_message_metadata(raw_metadata: str | None) -> dict[str, Any] | None:
    if not raw_metadata:
        return None
    try:
        parsed = json.loads(raw_metadata)
    except (json.JSONDecodeError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _sync_assistant_session_from_raw(conv: Conversation, *, sync_messages: bool = False) -> None:
    if conv.origin != "assistant":
        return
    if assistant_session_store.is_deleted_raw_conversation(conv.id, _assistant_raw_session_id(conv)):
        return

    history = conversation_store.get_messages(conv.id, limit=500) if sync_messages else []
    last_message_preview = ""
    if history:
        for history_message in reversed(history):
            if history_message.content.strip():
                compact = history_message.content.strip().replace("\n", " ")
                last_message_preview = f"{compact[:160]}..." if len(compact) > 160 else compact
                break

    assistant_session_store.upsert_session(
        raw_conversation_id=conv.id,
        cli_type=conv.cli_type,
        raw_session_id=_assistant_raw_session_id(conv),
        title=conv.title,
        last_message_preview=last_message_preview if sync_messages else None,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        metadata={
            "origin": conv.origin,
            "workspace": conv.workspace,
            "raw_conversation_id": conv.id,
            "raw_session_id": conv.session_id,
        },
    )

    if not sync_messages:
        return

    for history_message in history:
        assistant_session_store.add_message_by_raw_conversation(
            conv.id,
            role=history_message.role,
            content=history_message.content,
            raw_message_id=history_message.id,
            content_type=history_message.content_type,
            metadata=_parse_message_metadata(history_message.metadata),
            status=history_message.status,
            created_at=history_message.created_at,
        )


def _hydrate_assistant_sessions_from_raw(limit: int = 200) -> None:
    current_count = assistant_session_store.count_sessions()
    sync_limit = 5000 if current_count == 0 else max(limit, 200)
    for conv in conversation_store.list_conversations(limit=sync_limit):
        if conv.origin != "assistant":
            continue
        if assistant_session_store.is_deleted_raw_conversation(conv.id, _assistant_raw_session_id(conv)):
            assistant_session_store.delete_session_by_raw_conversation(conv.id)
            continue
        existing = assistant_session_store.get_session_by_raw_conversation(conv.id)
        should_sync_messages = (
            existing is None
            or existing.updated_at < conv.updated_at
            or not existing.last_message_preview
        )
        if (
            existing is None
            or existing.updated_at < conv.updated_at
            or existing.title != conv.title
            or existing.raw_session_id != _assistant_raw_session_id(conv)
            or not existing.last_message_preview
        ):
            _sync_assistant_session_from_raw(conv, sync_messages=should_sync_messages)


def _assistant_recent_sessions(limit: int = 6) -> list[dict[str, Any]]:
    _hydrate_assistant_sessions_from_raw(limit=limit)
    sessions = assistant_session_store.list_sessions(limit=limit)
    return [
        {
            "id": session.id,
            "title": session.title,
            "cliType": session.cli_type,
            "updatedAt": session.updated_at,
            "rawConversationId": session.raw_conversation_id,
            "rawSessionId": session.raw_session_id,
            "lastMessagePreview": session.last_message_preview,
        }
        for session in sessions
    ]


def build_assistant_overview_payload() -> dict[str, Any]:
    provider = get_ai_provider()
    recent_sessions = _assistant_recent_sessions(limit=12)
    session_count = assistant_session_store.count_sessions()

    if is_demo_mode():
        demo_cards = get_demo_cards()[:6]
        overview = get_demo_overview()
        today = get_demo_today()
        return {
            "system": {
                "provider": provider,
                "providerLabel": _provider_label(provider),
                "vaultReady": True,
                "literatureReady": True,
            },
            "inbox": {
                "totalUnread": 52,
                "unreadByModule": overview.get("byModule", {}),
                "spotlight": [
                    {
                        "id": card["id"],
                        "title": card["title"],
                        "summary": card["summary"],
                        "moduleId": card["module_id"],
                        "score": card["score"],
                        "tags": card.get("tags", []),
                        "sourceUrl": card.get("source_url", ""),
                        "createdAt": card["created_at"],
                    }
                    for card in demo_cards
                ],
            },
            "wiki": {
                "intel": {
                    "ready": True,
                    "total": get_demo_wiki_stats("intel").get("total", 0),
                    "byCategory": get_demo_wiki_stats("intel").get("by_category", {}),
                },
                "lit": {
                    "ready": True,
                    "total": get_demo_wiki_stats("lit").get("total", 0),
                    "byCategory": get_demo_wiki_stats("lit").get("by_category", {}),
                },
            },
            "insights": {
                "totalCards": overview.get("totalCards", 0),
                "thisWeek": overview.get("thisWeek", 0),
                "readingStreak": overview.get("readingStreak", 0),
                "topKeyword": overview.get("topTags", [[None]])[0][0],
                "todaySummary": today.get("summary"),
                "activityCount": today.get("activityCounts", {}).get("total", 0),
                "chatCount": today.get("activityCounts", {}).get("chats", 0),
                "moduleRunCount": today.get("activityCounts", {}).get("module_runs", 0),
            },
            "conversations": {
                "activeCount": session_count,
                "recent": recent_sessions[:6],
            },
        }

    vault_path = get_vault_path()
    literature_path = get_literature_path()
    activity_tracker = ActivityTracker()
    unread_by_module = _card_store.unread_counts()
    spotlight_cards = _card_store.list(unread_only=True, limit=6)
    top_keywords = _prefs.get_top_keywords(1)
    today_timeline = activity_tracker.get_timeline(datetime.now().strftime("%Y-%m-%d"))
    chat_count = sum(1 for item in today_timeline.activities if item.type.value in {"chat_start", "chat_message"})
    module_run_count = sum(1 for item in today_timeline.activities if item.type.value == "module_run")

    return {
        "system": {
            "provider": provider,
            "providerLabel": _provider_label(provider),
            "vaultReady": bool(vault_path),
            "literatureReady": bool(literature_path),
        },
        "inbox": {
            "totalUnread": sum(unread_by_module.values()),
            "unreadByModule": unread_by_module,
            "spotlight": _build_spotlight_cards(spotlight_cards),
        },
        "wiki": {
            "intel": _wiki_snapshot(vault_path, "intel"),
            "lit": _wiki_snapshot(vault_path, "lit"),
        },
        "insights": {
            "totalCards": _total_cards(_card_store),
            "thisWeek": _cards_this_week(_card_store),
            "readingStreak": _reading_streak(activity_tracker),
            "topKeyword": top_keywords[0][0] if top_keywords else None,
            "todaySummary": today_timeline.summary,
            "activityCount": len(today_timeline.activities),
            "chatCount": chat_count,
            "moduleRunCount": module_run_count,
        },
        "conversations": {
            "activeCount": session_count,
            "recent": recent_sessions[:6],
        },
    }


def build_assistant_chat_context() -> str:
    overview = build_assistant_overview_payload()
    spotlight = overview["inbox"]["spotlight"][:4]
    recent_conversations = overview["conversations"]["recent"][:4]
    intel_snapshot = overview["wiki"]["intel"]
    lit_snapshot = overview["wiki"]["lit"]
    insights = overview["insights"]

    lines = [
        "以下是助手工作台的当前上下文，请把它当成背景状态而不是逐条复述的正文：",
        f"- AI 提供方：{overview['system']['providerLabel']}",
        f"- 今日未读情报：{overview['inbox']['totalUnread']} 条",
        f"- Internet Wiki：{'已连接' if intel_snapshot['ready'] else '未连接'}，共 {intel_snapshot['total']} 页，重点分类：{_summarize_categories(intel_snapshot)}",
        f"- Literature Wiki：{'已连接' if lit_snapshot['ready'] else '未连接'}，共 {lit_snapshot['total']} 页，重点分类：{_summarize_categories(lit_snapshot)}",
        f"- 数据洞察：累计卡片 {insights['totalCards']}，本周新增 {insights['thisWeek']}，连续阅读 {insights['readingStreak']} 天",
    ]

    if insights.get("topKeyword"):
        lines.append(f"- 当前偏好焦点：{insights['topKeyword']}")
    if insights.get("todaySummary"):
        lines.append(f"- 今日摘要：{insights['todaySummary']}")

    if spotlight:
        lines.append("- 今日高优先级情报：")
        for item in spotlight:
            lines.append(f"  - {item['title']}｜来源 {item['moduleId']}｜{item['summary'][:120]}")

    if recent_conversations:
        lines.append("- 最近活动会话：")
        for item in recent_conversations:
            lines.append(f"  - {item['title']}（{item['cliType']}）")

    lines.append("回答时优先使用这些状态帮助用户推进任务，除非用户明确要求，不要把整段上下文原样复述给用户。")
    return "\n".join(lines)


@router.get("/overview")
async def get_assistant_overview():
    return build_assistant_overview_payload()


@router.get("/sessions")
async def list_assistant_sessions(limit: int = 20):
    return {
        "items": _assistant_recent_sessions(limit=limit),
        "count": assistant_session_store.count_sessions(),
    }


@router.get("/sessions/{session_id}/messages")
async def get_assistant_session_messages(session_id: str, limit: int = 100):
    session = assistant_session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Assistant session not found")

    messages = assistant_session_store.list_messages(session_id, limit=limit)
    if not messages:
        raw_conversation = conversation_store.get_conversation(session.raw_conversation_id)
        if raw_conversation and raw_conversation.origin == "assistant":
            _sync_assistant_session_from_raw(raw_conversation, sync_messages=True)
            messages = assistant_session_store.list_messages(session_id, limit=limit)

    return [
        {
            "id": message.id,
            "assistantSessionId": message.assistant_session_id,
            "rawConversationId": message.raw_conversation_id,
            "role": message.role,
            "content": message.content,
            "contentType": message.content_type,
            "status": message.status,
            "createdAt": message.created_at,
            "metadata": message.metadata,
        }
        for message in messages
    ]


@router.delete("/sessions/{session_id}")
async def delete_assistant_session(session_id: str, req: DeleteAssistantSessionRequest | None = None):
    session = assistant_session_store.get_session(session_id)
    if not session:
        raw_conversation_id = (req.rawConversationId if req else "") or ""
        raw_session_id = (req.rawSessionId if req else "") or ""
        if raw_conversation_id or raw_session_id:
            assistant_session_store.record_deleted_session(
                raw_conversation_id=raw_conversation_id,
                raw_session_id=raw_session_id,
                assistant_session_id=session_id,
            )
            if raw_conversation_id:
                await conversation_runtime_manager.kill(raw_conversation_id)
                conversation_store.delete_conversation(raw_conversation_id)
            if raw_session_id:
                conversation_store.delete_conversation_by_session(raw_session_id)
            if raw_conversation_id:
                assistant_session_store.delete_session_by_raw_conversation(raw_conversation_id)
        return {"success": True}

    assistant_session_store.record_deleted_session(
        raw_conversation_id=session.raw_conversation_id,
        raw_session_id=session.raw_session_id,
        assistant_session_id=session.id,
    )
    await conversation_runtime_manager.kill(session.raw_conversation_id)
    conversation_store.delete_conversation(session.raw_conversation_id)
    conversation_store.delete_conversation_by_session(session.raw_session_id)
    assistant_session_store.delete_session(session_id)
    return {"success": True}
