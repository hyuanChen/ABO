"""arXiv API tool - on-demand paper search using the official arxiv package"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal, Optional
import asyncio
import logging
import re
from pathlib import Path

import arxiv
import httpx

logger = logging.getLogger(__name__)

__all__ = ["ArxivAPITool", "ArxivPaper", "arxiv_api_search"]


@dataclass
class ArxivPaper:
    """Standardized arXiv paper result"""
    id: str
    title: str
    authors: list[str]
    summary: str
    published: datetime
    updated: datetime
    categories: list[str]
    primary_category: str
    pdf_url: str
    arxiv_url: str
    doi: Optional[str]
    journal_ref: Optional[str]
    comment: Optional[str]


class ArxivAPITool:
    """Wrapper around the arxiv package for ABO integration"""

    def __init__(self):
        self.client = arxiv.Client(
            page_size=100,
            delay_seconds=3.0,
            num_retries=3
        )

    def _build_query(
        self,
        keywords: list[str],
        categories: Optional[list[str]] = None,
        mode: Literal["AND", "OR"] = "OR",
        author: Optional[str] = None,
        title: Optional[str] = None,
    ) -> str:
        parts = []

        if keywords:
            if mode == "AND":
                kw_query = " AND ".join(f'"{kw}"' for kw in keywords)
                parts.append(f"({kw_query})")
            else:
                kw_query = " OR ".join(f'"{kw}"' for kw in keywords)
                parts.append(f"({kw_query})")

        if categories:
            cat_query = " OR ".join(f"cat:{cat}" for cat in categories)
            parts.append(f"({cat_query})")

        if author:
            parts.append(f'au:"{author}"')

        if title:
            parts.append(f'ti:"{title}"')

        return " AND ".join(parts) if parts else "all:*"

    async def search(
        self,
        keywords: list[str],
        categories: Optional[list[str]] = None,
        mode: Literal["AND", "OR"] = "OR",
        max_results: int = 50,
        days_back: Optional[int] = None,
        sort_by: Literal["submittedDate", "relevance", "lastUpdatedDate"] = "submittedDate",
        sort_order: Literal["descending", "ascending"] = "descending",
        author: Optional[str] = None,
        title: Optional[str] = None,
    ) -> list[ArxivPaper]:
        """Search arXiv for papers matching the given criteria.

        Args:
            keywords: List of search keywords
            categories: Optional list of arXiv categories (e.g., ["cs.AI", "cs.LG"])
            mode: "AND" or "OR" for combining keywords
            max_results: Maximum number of results to return
            days_back: Optional filter for papers published within N days
            sort_by: Sort criterion ("submittedDate", "relevance", "lastUpdatedDate")
            sort_order: Sort direction ("descending" or "ascending")
            author: Optional author name filter
            title: Optional title filter

        Returns:
            List of ArxivPaper objects matching the search criteria
        """
        query = self._build_query(keywords, categories, mode, author, title)

        sort_map = {
            "submittedDate": arxiv.SortCriterion.SubmittedDate,
            "relevance": arxiv.SortCriterion.Relevance,
            "lastUpdatedDate": arxiv.SortCriterion.LastUpdatedDate,
        }
        sort_criterion = sort_map.get(sort_by, arxiv.SortCriterion.SubmittedDate)
        if sort_by not in sort_map:
            logger.warning(f"Invalid sort_by value: {sort_by}, using 'submittedDate'")

        sort_dir_map = {
            "descending": arxiv.SortOrder.Descending,
            "ascending": arxiv.SortOrder.Ascending,
        }
        sort_direction = sort_dir_map.get(sort_order, arxiv.SortOrder.Descending)
        if sort_order not in sort_dir_map:
            logger.warning(f"Invalid sort_order value: {sort_order}, using 'descending'")

        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=sort_criterion,
            sort_order=sort_direction,
        )

        try:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, lambda: list(self.client.results(search)))
        except Exception as e:
            logger.error(f"[arxiv_api] Failed to search arXiv: {e}")
            return []

        papers = []
        cutoff = datetime.utcnow() - timedelta(days=days_back) if days_back else None

        for result in results:
            if cutoff and result.published.replace(tzinfo=None) < cutoff:
                continue

            papers.append(ArxivPaper(
                id=result.get_short_id(),
                title=result.title,
                authors=[str(a) for a in result.authors],
                summary=result.summary,
                published=result.published,
                updated=result.updated,
                categories=result.categories,
                primary_category=result.primary_category,
                pdf_url=result.pdf_url,
                arxiv_url=result.entry_id,
                doi=result.doi,
                journal_ref=result.journal_ref,
                comment=result.comment,
            ))

        return papers

    async def fetch_figures(self, arxiv_id: str) -> list[dict]:
        """Fetch figures from arXiv HTML version."""
        html_url = f"https://arxiv.org/html/{arxiv_id}"
        figures = []

        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(html_url, headers={"User-Agent": "ABO-arXiv-API/1.0"}, timeout=15)

            if resp.status_code != 200:
                return figures

            html = resp.text

            # Look for img tags that are likely pipeline/method figures
            img_pattern = r'<img[^>]+src="([^"]+)"[^>]*>'

            found_urls = set()
            img_matches = list(re.finditer(img_pattern, html, re.IGNORECASE))

            for i, match in enumerate(img_matches[:8]):  # Limit to first 8 images
                try:
                    src = match.group(1)
                    if not src:
                        continue

                    # Extract alt from the same img tag
                    img_tag = match.group(0)
                    alt_match = re.search(r'alt="([^"]*)"', img_tag, re.IGNORECASE)
                    alt = alt_match.group(1) if alt_match else ""

                    # Skip non-figure images
                    if any(skip in src.lower() for skip in ['icon', 'logo', 'button', 'spacer', 'avatar']):
                        continue

                    # Make absolute URL
                    if src.startswith('/'):
                        src = f"https://arxiv.org{src}"
                    elif not src.startswith('http'):
                        # Handle relative paths - arxiv HTML uses paths like "2604.01216v1/x1.png"
                        if src.startswith(arxiv_id + '/'):
                            src = f"https://arxiv.org/html/{src}"
                        else:
                            src = f"https://arxiv.org/html/{arxiv_id}/{src}"

                    if src in found_urls:
                        continue
                    found_urls.add(src)

                    # Check if it's a method/pipeline related figure
                    alt_lower = alt.lower()
                    is_method_figure = any(kw in alt_lower for kw in [
                        'method', 'pipeline', 'architecture', 'framework',
                        'overview', 'structure', 'model', 'system', 'approach',
                        'flowchart', 'diagram', 'fig', 'figure', 'network',
                        'proposed', 'illustration', 'schematic'
                    ])

                    figures.append({
                        'url': src,
                        'caption': alt[:100] if alt else f"Figure {i+1}",
                        'is_method': is_method_figure,
                        'type': 'img'
                    })
                except Exception:
                    continue

            # Sort: prioritize method figures, then by caption
            figures.sort(key=lambda x: (not x['is_method'], x['caption']))
            figures = figures[:4]  # Limit to top 4 figures

        except Exception as e:
            logger.warning(f"Failed to fetch figures for {arxiv_id}: {e}")

        return figures

    def to_dict(self, paper: ArxivPaper) -> dict:
        """Convert an ArxivPaper to a dictionary.

        Args:
            paper: ArxivPaper instance to convert

        Returns:
            Dictionary representation of the paper
        """
        return {
            "id": paper.id,
            "title": paper.title,
            "authors": paper.authors,
            "summary": paper.summary,
            "published": paper.published.isoformat() if paper.published else None,
            "updated": paper.updated.isoformat() if paper.updated else None,
            "categories": paper.categories,
            "primary_category": paper.primary_category,
            "pdf_url": paper.pdf_url,
            "arxiv_url": paper.arxiv_url,
            "doi": paper.doi,
            "journal_ref": paper.journal_ref,
            "comment": paper.comment,
        }


async def arxiv_api_search(
    keywords: list[str],
    categories: Optional[list[str]] = None,
    mode: Literal["AND", "OR"] = "OR",
    max_results: int = 50,
    days_back: Optional[int] = None,
    sort_by: Literal["submittedDate", "relevance", "lastUpdatedDate"] = "submittedDate",
    sort_order: Literal["descending", "ascending"] = "descending",
    author: Optional[str] = None,
    title: Optional[str] = None,
) -> list[dict]:
    """Convenience function to search arXiv and return results as dictionaries.

    Args:
        keywords: List of search keywords
        categories: Optional list of arXiv categories (e.g., ["cs.AI", "cs.LG"])
        mode: "AND" or "OR" for combining keywords
        max_results: Maximum number of results to return
        days_back: Optional filter for papers published within N days
        sort_by: Sort criterion ("submittedDate", "relevance", "lastUpdatedDate")
        sort_order: Sort direction ("descending" or "ascending")
        author: Optional author name filter
        title: Optional title filter

    Returns:
        List of dictionaries containing paper information
    """
    tool = ArxivAPITool()
    papers = await tool.search(
        keywords=keywords,
        categories=categories,
        mode=mode,
        max_results=max_results,
        days_back=days_back,
        sort_by=sort_by,
        sort_order=sort_order,
        author=author,
        title=title,
    )
    return [tool.to_dict(p) for p in papers]
