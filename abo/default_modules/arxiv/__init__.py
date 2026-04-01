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

    async def fetch(self, custom_keywords: list[str] = None, max_results: int = 20, existing_ids: set[str] = None, mode: str = "AND", cs_only: bool = True) -> list[Item]:
        from pathlib import Path
        import asyncio
        import re

        prefs_path = Path.home() / ".abo" / "preferences.json"
        keywords = custom_keywords or ["machine learning"]
        if not custom_keywords and prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            keywords = data.get("modules", {}).get("arxiv-tracker", {}).get(
                "keywords", keywords
            )

        # Build query based on mode
        if mode.upper() == "AND":
            # AND mode: all keywords must be in abstract
            # Use OR for API query (to get candidates), then filter locally
            query = "+OR+".join(f'all:{kw.replace(" ", "+")}' for kw in keywords)
        else:
            # OR mode: any keyword matches
            query = "+OR+".join(f'all:{kw.replace(" ", "+")}' for kw in keywords)

        # Add CS category filter if enabled
        category_filter = "cat:cs.*" if cs_only else ""
        if category_filter:
            query = f"({query})+AND+{category_filter}"

        url = (
            f"https://export.arxiv.org/api/query"
            f"?search_query={query}&max_results={max_results * 10}"  # Fetch more for filtering
            f"&sortBy=submittedDate&sortOrder=descending"
        )

        max_retries = 3
        last_error = None
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                    resp = await client.get(url, headers={"User-Agent": "ABO-arXiv-Tracker/1.0"})

                if resp.status_code == 429:
                    wait_time = 2 ** attempt
                    if attempt < max_retries - 1:
                        await asyncio.sleep(wait_time)
                        continue
                    raise Exception(f"arXiv API rate limit exceeded. Please wait a moment and try again.")

                if resp.status_code != 200:
                    raise Exception(f"arXiv API returned {resp.status_code}: {resp.text[:200]}")

                if not resp.text or resp.text.strip() == "":
                    raise Exception("arXiv API returned empty response")

                text = resp.text.strip()
                if not text.startswith("<?xml") and not text.startswith("<feed"):
                    raise Exception(f"arXiv API returned non-XML response: {text[:200]}")

                break
            except (httpx.ReadTimeout, httpx.ConnectTimeout) as e:
                last_error = e
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                else:
                    raise Exception(f"arXiv API timeout after {max_retries} retries")
        else:
            if last_error:
                raise Exception(f"arXiv API failed: {last_error}")

        root = ET.fromstring(resp.text)
        items = []
        cutoff = datetime.utcnow() - timedelta(days=60)  # Extended for CS-only filter
        existing_ids = existing_ids or set()

        for entry in root.findall("a:entry", self._NS):
            try:
                raw_id_elem = entry.find("a:id", self._NS)
                if raw_id_elem is None or not raw_id_elem.text:
                    continue
                raw_id = raw_id_elem.text.strip()
                arxiv_id = raw_id.split("/abs/")[-1]

                # Skip if already in literature library
                if arxiv_id in existing_ids:
                    continue

                published_elem = entry.find("a:published", self._NS)
                if published_elem is None or not published_elem.text:
                    continue
                published_str = published_elem.text.strip()
                published = datetime.fromisoformat(
                    published_str.replace("Z", "+00:00")
                ).replace(tzinfo=None)
                if published < cutoff:
                    continue

                summary_elem = entry.find("a:summary", self._NS)
                if summary_elem is None or not summary_elem.text:
                    continue
                abstract = summary_elem.text.strip()

                # Apply AND filter if mode is AND
                if mode.upper() == "AND":
                    abstract_lower = abstract.lower()
                    if not all(kw.lower() in abstract_lower for kw in keywords):
                        continue

                title_elem = entry.find("a:title", self._NS)
                title = title_elem.text.strip().replace("\n", " ") if title_elem and title_elem.text else "Untitled"

                authors = []
                for author in entry.findall("a:author", self._NS):
                    name_elem = author.find("a:name", self._NS)
                    if name_elem and name_elem.text:
                        authors.append(name_elem.text)

                items.append(Item(
                    id=arxiv_id,
                    raw={
                        "title": title,
                        "abstract": abstract,
                        "authors": authors,
                        "url": f"https://arxiv.org/abs/{arxiv_id}",
                        "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}",
                        "published": published.strftime("%Y-%m-%d"),
                    },
                ))

                # Stop once we have enough unique items
                if len(items) >= max_results:
                    break
            except Exception as e:
                # Skip problematic entries
                continue

        return items

    async def fetch_figures(self, arxiv_id: str) -> list[dict]:
        """Fetch figures from arXiv HTML version."""
        html_url = f"https://arxiv.org/html/{arxiv_id}"
        figures = []

        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(html_url, headers={"User-Agent": "ABO-arXiv-Tracker/1.0"})

            if resp.status_code != 200:
                return figures

            html = resp.text
            import re

            # Look for img tags that are likely pipeline/method figures
            # arXiv HTML has img tags with src pointing to figures
            img_pattern = r'<img[^>]+src="([^"]+)"[^>]*>'
            alt_pattern = r'<img[^>]*alt="([^"]*)"[^>]*>'

            found_urls = set()
            img_matches = list(re.finditer(img_pattern, html, re.IGNORECASE))

            for i, match in enumerate(img_matches[:5]):  # Limit to first 5 images
                try:
                    src = match.group(1)
                    if not src:
                        continue

                    # Extract alt from the same img tag
                    img_tag = match.group(0)
                    alt_match = re.search(r'alt="([^"]*)"', img_tag, re.IGNORECASE)
                    alt = alt_match.group(1) if alt_match else ""

                    # Skip non-figure images
                    if any(skip in src.lower() for skip in ['icon', 'logo', 'button', 'spacer']):
                        continue

                    # Make absolute URL
                    if src.startswith('/'):
                        src = f"https://arxiv.org{src}"
                    elif not src.startswith('http'):
                        src = f"https://arxiv.org/html/{arxiv_id}/{src}"

                    if src in found_urls:
                        continue
                    found_urls.add(src)

                    # Check if it's a method/pipeline related figure
                    alt_lower = alt.lower()
                    is_method_figure = any(kw in alt_lower for kw in [
                        'method', 'pipeline', 'architecture', 'framework',
                        'overview', 'structure', 'model', 'system', 'approach',
                        'flowchart', 'diagram', 'fig', 'figure'
                    ])

                    figures.append({
                        'url': src,
                        'caption': alt[:100] if alt else f"Figure {i+1}",
                        'is_method': is_method_figure,
                        'type': 'img'
                    })
                except Exception:
                    continue

            # Limit to first 3 figures, prioritize method figures
            figures.sort(key=lambda x: (not x['is_method'], x['caption']))
            figures = figures[:3]

        except Exception as e:
            print(f"Failed to fetch figures for {arxiv_id}: {e}")

        return figures

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards = []
        for item in items:
            p = item.raw

            # Fetch figures for this paper
            figures = await self.fetch_figures(item.id)

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
                    "abstract": p["abstract"],
                    "keywords": result.get("tags", []),
                    "figures": figures,  # Add figures to metadata
                },
            ))
        return cards
