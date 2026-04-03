"""RSS 相关的 FastAPI 路由."""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from ..config import load as load_config, save as save_config
from ..store.cards import CardStore
from .generator import generate_feed

router = APIRouter(prefix="/api/rss", tags=["rss"])


class RSSConfig(BaseModel):
    enabled: bool
    title: str
    description: str
    max_items: int = 50


class RSSConfigResponse(BaseModel):
    enabled: bool
    title: str
    description: str
    max_items: int
    feed_url: str


@router.get("/feed")
async def get_rss_feed(request: Request):
    """Get the aggregated RSS feed."""
    config = load_config()

    # Check if RSS is enabled
    if not config.get("rss_enabled", False):
        raise HTTPException(status_code=404, detail="RSS feed is disabled")

    # Get host for link
    host = str(request.base_url).rstrip("/")

    card_store = CardStore()
    feed_xml = generate_feed(
        card_store=card_store,
        title=config.get("rss_title", "ABO Intelligence Feed"),
        description=config.get("rss_description", "Aggregated intelligence from ABO modules"),
        link=host,
        max_items=config.get("rss_max_items", 50),
    )

    return Response(
        content=feed_xml,
        media_type="application/rss+xml; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/config", response_model=RSSConfigResponse)
async def get_rss_config(request: Request):
    """Get RSS configuration."""
    config = load_config()

    host = str(request.base_url).rstrip("/")
    feed_url = f"{host}/api/rss/feed" if config.get("rss_enabled", False) else ""

    return RSSConfigResponse(
        enabled=config.get("rss_enabled", False),
        title=config.get("rss_title", "ABO Intelligence Feed"),
        description=config.get("rss_description", "Aggregated intelligence from ABO modules"),
        max_items=config.get("rss_max_items", 50),
        feed_url=feed_url,
    )


@router.post("/config", response_model=RSSConfigResponse)
async def update_rss_config(config_update: RSSConfig, request: Request):
    """Update RSS configuration."""
    config = load_config()

    config["rss_enabled"] = config_update.enabled
    config["rss_title"] = config_update.title
    config["rss_description"] = config_update.description
    config["rss_max_items"] = max(10, min(200, config_update.max_items))  # Clamp 10-200

    save_config(config)

    host = str(request.base_url).rstrip("/")
    feed_url = f"{host}/api/rss/feed" if config_update.enabled else ""

    return RSSConfigResponse(
        enabled=config_update.enabled,
        title=config_update.title,
        description=config_update.description,
        max_items=config["rss_max_items"],
        feed_url=feed_url,
    )
