import json
from fastapi import WebSocket
from ..sdk.types import Card


class Broadcaster:
    def __init__(self):
        self._clients: list[WebSocket] = []

    def register(self, ws: WebSocket):
        self._clients.append(ws)

    def unregister(self, ws: WebSocket):
        self._clients = [c for c in self._clients if c is not ws]

    async def send_card(self, card: Card):
        await self._broadcast(json.dumps({"type": "new_card", "card": card.to_dict()}))

    async def send_event(self, event: dict):
        await self._broadcast(json.dumps(event))

    async def _broadcast(self, payload: str):
        dead = []
        for ws in self._clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister(ws)


broadcaster = Broadcaster()
