// src/modules/profile/HexagonRadar.tsx
import { ProfileStats, useStore } from "../../core/store";

interface Props {
  stats: ProfileStats;
  size?: number;
}

const DIMS = [
  { key: "research",  label: "研究力", color: "#6366F1" },
  { key: "output",    label: "产出力", color: "#10B981" },
  { key: "health",    label: "健康力", color: "#F59E0B" },
  { key: "learning",  label: "学习力", color: "#3B82F6" },
  { key: "san",       label: "SAN",   color: "#EC4899" },
  { key: "happiness", label: "幸福感", color: "#8B5CF6" },
] as const;

type DimKey = typeof DIMS[number]["key"];

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function toPath(points: { x: number; y: number }[]) {
  return (
    points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z"
  );
}

export default function HexagonRadar({ stats, size = 280 }: Props) {
  const showcaseMode = useStore((s) => s.showcaseMode);
  const pad = 36;
  const viewSize = size + pad * 2;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const maxR = size * 0.35;
  const labelR = maxR + 30;
  const gradeR = maxR + 16;
  const angles = DIMS.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / 6);
  const rings = [20, 40, 60, 80, 100];

  const dataPoints = DIMS.map(({ key }, i) => {
    const score = stats[key as DimKey]?.score ?? 0;
    const minR = maxR * 0.15;
    const r = minR + (score / 100) * (maxR - minR);
    return polarToXY(cx, cy, r, angles[i]);
  });

  return (
    <svg
      width="100%"
      style={{ maxWidth: `${viewSize}px` }}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      className={showcaseMode ? "showcase-neon-radar" : ""}
    >
      {/* Showcase: gradient defs for neon glow */}
      {showcaseMode && (
        <defs>
          <linearGradient id="neon-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#EC4899" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="neon-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="50%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#F472B6" />
          </linearGradient>
          <filter id="neon-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="dot-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}

      {/* Grid rings */}
      {rings.map((pct) => {
        const r = (pct / 100) * maxR;
        const pts = angles.map((a) => polarToXY(cx, cy, r, a));
        return (
          <polygon
            key={pct}
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke={showcaseMode ? "rgba(139, 92, 246, 0.15)" : "var(--border-color)"}
            strokeWidth={showcaseMode ? "0.8" : "1"}
          />
        );
      })}

      {/* Axis lines */}
      {angles.map((a, i) => {
        const end = polarToXY(cx, cy, maxR, a);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={end.x.toFixed(1)} y2={end.y.toFixed(1)}
            stroke={showcaseMode ? "rgba(139, 92, 246, 0.2)" : "var(--border-light)"}
            strokeWidth={showcaseMode ? "0.8" : "1"}
          />
        );
      })}

      {/* Data polygon */}
      <path
        d={toPath(dataPoints)}
        fill={showcaseMode ? "url(#neon-fill)" : "rgb(99 102 241 / 0.25)"}
        stroke={showcaseMode ? "url(#neon-stroke)" : "#6366F1"}
        strokeWidth={showcaseMode ? "2.5" : "2"}
        filter={showcaseMode ? "url(#neon-glow)" : undefined}
      />

      {/* Data dots */}
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x.toFixed(1)} cy={p.y.toFixed(1)}
          r={showcaseMode ? "5" : "4"}
          fill={DIMS[i].color}
          filter={showcaseMode ? "url(#dot-glow)" : undefined}
        />
      ))}

      {/* Labels + JoJo grade */}
      {DIMS.map(({ key, label, color }, i) => {
        const a = angles[i];
        const lp = polarToXY(cx, cy, labelR, a);
        const gp = polarToXY(cx, cy, gradeR, a);
        const grade = stats[key as DimKey]?.grade ?? "E";
        const score = stats[key as DimKey]?.score ?? 0;

        return (
          <g key={i}>
            <text
              x={lp.x.toFixed(1)} y={lp.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={showcaseMode ? "12" : "11"}
              fontWeight={showcaseMode ? "600" : "400"}
              fill="var(--text-muted)"
            >
              {label}
            </text>
            <text
              x={gp.x.toFixed(1)} y={gp.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={showcaseMode ? "15" : "13"}
              fontFamily="monospace" fontWeight="bold"
              fill={color}
              filter={showcaseMode ? "url(#dot-glow)" : undefined}
            >
              {grade}
            </text>
            <title>{`${label}: ${score}/100 (${grade})`}</title>
          </g>
        );
      })}

      {/* Center dot */}
      <circle
        cx={cx} cy={cy}
        r={showcaseMode ? "4" : "3"}
        fill={showcaseMode ? "url(#neon-stroke)" : "rgb(99 102 241 / 0.5)"}
        filter={showcaseMode ? "url(#dot-glow)" : undefined}
      />
    </svg>
  );
}
