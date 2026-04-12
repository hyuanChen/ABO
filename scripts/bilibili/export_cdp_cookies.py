#!/usr/bin/env python3
"""一键导出 Bilibili Cookie：优先 CDP，失败后扫描本机浏览器 Cookie。"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from abo.tools.bilibili_crawler import export_bilibili_cookies_auto


async def _run(port: int, output: Path) -> dict:
    cookies = await export_bilibili_cookies_auto(port)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(cookies, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"success": True, "cookie_count": len(cookies), "output": str(output)}


def main() -> None:
    parser = argparse.ArgumentParser(description="从本地 CDP 浏览器导出 Bilibili Cookie")
    parser.add_argument("--port", type=int, default=9222)
    parser.add_argument("--output", default=str(Path.home() / "bilibili_cookies.json"))
    args = parser.parse_args()

    result = asyncio.run(_run(args.port, Path(args.output).expanduser()))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
