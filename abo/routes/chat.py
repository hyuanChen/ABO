"""聊天 API 路由 - 严格遵循 AionUi 协议"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Any, Optional, List
import asyncio
import contextlib
import json
import logging
import time
import uuid

from ..activity import ActivityTracker, ActivityType
from ..assistant.routes import build_assistant_chat_context
from ..assistant.store import assistant_session_store
from ..chat import RuntimeBusyError, conversation_runtime_manager
from ..chat.runtime_manager import BACKEND_SESSION_ID_KEY
from ..cli.detector import detector
from ..cli.runner import StreamEvent
from ..config import get_ai_provider
from ..runtime.bundled_idle import (
    bundled_backend_websocket_connected,
    bundled_backend_websocket_disconnected,
    mark_bundled_backend_activity,
)
from ..store.conversations import Conversation, Message, conversation_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat")
chat_router = router  # 导出别名


# === 请求/响应模型 ===

class CreateConversationRequest(BaseModel):
    cli_type: Optional[str] = None
    title: Optional[str] = None
    workspace: Optional[str] = None
    origin: Optional[str] = None


class ConversationResponse(BaseModel):
    id: str
    cli_type: str
    session_id: str
    title: str
    workspace: str
    status: str
    created_at: int
    updated_at: int


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    msg_id: Optional[str] = None
    role: str
    content: str
    content_type: str
    status: str
    created_at: int
    metadata: Optional[dict] = None


class SendMessageRequest(BaseModel):
    message: str
    conversation_id: str
    context_scope: Optional[str] = None


class UpdateTitleRequest(BaseModel):
    title: Optional[str] = None


class RuntimeStateResponse(BaseModel):
    conversation_id: str
    has_runtime: bool
    busy: bool
    last_active_at: Optional[int] = None
    resume_session_id: Optional[str] = None
    cli_type: Optional[str] = None


# === 连接管理器 ===

class ConnectionInfo:
    """连接信息"""
    def __init__(self):
        self.is_alive = True
        self.last_pong = 0


class ConnectionManager:
    """WebSocket 连接管理器 - 严格遵循 AionUi 协议"""

    def __init__(self):
        self.active_connections: dict = {}  # session_id -> WebSocket
        self.message_tasks: dict = {}  # session_id -> Task
        self.connection_info: dict = {}  # session_id -> ConnectionInfo
        self._heartbeat_tasks: dict = {}  # session_id -> Task

    async def connect(self, websocket: WebSocket, session_id: str, cli_type: str = None, raw_session_id: str = None):
        """建立连接"""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        self.connection_info[session_id] = ConnectionInfo()
        # Send connected message immediately
        await websocket.send_json({"type": "connected"})
        logger.info(f"WebSocket connected: {session_id}")

    def disconnect(self, session_id: str):
        """断开连接"""
        self.active_connections.pop(session_id, None)
        self.connection_info.pop(session_id, None)
        if session_id in self._heartbeat_tasks:
            task = self._heartbeat_tasks.pop(session_id, None)
            if task:
                task.cancel()
        logger.info(f"WebSocket disconnected: {session_id}")

    async def send_json(self, session_id: str, data: dict):
        """发送 JSON 消息"""
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(data)
            except Exception as e:
                logger.error(f"Failed to send to {session_id}: {e}")

    def handle_pong(self, session_id: str, timestamp: float):
        """处理 pong 响应"""
        if session_id in self.connection_info:
            self.connection_info[session_id].last_pong = timestamp
            self.connection_info[session_id].is_alive = True

    def track_message_task(self, session_id: str, task: asyncio.Task):
        """追踪当前连接上的后台消息任务"""
        self.message_tasks[session_id] = task

        def _cleanup(_done: asyncio.Task):
            if self.message_tasks.get(session_id) is task:
                self.message_tasks.pop(session_id, None)

        task.add_done_callback(_cleanup)

    def get_message_task(self, session_id: str) -> Optional[asyncio.Task]:
        task = self.message_tasks.get(session_id)
        if task and task.done():
            self.message_tasks.pop(session_id, None)
            return None
        return task

    def cancel_message_task(self, session_id: str) -> bool:
        task = self.get_message_task(session_id)
        if not task:
            return False
        task.cancel()
        return True


manager = ConnectionManager()


def _truncate_prompt_chunk(content: str, limit: int = 1600) -> str:
    compact = content.strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit]}\n...[truncated]"


def _build_history_context(history_messages: List[Message], limit: int = 8) -> str:
    relevant = [
        msg for msg in history_messages
        if msg.role in {"user", "assistant"} and msg.content_type == "text" and msg.content.strip()
    ][-limit:]
    if not relevant:
        return ""

    lines = ["以下是这个会话最近的上下文，请延续它继续回答："]
    for message in relevant:
        role_label = "用户" if message.role == "user" else "助手"
        lines.append(f"{role_label}: {_truncate_prompt_chunk(message.content)}")
    return "\n\n".join(lines)


def _should_include_assistant_context(conv: Conversation, context_scope: Optional[str]) -> bool:
    return (context_scope or "").strip() == "assistant" or conv.origin == "assistant"


def _build_runtime_prompt(
    conv: Conversation,
    message: str,
    history_messages: List[Message],
    context_scope: Optional[str] = None,
) -> str:
    sections: list[str] = []

    if _should_include_assistant_context(conv, context_scope):
        assistant_context = build_assistant_chat_context()
        if assistant_context:
            sections.append(assistant_context)

    history_context = _build_history_context(history_messages)
    if history_context:
        sections.append(history_context)

    if not sections:
        return message

    sections.append(f"当前用户请求：\n{message}")
    return "\n\n---\n\n".join(sections)


def _record_chat_activity(
    activity_type: ActivityType,
    *,
    topic: str = "",
    context_scope: str = "",
    conversation_id: str = "",
    cli_type: str = "",
    message_count: int = 1,
) -> None:
    try:
        tracker = ActivityTracker()
        tracker.record_activity(
            activity_type=activity_type,
            chat_topic=(topic or "")[:120] or None,
            metadata={
                "context": context_scope,
                "conversation_id": conversation_id,
                "cli_type": cli_type,
                "message_count": message_count,
            },
        )
    except Exception:
        logger.exception("Failed to record chat activity")


def _conversation_response(conv: Conversation) -> ConversationResponse:
    return ConversationResponse(
        id=conv.id,
        cli_type=conv.cli_type,
        session_id=conv.session_id,
        title=conv.title,
        workspace=conv.workspace,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


def _is_assistant_conversation(conv: Optional[Conversation]) -> bool:
    return bool(conv and conv.origin == "assistant")


def _assistant_raw_session_id(conv: Conversation) -> str:
    metadata = conversation_store.parse_metadata(conv.metadata)
    session_id = str(metadata.get(BACKEND_SESSION_ID_KEY) or "").strip()
    return session_id or conv.session_id


def _parse_message_metadata(message: Message) -> Optional[dict]:
    if not message.metadata:
        return None
    try:
        parsed = json.loads(message.metadata)
    except (json.JSONDecodeError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _event_metadata(event: StreamEvent, conv: Conversation, started_at: float) -> dict[str, Any]:
    metadata = dict(event.metadata or {})
    elapsed_seconds = int(time.monotonic() - started_at)
    metadata.setdefault("conversationId", conv.id)
    metadata.setdefault("conversation_id", conv.id)
    metadata.setdefault("cliType", conv.cli_type)
    metadata.setdefault("cli_type", conv.cli_type)
    metadata["elapsedSeconds"] = elapsed_seconds
    metadata["elapsed_seconds"] = elapsed_seconds
    return metadata


def _tool_merge_key(event: StreamEvent) -> str:
    metadata = event.metadata or {}
    for key in ("toolCallId", "tool_call_id", "callId", "call_id", "id"):
        value = metadata.get(key)
        if value:
            return str(value)
    command = metadata.get("command") or event.data
    if command:
        return str(command)[:120]
    return event.msg_id


def _tool_content(event: StreamEvent) -> str:
    metadata = event.metadata or {}
    command = str(metadata.get("command") or "").strip()
    output = str(event.data or "").strip()
    if command and output and output != command:
        return f"{command}\n\n{output}"
    return output or command or "工具调用"


def _sync_assistant_session(conv: Optional[Conversation], *, sync_messages: bool = False) -> None:
    if not _is_assistant_conversation(conv):
        return
    if assistant_session_store.is_deleted_raw_conversation(conv.id, _assistant_raw_session_id(conv)):
        return

    latest = conversation_store.get_conversation(conv.id) or conv
    history = conversation_store.get_messages(latest.id, limit=500) if sync_messages else []
    last_message_preview = ""
    if history:
        for history_message in reversed(history):
            if history_message.content.strip():
                compact = history_message.content.strip().replace("\n", " ")
                last_message_preview = f"{compact[:160]}..." if len(compact) > 160 else compact
                break

    assistant_session_store.upsert_session(
        raw_conversation_id=latest.id,
        cli_type=latest.cli_type,
        raw_session_id=_assistant_raw_session_id(latest),
        title=latest.title,
        last_message_preview=last_message_preview if sync_messages else None,
        created_at=latest.created_at,
        updated_at=latest.updated_at,
        metadata={
            "origin": latest.origin,
            "workspace": latest.workspace,
            "raw_conversation_id": latest.id,
            "raw_session_id": latest.session_id,
        },
    )

    if not sync_messages:
        return

    for history_message in history:
        assistant_session_store.add_message_by_raw_conversation(
            latest.id,
            role=history_message.role,
            content=history_message.content,
            raw_message_id=history_message.id,
            content_type=history_message.content_type,
            metadata=_parse_message_metadata(history_message),
            status=history_message.status,
            created_at=history_message.created_at,
        )


async def _run_conversation_turn(
    conv: Conversation,
    message: str,
    context_scope: Optional[str],
    on_event,
) -> tuple[str, str]:
    msg_id = str(uuid.uuid4())
    started_at = time.monotonic()
    status_state = {"phase": "starting", "label": "正在准备对话", "detail": ""}
    runtime_finished = False

    async def emit_status(
        phase: str,
        label: str,
        detail: str = "",
        *,
        heartbeat: bool = False,
        extra: Optional[dict] = None,
    ) -> None:
        status_state.update({"phase": phase, "label": label, "detail": detail})
        metadata = {
            "phase": phase,
            "label": label,
            "detail": detail,
            "elapsedSeconds": int(time.monotonic() - started_at),
            "conversationId": conv.id,
            "cliType": conv.cli_type,
            "heartbeat": heartbeat,
        }
        if extra:
            metadata.update(extra)
        await on_event(StreamEvent(type="status", data=label, msg_id=msg_id, metadata=metadata))

    async def heartbeat() -> None:
        while not runtime_finished:
            await asyncio.sleep(1)
            if runtime_finished:
                return
            await emit_status(
                status_state["phase"],
                status_state["label"],
                status_state.get("detail", ""),
                heartbeat=True,
            )

    heartbeat_task = asyncio.create_task(heartbeat())

    try:
        await emit_status("context", "正在读取会话上下文")
        history_messages = conversation_store.get_messages(conv.id, limit=12)
        _sync_assistant_session(conv)
        await emit_status("persist", "正在写入用户消息")
        user_message_id = conversation_store.add_message(conv_id=conv.id, role="user", content=message)
        if _is_assistant_conversation(conv):
            assistant_session_store.add_message_by_raw_conversation(
                conv.id,
                role="user",
                content=message,
                raw_message_id=user_message_id,
                created_at=conversation_store.get_messages(conv.id, limit=1)[0].created_at,
            )

        await emit_status("context", "正在整理助手上下文")
        runtime_message = _build_runtime_prompt(conv, message, history_messages, context_scope)
        _record_chat_activity(
            ActivityType.CHAT_MESSAGE,
            topic=message,
            context_scope=context_scope or conv.origin,
            conversation_id=conv.id,
            cli_type=conv.cli_type,
        )

        full_response: list[str] = []
        assistant_message_id: Optional[str] = None

        async def handle_event(event: StreamEvent):
            nonlocal assistant_message_id, runtime_finished
            event.metadata = _event_metadata(event, conv, started_at)
            if event.type == "status":
                metadata = dict(event.metadata or {})
                phase = str(metadata.get("phase") or "runtime")
                label = str(metadata.get("label") or event.data or "工作机正在处理")
                detail = str(metadata.get("detail") or "")
                status_state.update({"phase": phase, "label": label, "detail": detail})
                metadata.update(
                    {
                        "phase": phase,
                        "label": label,
                        "detail": detail,
                        "elapsedSeconds": int(time.monotonic() - started_at),
                        "conversationId": conv.id,
                        "cliType": conv.cli_type,
                    }
                )
                event.metadata = metadata
                event.data = label
            if event.type == "content":
                chunk = str(event.data or "")
                full_response.append(chunk)
                if chunk:
                    assistant_message_id = conversation_store.add_or_update_message(
                        conv.id,
                        "assistant",
                        chunk,
                        msg_id=event.msg_id,
                        content_type="text",
                        metadata=event.metadata,
                        status="streaming",
                        append=True,
                    )
            elif event.type == "tool_call":
                tool_msg_id = f"{event.msg_id}:tool:{_tool_merge_key(event)}"
                phase = str((event.metadata or {}).get("phase") or "")
                conversation_store.add_or_update_message(
                    conv.id,
                    "assistant",
                    _tool_content(event),
                    msg_id=tool_msg_id,
                    content_type="tool_call",
                    metadata=event.metadata,
                    status="completed" if phase in {"tool_done", "done", "completed"} else "streaming",
                    append=False,
                )
            elif event.type == "error":
                conversation_store.add_or_update_message(
                    conv.id,
                    "system",
                    str(event.data or "工作机运行失败"),
                    msg_id=event.msg_id,
                    content_type="error",
                    metadata=event.metadata,
                    status="error",
                    append=False,
                )
            if event.type in {"finish", "error"}:
                runtime_finished = True
                conversation_store.finalize_message(event.msg_id)
            await on_event(event)

        await emit_status("runtime", "正在唤起工作机")
        await conversation_runtime_manager.send_message(conv, runtime_message, msg_id, handle_event)
        runtime_finished = True
        assistant_text = "".join(full_response)
        if assistant_text and assistant_message_id is None:
            assistant_message_id = conversation_store.add_or_update_message(
                conv.id,
                "assistant",
                assistant_text,
                msg_id=msg_id,
                content_type="text",
                status="completed",
                append=False,
            )
        conversation_store.finalize_message(msg_id)
        if _is_assistant_conversation(conv):
            latest = conversation_store.get_conversation(conv.id) or conv
            if assistant_text and assistant_message_id:
                assistant_session_store.add_message_by_raw_conversation(
                    conv.id,
                    role="assistant",
                    content=assistant_text,
                    raw_message_id=assistant_message_id,
                    created_at=conversation_store.get_messages(conv.id, limit=1)[0].created_at,
                )
            _sync_assistant_session(latest, sync_messages=True)
        return assistant_text, msg_id
    except asyncio.CancelledError:
        runtime_finished = True
        conversation_store.finalize_message(msg_id)
        conversation_store.finalize_streaming_messages(conv.id)
        conversation_store.add_or_update_message(
            conv.id,
            "system",
            "已终止当前回复",
            msg_id=f"{msg_id}:stopped",
            content_type="agent_status",
            metadata={
                "phase": "stopped",
                "label": "已终止当前回复",
                "conversationId": conv.id,
                "cliType": conv.cli_type,
                "elapsedSeconds": int(time.monotonic() - started_at),
            },
            status="completed",
            append=False,
        )
        if _is_assistant_conversation(conv):
            _sync_assistant_session(conversation_store.get_conversation(conv.id) or conv, sync_messages=True)
        raise
    finally:
        runtime_finished = True
        heartbeat_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task


# === CLI 检测 API ===

@router.get("/cli/detect")
async def detect_clis(force: bool = False):
    """检测可用的 CLI 工具"""
    clis = detector.detect_all(force=force)
    return [
        {
            "id": cli.id,
            "name": cli.name,
            "command": cli.command,
            "version": cli.version,
            "isAvailable": cli.is_available,
            "protocol": cli.protocol
        }
        for cli in clis
    ]


@router.get("/cli/{cli_id}")
async def get_cli_info(cli_id: str):
    """获取 CLI 详细信息"""
    info = detector.get_cli_info(cli_id)
    if not info:
        raise HTTPException(status_code=404, detail="CLI not found")

    return {
        "id": info.id,
        "name": info.name,
        "command": info.command,
        "version": info.version,
        "isAvailable": info.is_available,
        "protocol": info.protocol
    }


# === 对话管理 API ===

@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(req: CreateConversationRequest):
    """创建新对话"""
    cli_type = req.cli_type or get_ai_provider()
    cli_info = detector.get_cli_info(cli_type)
    if not cli_info or not cli_info.is_available:
        raise HTTPException(status_code=400, detail=f"CLI {cli_type} not available")

    session_id = str(uuid.uuid4())
    conv_id = conversation_store.create_conversation(
        cli_type=cli_type,
        session_id=session_id,
        title=req.title or f"New {cli_info.name} chat",
        workspace=req.workspace or "",
        origin=req.origin or "",
    )

    conv = conversation_store.get_conversation(conv_id)
    if conv:
        _sync_assistant_session(conv)
        _record_chat_activity(
            ActivityType.CHAT_START,
            topic=conv.title,
            context_scope=conv.origin,
            conversation_id=conv.id,
            cli_type=conv.cli_type,
            message_count=0,
        )
    return _conversation_response(conv)


@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(cli_type: Optional[str] = None, limit: int = 50):
    """列出对话"""
    convs = conversation_store.list_conversations(cli_type=cli_type, limit=limit)
    return [
        ConversationResponse(
            id=c.id,
            cli_type=c.cli_type,
            session_id=c.session_id,
            title=c.title,
            workspace=c.workspace,
            status=c.status,
            created_at=c.created_at,
            updated_at=c.updated_at
        )
        for c in convs
    ]


@router.get("/conversations/{conv_id}", response_model=ConversationResponse)
async def get_conversation(conv_id: str):
    """获取对话详情"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _conversation_response(conv)


