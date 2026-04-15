import hashlib
import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Any, Mapping

from ..config import get_abo_dir
from ..sdk.types import Card

_DB_PATH = get_abo_dir() / "data" / "papers.db"

_DDL = """
CREATE TABLE IF NOT EXISTS papers (
    paper_key          TEXT PRIMARY KEY,
    canonical_id       TEXT NOT NULL,
    title              TEXT NOT NULL,
    summary            TEXT,
    abstract           TEXT,
    authors            TEXT,
    author_count       INTEGER,
    year               INTEGER,
    published          TEXT,
    updated            TEXT,
    venue              TEXT,
    source_type        TEXT,
    source_module      TEXT,
    source_modules     TEXT,
    source_url         TEXT,
    arxiv_id           TEXT,
    arxiv_url          TEXT,
    pdf_url            TEXT,
    html_url           TEXT,
    s2_paper_id        TEXT,
    s2_url             TEXT,
    categories         TEXT,
    keywords           TEXT,
    tags               TEXT,
    figures            TEXT,
    local_figures      TEXT,
    citation_count     INTEGER,
    reference_count    INTEGER,
    contribution       TEXT,
    relationship       TEXT,
    relationship_label TEXT,
    source_paper_title TEXT,
    source_arxiv_id    TEXT,
    obsidian_path      TEXT,
    literature_path    TEXT,
    saved_to_literature INTEGER DEFAULT 0,
    score              REAL,
    metadata           TEXT,
    raw_payload        TEXT,
    created_at         REAL,
    updated_at         REAL,
    last_seen_at       REAL
);
CREATE INDEX IF NOT EXISTS idx_papers_updated_at ON papers(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_source_module ON papers(source_module, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_saved ON papers(saved_to_literature, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_arxiv_id ON papers(arxiv_id);
CREATE INDEX IF NOT EXISTS idx_papers_s2_paper_id ON papers(s2_paper_id);
"""

_ARXIV_ID_RE = re.compile(
    r"(?:(?:arxiv\.org/(?:abs|pdf|html)/)|^)?([a-z\-]+/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?",
    re.IGNORECASE,
)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _json_loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _clean_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _first_non_empty(*values: Any) -> str:
    for value in values:
        text = _clean_str(value)
        if text:
            return text
    return ""


def _normalize_string_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, (list, tuple, set)):
        raw_items = list(value)
    else:
        raw_items = [value]

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        text = _clean_str(item)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(text)
    return normalized


def _normalize_object_list(value: Any) -> list[dict[str, Any]]:
    if not value:
        return []
    if not isinstance(value, (list, tuple)):
        return []

    normalized: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, Mapping):
            normalized.append(dict(item))
    return normalized


