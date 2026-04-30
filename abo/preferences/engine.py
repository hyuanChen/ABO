import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Dict, List, Optional

from ..storage_paths import get_keyword_preferences_path, get_liked_dir, get_preferences_path


@dataclass
class KeywordPreference:
    """Keyword preference model with scoring."""
    keyword: str
    score: float  # -1.0 to 1.0, accumulated from feedback
    count: int    # number of interactions
    source_modules: list[str]  # which modules this keyword came from
    last_updated: str  # ISO format datetime

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "KeywordPreference":
        payload = dict(data or {})
        payload.setdefault("keyword", "")
        payload.setdefault("score", 0.0)
        payload.setdefault("count", 0)
        payload.setdefault("source_modules", [])
        payload.setdefault("last_updated", "")
        return cls(**payload)

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
    "deep_dive": lambda tags: {t: 1.1 for t in tags},
    # 偏好系统当前只使用正反馈，负反馈暂不纳入排序权重。
    "like":      lambda tags: {t: 1.15 for t in tags},
    "neutral":   lambda tags: {},
    "skip":      lambda tags: {},
    "dislike":   lambda tags: {},
}


class PreferenceEngine:
    def __init__(self):
        self._data: dict | None = None

    def _load(self) -> dict:
        prefs_path = get_preferences_path()
        if prefs_path.exists():
            stored = json.loads(prefs_path.read_text(encoding="utf-8"))
            return {**_DEFAULTS, **stored}
        return {k: (v.copy() if isinstance(v, dict) else list(v) if isinstance(v, list) else v)
                for k, v in _DEFAULTS.items()}

    def _save(self):
        data = self._ensure_data()
        prefs_path = get_preferences_path()
        prefs_path.parent.mkdir(parents=True, exist_ok=True)
        prefs_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    def _ensure_data(self) -> dict:
        if self._data is None:
            self._data = self._load()
        return self._data

    def get_prefs_for_module(self, module_id: str) -> dict:
        data = self._ensure_data()
        return {
            **data,
            "module": data["modules"].get(module_id, {}),
        }

    def threshold(self, module_id: str) -> float:
        data = self._ensure_data()
        return data["modules"].get(module_id, {}).get(
            "score_threshold",
            data["global"]["score_threshold"]
        )

    def max_cards(self, module_id: str) -> int:
        data = self._ensure_data()
        return data["modules"].get(module_id, {}).get(
            "max_cards_per_run",
            data["global"]["max_cards_per_run"]
        )

    def record_feedback(self, card_tags: list[str], action: str):
        """根据用户操作更新 derived_weights"""
        rule = _WEIGHT_RULES.get(action)
        if not rule or not card_tags:
            return
        updates = rule(card_tags)
        data = self._ensure_data()
        weights = data["derived_weights"]
        for tag, factor in updates.items():
            current = weights.get(tag, 1.0)
            weights[tag] = max(0.1, min(5.0, current * factor))
        self._save()

    def save_liked_to_markdown(self, card: dict) -> Path | None:
        """Save a liked card to category-specific markdown file in the app data dir.

        Args:
            card: Dictionary with keys: title, summary, source_url, module_id, category, tags

        Returns:
            Path to the markdown file or None if not saved
        """
        # Map category to markdown file
        category = card.get("category", "")
        category_map = {
            "paper": "papers.md",
            "news": "news.md",
            "idea": "ideas.md",
            "todo": "todos.md",
        }

        # Default to ideas.md if category not recognized
        filename = category_map.get(category, "ideas.md")

        # Ensure liked directory exists
        liked_dir = get_liked_dir()
        liked_dir.mkdir(parents=True, exist_ok=True)

        file_path = liked_dir / filename

        # Build frontmatter
        title = card.get("title", "Untitled")
        source_url = card.get("source_url", "")
        module_id = card.get("module_id", "")
        tags = card.get("tags", [])
        date = datetime.now().strftime("%Y-%m-%d")

        # Build markdown entry
        frontmatter_lines = [
            "---",
            f'title: "{title}"',
            f'source: "{module_id}"',
        ]
        if source_url:
            frontmatter_lines.append(f'url: "{source_url}"')
        frontmatter_lines.append(f'date: "{date}"')
        if tags:
            frontmatter_lines.append(f'tags: {tags}')
        frontmatter_lines.append("---")
        frontmatter_lines.append("")

        # Add summary as content
        summary = card.get("summary", "")
        if summary:
            frontmatter_lines.append(summary)
            frontmatter_lines.append("")

        # Add source link if available
        if source_url:
            frontmatter_lines.append(f"[Source]({source_url})")
            frontmatter_lines.append("")

        entry_text = "\n".join(frontmatter_lines)

        # Atomic append: write to temp file, then append to target
        try:
            if file_path.exists():
                # Append to existing file with separator
                existing_content = file_path.read_text(encoding="utf-8")
                new_content = existing_content + "\n" + entry_text
            else:
                # New file
                new_content = entry_text

            # Atomic write
            tmp_path = file_path.with_suffix(".tmp")
            tmp_path.write_text(new_content, encoding="utf-8")
            os.replace(tmp_path, file_path)

            return file_path
        except Exception:
            return None

    def all_data(self) -> dict:
        return self._ensure_data()

    def update(self, data: dict):
        current = self._ensure_data()
        current.update(data)
        self._save()

    # ── Keyword Preference System (Phase 2) ─────────────────────────

    def _load_keyword_prefs(self) -> dict[str, KeywordPreference]:
        """Load keyword preferences from disk."""
        keywords_path = get_keyword_preferences_path()
        if keywords_path.exists():
            data = json.loads(keywords_path.read_text(encoding="utf-8"))
            prefs: dict[str, KeywordPreference] = {}
            for key, value in data.items():
                payload = dict(value or {})
                payload.setdefault("keyword", str(key))
                prefs[str(key)] = KeywordPreference.from_dict(payload)
            return prefs
        return {}

    def _save_keyword_prefs(self, prefs: dict[str, KeywordPreference]):
        """Save keyword preferences to disk."""
        keywords_path = get_keyword_preferences_path()
        keywords_path.parent.mkdir(parents=True, exist_ok=True)
        data = {k: v.to_dict() for k, v in prefs.items()}
        keywords_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    def update_from_feedback(self, card_tags: list[str], action: str, card_module: str = ""):
        """Update keyword preferences based on user feedback.

        Args:
            card_tags: List of tags from the card
            action: Feedback action (like, neutral, dislike, save, skip)
            card_module: Source module ID
        """
        # Map action to score delta
        action_deltas = {
            "like": 0.3,
            "save": 0.4,
            "star": 0.5,
            "deep_dive": 0.35,
            "neutral": 0.0,
            "skip": 0.0,
            "dislike": 0.0,
        }

        delta = action_deltas.get(action, 0)
        if delta == 0:
            return

        prefs = self._load_keyword_prefs()

        for tag in card_tags:
            tag_lower = tag.lower()
            if tag_lower in prefs:
                pref = prefs[tag_lower]
                # Weighted average update
                new_score = (pref.score * pref.count + delta) / (pref.count + 1)
                pref.score = max(-1.0, min(1.0, new_score))  # Clamp to [-1, 1]
                pref.count += 1
                pref.last_updated = datetime.now().isoformat()
                if card_module and card_module not in pref.source_modules:
                    pref.source_modules.append(card_module)
            else:
                prefs[tag_lower] = KeywordPreference(
                    keyword=tag_lower,
                    score=max(-1.0, min(1.0, delta)),
                    count=1,
                    source_modules=[card_module] if card_module else [],
                    last_updated=datetime.now().isoformat(),
                )

        self._save_keyword_prefs(prefs)

    def get_keyword_score(self, tag: str) -> float:
        """Get positive-only preference score for a keyword."""
        prefs = self._load_keyword_prefs()
        score = prefs.get(tag.lower(), KeywordPreference(tag.lower(), 0, 0, [], "")).score
        return max(0.0, score)

    def get_all_keyword_prefs(self, positive_only: bool = False) -> dict[str, KeywordPreference]:
        """Get keyword preferences, optionally filtered to active positive signals."""
        prefs = self._load_keyword_prefs()
        if not positive_only:
            return prefs
        return {
            keyword: pref
            for keyword, pref in prefs.items()
            if pref.score > 0 and pref.count > 0
        }

    def get_top_keywords(self, n: int = 20) -> list[tuple[str, float]]:
        """Get top N liked keywords by score."""
        prefs = self.get_all_keyword_prefs(positive_only=True)
        sorted_prefs = sorted(
            prefs.items(),
            key=lambda x: (x[1].score, x[1].count, x[1].last_updated),
            reverse=True
        )
        return [(k, v.score) for k, v in sorted_prefs[:n]]

    def get_disliked_keywords(self) -> list[str]:
        """Negative keyword feedback is temporarily disabled in the preference layer."""
        return []
