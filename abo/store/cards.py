import json
import sqlite3
from pathlib import Path
from ..sdk.types import Card

_DB_PATH = Path.home() / ".abo" / "data" / "cards.db"

_DDL = """
CREATE TABLE IF NOT EXISTS cards (
    id            TEXT PRIMARY KEY,
    module_id     TEXT NOT NULL,
    title         TEXT NOT NULL,
    summary       TEXT,
    score         REAL,
    tags          TEXT,
    source_url    TEXT,
    obsidian_path TEXT,
    metadata      TEXT,
    created_at    REAL,
    read          INTEGER DEFAULT 0,
    feedback      TEXT
);
CREATE INDEX IF NOT EXISTS idx_module ON cards(module_id);
CREATE INDEX IF NOT EXISTS idx_unread ON cards(read, created_at DESC);
"""


class CardStore:
    def __init__(self, db_path: Path = _DB_PATH):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = db_path
        with self._conn() as conn:
            conn.executescript(_DDL)

    def _conn(self):
        return sqlite3.connect(self._db)

    def save(self, card: Card):
        with self._conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO cards
                   (id, module_id, title, summary, score, tags, source_url,
                    obsidian_path, metadata, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (card.id, card.module_id, card.title, card.summary, card.score,
                 json.dumps(card.tags, ensure_ascii=False),
                 card.source_url, card.obsidian_path,
                 json.dumps(card.metadata, ensure_ascii=False),
                 card.created_at)
            )

    def get(self, card_id: str) -> Card | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
        return self._row_to_card(row) if row else None

    def list(self, module_id: str | None = None, unread_only: bool = False,
             limit: int = 50, offset: int = 0) -> list[Card]:
        sql = "SELECT * FROM cards WHERE 1=1"
        params: list = []
        if module_id:
            sql += " AND module_id=?"
            params.append(module_id)
        if unread_only:
            sql += " AND read=0"
        sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params += [limit, offset]
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_card(r) for r in rows]

    def mark_read(self, card_id: str):
        with self._conn() as conn:
            conn.execute("UPDATE cards SET read=1 WHERE id=?", (card_id,))

    def record_feedback(self, card_id: str, action: str):
        with self._conn() as conn:
            conn.execute("UPDATE cards SET feedback=?, read=1 WHERE id=?",
                         (action, card_id))

    def count_feedback(self, module_id: str, action: str) -> int:
        """Count cards from a module that received a specific feedback action."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM cards WHERE module_id=? AND feedback=?",
                (module_id, action),
            ).fetchone()
            return row[0] if row else 0

    def unread_counts(self) -> dict[str, int]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT module_id, COUNT(*) FROM cards WHERE read=0 GROUP BY module_id"
            ).fetchall()
        return {r[0]: r[1] for r in rows}

    def _row_to_card(self, row) -> Card:
        return Card(
            id=row[0], module_id=row[1], title=row[2],
            summary=row[3] or "",
            score=row[4] or 0.0,
            tags=json.loads(row[5] or "[]"),
            source_url=row[6] or "",
            obsidian_path=row[7] or "",
            metadata=json.loads(row[8] or "{}"),
            created_at=row[9] or 0.0,
        )
