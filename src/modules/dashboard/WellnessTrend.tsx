// src/modules/dashboard/WellnessTrend.tsx
// Section 2: 30-day SAN/Happiness/Energy triple-line trend chart
import { useMemo, useState } from "react";

interface DailyWellness {
  date: string;
  san: number | null;
  happiness: number | null;
  energy: number | null;
}

interface WeeklyAvg {
  san: number;
  happiness: number;
  energy: number;
}

interface WellnessData {
  daily: DailyWellness[];
  thisWeekAvg: WeeklyAvg;
  lastWeekAvg: WeeklyAvg;
}

const LINES = [
  { key: "san" as const, label: "SAN", color: "#BCA4E3", max: 100 },
  { key: "happiness" as const, label: "Happiness", color: "#FFB7B2", max: 100 },
  { key: "energy" as const, label: "Energy", color: "#A8E6CF", max: 100 },
];

export default function WellnessTrend({ data }: { data: WellnessData }) {
  const [activeLines, setActiveLines] = useState<Set<string>>(
    new Set(["san", "happiness", "energy"])
  );

  const toggleLine = (key: string) => {
    setActiveLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const chartWidth = 100;
  const chartHeight = 60;

  const paths = useMemo(() => {
    const result: Record<string, { pathD: string; points: { x: number; y: number; value: number; date: string }[] }> = {};

    for (const line of LINES) {
      if (!activeLines.has(line.key)) continue;

      const validPoints: { x: number; y: number; value: number; date: string }[] = [];

      data.daily.forEach((d, index) => {
        const raw = d[line.key];
        if (raw == null) return;
        const normalized = (raw / line.max) * chartHeight;
        validPoints.push({
          x: (index / (data.daily.length - 1)) * chartWidth,
          y: chartHeight - normalized,
          value: raw,
          date: d.date,
        });
      });

      if (validPoints.length < 2) {
        result[line.key] = { pathD: "", points: validPoints };
        continue;
      }

      let pathD = `M ${validPoints[0].x} ${validPoints[0].y}`;
      for (let i = 1; i < validPoints.length; i++) {
        const prev = validPoints[i - 1];
        const curr = validPoints[i];
        const cpx1 = prev.x + (curr.x - prev.x) / 3;
        const cpx2 = prev.x + (2 * (curr.x - prev.x)) / 3;
        pathD += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
      }

      result[line.key] = { pathD, points: validPoints };
    }

    return result;
  }, [data, activeLines]);

  const hasData = Object.values(paths).some((p) => p.points.length > 0);

  if (!hasData) {
    return (
      <div
        style={{
          height: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "0.875rem",
        }}
      >
        Check in daily to see your wellness trends
      </div>
    );
  }

  // Weekly comparison deltas
  const deltas = LINES.map((line) => {
    const tw = data.thisWeekAvg[line.key];
    const lw = data.lastWeekAvg[line.key];
    const delta = tw - lw;
    return { ...line, thisWeek: tw, lastWeek: lw, delta };
  });

  return (
    <div style={{ padding: "16px 0" }}>
      {/* Legend + Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
        {LINES.map((line) => (
          <button
            key={line.key}
            onClick={() => toggleLine(line.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--border-light)",
              background: activeLines.has(line.key) ? `${line.color}20` : "transparent",
              cursor: "pointer",
              opacity: activeLines.has(line.key) ? 1 : 0.4,
              transition: "all 0.2s ease",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              fontWeight: 500,
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: line.color,
              }}
            />
            {line.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ position: "relative", height: "180px", marginBottom: "8px" }}>
        {/* Y-axis */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: "20px",
            width: "24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontSize: "0.625rem",
            color: "var(--text-muted)",
            textAlign: "right",
          }}
        >
          <span>H</span>
          <span>M</span>
          <span>L</span>
        </div>

        <div
          style={{
            position: "absolute",
            left: "32px",
            right: 0,
            top: 0,
            bottom: "20px",
          }}
        >
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            style={{ width: "100%", height: "100%", overflow: "visible" }}
          >
            {/* Grid */}
            {[0, 20, 40, 60].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke="var(--border-light)"
                strokeWidth="0.3"
                strokeDasharray="2,3"
              />
            ))}

            {/* Lines */}
            {LINES.map((line) => {
              const p = paths[line.key];
              if (!p || !p.pathD) return null;
              return (
                <path
                  key={line.key}
                  d={p.pathD}
                  fill="none"
                  stroke={line.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* X-axis dates */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingLeft: "32px",
          fontSize: "0.625rem",
          color: "var(--text-muted)",
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const idx = Math.min(Math.floor(pct * (data.daily.length - 1)), data.daily.length - 1);
          return <span key={pct}>{data.daily[idx]?.date.slice(5)}</span>;
        })}
      </div>

      {/* Weekly comparison cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px",
          marginTop: "20px",
        }}
      >
        {deltas.map((d) => (
          <div
            key={d.key}
            style={{
              padding: "12px",
              background: "var(--bg-hover)",
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "4px" }}>
              {d.label}
            </div>
            <div
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "var(--text-main)",
                fontFamily: "'M PLUS Rounded 1c', sans-serif",
              }}
            >
              {d.thisWeek > 0 ? (d.key === "energy" ? d.thisWeek : d.thisWeek.toFixed(1)) : "—"}
            </div>
            {d.lastWeek > 0 && (
              <div
                style={{
                  fontSize: "0.6875rem",
                  color: d.delta > 0 ? "#5BA88C" : d.delta < 0 ? "#E89B96" : "var(--text-muted)",
                  marginTop: "2px",
                }}
              >
                {d.delta > 0 ? "+" : ""}
                {d.key === "energy" ? d.delta : d.delta.toFixed(1)} vs last week
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
