"""CLI 运行器 - 支持多种协议 (raw, ACP, websocket)"""

import asyncio
import json
import os
import uuid
from typing import Callable, Optional, Dict, Any
from dataclasses import dataclass
from abc import ABC, abstractmethod
import logging

import websockets

logger = logging.getLogger(__name__)

logger = logging.getLogger(__name__)


@dataclass
class StreamEvent:
    type: str  # start, content, tool_call, error, finish
    data: str
    msg_id: str
    metadata: Optional[Dict[str, Any]] = None


class BaseRunner(ABC):
    """CLI Runner 抽象基类"""

    def __init__(self, cli_info: 'CliInfo', session_id: str, workspace: str = ""):
        self.cli_info = cli_info
        self.session_id = session_id
        self.workspace = workspace or os.getcwd()
        self.process: Optional[asyncio.subprocess.Process] = None
        self._closed = False

    @abstractmethod
    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """发送消息并处理流式响应"""
        pass

    async def _emit(self, on_event: Callable[[StreamEvent], None], event: StreamEvent):
        """发送事件（支持同步和异步回调）"""
        result = on_event(event)
        if asyncio.iscoroutine(result):
            await result

    async def close(self):
        """关闭 Runner"""
        self._closed = True
        if self.process:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                self.process.kill()
            self.process = None

    def _get_env(self) -> dict:
        """获取环境变量"""
        return dict(os.environ)


class RawRunner(BaseRunner):
    """原始文本协议 Runner (Claude --print)"""

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """发送消息并接收流式响应"""

        # 发送开始事件
        await self._emit(on_event, StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # 启动进程 - raw 协议使用 acp_args
            cmd = [self.cli_info.command] + self.cli_info.acp_args

            logger.info(f"RawRunner starting: {' '.join(cmd)}")

            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=self._get_env()
            )

            # 发送消息
            assert self.process.stdin
            input_data = f"{message}\n\n".encode('utf-8')
            self.process.stdin.write(input_data)
            await self.process.stdin.drain()
            self.process.stdin.close()

            # 读取输出
            assert self.process.stdout
            chunks = []

            while True:
                chunk = await self.process.stdout.read(4096)
                if not chunk:
                    break

                text = chunk.decode('utf-8', errors='replace')
                chunks.append(text)

                await self._emit(on_event, StreamEvent(
                    type="content",
                    data=text,
                    msg_id=msg_id
                ))

            # 检查错误
            assert self.process.stderr
            stderr = await self.process.stderr.read()
            if stderr:
                err_text = stderr.decode('utf-8', errors='replace')
                logger.warning(f"CLI stderr: {err_text[:200]}")

            # 等待进程结束
            exit_code = await self.process.wait()
            logger.info(f"RawRunner process exited with code: {exit_code}")

            # 发送完成事件
            await self._emit(on_event, StreamEvent(
                type="finish",
                data="",
                msg_id=msg_id,
                metadata={"total_length": sum(len(c) for c in chunks)}
            ))

        except Exception as e:
            logger.exception("Raw runner error")
            await self._emit(on_event, StreamEvent(
                type="error",
                data=str(e),
                msg_id=msg_id
            ))
            raise
        finally:
            await self.close()


