// src/modules/profile/HexagonRadar.tsx
import { ProfileStats } from "../../core/store";

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
    // Ensure minimum radius so E-grade (0-20) is still visible
    const minR = maxR * 0.15;
    const r = minR + (score / 100) * (maxR - minR);
    return polarToXY(cx, cy, r, angles[i]);
  });

  return (
    <svg
      width="100%"
      style={{ maxWidth: `${viewSize}px` }}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
    >
      {/* Grid rings */}
      {rings.map((pct) => {
        const r = (pct / 100) * maxR;
        const pts = angles.map((a) => polarToXY(cx, cy, r, a));
        return (
          <polygon
            key={pct}
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--border-color)"
            strokeWidth="1"
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
            stroke="var(--border-light)"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <path
        d={toPath(dataPoints)}
        fill="rgb(99 102 241 / 0.25)"
        stroke="#6366F1"
        strokeWidth="2"
      />

      {/* Data dots */}
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x.toFixed(1)} cy={p.y.toFixed(1)}
          r="4"
          fill={DIMS[i].color}
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
              fontSize="11" fill="var(--text-muted)"
            >
              {label}
            </text>
            <text
              x={gp.x.toFixed(1)} y={gp.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontFamily="monospace" fontWeight="bold"
              fill={color}
            >
              {grade}
            </text>
            <title>{`${label}: ${score}/100 (${grade})`}</title>
          </g>
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r="3" fill="rgb(99 102 241 / 0.5)" />
    </svg>
  );
}
