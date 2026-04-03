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
  card_view: <Eye className="w-4 h-4" />,
  card_like: <Heart className="w-4 h-4 text-rose-500" />,
  card_save: <Bookmark className="w-4 h-4 text-amber-500" />,
  card_dislike: <Heart className="w-4 h-4 text-slate-500" />,
  chat_message: <MessageCircle className="w-4 h-4 text-blue-500" />,
  chat_start: <MessageCircle className="w-4 h-4 text-indigo-500" />,
  module_run: <RefreshCw className="w-4 h-4 text-emerald-500" />,
  checkin: <Sparkles className="w-4 h-4 text-purple-500" />,
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
      <div className="flex items-center justify-center h-40 text-slate-500">
        <Clock className="w-5 h-5 animate-spin mr-2" />
        加载今日时间线...
      </div>
    );
  }

  if (!timeline || timeline.activities.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>今日暂无活动记录</p>
        <p className="text-sm mt-1">开始浏览内容或对话吧！</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Section */}
      {timeline.summary ? (
        <div className="bg-gradient-to-r from-indigo-900/50 to-violet-900/50 rounded-xl p-4 border border-indigo-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h4 className="font-semibold text-indigo-200">今日总结</h4>
            <span className="text-xs text-indigo-400/60 ml-auto">
              {timeline.summary_generated_at?.slice(11, 16)}
            </span>
          </div>
          <p className="text-sm text-indigo-100/80 leading-relaxed whitespace-pre-line">
            {timeline.summary}
          </p>
        </div>
      ) : (
        <button
          onClick={generateSummary}
          disabled={generating}
          className="w-full py-3 rounded-xl bg-slate-800/50 border border-slate-700/50
                     hover:bg-slate-800 transition-colors flex items-center justify-center gap-2
                     text-slate-300 text-sm disabled:opacity-50"
        >
          {generating ? (
            <>
              <Clock className="w-4 h-4 animate-spin" />
              正在生成总结...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              生成今日总结
            </>
          )}
        </button>
      )}

      {/* Chat Path */}
      {timeline.chat_path.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-3">今日对话路径</h4>
          <div className="space-y-2">
            {timeline.chat_path.map((chat, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-slate-600 font-mono text-xs pt-0.5">
                  {chat.time.slice(0, 5)}
                </span>
                <div className="flex-1">
                  <span className="text-slate-300">{chat.topic || "未命名话题"}</span>
                  {chat.context && (
                    <p className="text-slate-500 text-xs mt-0.5 line-clamp-1">
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
        <h4 className="text-sm font-medium text-slate-400 mb-3">
          活动记录 ({timeline.activities.length})
        </h4>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {timeline.activities.slice().reverse().map((activity) => (
            <div
              key={activity.id}
              className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
            >
              <span className="text-slate-500">
                {activityIcons[activity.type] || <Clock className="w-4 h-4" />}
              </span>
              <span className="text-xs text-slate-600 font-mono">
                {activity.timestamp.slice(11, 16)}
              </span>
              <span className="text-xs text-slate-500">
                {activityLabels[activity.type] || activity.type}
              </span>
              {activity.card_title && (
                <span className="text-sm text-slate-300 truncate flex-1">
                  {activity.card_title}
                </span>
              )}
              {activity.chat_topic && (
                <span className="text-sm text-slate-300 truncate flex-1">
                  {activity.chat_topic}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-800">
        {Object.entries(timeline.interaction_summary)
          .filter(([_, count]) => count > 0)
          .slice(0, 3)
          .map(([type, count]) => (
            <div key={type} className="text-center">
              <div className="text-xl font-bold text-indigo-400">{count}</div>
              <div className="text-xs text-slate-500">
                {activityLabels[type] || type}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
