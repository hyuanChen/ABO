"""
ABO SDK 工具函数。
所有异步，封装本机工具（claude CLI、yt-dlp、faster-whisper）。
"""
import asyncio
import json
import os
import re
from pathlib import Path

import httpx
import feedparser

from ..config import get_ai_provider


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


def resolve_ai_provider(provider: str | None = None) -> str:
    """Resolve provider with config fallback."""
    resolved = (provider or get_ai_provider()).strip().lower()
    if resolved not in {"codex", "claude"}:
        return "codex"
    return resolved


def build_ai_command(
    prompt: str,
    prefs: dict | None = None,
    provider: str | None = None,
) -> tuple[str, list[str]]:
    """Build the CLI command for the configured AI provider."""
    full = f"{_build_pref_block(prefs)}\n\n{prompt}" if prefs else prompt
    resolved = resolve_ai_provider(provider)

    if resolved == "codex":
        return resolved, [
            "codex",
            "exec",
            "--full-auto",
            "--skip-git-repo-check",
            "--color",
            "never",
            full,
        ]

    return resolved, ["claude", "--print", full]


async def agent(
    prompt: str,
    prefs: dict | None = None,
    timeout: int = 30,
    provider: str | None = None,
) -> str:
    """调用当前配置的 Agent CLI。"""
    resolved, command = build_ai_command(prompt, prefs=prefs, provider=provider)
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=os.getcwd(),
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        if proc.returncode not in (0, None):
            detail = stderr.decode().strip() or stdout.decode().strip() or f"{resolved} exited with {proc.returncode}"
            raise Exception(f"{resolved} CLI 调用失败: {detail}")
        return stdout.decode().strip()
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise Exception(f"{resolved} CLI 调用超时（{timeout}秒）")


async def agent_json(prompt: str, prefs: dict | None = None, provider: str | None = None) -> dict:
    """调用当前配置的 Agent CLI 并解析 JSON（自动剥离 markdown code fence）"""
    raw = await agent(prompt, prefs=prefs, provider=provider)
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    text = match.group(1) if match else raw
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {}


# Backward-compatible aliases for older modules.
claude = agent
claude_json = agent_json


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
