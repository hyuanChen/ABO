"""CLI 运行器 - 支持多种协议"""

import asyncio
import json
import os
import uuid
from typing import Callable, Optional, Dict, Any
from dataclasses import dataclass
from abc import ABC, abstractmethod
import logging

from .env import get_enhanced_cli_env, resolve_cli_command

logger = logging.getLogger(__name__)


@dataclass
class StreamEvent:
    """流式事件"""
    type: str  # start, status, content, tool_call, error, finish
    data: str
    msg_id: str
    metadata: Optional[Dict[str, Any]] = None


class BaseRunner(ABC):
    """CLI Runner 抽象基类"""

    def __init__(
        self,
        cli_info: 'CliInfo',
        session_id: str,
        workspace: str = "",
        resume_session_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
    ):
        self.cli_info = cli_info
        self.session_id = session_id
        self.workspace = workspace or os.getcwd()
        self.resume_session_id = resume_session_id
        self.conversation_id = conversation_id
        self.process: Optional[asyncio.subprocess.Process] = None
        self._closed = False
        self.last_session_handle: Optional[str] = resume_session_id

    @abstractmethod
    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """发送消息并处理流式响应"""
        pass

    async def close(self):
        """关闭 Runner"""
        self._closed = True
        if self.process:
            try:
                if self.process.returncode is None:
                    self.process.terminate()
                    try:
                        await asyncio.wait_for(self.process.wait(), timeout=2.0)
                    except asyncio.TimeoutError:
                        self.process.kill()
                        await self.process.wait()
            except Exception as e:
                logger.warning(f"Error closing process: {e}")
            finally:
                self.process = None

    def _get_env(self) -> dict:
        """获取环境变量 - 移除 CLAUDECODE 避免嵌套会话检测"""
        env = get_enhanced_cli_env()
        # 移除 Claude Code 环境变量，允许在 Claude Code 会话中启动子 Claude 进程
        env.pop('CLAUDECODE', None)
        env.pop('CLAUDE_CODE', None)
        return env

    def _resolve_command(self, env: Optional[dict] = None) -> str:
        active_env = env or self._get_env()
        return resolve_cli_command(self.cli_info.command, env=active_env) or self.cli_info.command


class RawRunner(BaseRunner):
    """原始文本协议 Runner (Claude --print)

    严格按AionUi设计:
    1. 启动进程时发送 prompt 到 stdin
    2. 实时读取 stdout 流式输出
    3. 每收到一行立即触发 content 事件
    4. 进程结束时触发 finish 事件
    5. 确保进程完全终止
    """

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """发送消息并接收流式响应"""

        # 发送开始事件
        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))

        logger.info(f"RawRunner: cli_info={self.cli_info}, acp_args={getattr(self.cli_info, 'acp_args', 'N/A')}")

        try:
            # 构建命令
            # 如果 acp_args 包含 --print，将消息作为命令行参数传递
            # 否则使用 stdin 传递（如 echo/cat 命令）
            acp_args = getattr(self.cli_info, 'acp_args', [])
            use_stdin = not ('--print' in acp_args or '-p' in acp_args)
            env = self._get_env()
            command = self._resolve_command(env)

            if use_stdin:
                cmd = [command] + acp_args
            else:
                cmd = [command] + acp_args + [message]

            logger.info(f"Starting process: {' '.join(cmd[:3])}...")

            # 启动进程
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE if use_stdin else None,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=env
            )

            # 如果需要，通过 stdin 发送消息
            if use_stdin and self.process.stdin:
                input_data = f"{message}\n\n".encode('utf-8')
                self.process.stdin.write(input_data)
                await self.process.stdin.drain()
                self.process.stdin.close()

            # 实时读取 stdout 流式输出
            assert self.process.stdout
            full_content = []

            # 逐行读取，实时发送
            while True:
                try:
                    line = await asyncio.wait_for(
                        self.process.stdout.readline(),
                        timeout=60.0
                    )
                    if not line:
                        break

                    text = line.decode('utf-8', errors='replace')
                    full_content.append(text)

                    # 立即发送 content 事件 (流式)
                    await on_event(StreamEvent(
                        type="content",
                        data=text,
                        msg_id=msg_id
                    ))

                except asyncio.TimeoutError:
                    logger.warning("Read timeout, breaking")
                    break

            # 等待进程结束
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("Process didn't exit, forcing kill")
                self.process.kill()
                await self.process.wait()

            # 读取 stderr (用于调试)
            assert self.process.stderr
            stderr_data = await self.process.stderr.read()
            if stderr_data:
                logger.debug(f"Process stderr: {stderr_data.decode()[:200]}")

            # 发送完成事件
            total_length = sum(len(c) for c in full_content)
            await on_event(StreamEvent(
                type="finish",
                data="",
                msg_id=msg_id,
                metadata={"total_length": total_length}
            ))

        except Exception as e:
            logger.exception("Raw runner error")
            await on_event(StreamEvent(
                type="error",
                data=str(e),
                msg_id=msg_id
            ))
            raise
        finally:
            await self.close()


