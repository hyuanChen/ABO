"""
ABO SDK 工具函数。
所有异步，封装本机工具（claude CLI、yt-dlp、faster-whisper）。
"""
import asyncio
import json
import re
from pathlib import Path

import httpx
import feedparser


def _build_pref_block(prefs: dict) -> str:
    weights = prefs.get("derived_weights", {})
    liked = [t for t, w in weights.items() if w >= 1.1]
    disliked = [t for t, w in weights.items() if w <= 0.7]
    g = prefs.get("global", {})
    return (
        "<user_preferences>\n"
        f"  偏好主题：{', '.join(liked) or '暂无'}\n"
        f"  不感兴趣：{', '.join(disliked) or '暂无'}\n"
        f"  摘要语言：{g.get('summary_language', 'zh')}\n"
        "</user_preferences>"
    )


async def claude(prompt: str, prefs: dict | None = None) -> str:
    """调用本机 claude CLI，返回完整文本（批处理模式）"""
    full = f"{_build_pref_block(prefs)}\n\n{prompt}" if prefs else prompt
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", full,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()


async def claude_json(prompt: str, prefs: dict | None = None) -> dict:
    """调用 claude 并解析 JSON（自动剥离 markdown code fence）"""
    raw = await claude(prompt, prefs=prefs)
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    text = match.group(1) if match else raw
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {}


async def fetch_rss(url: str) -> list[dict]:
    """feedparser 封装，返回 entry 列表"""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, follow_redirects=True)
    feed = feedparser.parse(resp.text)
    return [
        {
            "id": e.get("id") or e.get("link", ""),
            "title": e.get("title", ""),
            "summary": e.get("summary", ""),
            "link": e.get("link", ""),
            "published": e.get("published", ""),
        }
        for e in feed.entries
    ]


async def download_audio(url: str, output_dir: Path | None = None) -> Path:
    """yt-dlp 下载仅音频，返回 mp3 文件路径"""
    out = output_dir or (Path.home() / ".abo" / "tmp" / "audio")
    out.mkdir(parents=True, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        "yt-dlp", "--extract-audio", "--audio-format", "mp3",
        "-o", str(out / "%(id)s.%(ext)s"),
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()
    files = sorted(out.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise FileNotFoundError(f"yt-dlp 下载失败: {url}")
    return files[0]


async def transcribe(audio_path: Path) -> str:
    """faster-whisper 本地转录（在 executor 中运行，避免阻塞事件循环）"""
    loop = asyncio.get_event_loop()

    def _run():
        from faster_whisper import WhisperModel
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(str(audio_path), beam_size=5)
        return " ".join(s.text.strip() for s in segments)

    return await loop.run_in_executor(None, _run)
