// src/components/KeywordPreferences.tsx
// Phase 2: Keyword preference management - liked/disliked keywords

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, TrendingUp, Hash, X } from "lucide-react";
import { useStore } from "../core/store";
import { api } from "../core/api";

interface KeywordItemProps {
  keyword: string;
  score: number;
  count: number;
  onRemove?: () => void;
}

function KeywordItem({ keyword, score, count, onRemove }: KeywordItemProps) {
  const isPositive = score > 0;
  const intensity = Math.min(100, Math.abs(score) * 200);

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
        isPositive
          ? "bg-emerald-950/30 border-emerald-800/50 hover:border-emerald-700"
          : "bg-rose-950/30 border-rose-800/50 hover:border-rose-700"
      }`}
    >
      <div className="flex items-center gap-2">
        {isPositive ? (
          <ThumbsUp className="w-4 h-4 text-emerald-400" />
        ) : (
          <ThumbsDown className="w-4 h-4 text-rose-400" />
        )}
        <span className="text-sm text-slate-200">{keyword}</span>
        <span className="text-xs text-slate-500">({count}次)</span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`h-1.5 rounded-full transition-all ${
            isPositive ? "bg-emerald-500" : "bg-rose-500"
          }`}
          style={{ width: `${intensity}px` }}
        />
        <span
          className={`text-xs font-mono w-12 text-right ${
            isPositive ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {score > 0 ? "+" : ""}
          {score.toFixed(2)}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-1 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3 text-slate-500" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function KeywordPreferences() {
  const { keywordPrefs, setKeywordPrefs } = useStore();
  const [topKeywords, setTopKeywords] = useState<[string, number][]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    try {
      setLoading(true);
      const data = await api.get<any>("/api/preferences/keywords");
      setKeywordPrefs(data.keywords || {});
      setTopKeywords(data.top || []);
    } catch (e) {
      console.error("Failed to load keyword preferences:", e);
    } finally {
      setLoading(false);
    }
  }

  const likedKeywords = Object.entries(keywordPrefs).filter(
    ([, v]) => v.score > 0
  );
  const dislikedKeywords = Object.entries(keywordPrefs).filter(
    ([, v]) => v.score < -0.1
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500">
        <TrendingUp className="w-5 h-5 animate-pulse mr-2" />
        加载偏好数据...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-semibold text-white">关键词偏好</h3>
        </div>
        <button
          onClick={loadPreferences}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          刷新
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {likedKeywords.length}
          </div>
          <div className="text-xs text-slate-500">喜欢</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-rose-400">
            {dislikedKeywords.length}
          </div>
          <div className="text-xs text-slate-500">不喜欢</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-indigo-400">
            {Object.keys(keywordPrefs).length}
          </div>
          <div className="text-xs text-slate-500">总计</div>
        </div>
      </div>

      {/* Top Keywords */}
      {topKeywords.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-3">
            最喜欢的关键词
          </h4>
          <div className="flex flex-wrap gap-2">
            {topKeywords.slice(0, 8).map(([kw, score]) => (
              <span
                key={kw}
                className="px-3 py-1 bg-emerald-950/50 border border-emerald-800/50 rounded-full text-sm text-emerald-300"
              >
                {kw}
                <span className="ml-1 text-emerald-500">
                  +{score.toFixed(2)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Liked Keywords */}
      {likedKeywords.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-emerald-400 mb-3 flex items-center gap-2">
            <ThumbsUp className="w-4 h-4" />
            喜欢 ({likedKeywords.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {likedKeywords
              .sort((a, b) => b[1].score - a[1].score)
              .slice(0, 10)
              .map(([kw, data]) => (
                <KeywordItem
                  key={kw}
                  keyword={kw}
                  score={data.score}
                  count={data.count}
                />
              ))}
          </div>
        </div>
      )}

      {/* Disliked Keywords */}
      {dislikedKeywords.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-rose-400 mb-3 flex items-center gap-2">
            <ThumbsDown className="w-4 h-4" />
            不喜欢 ({dislikedKeywords.length})
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {dislikedKeywords
              .sort((a, b) => a[1].score - b[1].score)
              .map(([kw, data]) => (
                <KeywordItem
                  key={kw}
                  keyword={kw}
                  score={data.score}
                  count={data.count}
                />
              ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {Object.keys(keywordPrefs).length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <Hash className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>还没有关键词偏好</p>
          <p className="text-sm mt-1">
            在Feed中点赞或点踩内容来学习你的偏好
          </p>
        </div>
      )}
    </div>
  );
}