class CodexRunner(BaseRunner):
    """Codex runner using JSONL events and native session resume."""

    def _exec_options(self) -> list[str]:
        raw_args = set(getattr(self.cli_info, 'acp_args', []) or [])
        options = ["--json"]
        if "--full-auto" in raw_args:
            options.append("--full-auto")
        if "--dangerously-bypass-approvals-and-sandbox" in raw_args:
            options.append("--dangerously-bypass-approvals-and-sandbox")
        if "--skip-git-repo-check" in raw_args:
            options.append("--skip-git-repo-check")
        if "--ignore-user-config" in raw_args:
            options.append("--ignore-user-config")
        if "--ignore-rules" in raw_args:
            options.append("--ignore-rules")
        return options

    def _build_command(self) -> list[str]:
        options = self._exec_options()
        if self.resume_session_id:
            return [
                self.cli_info.command,
                "exec",
                "resume",
                *options,
                self.resume_session_id,
            ]
        return [self.cli_info.command, "exec", *options]

    async def send_message(
        self,
        message: str,
        msg_id: str,
        on_event: Callable[[StreamEvent], None],
    ) -> None:
        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))
        await on_event(
            StreamEvent(
                type="status",
                data="正在启动 Codex 工作机",
                msg_id=msg_id,
                metadata={"phase": "launch", "label": "正在启动 Codex 工作机"},
            )
        )

        finish_sent = False
        total_length = 0

        try:
            cmd = self._build_command()
            logger.info("Starting Codex process: %s", " ".join(cmd[:4]))
            env = self._get_env()
            cmd[0] = self._resolve_command(env)
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=env,
            )
            await on_event(
                StreamEvent(
                    type="status",
                    data="工作机已连接，正在发送任务",
                    msg_id=msg_id,
                    metadata={"phase": "dispatch", "label": "工作机已连接，正在发送任务"},
                )
            )

            if self.process.stdin:
                self.process.stdin.write(f"{message}\n".encode("utf-8"))
                await self.process.stdin.drain()
                self.process.stdin.close()
                await on_event(
                    StreamEvent(
                        type="status",
                        data="任务已送达，等待 Codex 响应",
                        msg_id=msg_id,
                        metadata={"phase": "waiting", "label": "任务已送达，等待 Codex 响应"},
                    )
                )

            assert self.process.stdout
            while True:
                try:
                    line = await asyncio.wait_for(self.process.stdout.readline(), timeout=90.0)
                except asyncio.TimeoutError:
                    logger.warning("Codex read timeout")
                    break

                if not line:
                    break

                delta_length, finish_sent = await self._process_codex_line(
                    line.decode("utf-8", errors="replace"),
                    msg_id,
                    on_event,
                    finish_sent,
                )
                total_length += delta_length

            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("Codex process didn't exit, forcing kill")
                self.process.kill()
                await self.process.wait()

            assert self.process.stderr
            stderr_data = await self.process.stderr.read()
            if stderr_data:
                logger.debug("Codex stderr: %s", stderr_data.decode("utf-8", errors="replace")[:400])

            if not finish_sent:
                metadata = {"total_length": total_length}
                if self.last_session_handle:
                    metadata["thread_id"] = self.last_session_handle
                await on_event(
                    StreamEvent(
                        type="finish",
                        data="",
                        msg_id=msg_id,
                        metadata=metadata,
                    )
                )

        except Exception as e:
            logger.exception("Codex runner error")
            await on_event(StreamEvent(type="error", data=str(e), msg_id=msg_id))
            raise
        finally:
            await self.close()

    async def _process_codex_line(
        self,
        line: str,
        msg_id: str,
        on_event: Callable[[StreamEvent], None],
        finish_sent: bool,
    ) -> tuple[int, bool]:
        text = line.strip()
        if not text or text == "Reading additional input from stdin...":
            return 0, finish_sent

        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            await on_event(StreamEvent(type="content", data=line, msg_id=msg_id))
            return len(line), finish_sent

        event_type = payload.get("type", "")
        if event_type == "thread.started":
            self.last_session_handle = payload.get("thread_id") or self.last_session_handle
            await on_event(
                StreamEvent(
                    type="status",
                    data="已恢复 Codex 会话",
                    msg_id=msg_id,
                    metadata={
                        "phase": "session",
                        "label": "已恢复 Codex 会话",
                        "thread_id": self.last_session_handle,
                    },
                )
            )
            return 0, finish_sent

        if event_type == "turn.started":
            await on_event(
                StreamEvent(
                    type="status",
                    data="Codex 正在思考",
                    msg_id=msg_id,
                    metadata={"phase": "thinking", "label": "Codex 正在思考"},
                )
            )
            return 0, finish_sent

        if event_type == "turn.cancelled":
            await on_event(
                StreamEvent(
                    type="status",
                    data="本轮已取消",
                    msg_id=msg_id,
                    metadata={"phase": "cancelled", "label": "本轮已取消"},
                )
            )
            return 0, finish_sent

        if event_type == "item.started":
            item = payload.get("item") or {}
            if item.get("type") == "command_execution":
                command = item.get("command", "")
                tool_metadata = dict(item)
                tool_metadata.update(
                    {
                        "phase": "tool",
                        "label": "正在执行命令",
                        "detail": command,
                        "command": command,
                    }
                )
                await on_event(
                    StreamEvent(
                        type="status",
                        data="正在执行命令",
                        msg_id=msg_id,
                        metadata={
                            "phase": "tool",
                            "label": "正在执行命令",
                            "detail": command,
                            "command": command,
                        },
                    )
                )
                await on_event(
                    StreamEvent(
                        type="tool_call",
                        data=command,
                        msg_id=msg_id,
                        metadata=tool_metadata,
                    )
                )
            return 0, finish_sent

        if event_type == "item.completed":
            item = payload.get("item") or {}
            item_type = item.get("type", "")
            if item_type == "agent_message":
                agent_text = item.get("text", "")
                if agent_text:
                    await on_event(
                        StreamEvent(
                            type="status",
                            data="正在整理回复",
                            msg_id=msg_id,
                            metadata={"phase": "responding", "label": "正在整理回复"},
                        )
                    )
                    metadata = {"thread_id": self.last_session_handle} if self.last_session_handle else None
                    await on_event(
                        StreamEvent(
                            type="content",
                            data=agent_text,
                            msg_id=msg_id,
                            metadata=metadata,
                        )
                    )
                    return len(agent_text), finish_sent
                return 0, finish_sent

            if item_type == "command_execution":
                command = item.get("command", "")
                tool_metadata = dict(item)
                tool_metadata.update(
                    {
                        "phase": "tool_done",
                        "label": "命令执行完成",
                        "detail": command,
                        "command": command,
                    }
                )
                await on_event(
                    StreamEvent(
                        type="status",
                        data="命令执行完成",
                        msg_id=msg_id,
                        metadata={
                            "phase": "tool_done",
                            "label": "命令执行完成",
                            "detail": command,
                            "command": command,
                        },
                    )
                )
                await on_event(
                    StreamEvent(
                        type="tool_call",
                        data=item.get("aggregated_output", ""),
                        msg_id=msg_id,
                        metadata=tool_metadata,
                    )
                )
            return 0, finish_sent

        if event_type == "turn.completed":
            metadata = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
            metadata = dict(metadata)
            metadata["total_length"] = metadata.get("total_length", 0)
            if self.last_session_handle:
                metadata["thread_id"] = self.last_session_handle
            await on_event(
                StreamEvent(
                    type="finish",
                    data="",
                    msg_id=msg_id,
                    metadata=metadata,
                )
            )
            return 0, True

        if event_type == "error":
            error_message = payload.get("message") or payload.get("error") or "Codex runner error"
            await on_event(StreamEvent(type="error", data=str(error_message), msg_id=msg_id))
            return 0, finish_sent

        return 0, finish_sent


