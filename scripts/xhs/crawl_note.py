#!/usr/bin/env python3
"""一键抓取单条小红书笔记到情报库 xhs 文件夹。"""

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
from abo.tools.xhs_crawler import classify_xhs_runtime_error, crawl_xhs_note_to_vault


def main() -> None:
    parser = argparse.ArgumentParser(description="抓取小红书单帖并保存为 Markdown")
    parser.add_argument("url", help="小红书 explore 链接或笔记 ID")
    parser.add_argument("--cookie", default="", help="Cookie 字符串；不传则读取 ABO 配置")
    parser.add_argument("--vault", default="", help="情报库路径；不传则读取 ABO 配置")
    parser.add_argument("--video", action="store_true", help="下载视频帖 MP4")
    parser.add_argument("--no-live-photo", action="store_true", help="不下载 Live 图动态 MP4")
    parser.add_argument("--comments", action="store_true", help="在 Markdown 中记录评论抓取选项")
    parser.add_argument("--sub-comments", action="store_true", help="记录二级评论抓取选项")
    parser.add_argument("--comments-limit", type=int, default=20)
    parser.add_argument("--no-extension", action="store_true", help="禁用浏览器扩展 bridge 主链路")
    parser.add_argument("--extension-port", type=int, default=9334, help="扩展 bridge server 端口")
    parser.add_argument("--no-cdp", action="store_true", help="禁用本地浏览器 CDP 兜底")
    parser.add_argument("--cdp-port", type=int, default=9222)
    args = parser.parse_args()

    config = load_config()
    cookie = args.cookie or config.get("xiaohongshu_cookie")
    vault_path = args.vault or (str(get_vault_path()) if get_vault_path() else "")
    try:
        result = asyncio.run(
            crawl_xhs_note_to_vault(
                args.url,
                cookie=cookie,
                vault_path=vault_path or None,
                include_video=args.video,
                include_live_photo=not args.no_live_photo,
                include_comments=args.comments,
                include_sub_comments=args.sub_comments,
                comments_limit=args.comments_limit,
                use_extension=not args.no_extension,
                extension_port=args.extension_port,
                use_cdp=not args.no_cdp,
                cdp_port=args.cdp_port,
            )
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as exc:
        error = classify_xhs_runtime_error(exc)
        print(
            json.dumps(
                {
                    "success": False,
                    "url": args.url,
                    "error_code": error["code"],
                    "error": error["message"],
                    "stopped": error["stop"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