@router.get("/conversations/{conv_id}/messages", response_model=List[MessageResponse])
async def get_messages(conv_id: str, limit: int = 100, before_id: Optional[str] = None):
    """获取消息列表"""
    msgs = conversation_store.get_messages(conv_id, limit=limit, before_id=before_id)
    return [
        MessageResponse(
            id=m.id,
            conversation_id=m.conversation_id,
            msg_id=m.msg_id,
            role=m.role,
            content=m.content,
            content_type=m.content_type,
            status=m.status,
            created_at=m.created_at,
            metadata=json.loads(m.metadata) if m.metadata else None
        )
        for m in msgs
    ]


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """删除对话"""
    conv = conversation_store.get_conversation(conv_id)
    await conversation_runtime_manager.kill(conv_id)
    if _is_assistant_conversation(conv):
        assistant_session_store.delete_session_by_raw_conversation(conv_id)
    conversation_store.delete_conversation(conv_id)
    return {"success": True}


@router.get("/connections")
async def get_connections():
    """获取活跃的 WebSocket 连接列表"""
    connections = []
    for session_id in manager.active_connections.keys():
        info = manager.connection_info.get(session_id)
        connections.append({
            "session_id": session_id,
            "connected": True,
            "is_alive": info.is_alive if info else True
        })
    return {
        "connections": connections,
        "count": len(connections)
    }


