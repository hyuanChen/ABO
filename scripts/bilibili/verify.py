#!/usr/bin/env python3
"""一键验证 Bilibili 登录态。"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from abo.tools.bilibili_crawler import resolve_cookie_header, verify_cookie_header


async def _run(args: argparse.Namespace) -> dict:
    cookie = args.cookie or (Path(args.cookie_file).expanduser().read_text(encoding="utf-8") if args.cookie_file else "")
    header = await resolve_cookie_header(cookie or None, use_cdp=not args.no_cdp, cdp_port=args.cdp_port)
    return await verify_cookie_header(header)


def main() -> None:
    parser = argparse.ArgumentParser(description="验证 Bilibili Cookie 是否可用")
    parser.add_argument("--cookie", default="", help="Cookie JSON/Header/SESSDATA")
    parser.add_argument("--cookie-file", default="", help="Cookie 文件")
    parser.add_argument("--no-cdp", action="store_true", help="不从 Edge CDP 读取完整 Cookie")
    parser.add_argument("--cdp-port", type=int, default=9222)
    args = parser.parse_args()

    result = asyncio.run(_run(args))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
