import json
import os
from datetime import datetime
from pathlib import Path

_PREFS_PATH = Path.home() / ".abo" / "preferences.json"
_LIKED_DIR = Path.home() / ".abo" / "liked"

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
    # 三级打分系统
    "like":      lambda tags: {t: 1.15 for t in tags},      # 👍 喜欢 - 大幅提升权重
    "neutral":   lambda tags: {t: 1.0 for t in tags},       # 😐 中立 - 保持权重
    "dislike":   lambda tags: {t: 0.6 for t in tags},       # 👎 不喜欢 - 大幅降低权重
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

    def save_liked_to_markdown(self, card: dict) -> Path | None:
        """Save a liked card to category-specific markdown file in ~/.abo/liked/.

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
        _LIKED_DIR.mkdir(parents=True, exist_ok=True)

        file_path = _LIKED_DIR / filename

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
        return self._data

    def update(self, data: dict):
        self._data.update(data)
        self._save()
