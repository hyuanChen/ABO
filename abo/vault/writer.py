"""Vault writer — create directories and write Markdown notes."""
from pathlib import Path
import frontmatter


def ensure_vault_structure(vault_path: str) -> None:
    root = Path(vault_path)
    for folder in ["Literature", "Ideas", "Journal", ".abo", ".abo/logs"]:
        (root / folder).mkdir(parents=True, exist_ok=True)


def write_note(path: Path, metadata: dict, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    post = frontmatter.Post(content, **metadata)
    path.write_text(frontmatter.dumps(post), encoding="utf-8")
