#!/usr/bin/env python3
"""一键抓取 Bilibili 动态、收藏夹、稍后再看到情报库 bilibili 文件夹。"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from abo.config import get_vault_path
from abo.tools.bilibili_crawler import crawl_bilibili_to_vault


def _cookie_arg(args: argparse.Namespace) -> str:
    if args.cookie:
        return args.cookie
    if args.cookie_file:
        return Path(args.cookie_file).expanduser().read_text(encoding="utf-8")
    return ""


def main() -> None:
    parser = argparse.ArgumentParser(description="抓取 Bilibili 到情报库 bilibili 文件夹")
    parser.add_argument("--cookie", default="", help="Cookie JSON/Header/SESSDATA")
    parser.add_argument("--cookie-file", default="", help="Cookie 文件")
    parser.add_argument("--vault", default="", help="情报库路径；不传则读取 ABO 配置")
    parser.add_argument("--no-cdp", action="store_true", help="不从 Edge CDP 读取完整 Cookie")
    parser.add_argument("--cdp-port", type=int, default=9222)
    parser.add_argument("--dynamic-limit", type=int, default=9)
    parser.add_argument("--favorite-folder-limit", type=int, default=1)
    parser.add_argument("--favorite-item-limit", type=int, default=3)
    parser.add_argument("--watch-later-limit", type=int, default=3)
    args = parser.parse_args()

    vault = args.vault or (str(get_vault_path()) if get_vault_path() else "")
    result = asyncio.run(
        crawl_bilibili_to_vault(
            cookie=_cookie_arg(args) or None,
            vault_path=vault or None,
            include_dynamics=True,
            include_favorites=True,
            include_watch_later=True,
            dynamic_limit=args.dynamic_limit,
            favorite_folder_limit=args.favorite_folder_limit,
            favorite_item_limit=args.favorite_item_limit,
            watch_later_limit=args.watch_later_limit,
            use_cdp=not args.no_cdp,
            cdp_port=args.cdp_port,
        )
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
