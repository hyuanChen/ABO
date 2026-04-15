from __future__ import annotations

import asyncio
import json
from typing import Any


DEFAULT_XHS_EXTENSION_PORT = 9334


class XHSExtensionBridge:
    """本地 WebSocket bridge server，供浏览器扩展连接并执行命令。"""

    def __init__(self, host: str = "127.0.0.1", port: int = DEFAULT_XHS_EXTENSION_PORT) -> None:
        self.host = host
        self.port = port
        self._server = None
        self._extension_ws = None
        self._connected = asyncio.Event()
        self._closed = False
        self._next_id = 1
        self._pending: dict[str, asyncio.Future[Any]] = {}
        self._send_lock = asyncio.Lock()

    async def __aenter__(self) -> "XHSExtensionBridge":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    async def start(self) -> None:
        try:
            import websockets
        except ImportError as exc:
            raise RuntimeError("缺少 websockets，无法启动扩展 bridge server") from exc

        self._server = await websockets.serve(
            self._handle_connection,
            self.host,
            self.port,
            max_size=32 * 1024 * 1024,
            ping_interval=20,
            ping_timeout=20,
        )

    async def close(self) -> None:
        self._closed = True
        for future in self._pending.values():
            if not future.done():
                future.set_exception(RuntimeError("bridge server 已关闭"))
        self._pending.clear()

        if self._extension_ws is not None:
            await self._extension_ws.close()
            self._extension_ws = None

        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def wait_until_ready(self, timeout: float = 15.0) -> None:
        try:
            await asyncio.wait_for(self._connected.wait(), timeout=timeout)
        except TimeoutError as exc:
            raise RuntimeError(
                f"扩展未连接到 ws://{self.host}:{self.port}。请先加载 /Users/huanc/Desktop/ABO/extension 并打开小红书页面。"
            ) from exc

    async def call(self, method: str, params: dict[str, Any] | None = None, timeout: float = 30.0) -> Any:
        await self.wait_until_ready()
        if self._extension_ws is None:
            raise RuntimeError("扩展连接不可用")

        request_id = str(self._next_id)
        self._next_id += 1
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending[request_id] = future

        payload = {"id": request_id, "method": method, "params": params or {}}
        async with self._send_lock:
            await self._extension_ws.send(json.dumps(payload, ensure_ascii=False))

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except TimeoutError as exc:
            self._pending.pop(request_id, None)
            raise RuntimeError(f"扩展命令超时: {method}") from exc

    async def _handle_connection(self, websocket, *args) -> None:
        try:
            async for raw in websocket:
                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                if message.get("role") == "extension":
                    self._extension_ws = websocket
                    self._connected.set()
                    continue

                request_id = str(message.get("id", ""))
                if not request_id:
                    continue
                future = self._pending.pop(request_id, None)
                if future is None or future.done():
                    continue

                if "error" in message and message["error"]:
                    future.set_exception(RuntimeError(str(message["error"])))
                else:
                    future.set_result(message.get("result"))
        finally:
            if self._extension_ws is websocket:
                self._extension_ws = None
                self._connected.clear()
                if not self._closed:
                    for future in self._pending.values():
                        if not future.done():
                            future.set_exception(RuntimeError("扩展连接已断开"))
                    self._pending.clear()
