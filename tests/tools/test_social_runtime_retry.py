from __future__ import annotations

from datetime import datetime

import pytest

from abo.tools.bilibili import BiliDynamic, BilibiliToolAPI, bilibili_fetch_followed
from abo.tools.xhs_runtime import (
    fetch_xhs_following_feed_result,
    fetch_xhs_keyword_search_result,
)
from abo.tools.xiaohongshu import XHSNote, XiaohongshuAPI


pytestmark = pytest.mark.anyio


async def _skip_sleep(_: float) -> None:
    return None


async def test_xhs_keyword_runtime_retries_transient_failure(monkeypatch):
    attempts = {"count": 0}

    async def fake_search(**kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("transient bridge timeout")
        return {"keyword": kwargs["keyword"], "total_found": 1, "notes": [{"id": "note-1", "title": "科研"}]}

    monkeypatch.setattr("abo.tools.social_runtime_retry.asyncio.sleep", _skip_sleep)
    monkeypatch.setattr("abo.tools.xhs_runtime.xiaohongshu_search", fake_search)

    result = await fetch_xhs_keyword_search_result(
        keyword="科研",
        cookie="web_session=test-token",
        max_results=5,
    )

    assert attempts["count"] == 2
    assert result["keyword"] == "科研"
    assert result["total_found"] == 1


async def test_xhs_following_runtime_retries_transient_failure(monkeypatch):
    attempts = {"count": 0}

    async def fake_get_following_feed_with_cookie(self, **kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("current tab became unavailable")
        return [
            XHSNote(
                id="note-follow-1",
                title="关注流内容",
                content="重试后抓到的内容",
                author="作者A",
                author_id="author-a",
                likes=32,
                collects=4,
                comments_count=1,
                url="https://www.xiaohongshu.com/explore/note-follow-1",
                published_at=datetime.now(),
            )
        ]

    monkeypatch.setattr("abo.tools.social_runtime_retry.asyncio.sleep", _skip_sleep)
    monkeypatch.setattr(XiaohongshuAPI, "get_following_feed_with_cookie", fake_get_following_feed_with_cookie)

    result = await fetch_xhs_following_feed_result(
        cookie="web_session=test-token",
        keywords=["科研"],
        max_notes=5,
    )

    assert attempts["count"] == 2
    assert result["total_found"] == 1
    assert result["notes"][0]["id"] == "note-follow-1"


async def test_bilibili_followed_runtime_retries_transient_failure(monkeypatch):
    attempts = {"count": 0}

    async def fake_fetch_followed_dynamics(self, **kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("temporary connection reset by peer")
        self._last_fetch_stats = {"matched_count_before_keep": 1}
        return [
            BiliDynamic(
                id="bili-dyn-1",
                dynamic_id="bili-dyn-1",
                title="B站动态",
                content="重试后抓到的动态",
                author="测试UP",
                author_id="1001",
                url="https://t.bilibili.com/bili-dyn-1",
                published_at=datetime.now(),
                dynamic_type="text",
            )
        ]

    monkeypatch.setattr("abo.tools.social_runtime_retry.asyncio.sleep", _skip_sleep)
    monkeypatch.setattr(BilibiliToolAPI, "fetch_followed_dynamics", fake_fetch_followed_dynamics)

    result = await bilibili_fetch_followed(
        "fake-sessdata",
        keywords=["科研"],
        limit=5,
    )

    assert attempts["count"] == 2
    assert result["total_found"] == 1
    assert result["dynamics"][0]["dynamic_id"] == "bili-dyn-1"
