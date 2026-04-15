#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from abo.tools.xhs_extension_bridge import XHSExtensionBridge


async def main_async(url: str, port: int) -> dict:
    async with XHSExtensionBridge(port=port) as bridge:
        await bridge.wait_until_ready(timeout=20)
        await bridge.call("navigate", {"url": url}, timeout=45)
        await bridge.call("wait_for_load", {"timeout": 45000}, timeout=45)
        await bridge.call("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15)
        result = await bridge.call(
            "evaluate",
            {
                "expression": (
                    "(() => ({"
                    "href: location.href,"
                    "title: document.title || '',"
                    "hasState: !!window.__INITIAL_STATE__,"
                    "text: (document.body?.innerText || '').slice(0, 300)"
                    "}))()"
                )
            },
            timeout=20,
        )
        return {"success": True, "port": port, "url": url, "result": result}


def main() -> None:
    parser = argparse.ArgumentParser(description="验证 XHS 浏览器扩展 bridge 是否可用")
    parser.add_argument("--url", default="https://www.xiaohongshu.com/")
    parser.add_argument("--port", type=int, default=9334)
    args = parser.parse_args()
    result = asyncio.run(main_async(args.url, args.port))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