def _merge_unique_strings(old: list[str], new: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for item in [*old, *new]:
        text = _clean_str(item)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        merged.append(text)
    return merged


def _coerce_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_arxiv_id(*values: Any) -> str:
    for value in values:
        text = _clean_str(value)
        if not text:
            continue
        match = _ARXIV_ID_RE.search(text)
        if match:
            return match.group(1)
    return ""


def _derive_year(year_value: Any, published: str) -> int | None:
    year = _coerce_int(year_value)
    if year:
        return year
    if published and len(published) >= 4:
        prefix = published[:4]
        parsed = _coerce_int(prefix)
        if parsed:
            return parsed
    return None


def _hash_identity(title: str, authors: list[str], source_url: str) -> str:
    payload = "|".join([title, ",".join(authors), source_url])
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def _build_paper_key(arxiv_id: str, s2_paper_id: str, source_url: str, title: str, authors: list[str]) -> tuple[str, str]:
    if arxiv_id:
        return f"arxiv:{arxiv_id}", arxiv_id
    if s2_paper_id:
        return f"s2:{s2_paper_id}", s2_paper_id
    if source_url:
        digest = hashlib.sha1(source_url.encode("utf-8")).hexdigest()[:16]
        return f"url:{digest}", source_url
    digest = _hash_identity(title, authors, source_url)
    return f"title:{digest}", digest


def _infer_source_type(metadata: Mapping[str, Any], arxiv_id: str, s2_paper_id: str, source_url: str) -> str:
    abo_type = _clean_str(metadata.get("abo-type")).lower()
    if "arxiv" in abo_type or arxiv_id or "arxiv.org" in source_url:
        return "arxiv"
    if "semantic" in abo_type or s2_paper_id or "semanticscholar.org" in source_url:
        return "semantic-scholar"
    return "paper"


def _is_paper_like(
    metadata: Mapping[str, Any],
    arxiv_id: str,
    s2_paper_id: str,
    source_url: str,
    authors: list[str],
    published: str,
    venue: str,
    abstract: str,
) -> bool:
    abo_type = _clean_str(metadata.get("abo-type")).lower()
    if "paper" in abo_type or "arxiv" in abo_type or "semantic" in abo_type:
        return True
    if arxiv_id or s2_paper_id:
        return True
    if "arxiv.org" in source_url or "semanticscholar.org" in source_url:
        return True
    if authors and (published or venue or abstract):
        return True
    return False


def _normalize_payload(payload: Mapping[str, Any], source_module: str | None = None) -> dict[str, Any] | None:
    metadata = dict(payload.get("metadata") or {})
    title = _first_non_empty(payload.get("title"), metadata.get("title"))
    if not title:
        return None

    authors = _normalize_string_list(payload.get("authors") or metadata.get("authors"))
    summary = _first_non_empty(payload.get("summary"), metadata.get("summary"))
    abstract = _first_non_empty(payload.get("abstract"), metadata.get("abstract"), summary)
    published = _first_non_empty(payload.get("published"), metadata.get("published"))
    updated = _first_non_empty(payload.get("updated"), metadata.get("updated"))
    year = _derive_year(payload.get("year", metadata.get("year")), published)
    venue = _first_non_empty(payload.get("venue"), metadata.get("venue"))

    source_url = _first_non_empty(
        payload.get("source_url"),
        payload.get("arxiv_url"),
        metadata.get("arxiv_url"),
        metadata.get("s2_url"),
        payload.get("url"),
    )
    arxiv_id = _extract_arxiv_id(
        payload.get("id"),
        payload.get("arxiv_id"),
        metadata.get("arxiv_id"),
        metadata.get("arxiv-id"),
        payload.get("arxiv_url"),
        metadata.get("arxiv_url"),
        metadata.get("html-url"),
        payload.get("pdf_url"),
        metadata.get("pdf-url"),
        source_url,
    )
    s2_paper_id = _first_non_empty(payload.get("paper_id"), metadata.get("paper_id"), metadata.get("paper-id"))
    arxiv_url = _first_non_empty(payload.get("arxiv_url"), metadata.get("arxiv_url"))
    pdf_url = _first_non_empty(payload.get("pdf_url"), payload.get("pdf-url"), metadata.get("pdf_url"), metadata.get("pdf-url"))
    html_url = _first_non_empty(payload.get("html_url"), payload.get("html-url"), metadata.get("html_url"), metadata.get("html-url"))
    s2_url = _first_non_empty(payload.get("s2_url"), metadata.get("s2_url"))

    categories = _normalize_string_list(
        payload.get("categories")
        or metadata.get("categories")
        or metadata.get("fields_of_study")
        or metadata.get("primary_category")
    )
    keywords = _normalize_string_list(payload.get("keywords") or metadata.get("keywords"))
    tags = _normalize_string_list(payload.get("tags"))
    figures = _normalize_object_list(payload.get("figures") or metadata.get("figures"))
    local_figures = _normalize_object_list(payload.get("local_figures") or metadata.get("local_figures"))

    source_module_value = _first_non_empty(
        source_module,
        payload.get("module_id"),
        payload.get("source_module"),
        metadata.get("source_module"),
    )
    paper_key, canonical_id = _build_paper_key(arxiv_id, s2_paper_id, source_url, title, authors)
    source_type = _infer_source_type(metadata, arxiv_id, s2_paper_id, source_url)
    if not _is_paper_like(metadata, arxiv_id, s2_paper_id, source_url, authors, published, venue, abstract):
        return None

    source_modules = _normalize_string_list(payload.get("source_modules") or metadata.get("source_modules"))
    if source_module_value:
        source_modules = _merge_unique_strings(source_modules, [source_module_value])

    citation_count = _coerce_int(payload.get("citation_count", metadata.get("citation_count")))
    reference_count = _coerce_int(payload.get("reference_count", metadata.get("reference_count")))
    score = _coerce_float(payload.get("score"))

    literature_path = _first_non_empty(
        payload.get("literature_path"),
        payload.get("path"),
        metadata.get("literature_path"),
    )
    saved_to_literature = bool(
        payload.get("saved_to_literature")
        or metadata.get("saved_to_literature")
        or literature_path
    )

    return {
        "paper_key": paper_key,
        "canonical_id": canonical_id,
        "title": title,
        "summary": summary,
        "abstract": abstract,
        "authors": authors,
        "author_count": len(authors) if authors else None,
        "year": year,
        "published": published,
        "updated": updated,
        "venue": venue,
        "source_type": source_type,
        "source_module": source_module_value,
        "source_modules": source_modules,
        "source_url": source_url,
        "arxiv_id": arxiv_id,
        "arxiv_url": arxiv_url or (f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else ""),
        "pdf_url": pdf_url or (f"https://arxiv.org/pdf/{arxiv_id}.pdf" if arxiv_id else ""),
        "html_url": html_url or (f"https://arxiv.org/html/{arxiv_id}" if arxiv_id else ""),
        "s2_paper_id": s2_paper_id,
        "s2_url": s2_url,
        "categories": categories,
        "keywords": keywords,
        "tags": tags,
        "figures": figures,
        "local_figures": local_figures,
        "citation_count": citation_count,
        "reference_count": reference_count,
        "contribution": _first_non_empty(payload.get("contribution"), metadata.get("contribution")),
        "relationship": _first_non_empty(payload.get("relationship"), metadata.get("relationship")),
        "relationship_label": _first_non_empty(payload.get("relationship_label"), metadata.get("relationship_label")),
        "source_paper_title": _first_non_empty(payload.get("source_paper_title"), metadata.get("source_paper_title")),
        "source_arxiv_id": _extract_arxiv_id(payload.get("source_arxiv_id"), metadata.get("source_arxiv_id")),
        "obsidian_path": _first_non_empty(payload.get("obsidian_path")),
        "literature_path": literature_path,
        "saved_to_literature": saved_to_literature,
        "score": score,
        "metadata": metadata,
        "raw_payload": dict(payload),
    }


class PaperStore:
    def __init__(self, db_path: Path = _DB_PATH):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = db_path
        with self._conn() as conn:
            conn.executescript(_DDL)

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db)
        conn.row_factory = sqlite3.Row
        return conn

    def upsert_from_card(self, card: Card) -> dict[str, Any] | None:
        return self.upsert_from_payload(card.to_dict(), source_module=card.module_id)

    def upsert_from_payload(self, payload: Mapping[str, Any], source_module: str | None = None) -> dict[str, Any] | None:
        normalized = _normalize_payload(payload, source_module=source_module)
        if not normalized:
            return None
        return self._upsert(normalized)

    def record_figures(self, arxiv_id: str, figures: list[dict[str, Any]], html_url: str | None = None) -> dict[str, Any]:
        existing = self.get_by_arxiv_id(arxiv_id)
        normalized = {
            "paper_key": existing["paper_key"] if existing else f"arxiv:{arxiv_id}",
            "canonical_id": existing["canonical_id"] if existing else arxiv_id,
            "title": existing["title"] if existing else f"arXiv {arxiv_id}",
            "summary": existing["summary"] if existing else "",
            "abstract": existing["abstract"] if existing else "",
            "authors": existing["authors"] if existing else [],
            "author_count": existing["author_count"] if existing else None,
            "year": existing["year"] if existing else None,
            "published": existing["published"] if existing else "",
            "updated": existing["updated"] if existing else "",
            "venue": existing["venue"] if existing else "",
            "source_type": existing["source_type"] if existing else "arxiv",
            "source_module": existing["source_module"] if existing else "",
            "source_modules": existing["source_modules"] if existing else [],
            "source_url": existing["source_url"] if existing else f"https://arxiv.org/abs/{arxiv_id}",
            "arxiv_id": arxiv_id,
            "arxiv_url": existing["arxiv_url"] if existing else f"https://arxiv.org/abs/{arxiv_id}",
            "pdf_url": existing["pdf_url"] if existing else f"https://arxiv.org/pdf/{arxiv_id}.pdf",
            "html_url": html_url or (existing["html_url"] if existing else f"https://arxiv.org/html/{arxiv_id}"),
            "s2_paper_id": existing["s2_paper_id"] if existing else "",
            "s2_url": existing["s2_url"] if existing else "",
            "categories": existing["categories"] if existing else [],
            "keywords": existing["keywords"] if existing else [],
            "tags": existing["tags"] if existing else [],
            "figures": _normalize_object_list(figures),
            "local_figures": existing["local_figures"] if existing else [],
            "citation_count": existing["citation_count"] if existing else None,
            "reference_count": existing["reference_count"] if existing else None,
            "contribution": existing["contribution"] if existing else "",
            "relationship": existing["relationship"] if existing else "",
            "relationship_label": existing["relationship_label"] if existing else "",
            "source_paper_title": existing["source_paper_title"] if existing else "",
            "source_arxiv_id": existing["source_arxiv_id"] if existing else "",
            "obsidian_path": existing["obsidian_path"] if existing else "",
            "literature_path": existing["literature_path"] if existing else "",
            "saved_to_literature": existing["saved_to_literature"] if existing else False,
            "score": existing["score"] if existing else None,
            "metadata": existing["metadata"] if existing else {},
            "raw_payload": {"figures": figures},
        }
        return self._upsert(normalized)

    def get(self, paper_key: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM papers WHERE paper_key=?", (paper_key,)).fetchone()
        return self._row_to_record(row) if row else None

    def get_by_arxiv_id(self, arxiv_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM papers WHERE arxiv_id=? ORDER BY updated_at DESC LIMIT 1",
                (arxiv_id,),
            ).fetchone()
        return self._row_to_record(row) if row else None

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        source_module: str | None = None,
        saved_only: bool = False,
    ) -> list[dict[str, Any]]:
        sql = "SELECT * FROM papers WHERE 1=1"
        params: list[Any] = []
        if source_module:
            sql += " AND source_modules LIKE ?"
            params.append(f'%"{source_module}"%')
        if saved_only:
            sql += " AND saved_to_literature=1"
        sql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_record(row) for row in rows]

    def existing_identifiers(self, source_module: str | None = None) -> set[str]:
        sql = "SELECT paper_key, canonical_id, arxiv_id, s2_paper_id FROM papers WHERE 1=1"
        params: list[Any] = []
        if source_module:
            sql += " AND source_modules LIKE ?"
            params.append(f'%"{source_module}"%')

        identifiers: set[str] = set()
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()

        for row in rows:
            for key in ["paper_key", "canonical_id", "arxiv_id", "s2_paper_id"]:
                value = _clean_str(row[key])
                if value:
                    identifiers.add(value)
            s2_paper_id = _clean_str(row["s2_paper_id"])
            if s2_paper_id:
                identifiers.add(f"s2_{s2_paper_id}")
        return identifiers

    def _upsert(self, normalized: dict[str, Any]) -> dict[str, Any]:
        existing = self.get(normalized["paper_key"])
        record = self._merge_records(existing, normalized)
        self._save(record)
        return record

    def _merge_records(self, existing: dict[str, Any] | None, incoming: dict[str, Any]) -> dict[str, Any]:
        now = time.time()
        if not existing:
            record = dict(incoming)
            record["created_at"] = now
            record["updated_at"] = now
            record["last_seen_at"] = now
            return record

        merged = dict(existing)

        scalar_fields = [
            "canonical_id",
            "title",
            "summary",
            "abstract",
            "published",
            "updated",
            "venue",
            "source_type",
            "source_module",
            "source_url",
            "arxiv_id",
            "arxiv_url",
            "pdf_url",
            "html_url",
            "s2_paper_id",
            "s2_url",
            "contribution",
            "relationship",
            "relationship_label",
            "source_paper_title",
            "source_arxiv_id",
            "obsidian_path",
            "literature_path",
        ]
        for field in scalar_fields:
            incoming_value = incoming.get(field)
            if isinstance(incoming_value, str):
                if incoming_value:
                    merged[field] = incoming_value
            elif incoming_value is not None:
                merged[field] = incoming_value

        for field in ["author_count", "year", "citation_count", "reference_count", "score"]:
            incoming_value = incoming.get(field)
            if incoming_value is not None:
                merged[field] = incoming_value

        for field in ["authors", "figures", "local_figures"]:
            incoming_value = incoming.get(field) or []
            if incoming_value:
                merged[field] = incoming_value

        for field in ["categories", "keywords", "tags", "source_modules"]:
            merged[field] = _merge_unique_strings(existing.get(field, []), incoming.get(field, []))

        merged["metadata"] = {
            **dict(existing.get("metadata") or {}),
            **dict(incoming.get("metadata") or {}),
        }
        merged["raw_payload"] = incoming.get("raw_payload") or existing.get("raw_payload") or {}
        merged["saved_to_literature"] = bool(existing.get("saved_to_literature") or incoming.get("saved_to_literature"))
        if merged["saved_to_literature"] and not merged.get("literature_path"):
            merged["literature_path"] = incoming.get("literature_path") or existing.get("literature_path", "")

        merged["created_at"] = existing.get("created_at", now)
        merged["updated_at"] = now
        merged["last_seen_at"] = now
        return merged

    def _save(self, record: dict[str, Any]) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO papers (
                    paper_key, canonical_id, title, summary, abstract, authors, author_count,
                    year, published, updated, venue, source_type, source_module, source_modules,
                    source_url, arxiv_id, arxiv_url, pdf_url, html_url, s2_paper_id, s2_url,
                    categories, keywords, tags, figures, local_figures, citation_count,
                    reference_count, contribution, relationship, relationship_label,
                    source_paper_title, source_arxiv_id, obsidian_path, literature_path,
                    saved_to_literature, score, metadata, raw_payload, created_at,
                    updated_at, last_seen_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    record["paper_key"],
                    record["canonical_id"],
                    record["title"],
                    record.get("summary", ""),
                    record.get("abstract", ""),
                    _json_dumps(record.get("authors", [])),
                    record.get("author_count"),
                    record.get("year"),
                    record.get("published", ""),
                    record.get("updated", ""),
                    record.get("venue", ""),
                    record.get("source_type", ""),
                    record.get("source_module", ""),
                    _json_dumps(record.get("source_modules", [])),
                    record.get("source_url", ""),
                    record.get("arxiv_id", ""),
                    record.get("arxiv_url", ""),
                    record.get("pdf_url", ""),
                    record.get("html_url", ""),
                    record.get("s2_paper_id", ""),
                    record.get("s2_url", ""),
                    _json_dumps(record.get("categories", [])),
                    _json_dumps(record.get("keywords", [])),
                    _json_dumps(record.get("tags", [])),
                    _json_dumps(record.get("figures", [])),
                    _json_dumps(record.get("local_figures", [])),
                    record.get("citation_count"),
                    record.get("reference_count"),
                    record.get("contribution", ""),
                    record.get("relationship", ""),
                    record.get("relationship_label", ""),
                    record.get("source_paper_title", ""),
                    record.get("source_arxiv_id", ""),
                    record.get("obsidian_path", ""),
                    record.get("literature_path", ""),
                    1 if record.get("saved_to_literature") else 0,
                    record.get("score"),
                    _json_dumps(record.get("metadata", {})),
                    _json_dumps(record.get("raw_payload", {})),
                    record.get("created_at", time.time()),
                    record.get("updated_at", time.time()),
                    record.get("last_seen_at", time.time()),
                ),
            )

    def _row_to_record(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "paper_key": row["paper_key"],
            "canonical_id": row["canonical_id"],
            "title": row["title"],
            "summary": row["summary"] or "",
            "abstract": row["abstract"] or "",
            "authors": _json_loads(row["authors"], []),
            "author_count": row["author_count"],
            "year": row["year"],
            "published": row["published"] or "",
            "updated": row["updated"] or "",
            "venue": row["venue"] or "",
            "source_type": row["source_type"] or "",
            "source_module": row["source_module"] or "",
            "source_modules": _json_loads(row["source_modules"], []),
            "source_url": row["source_url"] or "",
            "arxiv_id": row["arxiv_id"] or "",
            "arxiv_url": row["arxiv_url"] or "",
            "pdf_url": row["pdf_url"] or "",
            "html_url": row["html_url"] or "",
            "s2_paper_id": row["s2_paper_id"] or "",
            "s2_url": row["s2_url"] or "",
            "categories": _json_loads(row["categories"], []),
            "keywords": _json_loads(row["keywords"], []),
            "tags": _json_loads(row["tags"], []),
            "figures": _json_loads(row["figures"], []),
            "local_figures": _json_loads(row["local_figures"], []),
            "citation_count": row["citation_count"],
            "reference_count": row["reference_count"],
            "contribution": row["contribution"] or "",
            "relationship": row["relationship"] or "",
            "relationship_label": row["relationship_label"] or "",
            "source_paper_title": row["source_paper_title"] or "",
            "source_arxiv_id": row["source_arxiv_id"] or "",
            "obsidian_path": row["obsidian_path"] or "",
            "literature_path": row["literature_path"] or "",
            "saved_to_literature": bool(row["saved_to_literature"]),
            "score": row["score"],
            "metadata": _json_loads(row["metadata"], {}),
            "raw_payload": _json_loads(row["raw_payload"], {}),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "last_seen_at": row["last_seen_at"],
        }
