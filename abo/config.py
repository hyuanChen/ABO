"""
全局配置：Vault 路径 + 应用配置。
持久化到 ~/.abo-config.json（与旧版兼容）。
"""
import json
from pathlib import Path

_CONFIG_PATH = Path.home() / ".abo-config.json"
_ABO_DIR = Path.home() / ".abo"

_DEFAULTS = {
    "vault_path": str(Path.home() / "Documents" / "MyVault"),
    "literature_path": "",  # Second folder for literature/papers
    "version": "1.0.0",
}


def get_literature_path() -> Path | None:
    """Get literature folder path, returns None if not configured."""
    path = load().get("literature_path", "")
    if path:
        return Path(path)
    return None


def load() -> dict:
    if _CONFIG_PATH.exists():
        return {**_DEFAULTS, **json.loads(_CONFIG_PATH.read_text())}
    return _DEFAULTS.copy()


def save(data: dict) -> None:
    """Save config, merging with existing config to preserve other fields."""
    existing = load()
    merged = {**existing, **data}
    _CONFIG_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False))


def get_vault_path() -> Path:
    return Path(load()["vault_path"])


def get_abo_dir() -> Path:
    _ABO_DIR.mkdir(parents=True, exist_ok=True)
    return _ABO_DIR
