"""CLI 运行器 - 支持Raw协议 (Claude --print)"""

import asyncio
import os
from typing import Callable, Optional, Dict, Any
from dataclasses import dataclass
from abc import ABC, abstractmethod
import logging

logger = logging.getLogger(__name__)


@dataclass
class StreamEvent:
    """流式事件"""
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
        """获取环境变量"""
        return dict(os.environ)


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

        try:
            # 构建命令: claude --print
            cmd = [self.cli_info.command] + getattr(self.cli_info, 'acp_args', [])

            logger.info(f"Starting process: {' '.join(cmd)}")

            # 启动进程
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=self._get_env()
            )

            # 发送消息到 stdin
            assert self.process.stdin
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


class RunnerFactory:
    """Runner 工厂"""

    @classmethod
    def create(cls, cli_info, session_id: str, workspace: str = "") -> BaseRunner:
        """创建对应协议的 Runner

        目前只支持 raw 协议 (Claude --print)
        """
        return RawRunner(cli_info, session_id, workspace)
