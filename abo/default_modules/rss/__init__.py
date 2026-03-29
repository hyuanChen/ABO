import json
from datetime import datetime
from pathlib import Path

from abo.sdk import Module, Item, Card, fetch_rss, claude_json


class RssAggregator(Module):
    id       = "rss-aggregator"
    name     = "RSS 聚合"
    schedule = "0 */2 * * *"
    icon     = "rss"
    output   = ["obsidian", "ui"]

    _DEFAULT_FEEDS = [
        "https://feeds.feedburner.com/PapersWithCode",
        "https://github.blog/feed/",
    ]

    async def fetch(self) -> list[Item]:
        prefs_path = Path.home() / ".abo" / "preferences.json"
        feed_urls = self._DEFAULT_FEEDS
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            feed_urls = data.get("modules", {}).get("rss-aggregator", {}).get(
                "feed_urls", feed_urls
            )

        items = []
        for url in feed_urls:
            try:
                entries = await fetch_rss(url)
                for e in entries[:10]:
                    items.append(Item(id=e["id"] or e["link"], raw=e))
            except Exception:
                pass
        return items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        if not items:
            return []

        titles = "\n".join(f"- {item.raw['title']}" for item in items[:20])
        prompt = (
            f"以下是今日 RSS 聚合标题，分析主要技术趋势，返回 JSON：\n"
            f'{{"score":8,"summary":"<200字以内中文趋势摘要>",'
            f'"tags":["<tag1>","<tag2>"],"highlights":["<亮点1>","<亮点2>"]}}\n\n'
            f"{titles}"
        )
        result = await claude_json(prompt, prefs=prefs)

        date_str = datetime.now().strftime("%Y-%m-%d")
        return [Card(
            id=f"rss-{date_str}",
            title=f"{date_str} RSS 技术趋势",
            summary=result.get("summary", "今日技术动态聚合"),
            score=result.get("score", 7) / 10,
            tags=result.get("tags", []),
            source_url="",
            obsidian_path=f"Trends/{date_str}-rss-digest.md",
            metadata={"highlights": result.get("highlights", [])},
        )]
