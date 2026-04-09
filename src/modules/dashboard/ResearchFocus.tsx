// src/modules/dashboard/ResearchFocus.tsx
// Section 4: Research focus — keyword preferences, module distribution
import { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KeywordPref {
  keyword: string;
  score: number;
  count: number;
}

interface ResearchFocusProps {
  keywords: KeywordPref[];
  byModule: Record<string, number>;
}

const MODULE_NAMES: Record<string, string> = {
  "arxiv-tracker": "arXiv",
  "semantic-scholar-tracker": "Semantic Scholar",
  "xiaohongshu-tracker": "Xiaohongshu",
  "bilibili-tracker": "Bilibili",
  "xiaoyuzhou-tracker": "Xiaoyuzhou",
  "zhihu-tracker": "Zhihu",
  "folder-monitor": "Folder",
  arxiv: "arXiv API",
  rss: "RSS",
  podcast: "Podcast",
};

const MODULE_COLORS: Record<string, string> = {
  "arxiv-tracker": "#BCA4E3",
  "semantic-scholar-tracker": "#9B7FD4",
  "xiaohongshu-tracker": "#FF6B6B",
  "bilibili-tracker": "#00AEEC",
  "xiaoyuzhou-tracker": "#FFB7B2",
  "zhihu-tracker": "#FFE4B5",
  "folder-monitor": "#A8E6CF",
  arxiv: "#BCA4E3",
  rss: "#F5C88C",
  podcast: "#7DD3C0",
};

export default function ResearchFocus({ keywords, byModule }: ResearchFocusProps) {
  const liked = useMemo(
    () => keywords.filter((k) => k.score > 0.05).sort((a, b) => b.score - a.score).slice(0, 12),
    [keywords]
  );
  const disliked = useMemo(
    () => keywords.filter((k) => k.score < -0.05).sort((a, b) => a.score - b.score).slice(0, 6),
    [keywords]
  );

  // Donut chart data
  const moduleEntries = useMemo(() => {
    const entries = Object.entries(byModule)
      .map(([id, count]) => ({
        id,
        name: MODULE_NAMES[id] || id,
        count,
        color: MODULE_COLORS[id] || "#BCA4E3",
      }))
      .sort((a, b) => b.count - a.count);
    const total = entries.reduce((s, e) => s + e.count, 0);
    return { entries, total };
  }, [byModule]);

  // Build donut segments
  const donutSegments = useMemo(() => {
    if (moduleEntries.total === 0) return [];
    let cumulative = 0;
    return moduleEntries.entries.map((e) => {
      const pct = e.count / moduleEntries.total;
      const startAngle = cumulative * 360;
      cumulative += pct;
      const endAngle = cumulative * 360;
      return { ...e, pct, startAngle, endAngle };
    });
  }, [moduleEntries]);

  const maxScore = Math.max(...liked.map((k) => Math.abs(k.score)), 0.1);

  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: "24px" }}>
        {/* Keywords section */}
        <div>
          {/* Liked keywords */}
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "12px",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-main)",
              }}
            >
              <TrendingUp style={{ width: "14px", height: "14px", color: "#5BA88C" }} />
              Interests
            </div>
            {liked.length === 0 ? (
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", padding: "12px 0" }}>
                Interact with cards to build your research profile
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {liked.map((k) => {
                  const intensity = Math.min(k.score / maxScore, 1);
                  const opacity = 0.15 + intensity * 0.45;
                  const size = 0.6875 + intensity * 0.1875;
                  return (
                    <div
                      key={k.keyword}
                      title={`Score: ${k.score.toFixed(2)} | ${k.count} interactions`}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "var(--radius-full)",
                        background: `rgba(91, 168, 140, ${opacity})`,
                        fontSize: `${size}rem`,
                        fontWeight: 500,
                        color: "var(--text-main)",
                        cursor: "default",
                        transition: "transform 0.2s",
                      }}
                    >
                      {k.keyword}
                      <span
                        style={{
                          fontSize: "0.625rem",
                          color: "var(--text-muted)",
                          marginLeft: "4px",
                        }}
                      >
                        {k.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Disliked keywords */}
          {disliked.length > 0 && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "8px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                }}
              >
                <TrendingDown style={{ width: "12px", height: "12px", color: "#E89B96" }} />
                Not Interested
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {disliked.map((k) => (
                  <span
                    key={k.keyword}
                    style={{
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      background: "rgba(232, 155, 150, 0.15)",
                      fontSize: "0.6875rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {k.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Module Donut */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{ position: "relative", width: "140px", height: "140px" }}>
            <svg viewBox="0 0 42 42" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
              {donutSegments.map((seg, i) => {
                const circumference = Math.PI * 30; // r=15, so C = 2*pi*15
                const dashLength = seg.pct * circumference;
                const dashOffset =
                  i === 0
                    ? 0
                    : donutSegments.slice(0, i).reduce((s, prev) => s + prev.pct * circumference, 0);
                return (
                  <circle
                    key={seg.id}
                    cx="21"
                    cy="21"
                    r="15"
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="5"
                    strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                    strokeDashoffset={-dashOffset}
                    style={{ transition: "stroke-dasharray 0.5s ease" }}
                  />
                );
              })}
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "var(--text-main)",
                  fontFamily: "'M PLUS Rounded 1c', sans-serif",
                }}
              >
                {moduleEntries.total}
              </span>
              <span style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>cards</span>
            </div>
          </div>

          {/* Module legend */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
            {donutSegments.slice(0, 5).map((seg) => (
              <div
                key={seg.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.6875rem",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: seg.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {seg.name}
                </span>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                  {(seg.pct * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
