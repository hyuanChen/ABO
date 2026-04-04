"""聊天 API 路由 - 严格遵循 AionUi 协议"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import json
import logging
import uuid

from ..cli.detector import detector
from ..cli.runner import RunnerFactory, StreamEvent
from ..store.conversations import conversation_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat")
chat_router = router  # 导出别名


# === 请求/响应模型 ===

class CreateConversationRequest(BaseModel):
    cli_type: str
    title: Optional[str] = None
    workspace: Optional[str] = None


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
    role: str
    content: str
    content_type: str
    status: str
    created_at: int
    metadata: Optional[dict] = None


class SendMessageRequest(BaseModel):
    message: str
    conversation_id: str


# === 连接管理器 ===

class ConnectionManager:
    """WebSocket 连接管理器 - 严格遵循 AionUi 协议"""

    def __init__(self):
        self.active_connections: dict = {}  # session_id -> WebSocket
        self.runners: dict = {}  # session_id -> runner

    async def connect(self, websocket: WebSocket, session_id: str):
        """建立连接"""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info(f"WebSocket connected: {session_id}")

    def disconnect(self, session_id: str):
        """断开连接"""
        self.active_connections.pop(session_id, None)
        if session_id in self.runners:
            runner = self.runners.pop(session_id)
            asyncio.create_task(runner.close())
        logger.info(f"WebSocket disconnected: {session_id}")

    async def send_json(self, session_id: str, data: dict):
        """发送 JSON 消息"""
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(data)
            except Exception as e:
                logger.error(f"Failed to send to {session_id}: {e}")


manager = ConnectionManager()


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
            "is_available": cli.is_available,
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
        "is_available": info.is_available,
        "protocol": info.protocol
    }


# === 对话管理 API ===

@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(req: CreateConversationRequest):
    """创建新对话"""
    cli_info = detector.get_cli_info(req.cli_type)
    if not cli_info or not cli_info.is_available:
        raise HTTPException(status_code=400, detail=f"CLI {req.cli_type} not available")

    session_id = str(uuid.uuid4())
    conv_id = conversation_store.create_conversation(
        cli_type=req.cli_type,
        session_id=session_id,
        title=req.title or f"New {cli_info.name} chat",
        workspace=req.workspace or ""
    )

    conv = conversation_store.get_conversation(conv_id)
    return ConversationResponse(
        id=conv.id,
        cli_type=conv.cli_type,
        session_id=conv.session_id,
        title=conv.title,
        workspace=conv.workspace,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at
    )


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
    return ConversationResponse(
        id=conv.id,
        cli_type=conv.cli_type,
        session_id=conv.session_id,
        title=conv.title,
        workspace=conv.workspace,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at
    )


@router.get("/conversations/{conv_id}/messages", response_model=List[MessageResponse])
async def get_messages(conv_id: str, limit: int = 100, before_id: Optional[str] = None):
    """获取消息列表"""
    msgs = conversation_store.get_messages(conv_id, limit=limit, before_id=before_id)
    return [
        MessageResponse(
            id=m.id,
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
    conversation_store.delete_conversation(conv_id)
    return {"success": True}


@router.patch("/conversations/{conv_id}/title")
async def update_title(conv_id: str, title: str):
    """更新对话标题"""
    conversation_store.update_conversation_title(conv_id, title)
    return {"success": True}


@router.post("/conversations/{conv_id}/messages")
async def send_message_http(conv_id: str, req: SendMessageRequest):
    """HTTP 方式发送消息（非流式）"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    cli_info = detector.get_cli_info(conv.cli_type)
    if not cli_info:
        raise HTTPException(status_code=400, detail="CLI not found")

    # 保存用户消息
    conversation_store.add_message(
        conv_id=conv_id,
        role="user",
        content=req.message
    )

    # 创建 Runner
    runner = RunnerFactory.create(cli_info, conv.session_id, conv.workspace)

    # 收集响应
    chunks = []
    msg_id = str(uuid.uuid4())

    async def on_event(event: StreamEvent):
        if event.type == "content":
            chunks.append(event.data)

    try:
        await runner.send_message(req.message, msg_id, on_event)
        response_text = "".join(chunks)

        # 保存助手响应
        conversation_store.add_message(
            conv_id=conv_id,
            role="assistant",
            content=response_text,
            msg_id=msg_id
        )

        return {"message": response_text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await runner.close()


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

    # 发送连接成功消息
    await websocket.send_json({"type": "connected"})

    # 创建 Runner
    cli_info = detector.get_cli_info(cli_type)
    runner = None
    if cli_info:
        workspace = conv.workspace if conv else ""
        runner = RunnerFactory.create(cli_info, session_id, workspace)
        manager.runners[session_id] = runner

    try:
        while True:
            # 接收客户端消息
            data = await websocket.receive_json()
            msg_type = data.get("type", "message")

            if msg_type == "pong":
                # 心跳响应
                logger.debug(f"Pong from {session_id}")
                continue

            elif msg_type == "stop":
                # 停止生成
                if session_id in manager.runners:
                    await manager.runners[session_id].close()
                await manager.send_json(session_id, {"type": "stopped"})

            elif msg_type == "message":
                # 处理聊天消息
                message = data.get("content", "")
                conv_id = data.get("conversation_id", conv.id if conv else None)

                if not message or not conv_id:
                    continue

                # 保存用户消息
                conversation_store.add_message(
                    conv_id=conv_id,
                    role="user",
                    content=message
                )

                # 流式处理
                msg_id = str(uuid.uuid4())
                full_response = []

                async def on_event(event: StreamEvent):
                    # 转发到客户端
                    await manager.send_json(session_id, {
                        "type": event.type,
                        "data": event.data,
                        "msg_id": event.msg_id,
                        "metadata": event.metadata
                    })
                    # 收集内容
                    if event.type == "content":
                        full_response.append(event.data)

                # 执行 Runner
                if runner:
                    try:
                        await runner.send_message(message, msg_id, on_event)

                        # 保存完整响应
                        conversation_store.add_message(
                            conv_id=conv_id,
                            role="assistant",
                            content="".join(full_response),
                            msg_id=msg_id
                        )
                    except Exception as e:
                        logger.exception("Runner error")
                        await manager.send_json(session_id, {
                            "type": "error",
                            "data": str(e),
                            "msg_id": msg_id
                        })

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
