"""Claude CLI bridge — stream_call (WebSocket) and batch_call (string)."""
import asyncio
from fastapi import WebSocket


async def stream_call(prompt: str, context: str, websocket: WebSocket) -> None:
    """Stream mode: pipe claude CLI output to WebSocket (AI panel)."""
    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt
    process = await asyncio.create_subprocess_exec(
        "claude", "--print", "--output-format", "stream-json", full_prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    async for line in process.stdout:
        await websocket.send_text(line.decode())
    await process.wait()


async def batch_call(prompt: str, context: str = "") -> str:
    """Batch mode: wait for full output (note generation, A+B collision)."""
    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", full_prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()
