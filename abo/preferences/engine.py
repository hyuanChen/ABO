import json
from pathlib import Path

_PREFS_PATH = Path.home() / ".abo" / "preferences.json"

_DEFAULTS: dict = {
    "global": {
        "summary_language": "zh",
        "detail_level": "medium",
        "max_cards_per_run": 20,
        "score_threshold": 0.4,
    },
    "modules": {},
    "feedback_history": [],
    "derived_weights": {},
}

_WEIGHT_RULES = {
    "star":      lambda tags: {t: 1.1 for t in tags},
    "save":      lambda tags: {t: 1.05 for t in tags},
    "skip":      lambda tags: {tags[0]: 0.85} if tags else {},
    "deep_dive": lambda tags: {t: 1.1 for t in tags},
}


class PreferenceEngine:
    def __init__(self):
        self._data = self._load()

    def _load(self) -> dict:
        if _PREFS_PATH.exists():
            stored = json.loads(_PREFS_PATH.read_text())
            return {**_DEFAULTS, **stored}
        return {k: (v.copy() if isinstance(v, dict) else list(v) if isinstance(v, list) else v)
                for k, v in _DEFAULTS.items()}

    def _save(self):
        _PREFS_PATH.parent.mkdir(parents=True, exist_ok=True)
        _PREFS_PATH.write_text(json.dumps(self._data, indent=2, ensure_ascii=False))

    def get_prefs_for_module(self, module_id: str) -> dict:
        return {
            **self._data,
            "module": self._data["modules"].get(module_id, {}),
        }

    def threshold(self, module_id: str) -> float:
        return self._data["modules"].get(module_id, {}).get(
            "score_threshold",
            self._data["global"]["score_threshold"]
        )

    def max_cards(self, module_id: str) -> int:
        return self._data["modules"].get(module_id, {}).get(
            "max_cards_per_run",
            self._data["global"]["max_cards_per_run"]
        )

    def record_feedback(self, card_tags: list[str], action: str):
        """根据用户操作更新 derived_weights"""
        rule = _WEIGHT_RULES.get(action)
        if not rule or not card_tags:
            return
        updates = rule(card_tags)
        weights = self._data["derived_weights"]
        for tag, factor in updates.items():
            current = weights.get(tag, 1.0)
            weights[tag] = max(0.1, min(5.0, current * factor))
        self._save()

    def all_data(self) -> dict:
        return self._data

    def update(self, data: dict):
        self._data.update(data)
        self._save()
