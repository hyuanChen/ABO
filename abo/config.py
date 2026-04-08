"""
全局配置：Vault 路径 + 应用配置。
持久化到 ~/.abo-config.json（与旧版兼容）。
"""
import json
from pathlib import Path

_CONFIG_PATH = Path.home() / ".abo-config.json"
_ABO_DIR = Path.home() / ".abo"


def load() -> dict:
    """Load config from disk. Missing keys get empty-string defaults (not fake paths)."""
    defaults = {
        "vault_path": "",
        "literature_path": "",
        "version": "1.0.0",
        "onboarding_completed": False,
        "onboarding_step": 0,
    }
    if _CONFIG_PATH.exists():
        try:
            saved = json.loads(_CONFIG_PATH.read_text())
            return {**defaults, **saved}
        except Exception:
            pass
    return defaults.copy()


def save(data: dict) -> None:
    """Save config, merging with existing on-disk config.
    Empty strings do NOT overwrite existing non-empty values (prevents accidental erasure).
    """
    existing = load()
    merged = {**existing}
    for k, v in data.items():
        # Only overwrite if new value is non-empty, or existing was already empty
        if v or not existing.get(k):
            merged[k] = v
    _CONFIG_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False))


def get_vault_path() -> Path | None:
    """Return vault path, or None if not configured."""
    path = load().get("vault_path", "").strip()
    return Path(path) if path else None


def get_literature_path() -> Path | None:
    """Return literature path, or None if not configured."""
    path = load().get("literature_path", "").strip()
    return Path(path) if path else None


def get_abo_dir() -> Path:
    _ABO_DIR.mkdir(parents=True, exist_ok=True)
    return _ABO_DIR


def get_semantic_scholar_api_key() -> str:
    """Return Semantic Scholar API key, or empty string if not configured."""
    return load().get("semantic_scholar_api_key", "")