@router.patch("/conversations/{conv_id}/title")
async def update_title(conv_id: str, req: UpdateTitleRequest):
    """更新对话标题"""
    conversation_store.update_conversation_title(conv_id, req.title or "")
    _sync_assistant_session(conversation_store.get_conversation(conv_id))
    return {"success": True}


@router.get("/conversations/{conv_id}/runtime", response_model=RuntimeStateResponse)
async def get_conversation_runtime(conv_id: str):
    """获取会话级 runtime 状态。"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation_runtime_manager.get_state(conv)


@router.post("/conversations/{conv_id}/warmup", response_model=RuntimeStateResponse)
async def warmup_conversation_runtime(conv_id: str):
    """预热会话 runtime 元数据，真正的 CLI 进程仍在发送时按需启动。"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    try:
        return await conversation_runtime_manager.warmup(conv)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/conversations/{conv_id}/stop")
async def stop_conversation_turn(conv_id: str):
    """终止当前轮回复，保留会话本身。"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    stopped = await conversation_runtime_manager.stop(conv.id)
    conversation_store.finalize_streaming_messages(conv.id)
    if _is_assistant_conversation(conv):
        _sync_assistant_session(conversation_store.get_conversation(conv.id) or conv, sync_messages=True)
    state = conversation_runtime_manager.get_state(conv)
    return {
        "success": True,
        "conversation_id": conv.id,
        "stopped": stopped,
        "runtime": state,
    }


@router.post("/conversations/{conv_id}/messages")
async def send_message_http(conv_id: str, req: SendMessageRequest):
    """HTTP 方式发送消息（非流式）"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        response_text, _ = await _run_conversation_turn(
            conv,
            req.message,
            req.context_scope,
            lambda _event: asyncio.sleep(0),
        )
        return {"message": response_text}
    except RuntimeBusyError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# === WebSocket 实时通信 ===

