"""Obsidian URI scheme — opens files/searches in local Obsidian via macOS `open`."""
import subprocess
from urllib.parse import quote


def open_file(vault_name: str, file_path: str) -> None:
    """Open a specific file in Obsidian."""
    uri = f"obsidian://open?vault={quote(vault_name)}&file={quote(file_path)}"
    subprocess.run(["open", uri], check=False)


def search_vault(vault_name: str, query: str) -> None:
    """Open Obsidian search for a query."""
    uri = f"obsidian://search?vault={quote(vault_name)}&query={quote(query)}"
    subprocess.run(["open", uri], check=False)


def open_new_note(vault_name: str, file_path: str, content: str = "") -> None:
    """Create/open a note with optional initial content."""
    uri = f"obsidian://new?vault={quote(vault_name)}&file={quote(file_path)}"
    if content:
        uri += f"&content={quote(content)}"
    subprocess.run(["open", uri], check=False)
