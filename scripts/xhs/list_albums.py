#!/usr/bin/env python3
"""一键打开小红书收藏专辑页，并列出专辑预览。"""

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
from abo.config import load as load_config
from abo.tools.xhs_crawler import list_xhs_album_previews


def main() -> None:
    parser = argparse.ArgumentParser(description="打开小红书收藏专辑页并提取专辑列表")
    parser.add_argument("--cdp-port", type=int, default=9222)
    parser.add_argument("--vault", default="", help="情报库路径；不传则读取 ABO 配置")
    parser.add_argument("--visible", action="store_true", help="打开可见页面；默认使用后台页面")
    args = parser.parse_args()

    vault_path = args.vault or (str(get_vault_path()) if get_vault_path() else "")
    cookie = load_config().get("xiaohongshu_cookie")
    result = asyncio.run(
        list_xhs_album_previews(
            cookie=cookie,
            vault_path=vault_path or None,
            cdp_port=args.cdp_port,
            background=not args.visible,
            allow_cdp_fallback=args.visible,
        )
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
