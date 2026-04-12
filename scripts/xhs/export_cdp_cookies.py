#!/usr/bin/env python3
"""从已开启 CDP 调试端口的浏览器导出小红书 Cookie。

启动浏览器示例：
open -na "Microsoft Edge" --args --remote-debugging-port=9222
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

import httpx
import websockets


async def export_cookies(port: int, output: Path) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        version = (await client.get(f"http://127.0.0.1:{port}/json/version")).json()
    browser_ws = version.get("webSocketDebuggerUrl")
    if not browser_ws:
        raise RuntimeError("CDP 调试端口未返回 webSocketDebuggerUrl")

    async with websockets.connect(browser_ws, max_size=16 * 1024 * 1024) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Storage.getCookies", "params": {}}))
        while True:
            data = json.loads(await ws.recv())
            if data.get("id") == 1:
                cookies = data.get("result", {}).get("cookies", [])
                break

    xhs_cookies = [
        {
            "name": item.get("name"),
            "value": item.get("value"),
            "domain": item.get("domain"),
            "path": item.get("path", "/"),
        }
        for item in cookies
        if "xiaohongshu.com" in str(item.get("domain", ""))
    ]
    if not xhs_cookies:
        raise RuntimeError("未从 CDP 浏览器读取到小红书 Cookie，请确认浏览器已登录 xiaohongshu.com")
    output.parent.mkdir(parents=True, exist_ok=True)
    cookie_json = json.dumps(xhs_cookies, ensure_ascii=False, indent=2)
    output.write_text(cookie_json, encoding="utf-8")

    config_path = Path.home() / ".abo-config.json"
    config = {}
    if config_path.exists():
        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
        except Exception:
            config = {}
    config["xiaohongshu_cookie"] = json.dumps(xhs_cookies, ensure_ascii=False)
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

    web_session = next((item.get("value") for item in xhs_cookies if item.get("name") == "web_session"), None)
    return {
        "success": True,
        "cookie_count": len(xhs_cookies),
        "has_web_session": bool(web_session),
        "output": str(output),
        "abo_config": str(config_path),
        "message": "已导出 Cookie，并写入 ABO 配置",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="从本地 CDP 浏览器导出小红书 Cookie")
    parser.add_argument("--port", type=int, default=9222)
    parser.add_argument("--output", default=str(Path.home() / "cookies.json"))
    args = parser.parse_args()
    result = asyncio.run(export_cookies(args.port, Path(args.output).expanduser()))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
