#!/usr/bin/env python3
"""一键抓取 Bilibili 关注动态到情报库 bilibili/dynamic。"""

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


def main() -> None:
    parser = argparse.ArgumentParser(description="抓取 Bilibili 动态")
    parser.add_argument("--vault", default="", help="情报库路径；不传则读取 ABO 配置")
    parser.add_argument("--limit", type=int, default=9)
    parser.add_argument("--no-cdp", action="store_true")
    parser.add_argument("--cdp-port", type=int, default=9222)
    args = parser.parse_args()

    vault = args.vault or (str(get_vault_path()) if get_vault_path() else "")
    result = asyncio.run(
        crawl_bilibili_to_vault(
            vault_path=vault or None,
            include_dynamics=True,
            include_favorites=False,
            include_watch_later=False,
            dynamic_limit=args.limit,
            use_cdp=not args.no_cdp,
            cdp_port=args.cdp_port,
        )
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
