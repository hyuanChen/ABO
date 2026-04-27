"""Vault writer — create directories and write Markdown notes."""
import os
from pathlib import Path
import frontmatter

from .unified_entry import UnifiedVaultEntry


def ensure_vault_structure(vault_path: str) -> None:
    root = Path(vault_path)
    for folder in [
        "Literature",
        "Ideas",
        "Journal",
        "手记",
        "手记/日记",
        "手记/周记",
        "手记/月记",
        "手记/年记",
        ".abo",
        ".abo/logs",
    ]:
        (root / folder).mkdir(parents=True, exist_ok=True)


def write_note(path: Path, metadata: dict, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    post = frontmatter.Post(content, **metadata)
    path.write_text(frontmatter.dumps(post), encoding="utf-8")


def write_unified_note(
    path: Path,
    entry: UnifiedVaultEntry,
    content: str,
    *,
    extra_metadata: dict | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    post = frontmatter.Post(content)
    post.metadata.update(entry.to_frontmatter(extra_metadata=extra_metadata))
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(frontmatter.dumps(post), encoding="utf-8")
    os.replace(tmp, path)
