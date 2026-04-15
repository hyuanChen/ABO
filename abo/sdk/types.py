from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import time


@dataclass
class Item:
    """模块 fetch() 的原始数据单元"""
    id: str
    raw: dict[str, Any]


@dataclass
class Card:
    """经 Agent 处理后的标准化内容卡片"""
    id: str
    title: str
    summary: str
    score: float            # 相关性评分 0.0–1.0
    tags: list[str]
    source_url: str
    obsidian_path: str      # 相对 Vault 根的路径
    module_id: str = ""
    created_at: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "summary": self.summary,
            "score": self.score,
            "tags": self.tags,
            "source_url": self.source_url,
            "obsidian_path": self.obsidian_path,
            "module_id": self.module_id,
            "created_at": self.created_at,
            "read": False,
            "metadata": self.metadata,
        }


class FeedbackAction(str, Enum):
    SAVE      = "save"
    SKIP      = "skip"
    STAR      = "star"
    DEEP_DIVE = "deep_dive"
    LIKE      = "like"
    NEUTRAL   = "neutral"
    DISLIKE   = "dislike"
