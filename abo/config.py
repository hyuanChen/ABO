"""
全局配置：Vault 路径 + 应用配置。
持久化到应用数据目录，并自动兼容旧版 ~/.abo-config.json。
"""
import json
import re
from pathlib import Path

from .storage_paths import get_app_storage_root, get_config_path

_DEFAULT_INTELLIGENCE_DELIVERY_TIME = "09:00"


def _default_feed_preferences() -> dict:
    return {
        "hidden_module_ids": [
            "xiaoyuzhou-tracker",
            "zhihu-tracker",
            "folder-monitor",
        ],
        "group_mode": "smart",
        "show_recommendations": True,
    }


def normalize_daily_time(value: object, fallback: str = _DEFAULT_INTELLIGENCE_DELIVERY_TIME) -> str:
    text = str(value or "").strip()
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", text)
    if not match:
        return fallback

    hour = int(match.group(1))
    minute = int(match.group(2))
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return fallback
    return f"{hour:02d}:{minute:02d}"


def load() -> dict:
    """Load config from disk. Missing keys get empty-string defaults (not fake paths)."""
    defaults = {
        "vault_path": "",
        "literature_path": "",
        "ai_provider": "codex",
        "paper_ai_scoring_enabled": False,
        "intelligence_delivery_enabled": True,
        "intelligence_delivery_time": _DEFAULT_INTELLIGENCE_DELIVERY_TIME,
        "version": "1.0.0",
        "onboarding_completed": False,
        "onboarding_step": 0,
        "feed_preferences": _default_feed_preferences(),
    }
    config_path = get_config_path()
    if config_path.exists():
        try:
            saved = json.loads(config_path.read_text(encoding="utf-8"))
            merged = {**defaults, **saved}
            if isinstance(saved.get("feed_preferences"), dict):
                merged["feed_preferences"] = {
                    **_default_feed_preferences(),
                    **saved["feed_preferences"],
                }
            merged["intelligence_delivery_time"] = normalize_daily_time(
                saved.get("intelligence_delivery_time"),
                _DEFAULT_INTELLIGENCE_DELIVERY_TIME,
            )
            return merged
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
        if k == "feed_preferences" and isinstance(v, dict):
            merged[k] = {
                **_default_feed_preferences(),
                **(existing.get(k) or {}),
                **v,
            }
            continue
        if k == "intelligence_delivery_time":
            merged[k] = normalize_daily_time(v, existing.get(k) or _DEFAULT_INTELLIGENCE_DELIVERY_TIME)
            continue
        # Booleans are always written as-is (including False)
        if isinstance(v, bool):
            merged[k] = v
        # Only overwrite if new value is non-empty, or existing was already empty
        elif v or not existing.get(k):
            merged[k] = v
    config_path = get_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")


def get_vault_path() -> Path | None:
    """Return vault path, or None if not configured."""
    path = load().get("vault_path", "").strip()
    return Path(path) if path else None


def get_literature_path() -> Path | None:
    """Return literature path, or None if not configured."""
    path = load().get("literature_path", "").strip()
    return Path(path) if path else None


def get_ai_provider() -> str:
    """Return the configured AI provider. Defaults to Codex."""
    provider = str(load().get("ai_provider", "codex")).strip().lower()
    if provider not in {"codex", "claude"}:
        return "codex"
    return provider


def is_paper_ai_scoring_enabled() -> bool:
    """Return whether paper crawl AI scoring is enabled."""
    return bool(load().get("paper_ai_scoring_enabled", False))


def get_abo_dir() -> Path:
    return get_app_storage_root()


def get_semantic_scholar_api_key() -> str:
    """Return Semantic Scholar API key, or empty string if not configured."""
    return load().get("semantic_scholar_api_key", "")


def is_demo_mode() -> bool:
    """Return True if demo/showcase mode is enabled."""
    return bool(load().get("demo_mode", False))
