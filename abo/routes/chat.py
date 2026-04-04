"""Chat WebSocket 和 HTTP API"""

import asyncio
import json
import uuid
import time
from typing import Dict, Optional, Set
from dataclasses import dataclass, field

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from ..cli import detector, RunnerFactory, StreamEvent
from ..store.conversations import conversation_store

chat_router = APIRouter(prefix="/api/chat")


@dataclass
class ConnectionInfo:
    """Connection metadata"""
    client_id: str
    cli_type: str
    session_id: str
    connected_at: float
    last_pong: float
    is_alive: bool = True


class ConnectionManager:
    """
    WebSocket Connection Manager with heartbeat support.

    Features:
    - Track active connections
    - Send heartbeat every 15 seconds
    - Handle pong responses
    - Manage runner lifecycle
    """

    HEARTBEAT_INTERVAL = 15.0  # seconds
    HEARTBEAT_TIMEOUT = 30.0   # seconds

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.connection_info: Dict[str, ConnectionInfo] = {}
        self.runners: dict = {}
        self._heartbeat_tasks: Dict[str, asyncio.Task] = {}

    async def connect(self, websocket: WebSocket, client_id: str, cli_type: str = "", session_id: str = ""):
        """Accept connection and start heartbeat."""
        await websocket.accept()
        self.active_connections[client_id] = websocket

        now = time.time()
        self.connection_info[client_id] = ConnectionInfo(
            client_id=client_id,
            cli_type=cli_type,
            session_id=session_id,
            connected_at=now,
            last_pong=now
        )

        # Start heartbeat for this connection
        self._heartbeat_tasks[client_id] = asyncio.create_task(
            self._heartbeat_loop(client_id)
        )

        # Send connected event
        await self.send_json(client_id, {"type": "connected"})

    def disconnect(self, client_id: str):
        """Clean up connection and resources."""
        # Cancel heartbeat task
        if client_id in self._heartbeat_tasks:
            task = self._heartbeat_tasks.pop(client_id)
            task.cancel()

        self.active_connections.pop(client_id, None)
        self.connection_info.pop(client_id, None)

        if client_id in self.runners:
            runner = self.runners.pop(client_id)
            try:
                # Try to close runner if event loop is running
                loop = asyncio.get_running_loop()
                asyncio.create_task(runner.close())
            except RuntimeError:
                # No running event loop, skip async cleanup
                pass

    async def send_json(self, client_id: str, data: dict):
        """Send JSON message to client."""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(data)
            except Exception:
                pass

    async def _heartbeat_loop(self, client_id: str):
        """Send periodic heartbeat pings."""
        try:
            while client_id in self.active_connections:
                await asyncio.sleep(self.HEARTBEAT_INTERVAL)

                if client_id not in self.active_connections:
                    break

                # Check if client is still alive
                info = self.connection_info.get(client_id)
                if info:
                    time_since_pong = time.time() - info.last_pong
                    if time_since_pong > self.HEARTBEAT_TIMEOUT:
                        # Client hasn't responded, disconnect
                        info.is_alive = False
                        await self._disconnect_client(client_id)
                        break

                # Send ping
                await self.send_json(client_id, {
                    "type": "ping",
                    "timestamp": int(time.time() * 1000)
                })
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    async def _disconnect_client(self, client_id: str):
        """Disconnect a client due to timeout."""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].close()
            except Exception:
                pass
        self.disconnect(client_id)

    def handle_pong(self, client_id: str, timestamp: float):
        """Update last pong time."""
        if client_id in self.connection_info:
            self.connection_info[client_id].last_pong = time.time()
            self.connection_info[client_id].is_alive = True

    def get_active_connections(self) -> list:
        """Get list of active connection info."""
        return [
            {
                "client_id": info.client_id,
                "cli_type": info.cli_type,
                "session_id": info.session_id,
                "connected_at": info.connected_at,
                "last_pong": info.last_pong,
                "is_alive": info.is_alive
            }
            for info in self.connection_info.values()
        ]


manager = ConnectionManager()


@chat_router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """
    通用 CLI 对话 WebSocket

    WebSocket Protocol:
    Client -> Server:
        - { "type": "message", "content": "...", "conversation_id": "..." }
        - { "type": "pong", "timestamp": "..." }
        - { "type": "stop" }

    Server -> Client:
        - { "type": "connected" }
        - { "type": "ping", "timestamp": "..." }
        - { "type": "start", "msg_id": "..." }
        - { "type": "content", "data": "...", "msg_id": "..." }
        - { "type": "finish", "msg_id": "..." }
        - { "type": "error", "data": "...", "msg_id": "..." }
    """
    client_id = f"{cli_type}:{session_id}"
    await manager.connect(websocket, client_id, cli_type, session_id)

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
            msg_type = data.get('type', 'message')

            # Handle pong response
            if msg_type == 'pong':
                timestamp = data.get('timestamp', 0)
                manager.handle_pong(client_id, timestamp)
                continue

            # Handle stop request
            if msg_type == 'stop':
                runner = manager.runners.get(client_id)
                if runner:
                    await runner.close()
                continue

            # Handle message
            if msg_type == 'message':
                message = data.get('content', '')
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


# Connection Status Endpoints
@chat_router.get("/connections")
async def get_connections():
    """获取活跃连接状态"""
    connections = manager.get_active_connections()
    return {
        "connections": connections,
        "count": len(connections)
    }


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
