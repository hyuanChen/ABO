"""RSS 2.0 feed 生成器."""

from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom
from datetime import datetime
from typing import List
from ..store.cards import CardStore
from ..sdk.types import Card


class RSSGenerator:
    """生成标准 RSS 2.0 XML feed."""

    def __init__(
        self,
        title: str = "ABO Intelligence Feed",
        description: str = "Aggregated intelligence from ABO modules",
        link: str = "http://localhost:1420",
        max_items: int = 50,
    ):
        self.title = title
        self.description = description
        self.link = link
        self.max_items = max_items

    def generate(self, cards: List[Card]) -> str:
        """Generate RSS 2.0 XML from cards."""
        rss = Element("rss", version="2.0")
        channel = SubElement(rss, "channel")

        # Channel metadata
        SubElement(channel, "title").text = self.title
        SubElement(channel, "description").text = self.description
        SubElement(channel, "link").text = self.link
        SubElement(channel, "language").text = "zh-CN"
        SubElement(channel, "lastBuildDate").text = self._format_rfc822(datetime.now())
        SubElement(channel, "generator").text = "ABO RSS Generator"

        # Add items
        for card in cards[:self.max_items]:
            item = SubElement(channel, "item")
            self._add_item(item, card)

        # Pretty print
        rough_string = tostring(rss, encoding="unicode")
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent="  ", encoding="utf-8").decode("utf-8")

    def _add_item(self, parent: Element, card: Card):
        """Add a single card as RSS item."""
        SubElement(parent, "title").text = card.title
        SubElement(parent, "description").text = card.summary or ""
        SubElement(parent, "link").text = card.source_url or ""
        SubElement(parent, "guid", isPermaLink="false").text = card.id
        SubElement(parent, "pubDate").text = self._format_rfc822(
            datetime.fromtimestamp(card.created_at)
        )

        # Category from tags
        for tag in card.tags[:3]:  # Max 3 categories
            SubElement(parent, "category").text = tag

        # Source module as comments
        if card.module_id:
            SubElement(parent, "{http://purl.org/dc/elements/1.1/}source").text = card.module_id

    def _format_rfc822(self, dt: datetime) -> str:
        """Format datetime as RFC 822 string."""
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

        day_name = days[dt.weekday()]
        month_name = months[dt.month - 1]

        return f"{day_name}, {dt.day:02d} {month_name} {dt.year} {dt.hour:02d}:{dt.minute:02d}:{dt.second:02d} +0800"


def generate_feed(
    card_store: CardStore,
    title: str = "ABO Intelligence Feed",
    description: str = "Aggregated intelligence from ABO modules",
    link: str = "http://localhost:1420",
    max_items: int = 50,
    days: int = 7,  # Only include recent days
) -> str:
    """Convenience function to generate RSS from card store."""
    import time

    generator = RSSGenerator(title, description, link, max_items)

    # Get recent cards
    since = time.time() - (days * 24 * 3600)
    all_cards = card_store.list(limit=max_items * 2)
    recent_cards = [c for c in all_cards if c.created_at >= since]

    # Sort by created_at desc
    recent_cards.sort(key=lambda c: c.created_at, reverse=True)

    return generator.generate(recent_cards)
