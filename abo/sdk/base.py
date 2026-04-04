from abc import ABC, abstractmethod
from .types import Item, Card, FeedbackAction


class Module(ABC):
    """所有 ABO 模块的基类（内置模块和用户自定义模块都继承此类）"""
    id: str = ""
    name: str = ""
    schedule: str = "0 8 * * *"
    icon: str = "rss"
    enabled: bool = True

    def __init_subclass__(cls, **kwargs):
        """子类未显式声明 output 时，默认同时输出到 obsidian 和 ui"""
        super().__init_subclass__(**kwargs)
        if not isinstance(getattr(cls, "output", None), list):
            cls.output = ["obsidian", "ui"]

    @abstractmethod
    async def fetch(self) -> list[Item]:
        """拉取原始数据，返回 Item 列表（不做 Claude 处理）"""
        ...

    @abstractmethod
    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """用 Claude 处理数据，prefs 包含用户偏好，应注入 Claude prompt"""
        ...

    async def on_feedback(self, card_id: str, action: FeedbackAction) -> None:
        """用户操作回调，子类可重写以实现自定义逻辑"""
        pass

    def _module_cookie(self) -> str:
        import json
        from pathlib import Path
        prefs_path = Path.home() / ".abo" / "preferences.json"
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            return data.get("modules", {}).get(self.id, {}).get("cookie", "")
        return ""

    def get_status(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "schedule": self.schedule,
            "icon": self.icon,
            "enabled": self.enabled,
            "output": getattr(self, "output", ["obsidian", "ui"]),
        }
