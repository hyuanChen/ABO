"""Assistant-specific conversation storage."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from ..storage_paths import resolve_app_db_path


@dataclass
class AssistantSession:
    id: str
    raw_conversation_id: str
    cli_type: str
    raw_session_id: str
    title: str
    last_message_preview: str
    status: str
    created_at: int
    updated_at: int
    metadata: str = "{}"


@dataclass
class AssistantMessage:
    id: str
    assistant_session_id: str
    raw_conversation_id: str
    raw_message_id: Optional[str]
    role: str
    content: str
    content_type: str
    metadata: Optional[str]
    status: str
    created_at: int


class AssistantSessionStore:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, db_path: str | None = None):
        if hasattr(self, "_initialized"):
            return

        self.db_path = os.path.expanduser(db_path or resolve_app_db_path("assistant_sessions.db"))
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()
        self._initialized = True

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self) -> None:
        with self._get_conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS assistant_sessions (
                    id TEXT PRIMARY KEY,
                    raw_conversation_id TEXT NOT NULL UNIQUE,
                    cli_type TEXT NOT NULL,
                    raw_session_id TEXT NOT NULL,
                    title TEXT DEFAULT '',
                    last_message_preview TEXT DEFAULT '',
                    status TEXT DEFAULT 'active',
                    metadata TEXT DEFAULT '{}',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS assistant_messages (
                    id TEXT PRIMARY KEY,
                    assistant_session_id TEXT NOT NULL,
                    raw_conversation_id TEXT NOT NULL,
                    raw_message_id TEXT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    content_type TEXT DEFAULT 'text',
                    metadata TEXT,
                    status TEXT DEFAULT 'completed',
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (assistant_session_id) REFERENCES assistant_sessions(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_assistant_sessions_updated
                    ON assistant_sessions(updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_assistant_messages_session_time
                    ON assistant_messages(assistant_session_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_assistant_messages_raw_conv
                    ON assistant_messages(raw_conversation_id, created_at);
                """
            )
            self._ensure_column(conn, "assistant_messages", "raw_message_id", "TEXT")
            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_messages_raw_message
                ON assistant_messages(raw_message_id)
                """
            )

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    @staticmethod
    def _serialize_metadata(metadata: Optional[dict]) -> str:
        return json.dumps(metadata or {}, ensure_ascii=False)

    @staticmethod
    def _preview_for(content: str) -> str:
        preview = content.strip().replace("\n", " ")
        if len(preview) > 160:
            preview = f"{preview[:160]}..."
        return preview

    def upsert_session(
        self,
        *,
        raw_conversation_id: str,
        cli_type: str,
        raw_session_id: str,
        title: str = "",
        last_message_preview: Optional[str] = None,
        status: str = "active",
        created_at: Optional[int] = None,
        updated_at: Optional[int] = None,
        metadata: Optional[dict] = None,
    ) -> AssistantSession:
        now = int(datetime.now().timestamp() * 1000)
        normalized_created_at = created_at or now
        normalized_updated_at = updated_at or now

        with self._get_conn() as conn:
            existing = conn.execute(
                "SELECT * FROM assistant_sessions WHERE raw_conversation_id = ?",
                (raw_conversation_id,),
            ).fetchone()

            if existing:
                next_title = title or existing["title"]
                next_preview = (
                    existing["last_message_preview"]
                    if last_message_preview is None
                    else last_message_preview
                )
                next_metadata = (
                    existing["metadata"]
                    if metadata is None
                    else self._serialize_metadata(metadata)
                )
                conn.execute(
                    """
                    UPDATE assistant_sessions
                    SET cli_type = ?, raw_session_id = ?, title = ?, last_message_preview = ?, metadata = ?, status = ?, updated_at = ?
                    WHERE raw_conversation_id = ?
                    """,
                    (
                        cli_type,
                        raw_session_id,
                        next_title,
                        next_preview,
                        next_metadata,
                        status or existing["status"],
                        normalized_updated_at,
                        raw_conversation_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO assistant_sessions (
                        id, raw_conversation_id, cli_type, raw_session_id, title, last_message_preview, status, metadata, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        raw_conversation_id,
                        cli_type,
                        raw_session_id,
                        title,
                        last_message_preview or "",
                        status,
                        self._serialize_metadata(metadata),
                        normalized_created_at,
                        normalized_updated_at,
                    ),
                )

        return self.get_session_by_raw_conversation(raw_conversation_id)

    def get_session(self, session_id: str) -> Optional[AssistantSession]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM assistant_sessions WHERE id = ?",
                (session_id,),
            ).fetchone()
        return AssistantSession(**dict(row)) if row else None

    def get_session_by_raw_conversation(self, raw_conversation_id: str) -> Optional[AssistantSession]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM assistant_sessions WHERE raw_conversation_id = ?",
                (raw_conversation_id,),
            ).fetchone()
        return AssistantSession(**dict(row)) if row else None

    def list_sessions(self, limit: int = 50, offset: int = 0) -> list[AssistantSession]:
        with self._get_conn() as conn:
            rows = conn.execute(
                """
                SELECT * FROM assistant_sessions
                WHERE status = 'active'
                ORDER BY updated_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        return [AssistantSession(**dict(row)) for row in rows]

    def count_sessions(self) -> int:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS count FROM assistant_sessions WHERE status = 'active'"
            ).fetchone()
        return int(row["count"]) if row else 0

    def touch_session_by_raw_conversation(
        self,
        raw_conversation_id: str,
        *,
        title: Optional[str] = None,
        last_message_preview: Optional[str] = None,
        updated_at: Optional[int] = None,
    ) -> None:
        now = updated_at or int(datetime.now().timestamp() * 1000)
        with self._get_conn() as conn:
            session = conn.execute(
                "SELECT title, last_message_preview FROM assistant_sessions WHERE raw_conversation_id = ?",
                (raw_conversation_id,),
            ).fetchone()
            if not session:
                return
            conn.execute(
                """
                UPDATE assistant_sessions
                SET title = ?, last_message_preview = ?, updated_at = ?
                WHERE raw_conversation_id = ?
                """,
                (
                    title if title is not None else session["title"],
                    last_message_preview if last_message_preview is not None else session["last_message_preview"],
                    now,
                    raw_conversation_id,
                ),
            )

    def add_message_by_raw_conversation(
        self,
        raw_conversation_id: str,
        *,
        role: str,
        content: str,
        raw_message_id: Optional[str] = None,
        content_type: str = "text",
        metadata: Optional[dict] = None,
        status: str = "completed",
        created_at: Optional[int] = None,
    ) -> Optional[str]:
        session = self.get_session_by_raw_conversation(raw_conversation_id)
        if not session:
            return None

        existing_message_id: Optional[str] = None
        if raw_message_id:
            with self._get_conn() as conn:
                existing = conn.execute(
                    "SELECT id FROM assistant_messages WHERE raw_message_id = ?",
                    (raw_message_id,),
                ).fetchone()
            if existing:
                existing_message_id = str(existing["id"])

        if existing_message_id:
            return existing_message_id

        now = created_at or int(datetime.now().timestamp() * 1000)
        message_id = str(uuid.uuid4())
        preview = self._preview_for(content)

        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO assistant_messages (
                    id, assistant_session_id, raw_conversation_id, raw_message_id, role, content, content_type, metadata, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message_id,
                    session.id,
                    raw_conversation_id,
                    raw_message_id,
                    role,
                    content,
                    content_type,
                    self._serialize_metadata(metadata) if metadata else None,
                    status,
                    now,
                ),
            )
            conn.execute(
                """
                UPDATE assistant_sessions
                SET last_message_preview = ?, updated_at = ?
                WHERE id = ?
                """,
                (preview, now, session.id),
            )

        return message_id

    def list_messages(self, session_id: str, limit: int = 100) -> list[AssistantMessage]:
        with self._get_conn() as conn:
            rows = conn.execute(
                """
                SELECT * FROM assistant_messages
                WHERE assistant_session_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()

        messages = [AssistantMessage(**dict(row)) for row in rows]
        messages.reverse()
        return messages

    def delete_session(self, session_id: str) -> None:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM assistant_sessions WHERE id = ?", (session_id,))

    def delete_session_by_raw_conversation(self, raw_conversation_id: str) -> None:
        with self._get_conn() as conn:
            conn.execute(
                "DELETE FROM assistant_sessions WHERE raw_conversation_id = ?",
                (raw_conversation_id,),
            )


assistant_session_store = AssistantSessionStore()
