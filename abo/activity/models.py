from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum
import json


class ActivityType(Enum):
    CARD_VIEW = "card_view"
    CARD_LIKE = "card_like"
    CARD_SAVE = "card_save"
    CARD_DISLIKE = "card_dislike"
    CARD_SHARE = "card_share"
    CHAT_START = "chat_start"
    CHAT_MESSAGE = "chat_message"
    MODULE_RUN = "module_run"
    CHECKIN = "checkin"


@dataclass
class Activity:
    id: str
    type: ActivityType
    timestamp: str
    user_id: str = "default"
    card_id: Optional[str] = None
    card_title: Optional[str] = None
    module_id: Optional[str] = None
    chat_topic: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type.value,
            "timestamp": self.timestamp,
            "user_id": self.user_id,
            "card_id": self.card_id,
            "card_title": self.card_title,
            "module_id": self.module_id,
            "chat_topic": self.chat_topic,
            "metadata": self.metadata
        }


@dataclass
class DailyTimeline:
    date: str
    activities: List[Activity] = field(default_factory=list)
    summary: Optional[str] = None
    summary_generated_at: Optional[str] = None

    def get_chat_path(self) -> List[Dict]:
        """Extract chat/conversation flow from activities."""
        chats = []
        for activity in self.activities:
            if activity.type in [ActivityType.CHAT_START, ActivityType.CHAT_MESSAGE]:
                chats.append({
                    "time": activity.timestamp,
                    "topic": activity.chat_topic,
                    "context": activity.metadata.get("context", "")
                })
        return chats

    def get_interaction_summary(self) -> Dict[str, int]:
        """Count different types of interactions."""
        counts = {}
        for activity in self.activities:
            type_name = activity.type.value
            counts[type_name] = counts.get(type_name, 0) + 1
        return counts
