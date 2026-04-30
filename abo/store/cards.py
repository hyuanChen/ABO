import json
import sqlite3
from pathlib import Path

from ..storage_paths import resolve_app_db_path
from ..sdk.types import Card

_DB_PATH = Path(resolve_app_db_path("cards.db"))

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
CREATE INDEX IF NOT EXISTS idx_created_at ON cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score ON cards(score DESC);

CREATE TABLE IF NOT EXISTS crawl_records (
    record_key     TEXT PRIMARY KEY,
    module_id      TEXT NOT NULL,
    card_id        TEXT NOT NULL,
    content_id     TEXT,
    title          TEXT NOT NULL,
    summary        TEXT,
    score          REAL,
    source_url     TEXT,
    obsidian_path  TEXT,
    tags           TEXT,
    crawl_source   TEXT,
    author         TEXT,
    published      TEXT,
    metadata       TEXT,
    first_seen_at  REAL NOT NULL,
    last_seen_at   REAL NOT NULL,
    seen_count     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_crawl_records_last_seen ON crawl_records(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_records_module_last_seen ON crawl_records(module_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_records_content_id ON crawl_records(content_id);
CREATE INDEX IF NOT EXISTS idx_crawl_records_module_content_id ON crawl_records(module_id, content_id);
CREATE INDEX IF NOT EXISTS idx_crawl_records_module_source_url ON crawl_records(module_id, source_url);
"""

_CRAWL_RECORD_MIGRATION_COLUMNS = {
    "processed": "INTEGER NOT NULL DEFAULT 0",
    "processed_at": "REAL",
    "handled_feedback": "TEXT",
}

_PAPER_SCOPE_MODULE_IDS = (
    "arxiv-tracker",
    "semantic-scholar-tracker",
)


def _clean_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _normalize_string_list(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, (list, tuple, set)):
        items = list(value)
    else:
        items = [value]

    result: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = _clean_str(item)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def _derive_content_id(card: Card) -> str:
    meta = card.metadata or {}
    candidates = [
        meta.get("entry-id"),
        meta.get("content_id"),
        meta.get("paperId"),
        meta.get("note_id"),
        meta.get("noteId"),
        meta.get("note-id"),
        meta.get("paper_id"),
        meta.get("paper-id"),
        meta.get("arxiv_id"),
        meta.get("arxiv-id"),
        meta.get("dynamic_id"),
        meta.get("bvid"),
        meta.get("aid"),
        meta.get("video_id"),
        meta.get("video-id"),
        meta.get("oid"),
        card.id,
    ]
    for candidate in candidates:
        text = _clean_str(candidate)
        if text:
            return text
    return card.id


def _derive_author(card: Card) -> str:
    meta = card.metadata or {}
    for key in ("author", "author_name", "up_name", "creator", "creator_name", "user_nickname"):
        text = _clean_str(meta.get(key))
        if text:
            return text

    authors = meta.get("authors")
    if isinstance(authors, list) and authors:
        return _clean_str(authors[0])
    return ""


def _derive_published(card: Card) -> str:
    meta = card.metadata or {}
    for key in ("published", "created_at", "publish_time", "pubdate", "display_time"):
        text = _clean_str(meta.get(key))
        if text:
            return text
    return ""


def _derive_crawl_source(card: Card) -> str:
    meta = card.metadata or {}
    for key in ("crawl_source", "platform", "source-platform", "source-module", "paper_tracking_type", "relationship"):
        text = _clean_str(meta.get(key))
        if text:
            return text
    return card.module_id


def _record_key(card: Card) -> str:
    return f"{card.module_id}:{card.id}"


def _module_scope_ids(card: Card) -> list[str]:
    module_id = _clean_str(card.module_id)
    meta = card.metadata or {}
    if module_id in _PAPER_SCOPE_MODULE_IDS:
        return list(_PAPER_SCOPE_MODULE_IDS)

    paper_identity_keys = (
        "paper_tracking_type",
        "paper_tracking_role",
        "paper_id",
        "paper-id",
        "paperId",
        "arxiv_id",
        "arxiv-id",
    )
    if any(_clean_str(meta.get(key)) for key in paper_identity_keys):
        return list(_PAPER_SCOPE_MODULE_IDS)

    return [module_id] if module_id else []


class CardStore:
    def __init__(self, db_path: Path = _DB_PATH):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = db_path
        with self._conn() as conn:
            conn.executescript(_DDL)
            self._ensure_crawl_record_columns(conn)
            self._prune_legacy_semantic_scholar_tracker_cards(conn)
            self._backfill_crawl_records(conn)
            self._backfill_processed_history(conn)

    def _conn(self):
        return sqlite3.connect(self._db)

    def save(self, card: Card):
        with self._conn() as conn:
            existing = conn.execute(
                "SELECT read, feedback FROM cards WHERE id=?",
                (card.id,),
            ).fetchone()
            existing_read = int(existing[0]) if existing else 0
            existing_feedback = _clean_str(existing[1]) if existing else ""
            handled_state = self._get_processed_identity_state(conn, card)
            should_mark_read = bool(existing_read or handled_state["processed"])
            conn.execute(
                """INSERT OR REPLACE INTO cards
                   (id, module_id, title, summary, score, tags, source_url,
                    obsidian_path, metadata, created_at, read, feedback)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (card.id, card.module_id, card.title, card.summary, card.score,
                 json.dumps(card.tags, ensure_ascii=False),
                 card.source_url, card.obsidian_path,
                 json.dumps(card.metadata, ensure_ascii=False),
                 card.created_at,
                 1 if should_mark_read else 0,
                 existing_feedback or None)
            )
            self._save_crawl_record(
                conn,
                card,
                processed=should_mark_read,
                handled_feedback=handled_state["handled_feedback"] or existing_feedback or None,
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

    def record_feedback(self, card_id: str, action: str) -> list[str]:
        card = self.get(card_id)
        if not card:
            return []
        with self._conn() as conn:
            conn.execute("UPDATE cards SET feedback=?, read=1 WHERE id=?",
                         (action, card_id))
            affected_ids = self._mark_processed_identity(conn, card, handled_feedback=action)
        return affected_ids

    def is_unread(self, card_id: str) -> bool:
        with self._conn() as conn:
            row = conn.execute("SELECT read FROM cards WHERE id=?", (card_id,)).fetchone()
        return bool(row) and int(row[0] or 0) == 0

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

    def list_created_between(
        self,
        start_ts: float,
        end_ts: float,
        limit: int = 50,
    ) -> list[Card]:
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT * FROM cards
                WHERE created_at >= ? AND created_at < ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (start_ts, end_ts, limit),
            ).fetchall()
        return [self._row_to_card(r) for r in rows]

    def list_crawl_records(
        self,
        module_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        sql = """
            SELECT
                record_key, module_id, card_id, content_id, title, summary, score,
                source_url, obsidian_path, tags, crawl_source, author, published,
                metadata, first_seen_at, last_seen_at, seen_count
            FROM crawl_records
            WHERE 1=1
        """
        params: list = []
        if module_id:
            sql += " AND module_id=?"
            params.append(module_id)
        sql += " ORDER BY last_seen_at DESC LIMIT ? OFFSET ?"
        params += [limit, offset]

        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()

        return [
            {
                "record_key": row[0],
                "module_id": row[1],
                "card_id": row[2],
                "content_id": row[3],
                "title": row[4],
                "summary": row[5] or "",
                "score": row[6] or 0.0,
                "source_url": row[7] or "",
                "obsidian_path": row[8] or "",
                "tags": json.loads(row[9] or "[]"),
                "crawl_source": row[10] or "",
                "author": row[11] or "",
                "published": row[12] or "",
                "metadata": json.loads(row[13] or "{}"),
                "first_seen_at": row[14] or 0.0,
                "last_seen_at": row[15] or 0.0,
                "seen_count": row[16] or 0,
            }
            for row in rows
        ]

    def count_crawl_records(self, module_id: str | None = None) -> int:
        sql = "SELECT COUNT(*) FROM crawl_records WHERE 1=1"
        params: list = []
        if module_id:
            sql += " AND module_id=?"
            params.append(module_id)
        with self._conn() as conn:
            row = conn.execute(sql, params).fetchone()
        return int(row[0]) if row else 0

    def has_crawl_record(
        self,
        *,
        module_ids: str | list[str] | tuple[str, ...] | set[str] | None = None,
        content_id: str | None = None,
        source_url: str | None = None,
    ) -> bool:
        normalized_module_ids = _normalize_string_list(module_ids)
        normalized_content_id = _clean_str(content_id)
        normalized_source_url = _clean_str(source_url)

        if not normalized_content_id and not normalized_source_url:
            return False

        sql = "SELECT 1 FROM crawl_records WHERE 1=1"
        params: list[str] = []
        if normalized_module_ids:
            placeholders = ",".join("?" for _ in normalized_module_ids)
            sql += f" AND module_id IN ({placeholders})"
            params.extend(normalized_module_ids)

        if normalized_content_id and normalized_source_url:
            sql += (
                " AND ("
                "lower(content_id)=lower(?)"
                " OR source_url=?"
                ")"
            )
            params.extend([normalized_content_id, normalized_source_url])
        elif normalized_content_id:
            sql += " AND lower(content_id)=lower(?)"
            params.append(normalized_content_id)
        else:
            sql += " AND source_url=?"
            params.append(normalized_source_url)

        sql += " LIMIT 1"
        with self._conn() as conn:
            row = conn.execute(sql, params).fetchone()
        return bool(row)

    def has_processed_crawl_record(
        self,
        *,
        module_ids: str | list[str] | tuple[str, ...] | set[str] | None = None,
        content_id: str | None = None,
        source_url: str | None = None,
    ) -> bool:
        normalized_module_ids = _normalize_string_list(module_ids)
        normalized_content_id = _clean_str(content_id)
        normalized_source_url = _clean_str(source_url)

        if not normalized_content_id and not normalized_source_url:
            return False

        sql = "SELECT 1 FROM crawl_records WHERE processed=1"
        params: list[str] = []
        if normalized_module_ids:
            placeholders = ",".join("?" for _ in normalized_module_ids)
            sql += f" AND module_id IN ({placeholders})"
            params.extend(normalized_module_ids)

        if normalized_content_id and normalized_source_url:
            sql += (
                " AND ("
                "lower(content_id)=lower(?)"
                " OR source_url=?"
                ")"
            )
            params.extend([normalized_content_id, normalized_source_url])
        elif normalized_content_id:
            sql += " AND lower(content_id)=lower(?)"
            params.append(normalized_content_id)
        else:
            sql += " AND source_url=?"
            params.append(normalized_source_url)

        sql += " LIMIT 1"
        with self._conn() as conn:
            row = conn.execute(sql, params).fetchone()
        return bool(row)

    def existing_content_ids(
        self,
        *,
        module_ids: str | list[str] | tuple[str, ...] | set[str] | None = None,
    ) -> set[str]:
        normalized_module_ids = _normalize_string_list(module_ids)

        sql = "SELECT DISTINCT content_id FROM crawl_records WHERE content_id IS NOT NULL AND content_id != ''"
        params: list[str] = []
        if normalized_module_ids:
            placeholders = ",".join("?" for _ in normalized_module_ids)
            sql += f" AND module_id IN ({placeholders})"
            params.extend(normalized_module_ids)

        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()

        return {
            content_id
            for row in rows
            if (content_id := _clean_str(row[0]))
        }

    def existing_processed_content_ids(
        self,
        *,
        module_ids: str | list[str] | tuple[str, ...] | set[str] | None = None,
    ) -> set[str]:
        normalized_module_ids = _normalize_string_list(module_ids)

        sql = (
            "SELECT DISTINCT content_id FROM crawl_records "
            "WHERE processed=1 AND content_id IS NOT NULL AND content_id != ''"
        )
        params: list[str] = []
        if normalized_module_ids:
            placeholders = ",".join("?" for _ in normalized_module_ids)
            sql += f" AND module_id IN ({placeholders})"
            params.extend(normalized_module_ids)

        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()

        return {
            content_id
            for row in rows
            if (content_id := _clean_str(row[0]))
        }

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

    def _ensure_crawl_record_columns(self, conn: sqlite3.Connection) -> None:
        existing_columns = {
            str(row[1]).strip()
            for row in conn.execute("PRAGMA table_info(crawl_records)").fetchall()
        }
        for column_name, column_sql in _CRAWL_RECORD_MIGRATION_COLUMNS.items():
            if column_name in existing_columns:
                continue
            conn.execute(f"ALTER TABLE crawl_records ADD COLUMN {column_name} {column_sql}")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_crawl_records_processed ON crawl_records(processed, last_seen_at DESC)"
        )

    def _build_identity_match_clause(
        self,
        *,
        module_ids: list[str],
        content_id: str,
        source_url: str,
    ) -> tuple[str, list[str]]:
        normalized_module_ids = _normalize_string_list(module_ids)
        normalized_content_id = _clean_str(content_id)
        normalized_source_url = _clean_str(source_url)
        if not normalized_module_ids or (not normalized_content_id and not normalized_source_url):
            return "", []

        sql = ""
        params: list[str] = []
        placeholders = ",".join("?" for _ in normalized_module_ids)
        sql += f" module_id IN ({placeholders})"
        params.extend(normalized_module_ids)

        if normalized_content_id and normalized_source_url:
            sql += " AND (lower(content_id)=lower(?) OR source_url=?)"
            params.extend([normalized_content_id, normalized_source_url])
        elif normalized_content_id:
            sql += " AND lower(content_id)=lower(?)"
            params.append(normalized_content_id)
        else:
            sql += " AND source_url=?"
            params.append(normalized_source_url)

        return sql, params

    def _get_processed_identity_state(
        self,
        conn: sqlite3.Connection,
        card: Card,
    ) -> dict[str, object]:
        where_sql, params = self._build_identity_match_clause(
            module_ids=_module_scope_ids(card),
            content_id=_derive_content_id(card),
            source_url=card.source_url,
        )
        if not where_sql:
            return {"processed": False, "handled_feedback": None}

        row = conn.execute(
            f"""
            SELECT processed, handled_feedback
            FROM crawl_records
            WHERE {where_sql} AND processed=1
            ORDER BY COALESCE(processed_at, last_seen_at) DESC, last_seen_at DESC
            LIMIT 1
            """,
            params,
        ).fetchone()
        if not row:
            return {"processed": False, "handled_feedback": None}
        return {
            "processed": bool(int(row[0] or 0)),
            "handled_feedback": _clean_str(row[1]) or None,
        }

    def _mark_processed_identity(
        self,
        conn: sqlite3.Connection,
        card: Card,
        *,
        handled_feedback: str | None = None,
    ) -> list[str]:
        where_sql, params = self._build_identity_match_clause(
            module_ids=_module_scope_ids(card),
            content_id=_derive_content_id(card),
            source_url=card.source_url,
        )
        if not where_sql:
            return [card.id]

        import time
        processed_at = time.time()

        conn.execute(
            f"""
            UPDATE crawl_records
            SET processed=1,
                processed_at=?,
                handled_feedback=?
            WHERE {where_sql}
            """,
            [processed_at, _clean_str(handled_feedback) or None, *params],
        )

        rows = conn.execute(
            f"SELECT DISTINCT card_id FROM crawl_records WHERE {where_sql}",
            params,
        ).fetchall()
        matched_ids = [
            _clean_str(row[0])
            for row in rows
            if _clean_str(row[0])
        ]
        sibling_ids = [candidate_id for candidate_id in matched_ids if candidate_id != card.id]
        if sibling_ids:
            placeholders = ",".join("?" for _ in sibling_ids)
            conn.execute(
                f"UPDATE cards SET read=1 WHERE id IN ({placeholders})",
                sibling_ids,
            )

        return [card.id, *sibling_ids]

    def _save_crawl_record(
        self,
        conn: sqlite3.Connection,
        card: Card,
        *,
        processed: bool = False,
        handled_feedback: str | None = None,
    ) -> None:
        if (card.metadata or {}).get("demo"):
            return

        observed_at = float(card.created_at or 0.0) or 0.0
        if observed_at <= 0:
            observed_at = 0.0

        key = _record_key(card)
        existing = conn.execute(
            "SELECT first_seen_at, seen_count, processed, handled_feedback, processed_at FROM crawl_records WHERE record_key=?",
            (key,),
        ).fetchone()

        first_seen_at = existing[0] if existing else observed_at
        seen_count = (existing[1] if existing else 0) + 1
        prior_state = self._get_processed_identity_state(conn, card)
        effective_processed = bool(
            processed
            or (existing and int(existing[2] or 0))
            or prior_state["processed"]
        )
        effective_feedback = (
            _clean_str(handled_feedback)
            or (existing and _clean_str(existing[3]))
            or _clean_str(prior_state["handled_feedback"])
            or None
        )
        existing_processed_at = existing[4] if existing else None
        tags = _normalize_string_list(card.tags)

        conn.execute(
            """
            INSERT OR REPLACE INTO crawl_records (
                record_key, module_id, card_id, content_id, title, summary, score,
                source_url, obsidian_path, tags, crawl_source, author, published,
                metadata, first_seen_at, last_seen_at, seen_count, processed,
                processed_at, handled_feedback
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                key,
                card.module_id,
                card.id,
                _derive_content_id(card),
                card.title,
                card.summary,
                card.score,
                card.source_url,
                card.obsidian_path,
                json.dumps(tags, ensure_ascii=False),
                _derive_crawl_source(card),
                _derive_author(card),
                _derive_published(card),
                json.dumps(card.metadata, ensure_ascii=False),
                first_seen_at,
                observed_at,
                seen_count,
                1 if effective_processed else 0,
                existing_processed_at if existing_processed_at is not None else (observed_at if effective_processed else None),
                effective_feedback,
            ),
        )

    def _prune_legacy_semantic_scholar_tracker_cards(self, conn: sqlite3.Connection) -> None:
        # Legacy Semantic Scholar feed cards used the s2-citation-* shape and do not
        # carry the paper-tracking metadata required by the shared follow-up flow.
        conn.execute(
            """
            DELETE FROM crawl_records
            WHERE module_id='semantic-scholar-tracker'
              AND card_id LIKE 's2-citation-%'
            """
        )
        conn.execute(
            """
            DELETE FROM cards
            WHERE module_id='semantic-scholar-tracker'
              AND id LIKE 's2-citation-%'
            """
        )

    def _backfill_crawl_records(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute(
            """
            SELECT id, module_id, title, summary, score, tags, source_url,
                   obsidian_path, metadata, created_at
            FROM cards
            """
        ).fetchall()

        for row in rows:
            record_key = f"{row[1]}:{row[0]}"
            exists = conn.execute(
                "SELECT 1 FROM crawl_records WHERE record_key=?",
                (record_key,),
            ).fetchone()
            if exists:
                continue
            self._save_crawl_record(conn, self._row_to_card(row))

    def _backfill_processed_history(self, conn: sqlite3.Connection) -> None:
        processed_rows = conn.execute(
            """
            SELECT id, module_id, title, summary, score, tags, source_url,
                   obsidian_path, metadata, created_at, read, feedback
            FROM cards
            WHERE read=1 OR COALESCE(feedback, '') != ''
            """
        ).fetchall()
        for row in processed_rows:
            card = self._row_to_card(row[:10])
            handled_feedback = _clean_str(row[11]) or None
            self._mark_processed_identity(conn, card, handled_feedback=handled_feedback)

        unread_rows = conn.execute(
            """
            SELECT id, module_id, title, summary, score, tags, source_url,
                   obsidian_path, metadata, created_at
            FROM cards
            WHERE read=0
            """
        ).fetchall()
        for row in unread_rows:
            card = self._row_to_card(row)
            prior_state = self._get_processed_identity_state(conn, card)
            if not prior_state["processed"]:
                continue
            conn.execute("UPDATE cards SET read=1 WHERE id=?", (card.id,))
            self._save_crawl_record(
                conn,
                card,
                processed=True,
                handled_feedback=_clean_str(prior_state["handled_feedback"]) or None,
            )

    def get_prioritized(
        self,
        keyword_scores: dict[str, float],
        limit: int = 50,
        unread_only: bool = False,
    ) -> list[Card]:
        """Get cards sorted by combined AI score + positive user preference score.

        Args:
            keyword_scores: Dictionary of keyword -> positive preference score
            limit: Maximum number of cards to return
            unread_only: Only return unread cards

        Returns:
            List of cards sorted by combined score (descending)
        """
        cards = self.list(limit=limit * 2, unread_only=unread_only)

        def calculate_combined_score(card: Card) -> float:
            """Combine AI score with positive user preference scores."""
            base_score = card.score  # AI relevance score (0-1)

            # Positive signals can boost a card forward, but negative signals do not suppress it for now.
            pref_score = 0.0
            if card.tags and keyword_scores:
                for tag in card.tags:
                    tag_lower = tag.lower()
                    if tag_lower in keyword_scores:
                        pref_score += max(0.0, keyword_scores[tag_lower])

            normalized_pref = min(0.35, pref_score * 0.12)

            # Combined score: 70% AI score, 30% preference influence
            return base_score * 0.7 + (base_score + normalized_pref) * 0.3

        # Sort by combined score descending
        cards.sort(key=calculate_combined_score, reverse=True)
        return cards[:limit]