@router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """
    WebSocket 聊天接口 - 严格遵循 AionUi 协议

    客户端消息格式:
    - { "type": "message", "content": "...", "conversation_id": "..." }
    - { "type": "pong" }
    - { "type": "stop" }

    服务器消息格式:
    - { "type": "connected" }
    - { "type": "ping" }
    - { "type": "start", "msg_id": "..." }
    - { "type": "content", "data": "...", "msg_id": "..." }
    - { "type": "tool_call", "data": {...}, "msg_id": "..." }
    - { "type": "finish", "msg_id": "..." }
    - { "type": "error", "data": "...", "msg_id": "..." }
    """
    await manager.connect(websocket, session_id)
    bundled_backend_websocket_connected()

    # 查找或创建对话
    conv = conversation_store.get_conversation_by_session(session_id)
    if not conv:
        cli_info = detector.get_cli_info(cli_type)
        if cli_info:
            conv_id = conversation_store.create_conversation(
                cli_type=cli_type,
                session_id=session_id,
                title=f"New {cli_info.name} chat"
            )
            conv = conversation_store.get_conversation(conv_id)
            if conv:
                _record_chat_activity(
                    ActivityType.CHAT_START,
                    topic=conv.title,
                    context_scope=conv.origin,
                    conversation_id=conv.id,
                    cli_type=conv.cli_type,
                    message_count=0,
                )

    try:
        while True:
            # 接收客户端消息
            data = await websocket.receive_json()
            mark_bundled_backend_activity()
            msg_type = data.get("type", "message")

            if msg_type == "pong":
                # 心跳响应
                logger.debug(f"Pong from {session_id}")
                continue

            elif msg_type == "stop":
                # 停止生成
                task_cancelled = False
                stopped = False
                if conv:
                    stopped = await conversation_runtime_manager.stop(conv.id)
                    conversation_store.finalize_streaming_messages(conv.id)
                    task_cancelled = manager.cancel_message_task(session_id)
                await manager.send_json(session_id, {
                    "type": "stopped",
                    "data": "已终止当前回复",
                    "msg_id": data.get("msg_id") or str(uuid.uuid4()),
                    "conversation_id": conv.id if conv else data.get("conversation_id"),
                    "metadata": {
                        "phase": "stopped",
                        "label": "已终止当前回复",
                        "stopped": stopped,
                        "task_cancelled": task_cancelled,
                    },
                })

            elif msg_type == "message":
                # 处理聊天消息
                message = data.get("content", "")
                context_scope = data.get("context_scope")
                logger.info(f"Received message: {message[:50]}...")

                conv = conversation_store.get_conversation_by_session(session_id)
                if not conv:
                    logger.error(f"Conversation not found for session {session_id}")
                    await manager.send_json(session_id, {
                        "type": "error",
                        "data": "Conversation not found for this session",
                        "msg_id": str(uuid.uuid4())
                    })
                    continue

                conv_id = conv.id
                logger.info(f"Using conversation: {conv_id}")

                if not message:
                    logger.warning("Empty message, skipping")
                    continue

                if manager.get_message_task(session_id):
                    await manager.send_json(session_id, {
                        "type": "error",
                        "data": f"Conversation {conv_id} already has an active turn",
                        "msg_id": str(uuid.uuid4()),
                    })
                    continue

                async def process_message():
                    async def on_event(event: StreamEvent):
                        await manager.send_json(session_id, {
                            "type": event.type,
                            "data": event.data,
                            "msg_id": event.msg_id,
                            "metadata": event.metadata,
                            "conversation_id": conv.id,
                        })

                    try:
                        logger.info(f"Starting runtime turn for message: {message[:50]}...")
                        await _run_conversation_turn(conv, message, context_scope, on_event)
                    except RuntimeBusyError as e:
                        await manager.send_json(session_id, {
                            "type": "error",
                            "data": str(e),
                            "msg_id": str(uuid.uuid4()),
                        })
                    except Exception as e:
                        logger.exception("Runtime turn error")
                        await manager.send_json(session_id, {
                            "type": "error",
                            "data": str(e),
                            "msg_id": str(uuid.uuid4()),
                        })

                manager.track_message_task(session_id, asyncio.create_task(process_message()))

    except WebSocketDisconnect:
        logger.info(f"Client {session_id} disconnected")
    except Exception as e:
        logger.exception(f"WebSocket error for {session_id}")
        try:
            await websocket.send_json({
                "type": "error",
                "data": f"Server error: {str(e)}"
            })
        except:
            pass
    finally:
        manager.disconnect(session_id)
        bundled_backend_websocket_disconnected()
