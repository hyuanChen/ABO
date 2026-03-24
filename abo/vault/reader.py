"""Vault reader — frontmatter parsing and path utilities."""
from pathlib import Path
import frontmatter


def load_note(path: Path) -> dict:
    post = frontmatter.load(str(path))
    return {"meta": post.metadata, "content": post.content}


def find_notes(vault_path: str, subfolder: str = "") -> list[Path]:
    root = Path(vault_path) / subfolder if subfolder else Path(vault_path)
    return list(root.rglob("*.md"))
