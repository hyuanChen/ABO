import json
from datetime import datetime
from pathlib import Path

from abo.sdk import Module, Item, Card, fetch_rss, download_audio, transcribe, claude_json


class PodcastDigest(Module):
    id       = "podcast-digest"
    name     = "播客摘要"
    schedule = "0 7 * * *"
    icon     = "headphones"
    output   = ["obsidian", "ui"]

    async def fetch(self) -> list[Item]:
        prefs_path = Path.home() / ".abo" / "preferences.json"
        podcast_urls: list[str] = []
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            podcast_urls = data.get("modules", {}).get("podcast-digest", {}).get(
                "podcast_urls", []
            )

        items = []
        for url in podcast_urls:
            try:
                entries = await fetch_rss(url)
                if entries:
                    e = entries[0]  # 只取最新一集
                    items.append(Item(id=e["id"] or e["link"], raw=e))
            except Exception:
                pass
        return items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards = []
        for item in items:
            audio_url = item.raw.get("link", "")
            if not audio_url:
                continue
            try:
                audio_path = await download_audio(audio_url)
                transcript = await transcribe(audio_path)
                prompt = (
                    f"这是一期播客的转录文字，生成结构化摘要，返回 JSON：\n"
                    f'{{"score":7,"summary":"<核心内容100字>","key_points":["<要点1>","<要点2>","<要点3>"],'
                    f'"quotes":["<金句1>"],"tags":["<tag1>","<tag2>"]}}\n\n'
                    f"标题：{item.raw['title']}\n\n转录（前2000字）：{transcript[:2000]}"
                )
                result = await claude_json(prompt, prefs=prefs)
            except Exception as e:
                result = {"score": 5, "summary": f"处理失败: {e}", "key_points": [], "tags": []}

            date_str = datetime.now().strftime("%Y-%m-%d")
            safe_title = item.raw["title"][:50].replace("/", "-").replace("\\", "-")
            cards.append(Card(
                id=item.id,
                title=item.raw["title"],
                summary=result.get("summary", ""),
                score=result.get("score", 5) / 10,
                tags=result.get("tags", []),
                source_url=item.raw.get("link", ""),
                obsidian_path=f"Podcasts/{date_str}-{safe_title}.md",
                metadata={
                    "key_points": result.get("key_points", []),
                    "quotes": result.get("quotes", []),
                },
            ))
        return cards
