"""Chat WebSocket 和 HTTP API"""
import json
import uuid
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..claude_bridge.runner import CliRunner
from ..store.conversations import ConversationStore

chat_router = APIRouter(prefix="/api/chat")
store = ConversationStore()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.cli_runners: Dict[str, CliRunner] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        self.active_connections.pop(client_id, None)
        if client_id in self.cli_runners:
            self.cli_runners[client_id].cleanup()
            del self.cli_runners[client_id]

    async def send_json(self, client_id: str, data: dict):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(data)

manager = ConnectionManager()


@chat_router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """通用 CLI 对话 WebSocket"""
    client_id = f"{cli_type}:{session_id}"
    await manager.connect(websocket, client_id)
    runner = CliRunner(cli_type, session_id)
    manager.cli_runners[client_id] = runner

    try:
        while True:
            data = await websocket.receive_json()
            message = data.get('message', '')
            conv_id = data.get('conversation_id', '')

            if not message or not conv_id:
                await manager.send_json(client_id, {'type': 'error', 'data': 'Missing message or conversation_id'})
                continue

            store.add_message(conv_id, 'user', message)
            full_response = []
            current_msg_id = str(uuid.uuid4())

            await manager.send_json(client_id, {'type': 'start', 'data': '', 'msg_id': current_msg_id})

            async def on_chunk(event: dict):
                await manager.send_json(client_id, {
                    'type': event['type'], 'data': event['data'], 'msg_id': event.get('msg_id', current_msg_id)
                })
                if event['type'] == 'content':
                    full_response.append(event['data'])

            try:
                await runner.stream_call(message, on_chunk)
            except Exception as e:
                await manager.send_json(client_id, {'type': 'error', 'data': str(e), 'msg_id': current_msg_id})

            if full_response:
                store.add_message(conv_id, 'assistant', ''.join(full_response), msg_id=current_msg_id)

    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(client_id)


# HTTP API Models
class CreateConversationRequest(BaseModel):
    cli_type: str
    title: Optional[str] = None


class CreateConversationResponse(BaseModel):
    id: str
    session_id: str
    cli_type: str
    title: str


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: Optional[str] = None


class ConversationListItem(BaseModel):
    id: str
    cli_type: str
    session_id: str
    title: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ConversationDetailResponse(BaseModel):
    id: str
    cli_type: str
    session_id: str
    title: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MessagesResponse(BaseModel):
    messages: list


class SuccessResponse(BaseModel):
    success: bool


# HTTP Endpoints
@chat_router.post("/conversations", response_model=CreateConversationResponse)
async def create_conversation(req: CreateConversationRequest):
    session_id = str(uuid.uuid4())
    conv_id = store.create_conversation(req.cli_type, session_id, req.title)
    return CreateConversationResponse(
        id=conv_id, session_id=session_id, cli_type=req.cli_type,
        title=req.title or f"New {req.cli_type} chat"
    )


@chat_router.get("/conversations")
async def list_conversations(cli_type: Optional[str] = None):
    conversations = store.list_conversations(cli_type)
    return [
        {
            "id": conv.id,
            "cli_type": conv.cli_type,
            "session_id": conv.session_id,
            "title": conv.title,
            "created_at": conv.created_at,
            "updated_at": conv.updated_at
        }
        for conv in conversations
    ]


@chat_router.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, limit: int = 100):
    messages = store.get_messages(conv_id, limit)
    return {
        "messages": [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at
            }
            for msg in messages
        ]
    }


@chat_router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    conv = store.get_conversation(conv_id)
    if not conv:
        return {"error": "Conversation not found"}, 404
    return {
        "id": conv.id,
        "cli_type": conv.cli_type,
        "session_id": conv.session_id,
        "title": conv.title,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at
    }


@chat_router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    success = store.delete_conversation(conv_id)
    return {"success": success}


@chat_router.patch("/conversations/{conv_id}/title")
async def update_title(conv_id: str, body: dict):
    title = body.get('title', '')
    store.update_title(conv_id, title)
    return {"success": True}
