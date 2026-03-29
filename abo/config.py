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
    "version": "1.0.0",
}


def load() -> dict:
    if _CONFIG_PATH.exists():
        return {**_DEFAULTS, **json.loads(_CONFIG_PATH.read_text())}
    return _DEFAULTS.copy()


def save(data: dict) -> None:
    _CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def get_vault_path() -> Path:
    return Path(load()["vault_path"])


def get_abo_dir() -> Path:
    _ABO_DIR.mkdir(parents=True, exist_ok=True)
    return _ABO_DIR
