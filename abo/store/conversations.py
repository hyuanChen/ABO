"""对话历史存储 - SQLite"""
import sqlite3
import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List


@dataclass
class Message:
    id: str
    conversation_id: str
    role: str
    content: str
    msg_id: Optional[str] = None
    metadata: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class Conversation:
    id: str
    cli_type: str
    session_id: str
    title: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ConversationStore:
    def __init__(self, db_path: str = "~/.abo/data/conversations.db"):
        self.db_path = os.path.expanduser(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    cli_type TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    title TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    msg_id TEXT,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
                );

                CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
                CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at);
            """)

    def create_conversation(self, cli_type: str, session_id: str, title: str = "") -> str:
        conv_id = str(uuid.uuid4())
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO conversations (id, cli_type, session_id, title) VALUES (?, ?, ?, ?)",
                (conv_id, cli_type, session_id, title or f"New {cli_type} chat")
            )
        return conv_id

    def add_message(self, conv_id: str, role: str, content: str,
                    msg_id: Optional[str] = None, metadata: Optional[dict] = None):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO messages (id, conversation_id, role, content, msg_id, metadata)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), conv_id, role, content, msg_id,
                 json.dumps(metadata) if metadata else None)
            )
            conn.execute(
                "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (conv_id,)
            )

    def get_messages(self, conv_id: str, limit: int = 100) -> List[Message]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT * FROM messages WHERE conversation_id = ?
                   ORDER BY created_at ASC LIMIT ?""",
                (conv_id, limit)
            ).fetchall()
            return [
                Message(
                    id=row['id'],
                    conversation_id=row['conversation_id'],
                    role=row['role'],
                    content=row['content'],
                    msg_id=row['msg_id'],
                    metadata=row['metadata'],
                    created_at=row['created_at']
                )
                for row in rows
            ]

    def list_conversations(self, cli_type: Optional[str] = None) -> List[Conversation]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            if cli_type:
                rows = conn.execute(
                    """SELECT * FROM conversations WHERE cli_type = ?
                       ORDER BY updated_at DESC""",
                    (cli_type,)
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT * FROM conversations ORDER BY updated_at DESC"""
                ).fetchall()
            return [
                Conversation(
                    id=row['id'],
                    cli_type=row['cli_type'],
                    session_id=row['session_id'],
                    title=row['title'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                )
                for row in rows
            ]

    def get_conversation(self, conv_id: str) -> Optional[Conversation]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?",
                (conv_id,)
            ).fetchone()
            if row:
                return Conversation(
                    id=row['id'],
                    cli_type=row['cli_type'],
                    session_id=row['session_id'],
                    title=row['title'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                )
            return None

    def delete_conversation(self, conv_id: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "DELETE FROM conversations WHERE id = ?",
                (conv_id,)
            )
            return cursor.rowcount > 0

    def update_title(self, conv_id: str, title: str):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (title, conv_id)
            )
