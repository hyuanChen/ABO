import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any
from .models import Activity, ActivityType, DailyTimeline
from ..storage_paths import get_activities_dir
import uuid


class ActivityTracker:
    def __init__(self, storage_dir: Path | None = None):
        self.storage_dir = storage_dir or get_activities_dir()
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _get_timeline_path(self, date: str) -> Path:
        return self.storage_dir / f"timeline_{date}.json"

    def record_activity(
        self,
        activity_type: ActivityType,
        card_id: Optional[str] = None,
        card_title: Optional[str] = None,
        module_id: Optional[str] = None,
        chat_topic: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Activity:
        """Record a new activity."""
        now = datetime.now()
        activity = Activity(
            id=str(uuid.uuid4())[:8],
            type=activity_type,
            timestamp=now.isoformat(),
            card_id=card_id,
            card_title=card_title,
            module_id=module_id,
            chat_topic=chat_topic,
            metadata=metadata or {}
        )

        # Load today's timeline
        date_str = now.strftime("%Y-%m-%d")
        timeline = self.get_timeline(date_str)

        # Add activity
        timeline.activities.append(activity)
        timeline.activities.sort(key=lambda x: x.timestamp)

        # Save
        self._save_timeline(timeline)

        return activity

    def get_timeline(self, date: str) -> DailyTimeline:
        """Get or create timeline for a specific date."""
        path = self._get_timeline_path(date)

        if path.exists():
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                activities = [Activity(
                    id=a["id"],
                    type=ActivityType(a["type"]),
                    timestamp=a["timestamp"],
                    user_id=a.get("user_id", "default"),
                    card_id=a.get("card_id"),
                    card_title=a.get("card_title"),
                    module_id=a.get("module_id"),
                    chat_topic=a.get("chat_topic"),
                    metadata=a.get("metadata", {})
                ) for a in data.get("activities", [])]

                return DailyTimeline(
                    date=date,
                    activities=activities,
                    summary=data.get("summary"),
                    summary_generated_at=data.get("summary_generated_at")
                )

        return DailyTimeline(date=date)

    def _save_timeline(self, timeline: DailyTimeline):
        """Save timeline to disk."""
        path = self._get_timeline_path(timeline.date)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump({
                "date": timeline.date,
                "activities": [a.to_dict() for a in timeline.activities],
                "summary": timeline.summary,
                "summary_generated_at": timeline.summary_generated_at
            }, f, ensure_ascii=False, indent=2)

    def get_recent_timelines(self, days: int = 7) -> List[DailyTimeline]:
        """Get timelines for recent days."""
        timelines = []
        for i in range(days):
            date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            timeline = self.get_timeline(date)
            if timeline.activities:
                timelines.append(timeline)
        return timelines

    def update_summary(self, date: str, summary: str):
        """Update the AI-generated summary for a day."""
        timeline = self.get_timeline(date)
        timeline.summary = summary
        timeline.summary_generated_at = datetime.now().isoformat()
        self._save_timeline(timeline)
