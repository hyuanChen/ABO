import { useEffect, useState } from "react";
import { Clock, Heart, Bookmark, MessageCircle, Eye, Sparkles, RefreshCw } from "lucide-react";
import { api } from "../core/api";

interface Activity {
  id: string;
  type: string;
  timestamp: string;
  card_title?: string;
  module_id?: string;
  chat_topic?: string;
  metadata?: Record<string, any>;
}

interface TimelineData {
  date: string;
  activities: Activity[];
  summary?: string;
  summary_generated_at?: string;
  chat_path: Array<{ time: string; topic: string; context: string }>;
  interaction_summary: Record<string, number>;
}

const activityIcons: Record<string, React.ReactNode> = {
  card_view: <Eye className="w-4 h-4" style={{ color: "var(--text-muted)" }} />,
  card_like: <Heart className="w-4 h-4" style={{ color: "var(--color-secondary)" }} />,
  card_save: <Bookmark className="w-4 h-4" style={{ color: "var(--color-accent)" }} />,
  card_dislike: <Heart className="w-4 h-4" style={{ color: "var(--text-light)" }} />,
  chat_message: <MessageCircle className="w-4 h-4" style={{ color: "var(--color-primary)" }} />,
  chat_start: <MessageCircle className="w-4 h-4" style={{ color: "var(--color-primary-dark)" }} />,
  module_run: <RefreshCw className="w-4 h-4" style={{ color: "var(--color-success)" }} />,
  checkin: <Sparkles className="w-4 h-4" style={{ color: "var(--color-warning)" }} />,
};

const activityLabels: Record<string, string> = {
  card_view: "浏览",
  card_like: "点赞",
  card_save: "保存",
  card_dislike: "不感兴趣",
  chat_message: "对话",
  chat_start: "开始对话",
  module_run: "运行爬虫",
  checkin: "签到",
};

export default function TimelineView() {
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadTimeline();
  }, []);

  async function loadTimeline() {
    try {
      setLoading(true);
      const data = await api.get<TimelineData>("/api/timeline/today");
      setTimeline(data);
    } catch (e) {
      console.error("Failed to load timeline:", e);
    } finally {
      setLoading(false);
    }
  }

  async function generateSummary() {
    try {
      setGenerating(true);
      await api.post("/api/summary/generate", {});
      await loadTimeline();
    } catch (e) {
      console.error("Failed to generate summary:", e);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40" style={{ color: "var(--text-muted)" }}>
        <Clock className="w-5 h-5 animate-spin mr-2" />
        加载今日时间线...
      </div>
    );
  }

  if (!timeline || timeline.activities.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
        <Clock className="w-12 h-12 mx-auto mb-3" style={{ opacity: 0.3 }} />
        <p>今日暂无活动记录</p>
        <p className="text-sm mt-1" style={{ color: "var(--text-light)" }}>开始浏览内容或对话吧！</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Section */}
      {timeline.summary ? (
        <div
          className="rounded-xl p-4"
          style={{
            background: `linear-gradient(135deg, rgba(188, 164, 227, 0.15), rgba(157, 123, 219, 0.1))`,
            border: "1px solid var(--border-color)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
            <h4 className="font-semibold" style={{ color: "var(--color-primary-dark)" }}>今日总结</h4>
            <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
              {timeline.summary_generated_at?.slice(11, 16)}
            </span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
            {timeline.summary}
          </p>
        </div>
      ) : (
        <button
          onClick={generateSummary}
          disabled={generating}
          className="w-full py-3 rounded-xl text-sm disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            color: "var(--text-secondary)",
          }}
        >
          {generating ? (
            <>
              <Clock className="w-4 h-4 animate-spin inline mr-2" />
              正在生成总结...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 inline mr-2" style={{ color: "var(--color-primary)" }} />
              生成今日总结
            </>
          )}
        </button>
      )}

      {/* Chat Path */}
      {timeline.chat_path.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3" style={{ color: "var(--text-muted)" }}>今日对话路径</h4>
          <div className="space-y-2">
            {timeline.chat_path.map((chat, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="font-mono text-xs pt-0.5" style={{ color: "var(--text-light)" }}>
                  {chat.time.slice(11, 16)}
                </span>
                <div className="flex-1">
                  <span style={{ color: "var(--text-secondary)" }}>{chat.topic || "未命名话题"}</span>
                  {chat.context && (
                    <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "var(--text-muted)" }}>
                      {chat.context}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      <div>
        <h4 className="text-sm font-medium mb-3" style={{ color: "var(--text-muted)" }}>
          活动记录 ({timeline.activities.length})
        </h4>
        <div
          className="space-y-2 max-h-60 overflow-y-auto rounded-lg p-2"
          style={{ background: "var(--bg-hover)" }}
        >
          {timeline.activities.slice().reverse().map((activity) => (
            <div
              key={activity.id}
              className="flex items-center gap-3 p-2 rounded-lg transition-all hover:scale-[1.01]"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-light)",
              }}
            >
              <span>{activityIcons[activity.type] || <Clock className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}</span>
              <span className="text-xs font-mono" style={{ color: "var(--text-light)" }}>
                {activity.timestamp.slice(11, 16)}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {activityLabels[activity.type] || activity.type}
              </span>
              {activity.card_title && (
                <span className="text-sm truncate flex-1" style={{ color: "var(--text-main)" }}>
                  {activity.card_title}
                </span>
              )}
              {activity.chat_topic && (
                <span className="text-sm truncate flex-1" style={{ color: "var(--text-main)" }}>
                  {activity.chat_topic}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div
        className="grid grid-cols-3 gap-3 pt-4"
        style={{ borderTop: "1px solid var(--border-light)" }}
      >
        {Object.entries(timeline.interaction_summary)
          .filter(([_, count]) => count > 0)
          .slice(0, 3)
          .map(([type, count]) => (
            <div key={type} className="text-center">
              <div className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>{count}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {activityLabels[type] || type}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
