"""对话数据存储模块"""

import sqlite3
import json
import os
from typing import List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import threading

from ..storage_paths import resolve_app_db_path


@dataclass
class Conversation:
    id: str
    cli_type: str
    session_id: str
    title: str
    workspace: str
    status: str
    created_at: int
    updated_at: int
    metadata: str = "{}"
    origin: str = ""


@dataclass
class Message:
    id: str
    conversation_id: str
    msg_id: Optional[str]
    role: str
    content: str
    content_type: str
    metadata: Optional[str]
    status: str
    created_at: int


class ConversationStore:
    """
    对话存储管理器

    功能：
    - 对话 CRUD
    - 消息 CRUD + 流式更新
    - 历史记录查询
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, db_path: Optional[str] = None):
        if hasattr(self, '_initialized'):
            return

        resolved_path = db_path or resolve_app_db_path("conversations.db")
        self.db_path = os.path.expanduser(resolved_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()
        self._initialized = True

    def _get_conn(self) -> sqlite3.Connection:
        """获取数据库连接"""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self):
        """初始化数据库表"""
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    cli_type TEXT NOT NULL,
                    session_id TEXT NOT NULL UNIQUE,
                    title TEXT DEFAULT '',
                    workspace TEXT DEFAULT '',
                    metadata TEXT DEFAULT '{}',
                    origin TEXT DEFAULT '',
                    status TEXT DEFAULT 'active',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    msg_id TEXT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    content_type TEXT DEFAULT 'text',
                    metadata TEXT,
                    status TEXT DEFAULT 'completed',
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_messages_conv_time
                    ON messages(conversation_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_messages_msgid
                    ON messages(msg_id);
                CREATE INDEX IF NOT EXISTS idx_conversations_updated
                    ON conversations(updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_conversations_session
                    ON conversations(session_id);
            """)
            self._ensure_column(conn, "conversations", "metadata", "TEXT DEFAULT '{}'")
            self._ensure_column(conn, "conversations", "origin", "TEXT DEFAULT ''")

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    # === 对话操作 ===

    @staticmethod
    def _serialize_metadata(metadata: Optional[dict]) -> str:
        return json.dumps(metadata or {}, ensure_ascii=False)

    @staticmethod
    def parse_metadata(metadata: Optional[str]) -> dict:
        if not metadata:
            return {}
        try:
            parsed = json.loads(metadata)
        except (json.JSONDecodeError, TypeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def create_conversation(
        self,
        cli_type: str,
        session_id: str,
        title: str = "",
        workspace: str = "",
        origin: str = "",
        metadata: Optional[dict] = None,
    ) -> str:
        """创建新对话"""
        import uuid

        conv_id = str(uuid.uuid4())
        now = int(datetime.now().timestamp() * 1000)

        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO conversations
                   (id, cli_type, session_id, title, workspace, metadata, origin, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)""",
                (
                    conv_id,
                    cli_type,
                    session_id,
                    title,
                    workspace,
                    self._serialize_metadata(metadata),
                    origin,
                    now,
                    now,
                )
            )

        return conv_id

    def get_conversation(self, conv_id: str) -> Optional[Conversation]:
        """获取对话信息"""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?",
                (conv_id,)
            ).fetchone()

            if row:
                return Conversation(**dict(row))
            return None

    def get_conversation_by_session(self, session_id: str) -> Optional[Conversation]:
        """通过 session_id 获取对话"""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM conversations WHERE session_id = ?",
                (session_id,)
            ).fetchone()

            if row:
                return Conversation(**dict(row))
            return None

    def list_conversations(self, cli_type: Optional[str] = None,
                          limit: int = 50, offset: int = 0) -> List[Conversation]:
        """列出对话"""
        with self._get_conn() as conn:
            if cli_type:
                rows = conn.execute(
                    """SELECT * FROM conversations
                       WHERE cli_type = ? AND status = 'active'
                       ORDER BY updated_at DESC LIMIT ? OFFSET ?""",
                    (cli_type, limit, offset)
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT * FROM conversations
                       WHERE status = 'active'
                       ORDER BY updated_at DESC LIMIT ? OFFSET ?""",
                    (limit, offset)
                ).fetchall()

            return [Conversation(**dict(row)) for row in rows]

    def update_conversation_title(self, conv_id: str, title: str):
        """更新对话标题"""
        now = int(datetime.now().timestamp() * 1000)

        with self._get_conn() as conn:
            conn.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (title, now, conv_id)
            )

    def touch_conversation(self, conv_id: str):
        """更新对话最近活动时间"""
        now = int(datetime.now().timestamp() * 1000)

        with self._get_conn() as conn:
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conv_id)
            )

    def update_conversation_metadata(self, conv_id: str, metadata: dict):
        """覆盖写入对话元数据"""
        now = int(datetime.now().timestamp() * 1000)

        with self._get_conn() as conn:
            conn.execute(
                "UPDATE conversations SET metadata = ?, updated_at = ? WHERE id = ?",
                (self._serialize_metadata(metadata), now, conv_id)
            )

    def merge_conversation_metadata(
        self,
        conv_id: str,
        updates: Optional[dict] = None,
        *,
        remove_keys: Optional[List[str]] = None,
    ) -> dict:
        """合并更新对话元数据并返回最新结果"""
        conv = self.get_conversation(conv_id)
        current = self.parse_metadata(conv.metadata if conv else None)

        if updates:
            current.update(updates)
        if remove_keys:
            for key in remove_keys:
                current.pop(key, None)

        self.update_conversation_metadata(conv_id, current)
        return current

    def close_conversation(self, conv_id: str):
        """关闭对话"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE conversations SET status = 'closed' WHERE id = ?",
                (conv_id,)
            )

    def delete_conversation(self, conv_id: str):
        """删除对话（级联删除消息）"""
        with self._get_conn() as conn:
            conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))

    def delete_conversation_by_session(self, session_id: str):
        """通过 session_id 删除对话（级联删除消息）"""
        if not session_id:
            return
        with self._get_conn() as conn:
            conn.execute("DELETE FROM conversations WHERE session_id = ?", (session_id,))

    # === 消息操作 ===

    def add_message(self, conv_id: str, role: str, content: str,
                   msg_id: Optional[str] = None,
                   content_type: str = "text",
                   metadata: Optional[dict] = None,
                   status: str = "completed") -> str:
        """添加消息"""
        import uuid

        message_id = str(uuid.uuid4())
        now = int(datetime.now().timestamp() * 1000)

        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO messages
                   (id, conversation_id, msg_id, role, content,
                    content_type, metadata, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (message_id, conv_id, msg_id, role, content,
                 content_type, json.dumps(metadata) if metadata else None,
                 status, now)
            )

            # 更新对话时间
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conv_id)
            )

        return message_id

    def add_or_update_message(
        self,
        conv_id: str,
        role: str,
        content: str,
        *,
        msg_id: Optional[str],
        content_type: str = "text",
        metadata: Optional[dict] = None,
        status: str = "streaming",
        append: bool = True,
    ) -> str:
        """Add a message or merge it into the existing stream row.

        Runtime events are keyed by conversation + role + msg_id + content_type.
        Text/thinking chunks append, while tool/error updates normally replace
        the current row. This keeps the DB close to the renderer stream without
        inserting one row per chunk.
        """
        import uuid

        now = int(datetime.now().timestamp() * 1000)
        metadata_json = json.dumps(metadata, ensure_ascii=False) if metadata else None

        with self._get_conn() as conn:
            existing = None
            if msg_id:
                existing = conn.execute(
                    """
                    SELECT id, content, metadata FROM messages
                    WHERE conversation_id = ? AND role = ? AND msg_id = ? AND content_type = ?
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (conv_id, role, msg_id, content_type),
                ).fetchone()

            if existing:
                message_id = str(existing["id"])
                next_content = f"{existing['content']}{content}" if append else content
                next_metadata = metadata_json if metadata is not None else existing["metadata"]
                conn.execute(
                    """
                    UPDATE messages
                    SET content = ?, metadata = ?, status = ?
                    WHERE id = ?
                    """,
                    (next_content, next_metadata, status, message_id),
                )
            else:
                message_id = str(uuid.uuid4())
                conn.execute(
                    """INSERT INTO messages
                       (id, conversation_id, msg_id, role, content,
                        content_type, metadata, status, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        message_id,
                        conv_id,
                        msg_id,
                        role,
                        content,
                        content_type,
                        metadata_json,
                        status,
                        now,
                    ),
                )

            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conv_id),
            )

        return message_id

    def update_message_content(self, msg_id: str, content: str):
        """更新消息内容（流式更新）"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE messages SET content = ? WHERE msg_id = ?",
                (content, msg_id)
            )

    def finalize_message(self, msg_id: str):
        """完成流式消息"""
        now = int(datetime.now().timestamp() * 1000)
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE messages SET status = 'completed' WHERE msg_id = ?",
                (msg_id,)
            )
            row = conn.execute(
                "SELECT conversation_id FROM messages WHERE msg_id = ? LIMIT 1",
                (msg_id,),
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE conversations SET updated_at = ? WHERE id = ?",
                    (now, row["conversation_id"]),
                )

    def finalize_streaming_messages(self, conv_id: str):
        """将某个对话中仍处于流式状态的消息收尾。"""
        now = int(datetime.now().timestamp() * 1000)
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE messages SET status = 'completed' WHERE conversation_id = ? AND status = 'streaming'",
                (conv_id,),
            )
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conv_id),
            )

    def get_messages(self, conv_id: str, limit: int = 100,
                    before_id: Optional[str] = None) -> List[Message]:
        """获取消息列表"""
        with self._get_conn() as conn:
            if before_id:
                # 分页加载
                before_time = conn.execute(
                    "SELECT created_at FROM messages WHERE id = ?",
                    (before_id,)
                ).fetchone()

                if before_time:
                    rows = conn.execute(
                        """SELECT * FROM messages
                           WHERE conversation_id = ? AND created_at < ?
                           ORDER BY created_at DESC LIMIT ?""",
                        (conv_id, before_time[0], limit)
                    ).fetchall()
                else:
                    rows = []
            else:
                rows = conn.execute(
                    """SELECT * FROM messages
                       WHERE conversation_id = ?
                       ORDER BY created_at DESC LIMIT ?""",
                    (conv_id, limit)
                ).fetchall()

            # 转为正序
            messages = [Message(**dict(row)) for row in rows]
            messages.reverse()
            return messages

    def search_messages(self, conv_id: str, query: str, limit: int = 20) -> List[Message]:
        """搜索消息"""
        with self._get_conn() as conn:
            rows = conn.execute(
                """SELECT * FROM messages
                   WHERE conversation_id = ? AND content LIKE ?
                   ORDER BY created_at DESC LIMIT ?""",
                (conv_id, f"%{query}%", limit)
            ).fetchall()

            messages = [Message(**dict(row)) for row in rows]
            messages.reverse()
            return messages


# 全局实例
conversation_store = ConversationStore()
