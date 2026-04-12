from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
import subprocess
import json

from ..sdk.tools import build_ai_command


class DailySummaryGenerator:
    def __init__(self, activity_tracker):
        self.tracker = activity_tracker

    def generate_summary(self, date: str) -> Optional[str]:
        """Generate daily summary using the configured AI CLI."""
        timeline = self.tracker.get_timeline(date)

        if not timeline.activities:
            print(f"[summary] No activities for {date}, skipping summary generation")
            return None

        # Build prompt for the configured AI assistant
        prompt = self._build_summary_prompt(timeline)
        provider, command = build_ai_command(prompt)

        try:
            print(f"[summary] Calling {provider} CLI for {date} summary...")
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=120  # 2 minute timeout
            )

            if result.returncode == 0:
                summary = result.stdout.strip()
                # Save summary to timeline
                self.tracker.update_summary(date, summary)
                print(f"[summary] Generated summary ({len(summary)} chars)")
                return summary
            else:
                print(f"[summary] {provider} error: {result.stderr}")
                return None

        except subprocess.TimeoutExpired:
            print(f"[summary] {provider} CLI timeout")
            return None
        except Exception as e:
            print(f"[summary] Error generating summary: {e}")
            return None

    def _build_summary_prompt(self, timeline) -> str:
        """Build prompt for Claude based on today's activities."""
        from ..activity.models import ActivityType

        activities = timeline.activities

        # Group activities by type
        views = [a for a in activities if a.type == ActivityType.CARD_VIEW]
        likes = [a for a in activities if a.type == ActivityType.CARD_LIKE]
        saves = [a for a in activities if a.type == ActivityType.CARD_SAVE]
        chats = [a for a in activities if a.type in [ActivityType.CHAT_START, ActivityType.CHAT_MESSAGE]]

        # Get unique topics from card titles
        topics = set()
        for a in activities:
            if a.card_title:
                topics.add(a.card_title[:50])

        # Get chat path
        chat_path = timeline.get_chat_path()

        prompt = f"""请根据以下今日活动记录，生成一段简洁的中文日报总结（200-300字）：

今日活动统计：
- 浏览内容: {len(views)} 次
- 点赞内容: {len(likes)} 次
- 保存内容: {len(saves)} 次
- 参与对话: {len(chats)} 次

浏览的主题包括：
{chr(10).join(f"- {t}" for t in list(topics)[:10])}

"""

        if chat_path:
            prompt += f"\n今日对话路径：\n"
            for chat in chat_path[-5:]:  # Last 5 chats
                time_str = chat['time'][11:16] if len(chat['time']) > 11 else "--:--"
                prompt += f"- [{time_str}] {chat['topic'] or '未命名话题'}\n"

        prompt += """
请生成一份简洁的日报总结，包括：
1. 今日主要关注领域/主题
2. 重要的互动或发现
3. 对话探索的路径
4. 简洁的建议或展望

用温暖、有洞察力的语气，像一位了解你的助手。

日报总结："""

        return prompt
