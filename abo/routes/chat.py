"""Chat WebSocket 和 HTTP API"""

import json
import uuid
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..cli import detector, RunnerFactory, StreamEvent
from ..store.conversations import conversation_store

chat_router = APIRouter(prefix="/api/chat")


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.runners: dict = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        self.active_connections.pop(client_id, None)
        if client_id in self.runners:
            runner = self.runners[client_id]
            import asyncio
            asyncio.create_task(runner.close())
            del self.runners[client_id]

    async def send_json(self, client_id: str, data: dict):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(data)
            except Exception:
                pass


manager = ConnectionManager()


@chat_router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """通用 CLI 对话 WebSocket"""
    client_id = f"{cli_type}:{session_id}"
    await manager.connect(websocket, client_id)

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

    if not conv:
        await websocket.send_json({
            "type": "error",
            "data": "Failed to create conversation",
            "msg_id": ""
        })
        manager.disconnect(client_id)
        return

    # 创建 Runner
    cli_info = detector.get_cli_info(cli_type)
    if cli_info:
        runner = RunnerFactory.create(cli_info, session_id, conv.workspace)
        manager.runners[client_id] = runner

    try:
        while True:
            data = await websocket.receive_json()
            message = data.get('message', '')
            conv_id = data.get('conversation_id', conv.id)

            if not message:
                continue

            # 保存用户消息
            conversation_store.add_message(
                conv_id=conv_id,
                role='user',
                content=message
            )

            # 流式处理
            msg_id = str(uuid.uuid4())
            full_response = []

            await manager.send_json(client_id, {'type': 'start', 'data': '', 'msg_id': msg_id})

            async def on_event(event: StreamEvent):
                await manager.send_json(client_id, {
                    'type': event.type,
                    'data': event.data,
                    'msg_id': event.msg_id,
                    'metadata': event.metadata
                })
                if event.type == 'content':
                    full_response.append(event.data)

            runner = manager.runners.get(client_id)
            if runner:
                try:
                    await runner.send_message(message, msg_id, on_event)
                    # 保存完整响应
                    conversation_store.add_message(
                        conv_id=conv_id,
                        role='assistant',
                        content=''.join(full_response),
                        msg_id=msg_id
                    )
                except Exception as e:
                    await manager.send_json(client_id, {
                        'type': 'error',
                        'data': str(e),
                        'msg_id': msg_id
                    })

    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception:
        manager.disconnect(client_id)


# HTTP API Models
class CreateConversationRequest(BaseModel):
    cli_type: str
    title: Optional[str] = None
    workspace: Optional[str] = None


class CreateConversationResponse(BaseModel):
    id: str
    session_id: str
    cli_type: str
    title: str
    workspace: str = ""
    status: str = "active"
    created_at: int = 0
    updated_at: int = 0


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    content_type: str
    status: str
    created_at: int
    metadata: Optional[dict] = None


class ConversationListItem(BaseModel):
    id: str
    cli_type: str
    session_id: str
    title: str
    workspace: str = ""
    status: str = "active"
    created_at: int = 0
    updated_at: int = 0


class MessagesResponse(BaseModel):
    messages: list


class SuccessResponse(BaseModel):
    success: bool


# CLI Detection Endpoints
@chat_router.get("/cli/detect")
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


@chat_router.get("/cli/{cli_id}")
async def get_cli_info(cli_id: str):
    """获取 CLI 详细信息"""
    info = detector.get_cli_info(cli_id)
    if not info:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="CLI not found")

    return {
        "id": info.id,
        "name": info.name,
        "command": info.command,
        "version": info.version,
        "isAvailable": info.is_available,
        "protocol": info.protocol
    }


# Conversation Endpoints
@chat_router.post("/conversations", response_model=CreateConversationResponse)
async def create_conversation(req: CreateConversationRequest):
    """创建新对话"""
    # 验证 CLI 可用
    cli_info = detector.get_cli_info(req.cli_type)
    if not cli_info or not cli_info.is_available:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"CLI {req.cli_type} not available")

    session_id = str(uuid.uuid4())
    conv_id = conversation_store.create_conversation(
        cli_type=req.cli_type,
        session_id=session_id,
        title=req.title or f"New {cli_info.name} chat",
        workspace=req.workspace or ""
    )

    conv = conversation_store.get_conversation(conv_id)
    return CreateConversationResponse(
        id=conv.id,
        session_id=conv.session_id,
        cli_type=conv.cli_type,
        title=conv.title,
        workspace=conv.workspace,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at
    )


@chat_router.get("/conversations", response_model=list)
async def list_conversations(cli_type: Optional[str] = None, limit: int = 50):
    """列出对话"""
    conversations = conversation_store.list_conversations(cli_type=cli_type, limit=limit)
    return [
        {
            "id": conv.id,
            "cli_type": conv.cli_type,
            "session_id": conv.session_id,
            "title": conv.title,
            "workspace": conv.workspace,
            "status": conv.status,
            "created_at": conv.created_at,
            "updated_at": conv.updated_at
        }
        for conv in conversations
    ]


@chat_router.get("/conversations/{conv_id}", response_model=CreateConversationResponse)
async def get_conversation(conv_id: str):
    """获取对话详情"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Conversation not found")
    return CreateConversationResponse(
        id=conv.id,
        session_id=conv.session_id,
        cli_type=conv.cli_type,
        title=conv.title,
        workspace=conv.workspace,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at
    )


@chat_router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """删除对话"""
    conversation_store.delete_conversation(conv_id)
    return {"success": True}


@chat_router.patch("/conversations/{conv_id}/title")
async def update_title(conv_id: str, body: dict):
    """更新对话标题"""
    title = body.get('title', '')
    conversation_store.update_conversation_title(conv_id, title)
    return {"success": True}


# Message Endpoints
@chat_router.get("/conversations/{conv_id}/messages", response_model=list)
async def get_messages(conv_id: str, limit: int = 100, before_id: Optional[str] = None):
    """获取消息列表"""
    messages = conversation_store.get_messages(conv_id, limit=limit, before_id=before_id)
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "content_type": m.content_type,
            "status": m.status,
            "created_at": m.created_at,
            "metadata": json.loads(m.metadata) if m.metadata else None
        }
        for m in messages
    ]