class AcpRunner(BaseRunner):
    """ACP (Agent Communication Protocol) Runner (Gemini, Codex)"""

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """使用 ACP 协议发送消息"""

        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # 启动 ACP 模式
            env = self._get_env()
            cmd = [self._resolve_command(env)] + getattr(self.cli_info, 'acp_args', [])

            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=env
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
            await on_event(StreamEvent(
                type="error",
                data=str(e),
                msg_id=msg_id
            ))
            raise

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
            await on_event(StreamEvent(type="finish", data="", msg_id=msg_id))

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
                    await on_event(StreamEvent(
                        type="content",
                        data=text,
                        msg_id=data.get("id", msg_id)
                    ))

                if status == "completed":
                    await on_event(StreamEvent(
                        type="finish",
                        data="",
                        msg_id=data.get("id", msg_id)
                    ))

            elif method == "tool_call":
                await on_event(StreamEvent(
                    type="tool_call",
                    data=json.dumps(params),
                    msg_id=data.get("id", msg_id),
                    metadata=params
                ))

            elif method == "error":
                await on_event(StreamEvent(
                    type="error",
                    data=params.get("message", "Unknown error"),
                    msg_id=data.get("id", msg_id)
                ))

        except json.JSONDecodeError:
            # 可能是非 JSON 输出，作为内容处理
            await on_event(StreamEvent(
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
        import websockets

        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # 启动 gateway 进程
            env = self._get_env()
            cmd = [self._resolve_command(env)] + getattr(self.cli_info, 'acp_args', [])
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
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
                        await on_event(StreamEvent(
                            type="content",
                            data=data.get("content", ""),
                            msg_id=msg_id
                        ))
                    elif data.get("type") == "complete":
                        await on_event(StreamEvent(
                            type="finish",
                            data="",
                            msg_id=msg_id
                        ))
                        break

        except Exception as e:
            logger.exception("WebSocket runner error")
            await on_event(StreamEvent(
                type="error",
                data=str(e),
                msg_id=msg_id
            ))
            raise


class RunnerFactory:
    """Runner 工厂"""

    RUNNERS = {
        "raw": RawRunner,
        "acp": AcpRunner,
        "websocket": WebSocketRunner,
    }

    @classmethod
    def create(
        cls,
        cli_info: 'CliInfo',
        session_id: str,
        workspace: str = "",
        resume_session_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
    ) -> BaseRunner:
        """创建对应协议的 Runner"""
        if cli_info.id == "codex":
            return CodexRunner(
                cli_info,
                session_id,
                workspace,
                resume_session_id=resume_session_id,
                conversation_id=conversation_id,
            )
        runner_class = cls.RUNNERS.get(cli_info.protocol, RawRunner)
        return runner_class(
            cli_info,
            session_id,
            workspace,
            resume_session_id=resume_session_id,
            conversation_id=conversation_id,
        )
