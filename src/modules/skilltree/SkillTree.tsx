import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { Lock } from "lucide-react";
import { api } from "../../core/api";
import { useStore, SkillDef } from "../../core/store";

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string; ring: string }> = {
  "academic-foundation": { label: "学术基础", color: "text-indigo-600 dark:text-indigo-400",   ring: "#6366F1" },
  "creativity":          { label: "创意研究", color: "text-violet-600 dark:text-violet-400",   ring: "#8B5CF6" },
  "productivity":        { label: "效率管理", color: "text-emerald-600 dark:text-emerald-400", ring: "#10B981" },
  "domain":              { label: "领域技能", color: "text-amber-600 dark:text-amber-400",     ring: "#F59E0B" },
};

// ── SVG circular progress ring ────────────────────────────────────────────────

function XpRing({
  pct, size = 56, ring, unlocked,
}: { pct: number; size?: number; ring: string; unlocked: boolean }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (unlocked ? pct / 100 : 0));

  return (
    <svg width={size} height={size} className="absolute inset-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="currentColor" strokeWidth={4}
        className="text-slate-200 dark:text-slate-700" />
      {unlocked && (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={ring} strokeWidth={4}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      )}
    </svg>
  );
}

// ── Skill card ────────────────────────────────────────────────────────────────

function SkillCard({ skill }: { skill: SkillDef }) {
  const meta = CATEGORY_META[skill.category] ?? CATEGORY_META["domain"];
  const pct = Math.round((skill.xp_in_level / skill.xp_for_next) * 100);

  return (
    <div className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-150 ${
      skill.unlocked
        ? "bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md hover:-translate-y-0.5"
        : "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60"
    }`}>
      {/* Lock badge */}
      {!skill.unlocked && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
          <Lock className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500" aria-hidden />
        </div>
      )}

      {/* XP ring + level */}
      <div className="relative w-14 h-14 flex items-center justify-center">
        <XpRing pct={pct} ring={meta.ring} unlocked={skill.unlocked} />
        <span className="font-heading text-lg font-bold text-slate-700 dark:text-slate-300 relative z-10">
          {skill.level}
        </span>
      </div>

      {/* Name */}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center leading-tight">
        {skill.name}
      </p>

      {/* XP info */}
      {skill.unlocked && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {skill.xp_in_level} / {skill.xp_for_next} XP
        </p>
      )}

      {/* Unlock condition */}
      {!skill.unlocked && skill.unlock_condition && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center leading-tight">
          {Object.entries(skill.unlock_condition)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}

// ── D3 dependency graph ───────────────────────────────────────────────────────

function DependencyGraph({ skills }: { skills: SkillDef[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const nodes = useMemo(() =>
    skills.map((s) => ({ id: s.id, name: s.name, unlocked: s.unlocked, level: s.level })),
    [skills]
  );

  const links = useMemo(() =>
    skills.flatMap((s) =>
      s.unlocks.map((parentId) => ({ source: parentId, target: s.id }))
    ),
    [skills]
  );

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;
    const el = svgRef.current;
    const W = el.clientWidth || 600;
    const H = el.clientHeight || 260;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el);

    // Arrow marker
    svg.append("defs").append("marker")
      .attr("id", "arrow").attr("viewBox", "0 -5 10 10")
      .attr("refX", 20).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path").attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#94A3B8");

    const sim = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(36));

    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#CBD5E1")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer");

    node.append("circle")
      .attr("r", 22)
      .attr("fill", (d: any) => d.unlocked ? "#6366F1" : "#E2E8F0")
      .attr("stroke", (d: any) => d.unlocked ? "#818CF8" : "#CBD5E1")
      .attr("stroke-width", 2);

    node.append("text")
      .attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("fill", (d: any) => d.unlocked ? "#fff" : "#94A3B8")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .text((d: any) => `Lv${d.level}`);

    node.append("text")
      .attr("text-anchor", "middle").attr("dy", "2.4em")
      .attr("fill", "#64748B").attr("font-size", "9px")
      .text((d: any) => d.name.length > 6 ? d.name.slice(0, 5) + "…" : d.name);

    sim.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { sim.stop(); };
  }, [nodes, links]);

  return (
    <svg ref={svgRef} className="w-full h-64 rounded-xl bg-slate-50 dark:bg-slate-900/50" aria-label="技能依赖关系图" />
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SkillTree() {
  const { skills, setSkills } = useStore();

  useEffect(() => {
    api.get<{ skills: SkillDef[] }>("/api/skills")
      .then((r) => setSkills(r.skills))
      .catch(() => {});
  }, [setSkills]);

  const grouped = useMemo(() => {
    const map: Record<string, SkillDef[]> = {};
    for (const sk of skills) {
      (map[sk.category] ??= []).push(sk);
    }
    return map;
  }, [skills]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h2 className="font-heading text-2xl text-slate-800 dark:text-slate-100">技能树</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">通过完成任务和文献阅读提升技能等级</p>
        </div>

        {/* D3 dependency graph */}
        {skills.length > 0 && (
          <div className="mb-6 bg-white dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">依赖关系</p>
            <DependencyGraph skills={skills} />
          </div>
        )}

        {/* Skill cards by category */}
        {Object.entries(grouped).map(([cat, catSkills]) => {
          const meta = CATEGORY_META[cat] ?? { label: cat, color: "text-slate-500", ring: "#6366F1" };
          return (
            <div key={cat} className="mb-6">
              <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${meta.color}`}>
                {meta.label}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {catSkills.map((sk) => <SkillCard key={sk.id} skill={sk} />)}
              </div>
            </div>
          );
        })}

        {skills.length === 0 && (
          <div className="flex items-center justify-center h-40 text-slate-400 dark:text-slate-500 text-sm">
            加载技能树…
          </div>
        )}
      </div>
    </div>
  );
}
