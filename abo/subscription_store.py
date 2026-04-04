"""
Subscription store for tracking subscription details with timestamps.
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional


class SubscriptionStore:
    """Store and manage subscription details with timestamps."""

    _PATH = Path.home() / ".abo" / "subscriptions.json"

    def __init__(self, path: Optional[Path] = None):
        self._path = path or self._PATH

    def _load(self) -> dict:
        """Load subscription data from file."""
        if not self._path.exists():
            return {}
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, IOError):
            return {}

    def _save(self, data: dict):
        """Save subscription data to file atomically."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self._path)

    def add_subscription(
        self,
        module_id: str,
        sub_type: str,
        value: str,
        added_by: str = "user",
    ) -> dict:
        """Record a new subscription with timestamp."""
        data = self._load()
        if module_id not in data:
            data[module_id] = []

        # Check if already exists
        existing = next(
            (s for s in data[module_id] if s["type"] == sub_type and s["value"] == value),
            None
        )
        if existing:
            return existing

        subscription = {
            "type": sub_type,
            "value": value,
            "added_at": datetime.utcnow().isoformat(),
            "added_by": added_by,
            "last_fetched": None,
            "fetch_count": 0,
        }
        data[module_id].append(subscription)
        self._save(data)
        return subscription

    def remove_subscription(self, module_id: str, sub_type: str, value: str) -> bool:
        """Remove a subscription record."""
        data = self._load()
        if module_id not in data:
            return False

        original_len = len(data[module_id])
        data[module_id] = [
            s for s in data[module_id]
            if not (s["type"] == sub_type and s["value"] == value)
        ]

        if len(data[module_id]) < original_len:
            self._save(data)
            return True
        return False

    def update_last_fetched(self, module_id: str, sub_type: str, value: str):
        """Update the last fetched timestamp for a subscription."""
        data = self._load()
        if module_id not in data:
            return

        for sub in data[module_id]:
            if sub["type"] == sub_type and sub["value"] == value:
                sub["last_fetched"] = datetime.utcnow().isoformat()
                sub["fetch_count"] = sub.get("fetch_count", 0) + 1
                break
        self._save(data)

    def get_subscriptions(self, module_id: str) -> list:
        """Get all subscriptions for a module."""
        data = self._load()
        return data.get(module_id, [])

    def get_all_subscriptions(self) -> dict:
        """Get all subscriptions grouped by module."""
        return self._load()

    def get_summary(self) -> dict:
        """Get a summary of all subscriptions."""
        data = self._load()
        summary = {
            "total_modules": len(data),
            "total_subscriptions": sum(len(subs) for subs in data.values()),
            "modules": {}
        }

        for module_id, subs in data.items():
            by_type = {}
            for sub in subs:
                t = sub["type"]
                if t not in by_type:
                    by_type[t] = []
                by_type[t].append({
                    "value": sub["value"],
                    "added_at": sub["added_at"],
                    "added_by": sub["added_by"],
                    "last_fetched": sub.get("last_fetched"),
                    "fetch_count": sub.get("fetch_count", 0),
                })

            summary["modules"][module_id] = {
                "total": len(subs),
                "by_type": by_type
            }

        return summary


# Global instance
_subscription_store: Optional[SubscriptionStore] = None


def get_subscription_store() -> SubscriptionStore:
    """Get the global subscription store instance."""
    global _subscription_store
    if _subscription_store is None:
        _subscription_store = SubscriptionStore()
    return _subscription_store