class AcpRunner(BaseRunner):
    """ACP (Agent Communication Protocol) Runner (Gemini, Codex)"""

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """使用 ACP 协议发送消息"""

        await self._emit(on_event, StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # 启动 ACP 模式
            cmd = [self.cli_info.command] + self.cli_info.acp_args

            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=self._get_env()
            )

            # 发送 ACP 初始化消息
            init_msg = {
                "jsonrpc": "2.0",
                "method": "initialize",
                "params": {"sessionId": self.session_id},
                "id": str(uuid.uuid4())
            }

            await self._send_acp_message(init_msg)

            # 发送对话消息
            chat_msg = {
                "jsonrpc": "2.0",
                "method": "conversation/submit",
                "params": {
                    "sessionId": self.session_id,
                    "text": message
                },
                "id": msg_id
            }

            await self._send_acp_message(chat_msg)

            # 读取响应
            await self._read_acp_stream(on_event, msg_id)

        except Exception as e:
            logger.exception("ACP runner error")
            await self._emit(on_event, StreamEvent(
                type="error",
                data=str(e),
                msg_id=msg_id
            ))
            raise
        finally:
            await self.close()

    async def _send_acp_message(self, msg: dict):
        """发送 ACP 消息"""
        assert self.process and self.process.stdin
        data = json.dumps(msg) + "\n"
        self.process.stdin.write(data.encode())
        await self.process.stdin.drain()

    async def _read_acp_stream(self, on_event: Callable, msg_id: str):
        """读取 ACP 流式响应"""
        assert self.process and self.process.stdout

        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        loop = asyncio.get_event_loop()

        # 将 stdout 连接到 StreamReader
        transport, _ = await loop.connect_read_pipe(
            lambda: protocol, self.process.stdout
        )

        buffer = b""

        try:
            while not self._closed:
                try:
                    chunk = await asyncio.wait_for(reader.read(4096), timeout=30.0)
                    if not chunk:
                        break

                    buffer += chunk

                    # 处理完整行
                    while b"\n" in buffer:
                        line, buffer = buffer.split(b"\n", 1)
                        await self._process_acp_line(line.decode(), on_event, msg_id)

                except asyncio.TimeoutError:
                    logger.warning("ACP read timeout")
                    break

        finally:
            transport.close()
            await self._emit(on_event, StreamEvent(type="finish", data="", msg_id=msg_id))

    async def _process_acp_line(self, line: str, on_event: Callable, msg_id: str):
        """处理单行 ACP 消息"""
        line = line.strip()
        if not line:
            return

        try:
            data = json.loads(line)
            method = data.get("method", "")
            params = data.get("params", {})

            if method == "conversation/update":
                content = params.get("content", {})
                text = content.get("text", "")
                status = params.get("status", "")

                if text:
                    await self._emit(on_event, StreamEvent(
                        type="content",
                        data=text,
                        msg_id=data.get("id", msg_id)
                    ))

                if status == "completed":
                    await self._emit(on_event, StreamEvent(
                        type="finish",
                        data="",
                        msg_id=data.get("id", msg_id)
                    ))

            elif method == "tool_call":
                await self._emit(on_event, StreamEvent(
                    type="tool_call",
                    data=json.dumps(params),
                    msg_id=data.get("id", msg_id),
                    metadata=params
                ))

            elif method == "error":
                await self._emit(on_event, StreamEvent(
                    type="error",
                    data=params.get("message", "Unknown error"),
                    msg_id=data.get("id", msg_id)
                ))

        except json.JSONDecodeError:
            # 可能是非 JSON 输出，作为内容处理
            await self._emit(on_event, StreamEvent(
                type="content",
                data=line,
                msg_id=msg_id
            ))


class WebSocketRunner(BaseRunner):
    """WebSocket 协议 Runner (OpenClaw Gateway)"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.ws = None
        self.ws_url = "ws://localhost:8080"  # OpenClaw 默认端口

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """通过 WebSocket 发送消息"""

        await self._emit(on_event, StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # 启动 gateway 进程
            cmd = [self.cli_info.command] + self.cli_info.acp_args
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # 等待 gateway 启动
            await asyncio.sleep(2)

            # 连接 WebSocket
            async with websockets.connect(self.ws_url) as ws:
                self.ws = ws

                # 发送消息
                await ws.send(json.dumps({
                    "type": "message",
                    "sessionKey": self.session_id,
                    "content": message
                }))

                # 接收响应
                async for response in ws:
                    data = json.loads(response)

                    if data.get("type") == "chunk":
                        await self._emit(on_event, StreamEvent(
                            type="content",
                            data=data.get("content", ""),
                            msg_id=msg_id
                        ))
                    elif data.get("type") == "complete":
                        await self._emit(on_event, StreamEvent(
                            type="finish",
                            data="",
                            msg_id=msg_id
                        ))
                        break

        except Exception as e:
            logger.exception("WebSocket runner error")
            await self._emit(on_event, StreamEvent(
                type="error",
                data=str(e),
                msg_id=msg_id
            ))
            raise
        finally:
            await self.close()


class RunnerFactory:
    """Runner 工厂"""

    RUNNERS = {
        "raw": RawRunner,
        "acp": AcpRunner,
        "websocket": WebSocketRunner,
    }

    @classmethod
    def create(cls, cli_info: 'CliInfo', session_id: str,
               workspace: str = "") -> BaseRunner:
        """创建对应协议的 Runner"""
        runner_class = cls.RUNNERS.get(cli_info.protocol, RawRunner)
        return runner_class(cli_info, session_id, workspace)
