"""SQLite FTS5 index for literature vault."""
import sqlite3
from pathlib import Path


def _db(vault_path: str) -> sqlite3.Connection:
    path = Path(vault_path) / ".abo" / "literature.db"
    conn = sqlite3.connect(str(path))
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts
        USING fts5(paper_id, title, authors, full_text, tokenize='unicode61')
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS papers_meta (
            paper_id TEXT PRIMARY KEY,
            md_path  TEXT NOT NULL,
            year     INTEGER,
            doi      TEXT,
            digest_level INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)
    conn.commit()
    return conn


def index_paper(vault_path: str, paper_id: str, title: str, authors: str,
                full_text: str, md_path: str, year: int | None = None,
                doi: str | None = None) -> None:
    conn = _db(vault_path)
    conn.execute("DELETE FROM papers_fts WHERE paper_id = ?", (paper_id,))
    conn.execute(
        "INSERT INTO papers_fts(paper_id, title, authors, full_text) VALUES (?,?,?,?)",
        (paper_id, title, authors, full_text[:50_000]),
    )
    conn.execute("""
        INSERT INTO papers_meta(paper_id, md_path, year, doi, created_at)
        VALUES (?,?,?,?, datetime('now'))
        ON CONFLICT(paper_id) DO UPDATE SET
            md_path=excluded.md_path, year=excluded.year, doi=excluded.doi
    """, (paper_id, md_path, year, doi))
    conn.commit()
    conn.close()


def search_papers(vault_path: str, query: str) -> list[dict]:
    conn = _db(vault_path)
    rows = conn.execute(
        """SELECT f.paper_id, f.title, f.authors,
                  snippet(papers_fts, 3, '<b>', '</b>', '…', 32) AS snippet,
                  m.year, m.doi, m.digest_level, m.md_path
           FROM papers_fts f
           JOIN papers_meta m USING(paper_id)
           WHERE papers_fts MATCH ?
           ORDER BY rank
           LIMIT 50""",
        (query,),
    ).fetchall()
    conn.close()
    cols = ["paper_id", "title", "authors", "snippet", "year", "doi", "digest_level", "md_path"]
    return [dict(zip(cols, r)) for r in rows]


def list_papers(vault_path: str) -> list[dict]:
    conn = _db(vault_path)
    rows = conn.execute(
        "SELECT paper_id, md_path, year, doi, digest_level, created_at FROM papers_meta ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    cols = ["paper_id", "md_path", "year", "doi", "digest_level", "created_at"]
    return [dict(zip(cols, r)) for r in rows]


def update_digest_level(vault_path: str, paper_id: str, level: int) -> None:
    conn = _db(vault_path)
    conn.execute(
        "UPDATE papers_meta SET digest_level = ? WHERE paper_id = ?",
        (level, paper_id),
    )
    conn.commit()
    conn.close()
