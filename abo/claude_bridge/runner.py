"""Claude CLI bridge — Universal CLI Runner with multi-protocol support."""
import asyncio
import json
import os
import uuid
from typing import Callable, Optional, Awaitable
from asyncio.subprocess import PIPE


class CliRunner:
    """通用 CLI 运行器 - 支持 Claude/Gemini 等多 CLI"""

    CLI_CONFIGS = {
        'claude': {
            'command': ['claude', '--print'],
            'env': {},
            'protocol': 'raw',
        },
        'gemini': {
            'command': ['gemini', '--experimental-acp'],
            'env': {},
            'protocol': 'acp',
        },
    }

    def __init__(self, cli_type: str, session_id: str):
        self.cli_type = cli_type
        self.config = self.CLI_CONFIGS.get(cli_type, self.CLI_CONFIGS['claude'])
        self.session_id = session_id
        self.process: Optional[asyncio.subprocess.Process] = None

    async def stream_call(self, message: str, on_chunk: Callable[[dict], Awaitable[None]], timeout: float = 300.0):
        protocol = self.config.get('protocol', 'raw')
        coro = self._stream_acp(message, on_chunk) if protocol == 'acp' else self._stream_raw(message, on_chunk)
        await asyncio.wait_for(coro, timeout=timeout)

    async def _stream_acp(self, message: str, on_chunk: Callable[[dict], Awaitable[None]]):
        self.process = await asyncio.create_subprocess_exec(
            *self.config['command'],
            stdin=PIPE, stdout=PIPE, stderr=PIPE,
            env={**os.environ, **self.config['env']}
        )
        acp_msg = {
            "jsonrpc": "2.0",
            "method": "conversation/submit",
            "params": {"sessionId": self.session_id, "text": message},
            "id": str(uuid.uuid4())
        }
        if self.process.stdin is None:
            raise RuntimeError("Process stdin is not available")
        self.process.stdin.write(json.dumps(acp_msg).encode() + b'\n')
        await self.process.stdin.drain()

        if self.process.stdout is None:
            raise RuntimeError("Process stdout is not available")
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        loop = asyncio.get_event_loop()
        await loop.connect_read_pipe(lambda: protocol, self.process.stdout)

        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                try:
                    data = json.loads(line.decode())
                    event_type = self._parse_acp_event(data)
                    if event_type == 'content':
                        await on_chunk({'type': 'content', 'data': data['params']['content']['text'], 'msg_id': data.get('id', '')})
                    elif event_type == 'finish':
                        await on_chunk({'type': 'finish', 'data': '', 'msg_id': ''})
                        break
                    elif event_type == 'tool_call':
                        await on_chunk({'type': 'tool_call', 'data': json.dumps(data['params']), 'msg_id': data.get('id', '')})
                except json.JSONDecodeError:
                    continue
        finally:
            if self.process:
                await self.process.wait()

    async def _stream_raw(self, message: str, on_chunk: Callable[[dict], Awaitable[None]]):
        self.process = await asyncio.create_subprocess_exec(
            *self.config['command'],
            stdin=PIPE, stdout=PIPE, stderr=PIPE,
        )
        if self.process.stdin is None:
            raise RuntimeError("Process stdin is not available")
        self.process.stdin.write(message.encode() + b'\n')
        await self.process.stdin.drain()
        self.process.stdin.close()

        if self.process.stdout is None:
            raise RuntimeError("Process stdout is not available")
        try:
            buffer = b''
            while True:
                chunk = await self.process.stdout.read(4096)
                if not chunk:
                    break
                buffer += chunk
                lines = buffer.split(b'\n')
                buffer = lines.pop() if lines else b''
                for line in lines:
                    if line:
                        await on_chunk({'type': 'content', 'data': line.decode('utf-8', errors='replace'), 'msg_id': ''})
            if buffer:
                await on_chunk({'type': 'content', 'data': buffer.decode('utf-8', errors='replace'), 'msg_id': ''})
            await on_chunk({'type': 'finish', 'data': '', 'msg_id': ''})
        finally:
            if self.process:
                await self.process.wait()

    def _parse_acp_event(self, data: dict) -> str:
        method = data.get('method', '')
        if method == 'conversation/update':
            status = data.get('params', {}).get('status', '')
            return 'finish' if status == 'completed' else 'content'
        elif method == 'tool_call':
            return 'tool_call'
        return 'unknown'

    def cleanup(self):
        if self.process:
            try:
                self.process.kill()
            except ProcessLookupError:
                pass
            self.process = None


async def stream_call(prompt: str, context: str, websocket):
    runner = CliRunner('claude', str(uuid.uuid4()))
    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt
    async def on_chunk(event: dict):
        await websocket.send_text(json.dumps(event))
    try:
        await runner.stream_call(full_prompt, on_chunk)
    finally:
        runner.cleanup()


async def batch_call(prompt: str, context: str = "") -> str:
    runner = CliRunner('claude', str(uuid.uuid4()))
    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt
    chunks = []
    async def on_chunk(event: dict):
        if event['type'] == 'content':
            chunks.append(event['data'])
    try:
        await runner.stream_call(full_prompt, on_chunk)
    finally:
        runner.cleanup()
    if runner.process and runner.process.returncode != 0:
        raise RuntimeError(f"CLI process exited with code {runner.process.returncode}")
    return ''.join(chunks)
