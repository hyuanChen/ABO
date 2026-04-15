#!/usr/bin/env python3
"""保守地把某个小红书专辑补抓到目标条数。"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from abo.config import get_vault_path, load as load_config
from abo.tools.xhs_crawler import (
    _get_cookies_via_extension,
    crawl_xhs_albums_incremental,
    list_xhs_album_previews,
)


async def _run(args: argparse.Namespace) -> dict:
    config = load_config()
    vault_path = args.vault or (str(get_vault_path()) if get_vault_path() else "")
    cookie = args.cookie or config.get("xiaohongshu_cookie") or ""
    if not cookie and not args.no_extension_cookie:
        try:
            cookie = await _get_cookies_via_extension(port=args.extension_port)
        except Exception:
            cookie = ""

    if args.board_id:
        target_album = {
            "board_id": args.board_id,
            "name": args.album_name or args.board_id,
            "count": args.target_total,
            "url": args.board_url
            or f"https://www.xiaohongshu.com/board/{args.board_id}?source=web_user_page",
        }
        album_result = {
            "success": True,
            "albums": [target_album],
            "total": 1,
            "message": "已按 board_id 直接构造专辑任务，跳过专辑列表读取",
            "skipped_lookup": True,
        }
    else:
        album_result = await list_xhs_album_previews(
            cookie=cookie,
            vault_path=vault_path or None,
            allow_cdp_fallback=False,
            use_extension=not args.no_extension,
            extension_port=args.extension_port,
            dedicated_window_mode=args.dedicated_window,
        )
        albums = album_result.get("albums", [])
        if not albums:
            raise RuntimeError(album_result.get("message") or "没有读取到专辑列表")
        target_album = albums[0]

    result = await crawl_xhs_albums_incremental(
        [target_album],
        cookie=cookie,
        vault_path=vault_path or None,
        cdp_port=args.cdp_port,
        max_notes_per_album=args.max_loaded_notes,
        crawl_mode="incremental",
        crawl_delay_seconds=args.crawl_delay_seconds,
        batch_size=args.batch_size,
        batch_pause_seconds=args.batch_pause_seconds,
        target_total_notes_per_album=args.target_total,
        use_extension=not args.no_extension,
        extension_port=args.extension_port,
        dedicated_window_mode=args.dedicated_window,
    )
    return {
        "album": target_album,
        "album_lookup": album_result,
        "crawl_result": result,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="把一个专辑保守补抓到目标条数")
    parser.add_argument("--board-id", default="", help="专辑 board_id；不传则选第一张专辑")
    parser.add_argument("--board-url", default="", help="专辑 URL；传 board-id 时可选")
    parser.add_argument("--album-name", default="", help="专辑名；传 board-id 时可选")
    parser.add_argument("--target-total", type=int, default=200, help="目标总条数")
    parser.add_argument("--max-loaded-notes", type=int, default=240, help="最多处理已加载的前 N 条")
    parser.add_argument("--cookie", default="", help="小红书 Cookie；不传则读 ABO 配置")
    parser.add_argument("--vault", default="", help="情报库路径；不传则读 ABO 配置")
    parser.add_argument("--no-extension", action="store_true", help="禁用扩展 bridge")
    parser.add_argument("--extension-port", type=int, default=9334)
    parser.add_argument("--dedicated-window", action="store_true", help="按专用浏览器窗口模式抓取专辑")
    parser.add_argument("--no-extension-cookie", action="store_true", help="不从扩展读取 cookie")
    parser.add_argument("--cdp-port", type=int, default=9222)
    parser.add_argument("--crawl-delay-seconds", type=float, default=18.0)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--batch-pause-seconds", type=float, default=30.0)
    args = parser.parse_args()

    result = asyncio.run(_run(args))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
