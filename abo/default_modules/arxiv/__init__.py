import json
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

import httpx

from abo.sdk import Module, Item, Card, claude_json


class ArxivTracker(Module):
    id       = "arxiv-tracker"
    name     = "arXiv 论文追踪"
    schedule = "0 8 * * *"
    icon     = "book-open"
    output   = ["obsidian", "ui"]

    _NS = {"a": "http://www.w3.org/2005/Atom"}

    async def fetch(self) -> list[Item]:
        from pathlib import Path
        prefs_path = Path.home() / ".abo" / "preferences.json"
        keywords = ["machine learning"]
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            keywords = data.get("modules", {}).get("arxiv-tracker", {}).get(
                "keywords", keywords
            )

        query = "+OR+".join(f'all:{kw.replace(" ", "+")}' for kw in keywords)
        url = (
            f"http://export.arxiv.org/api/query"
            f"?search_query={query}&max_results=30"
            f"&sortBy=submittedDate&sortOrder=descending"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)

        root = ET.fromstring(resp.text)
        items = []
        cutoff = datetime.utcnow() - timedelta(days=2)

        for entry in root.findall("a:entry", self._NS):
            raw_id = entry.find("a:id", self._NS).text.strip()
            arxiv_id = raw_id.split("/abs/")[-1]

            published_str = entry.find("a:published", self._NS).text.strip()
            published = datetime.fromisoformat(
                published_str.replace("Z", "+00:00")
            ).replace(tzinfo=None)
            if published < cutoff:
                continue

            items.append(Item(
                id=arxiv_id,
                raw={
                    "title": entry.find("a:title", self._NS).text.strip().replace("\n", " "),
                    "abstract": entry.find("a:summary", self._NS).text.strip(),
                    "authors": [
                        a.find("a:name", self._NS).text
                        for a in entry.findall("a:author", self._NS)
                    ],
                    "url": f"https://arxiv.org/abs/{arxiv_id}",
                    "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}",
                    "published": published.strftime("%Y-%m-%d"),
                },
            ))
        return items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards = []
        for item in items:
            p = item.raw
            prompt = (
                f'分析以下 arXiv 论文，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"contribution":"<一句话核心创新>"}}\n\n'
                f"标题：{p['title']}\n摘要：{p['abstract'][:600]}"
            )
            try:
                result = await claude_json(prompt, prefs=prefs)
            except Exception:
                result = {}

            first_author = (p["authors"][0].split()[-1] if p["authors"] else "Unknown")
            year = p["published"][:4]
            slug = p["title"][:40].replace(" ", "-").replace("/", "-")

            cards.append(Card(
                id=item.id,
                title=p["title"],
                summary=result.get("summary", p["abstract"][:100]),
                score=min(result.get("score", 5), 10) / 10,
                tags=result.get("tags", []),
                source_url=p["url"],
                obsidian_path=f"Literature/{first_author}{year}-{slug}.md",
                metadata={
                    "abo-type": "arxiv-paper",
                    "authors": p["authors"],
                    "arxiv-id": item.id,
                    "pdf-url": p["pdf_url"],
                    "published": p["published"],
                    "contribution": result.get("contribution", ""),
                },
            ))
        return cards
