// src/modules/dashboard/EngagementDepth.tsx
// Section 3: Reading depth — views vs deep reads, quality metrics, week comparison
import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface EngagementCounts {
  totalViewed: number;
  liked: number;
  saved: number;
  starred: number;
  disliked: number;
  skipped: number;
}

interface DailyEngagement {
  date: string;
  viewed: number;
  deepRead: number;
  rate: number;
}

interface WeekComparison {
  thisWeek: EngagementCounts;
  lastWeek: EngagementCounts;
  cardsDelta: number;
  engagementRateDelta: number;
}

interface EngagementData {
  overall: EngagementCounts;
  dailyTrend: DailyEngagement[];
  weekComparison: WeekComparison;
}

export default function EngagementDepth({ data }: { data: EngagementData }) {
  const overallRate =
    data.overall.totalViewed > 0
      ? (data.overall.liked + data.overall.saved + data.overall.starred) / data.overall.totalViewed
      : 0;

  // Sparkline for engagement rate
  const sparkline = useMemo(() => {
    const rates = data.dailyTrend.filter((d) => d.viewed > 0);
    if (rates.length < 2) return null;

    const maxRate = Math.max(...rates.map((r) => r.rate), 0.01);
    const w = 100;
    const h = 30;
    const points = rates.map((r, i) => ({
      x: (i / (rates.length - 1)) * w,
      y: h - (r.rate / maxRate) * h,
    }));

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      d += ` C ${prev.x + (curr.x - prev.x) / 3} ${prev.y}, ${prev.x + (2 * (curr.x - prev.x)) / 3} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    return d;
  }, [data.dailyTrend]);

  // Stacked bar: views vs engagement breakdown (last 14 days)
  const recentBars = useMemo(() => {
    return data.dailyTrend.slice(-14);
  }, [data.dailyTrend]);

  const maxViewed = Math.max(...recentBars.map((d) => d.viewed), 1);

  const tw = data.weekComparison.thisWeek;
  const twDeep = tw.liked + tw.saved + tw.starred;
  const twRate = tw.totalViewed > 0 ? twDeep / tw.totalViewed : 0;

  const DeltaIcon =
    data.weekComparison.engagementRateDelta > 0
      ? TrendingUp
      : data.weekComparison.engagementRateDelta < 0
      ? TrendingDown
      : Minus;

  const deltaColor =
    data.weekComparison.engagementRateDelta > 0
      ? "#5BA88C"
      : data.weekComparison.engagementRateDelta < 0
      ? "#E89B96"
      : "var(--text-muted)";

  return (
    <div style={{ padding: "16px 0" }}>
      {/* Top metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        {/* Deep read rate */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            padding: "16px",
            background: "linear-gradient(135deg, rgba(188, 164, 227, 0.1), rgba(188, 164, 227, 0.05))",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(188, 164, 227, 0.2)",
          }}
        >
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Deep Read Rate</span>
          <span
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--text-main)",
              fontFamily: "'M PLUS Rounded 1c', sans-serif",
            }}
          >
            {(overallRate * 100).toFixed(0)}%
          </span>
          {sparkline && (
            <svg viewBox="0 0 100 30" style={{ width: "80px", height: "24px" }}>
              <path d={sparkline} fill="none" stroke="#BCA4E3" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>

        {/* This week engagement */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            padding: "16px",
            background: "var(--bg-hover)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>This Week</span>
          <span
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--text-main)",
              fontFamily: "'M PLUS Rounded 1c', sans-serif",
            }}
          >
            {twDeep}
            <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-muted)" }}>
              /{tw.totalViewed}
            </span>
          </span>
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            {(twRate * 100).toFixed(0)}% engaged
          </span>
        </div>

        {/* Week-over-week */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            padding: "16px",
            background: "var(--bg-hover)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>vs Last Week</span>
          <DeltaIcon style={{ width: "24px", height: "24px", color: deltaColor }} />
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: deltaColor }}>
            {data.weekComparison.cardsDelta > 0 ? "+" : ""}
            {data.weekComparison.cardsDelta} cards
          </span>
          <span style={{ fontSize: "0.6875rem", color: deltaColor }}>
            {data.weekComparison.engagementRateDelta > 0 ? "+" : ""}
            {(data.weekComparison.engagementRateDelta * 100).toFixed(1)}% rate
          </span>
        </div>
      </div>

      {/* 14-day stacked bar chart */}
      <div style={{ marginBottom: "8px" }}>
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: "12px",
          }}
        >
          14-Day View vs Deep Read
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${recentBars.length}, 1fr)`,
            gap: "4px",
            alignItems: "end",
            height: "80px",
          }}
        >
          {recentBars.map((d) => {
            const totalH = (d.viewed / maxViewed) * 100;
            const deepH = d.viewed > 0 ? (d.deepRead / d.viewed) * totalH : 0;
            return (
              <div
                key={d.date}
                title={`${d.date.slice(5)}: ${d.viewed} viewed, ${d.deepRead} deep read`}
                style={{
                  height: `${Math.max(totalH, 4)}%`,
                  borderRadius: "3px 3px 0 0",
                  background: "rgba(188, 164, 227, 0.2)",
                  position: "relative",
                  overflow: "hidden",
                  minHeight: "3px",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${deepH}%`,
                    background: "linear-gradient(180deg, #BCA4E3, #9B7FD4)",
                    borderRadius: "0 0 0 0",
                    minHeight: d.deepRead > 0 ? "2px" : 0,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${recentBars.length}, 1fr)`,
            gap: "4px",
            marginTop: "4px",
          }}
        >
          {recentBars.map((d, i) => (
            <span
              key={d.date}
              style={{
                fontSize: "0.5rem",
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              {i % 2 === 0 ? d.date.slice(8) : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginTop: "12px",
          fontSize: "0.6875rem",
          color: "var(--text-muted)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "2px",
              background: "rgba(188, 164, 227, 0.2)",
            }}
          />
          Viewed
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "2px",
              background: "#BCA4E3",
            }}
          />
          Deep Read
        </div>
      </div>
    </div>
  );
}
