import json
from fastapi import WebSocket
from ..sdk.types import Card


class Broadcaster:
    def __init__(self):
        self._clients: list[WebSocket] = []

    def register(self, ws: WebSocket):
        self._clients.append(ws)
        print(f"[broadcaster] Client registered, total: {len(self._clients)}")

    def unregister(self, ws: WebSocket):
        self._clients = [c for c in self._clients if c is not ws]
        print(f"[broadcaster] Client unregistered, total: {len(self._clients)}")

    async def send_card(self, card: Card):
        await self._broadcast(json.dumps({"type": "new_card", "card": card.to_dict()}))

    async def send_event(self, event: dict):
        await self._broadcast(json.dumps(event))

    async def send_reward(self, action: str, rewards: dict, metadata: dict = None):
        """Broadcast reward notification to all clients."""
        await self._broadcast(json.dumps({
            "type": "reward_earned",
            "action": action,
            "rewards": rewards,
            "metadata": metadata or {},
        }))

    async def _broadcast(self, payload: str):
        if not self._clients:
            print(f"[broadcaster] No clients connected, skipping broadcast")
            return
        dead = []
        print(f"[broadcaster] Broadcasting to {len(self._clients)} clients: {payload[:100]}...")
        for ws in self._clients:
            try:
                await ws.send_text(payload)
                print(f"[broadcaster] Sent to client successfully")
            except Exception as e:
                print(f"[broadcaster] Failed to send: {e}")
                dead.append(ws)
        for ws in dead:
            self.unregister(ws)


broadcaster = Broadcaster()
