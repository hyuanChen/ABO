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
      className="flex items-center justify-between px-3 py-2 rounded-lg border transition-all group"
      style={{
        background: isPositive
          ? "rgba(168, 230, 207, 0.1)"
          : "rgba(255, 183, 178, 0.1)",
        borderColor: isPositive
          ? "rgba(168, 230, 207, 0.3)"
          : "rgba(255, 183, 178, 0.3)",
      }}
    >
      <div className="flex items-center gap-2">
        {isPositive ? (
          <ThumbsUp className="w-4 h-4" style={{ color: "var(--color-success-text)" }} />
        ) : (
          <ThumbsDown className="w-4 h-4" style={{ color: "var(--color-danger-text)" }} />
        )}
        <span style={{ color: "var(--text-secondary)" }}>{keyword}</span>
        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
          ({count}次)
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{
            width: `${intensity}px`,
            background: isPositive
              ? "var(--color-success)"
              : "var(--color-danger)",
          }}
        />
        <span
          className="text-xs font-mono w-12 text-right"
          style={{
            color: isPositive
              ? "var(--color-success-text)"
              : "var(--color-danger-text)",
          }}
        >
          {score > 0 ? "+" : ""}
          {score.toFixed(2)}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "var(--bg-hover)" }}
          >
            <X className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
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
      <div
        className="flex items-center justify-center h-40"
        style={{ color: "var(--text-muted)" }}
      >
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
          <Hash className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--text-main)" }}
          >
            关键词偏好
          </h3>
        </div>
        <button
          onClick={loadPreferences}
          className="text-xs transition-colors hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          刷新
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className="rounded-lg p-3 text-center"
          style={{ background: "var(--bg-hover)" }}
        >
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--color-success-text)" }}
          >
            {likedKeywords.length}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
            喜欢
          </div>
        </div>
        <div
          className="rounded-lg p-3 text-center"
          style={{ background: "var(--bg-hover)" }}
        >
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--color-danger-text)" }}
          >
            {dislikedKeywords.length}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
            不喜欢
          </div>
        </div>
        <div
          className="rounded-lg p-3 text-center"
          style={{ background: "var(--bg-hover)" }}
        >
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            {Object.keys(keywordPrefs).length}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
            总计
          </div>
        </div>
      </div>

      {/* Top Keywords */}
      {topKeywords.length > 0 && (
        <div>
          <h4
            className="text-sm font-medium mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            最喜欢的关键词
          </h4>
          <div className="flex flex-wrap gap-2">
            {topKeywords.slice(0, 8).map(([kw, score]) => (
              <span
                key={kw}
                className="px-3 py-1 rounded-full text-sm"
                style={{
                  background: "rgba(168, 230, 207, 0.15)",
                  border: "1px solid rgba(168, 230, 207, 0.3)",
                  color: "var(--color-success)",
                }}
              >
                {kw}
                <span style={{ opacity: 0.7, marginLeft: "4px" }}>
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
          <h4
            className="text-sm font-medium mb-3 flex items-center gap-2"
            style={{ color: "var(--color-success-text)" }}
          >
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
          <h4
            className="text-sm font-medium mb-3 flex items-center gap-2"
            style={{ color: "var(--color-danger-text)" }}
          >
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
        <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
          <Hash className="w-12 h-12 mx-auto mb-3" style={{ opacity: 0.3 }} />
          <p>还没有关键词偏好</p>
          <p className="text-sm mt-1">
            在Feed中点赞或点踩内容来学习你的偏好
          </p>
        </div>
      )}
    </div>
  );
}
