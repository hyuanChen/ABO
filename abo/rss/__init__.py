"""RSS 聚合模块 - 将爬取结果输出为标准 RSS 2.0 feed."""

from .generator import RSSGenerator, generate_feed
from .routes import router as rss_router

__all__ = ["RSSGenerator", "generate_feed", "rss_router"]
