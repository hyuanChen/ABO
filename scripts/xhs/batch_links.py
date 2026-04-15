#!/usr/bin/env python3
"""批量抓取小红书链接到情报库 xhs 文件夹。"""

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


def _load_links(args: argparse.Namespace) -> list[str]:
    links: list[str] = []
    if args.file:
        for line in Path(args.file).expanduser().read_text(encoding="utf-8").splitlines():
            clean = line.strip()
            if clean and not clean.startswith("#"):
                links.append(clean)
    links.extend(args.urls or [])
    unique: list[str] = []
    for link in links:
        if link not in unique:
            unique.append(link)
    return unique


async def _run(args: argparse.Namespace) -> list[dict]:
    config = load_config()
    cookie = args.cookie or config.get("xiaohongshu_cookie")
    vault_path = args.vault or (str(get_vault_path()) if get_vault_path() else "")
    results = []
    for idx, link in enumerate(_load_links(args), 1):
        try:
            result = await crawl_xhs_note_to_vault(
                link,
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
            results.append(result)
            print(f"[{idx}] OK {result['markdown_path']}")
        except Exception as exc:
            classified = classify_xhs_runtime_error(exc)
            error = {
                "success": False,
                "url": link,
                "error_code": classified["code"],
                "error": classified["message"],
                "stopped": classified["stop"],
            }
            results.append(error)
            print(f"[{idx}] FAIL {link}: {classified['message']}", file=sys.stderr)
            if classified["stop"]:
                print(f"[{idx}] STOP 批量任务已停止，原因: {classified['code']}", file=sys.stderr)
                break
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="批量抓取小红书链接")
    parser.add_argument("urls", nargs="*", help="小红书 explore 链接或笔记 ID")
    parser.add_argument("--file", default="", help="链接列表文件，每行一个")
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

    if not _load_links(args):
        parser.error("需要传入 URL 或 --file")

    results = asyncio.run(_run(args))
    print(json.dumps({"total": len(results), "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
