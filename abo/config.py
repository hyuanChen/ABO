"""Vault path configuration — stored in ~/.abo-config.json (global, pre-vault)."""
import json
from pathlib import Path

CONFIG_PATH = Path.home() / ".abo-config.json"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {"vault_path": "", "is_configured": False}


def save_config(vault_path: str) -> dict:
    config = {"vault_path": vault_path, "is_configured": True}
    CONFIG_PATH.write_text(json.dumps(config, indent=2))
    return config
