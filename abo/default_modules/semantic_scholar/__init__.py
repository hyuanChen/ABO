import asyncio
import httpx
from datetime import datetime

from abo.sdk import Module, Item, Card, claude_json


class SemanticScholarTracker(Module):
    """Fetch follow-up papers from Semantic Scholar API."""

    id = "semantic-scholar-tracker"
    name = "Semantic Scholar 后续论文"
    schedule = "0 9 * * *"  # Daily at 9 AM
    icon = "git-branch"
    output = ["obsidian", "ui"]

    # Semantic Scholar API base URL
    API_BASE = "https://api.semanticscholar.org/graph/v1"

    async def fetch_paper_details(self, arxiv_id: str) -> dict | None:
        """Fetch paper details from Semantic Scholar using arXiv ID."""
        # Remove arxiv: prefix if present
        clean_id = arxiv_id.replace("arxiv:", "").strip()

        url = f"{self.API_BASE}/paper/ARXIV:{clean_id}"
        params = {
            "fields": "paperId,title,abstract,year,citationCount,referenceCount,authors,citations,references"
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    return resp.json()
                elif resp.status_code == 404:
                    # Paper not found in S2
                    return None
                else:
                    print(f"S2 API error: {resp.status_code} - {resp.text[:200]}")
                    return None
        except Exception as e:
            print(f"Failed to fetch paper details: {e}")
            return None

    async def fetch_citations(self, paper_id: str, limit: int = 20) -> list[dict]:
        """Fetch papers that cite this paper."""
        url = f"{self.API_BASE}/paper/{paper_id}/citations"
        params = {
            "fields": "paperId,title,abstract,year,citationCount,authors,url",
            "limit": limit
        }

        citations = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("data", []):
                        citing_paper = item.get("citingPaper", {})
                        if citing_paper.get("title"):
                            citations.append(citing_paper)
                else:
                    print(f"S2 citations API error: {resp.status_code}")
        except Exception as e:
            print(f"Failed to fetch citations: {e}")

        return citations

    async def fetch_references(self, paper_id: str, limit: int = 20) -> list[dict]:
        """Fetch papers cited by this paper."""
        url = f"{self.API_BASE}/paper/{paper_id}/references"
        params = {
            "fields": "paperId,title,abstract,year,citationCount,authors,url",
            "limit": limit
        }

        references = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("data", []):
                        cited_paper = item.get("citedPaper", {})
                        if cited_paper.get("title"):
                            references.append(cited_paper)
                else:
                    print(f"S2 references API error: {resp.status_code}")
        except Exception as e:
            print(f"Failed to fetch references: {e}")

        return references

    async def fetch(
        self,
        arxiv_id: str = None,
        fetch_citations: bool = True,
        fetch_references: bool = False,
        limit: int = 20,
    ) -> list[Item]:
        """Fetch follow-up papers for a given arXiv ID."""
        if not arxiv_id:
            return []

        # Get paper details from S2
        paper_details = await self.fetch_paper_details(arxiv_id)
        if not paper_details:
            return []

        paper_id = paper_details.get("paperId")
        if not paper_id:
            return []

        items = []

        # Fetch citations (papers citing this paper)
        if fetch_citations:
            citations = await self.fetch_citations(paper_id, limit)
            for paper in citations:
                items.append(
                    Item(
                        id=f"s2-citation-{paper.get('paperId', '')}",
                        raw={
                            "title": paper.get("title", ""),
                            "abstract": paper.get("abstract", ""),
                            "authors": [
                                a.get("name", "") for a in paper.get("authors", [])
                            ],
                            "year": paper.get("year"),
                            "citation_count": paper.get("citationCount", 0),
                            "url": paper.get("url", ""),
                            "paper_id": paper.get("paperId"),
                            "relationship": "citation",  # This paper cites the original
                            "source_arxiv_id": arxiv_id,
                        },
                    )
                )

        # Fetch references (papers cited by this paper)
        if fetch_references:
            references = await self.fetch_references(paper_id, limit)
            for paper in references:
                items.append(
                    Item(
                        id=f"s2-reference-{paper.get('paperId', '')}",
                        raw={
                            "title": paper.get("title", ""),
                            "abstract": paper.get("abstract", ""),
                            "authors": [
                                a.get("name", "") for a in paper.get("authors", [])
                            ],
                            "year": paper.get("year"),
                            "citation_count": paper.get("citationCount", 0),
                            "url": paper.get("url", ""),
                            "paper_id": paper.get("paperId"),
                            "relationship": "reference",  # Original paper cites this
                            "source_arxiv_id": arxiv_id,
                        },
                    )
                )

        return items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Process Semantic Scholar papers into cards."""
        cards = []

        for item in items:
            p = item.raw

            # Skip items without abstracts
            if not p.get("abstract"):
                continue

            prompt = (
                f'分析以下学术论文，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"contribution":"<一句话核心创新>"}}\n\n'
                f"标题：{p['title']}\n摘要：{p['abstract'][:600]}"
            )

            try:
                result = await claude_json(prompt, prefs=prefs)
            except Exception:
                result = {}

            # Get first author for filename
            authors = p.get("authors", [])
            first_author = authors[0].split()[-1] if authors else "Unknown"
            year = str(p.get("year", datetime.now().year))

            # Create safe filename from title
            safe_title = (
                p["title"][:40].replace(" ", "-").replace("/", "-").replace(":", "-")
            )

            # Get source arXiv ID for subfolder naming
            source_arxiv = p.get("source_arxiv_id", "unknown")
            subfolder = source_arxiv[:6] if len(source_arxiv) >= 6 else source_arxiv

            # Build relationship label
            relationship = p.get("relationship", "citation")
            rel_label = "引用" if relationship == "citation" else "参考文献"

            cards.append(
                Card(
                    id=item.id,
                    title=p["title"],
                    summary=result.get("summary", p["abstract"][:100]),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", []) + [f"S2-{rel_label}"],
                    source_url=p.get("url", ""),
                    obsidian_path=f"Literature/FollowUps/{subfolder}/{first_author}{year}-{safe_title}.md",
                    metadata={
                        "abo-type": "semantic-scholar-paper",
                        "authors": authors,
                        "paper_id": p.get("paper_id"),
                        "s2_url": p.get("url"),
                        "year": p.get("year"),
                        "citation_count": p.get("citation_count", 0),
                        "contribution": result.get("contribution", ""),
                        "abstract": p["abstract"],
                        "keywords": result.get("tags", []),
                        "relationship": relationship,
                        "source_arxiv_id": source_arxiv,
                        "relationship_label": rel_label,
                    },
                )
            )

        return cards
