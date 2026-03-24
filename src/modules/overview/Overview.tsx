import { Zap, CheckSquare, Square, Trophy, TrendingUp } from "lucide-react";
import { useStore, GameState } from "../../core/store";

function energyColor(pct: number) {
  if (pct >= 80) return { bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", label: "高效模式" };
  if (pct >= 50) return { bar: "bg-indigo-500", badge: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", label: "正常模式" };
  if (pct >= 20) return { bar: "bg-amber-500", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "疲惫模式" };
  return { bar: "bg-red-500", badge: "bg-red-500/15 text-red-600 dark:text-red-400", label: "耗尽状态" };
}

const PLACEHOLDER_TASKS = [
  { id: 1, label: "阅读 Vaswani 2017", done: true },
  { id: 2, label: "写实验报告", done: false },
  { id: 3, label: "组会准备", done: false },
];

const PLACEHOLDER_SKILLS = [
  { label: "文献阅读", pct: 67, color: "bg-indigo-500 dark:bg-indigo-400" },
  { label: "批判性思维", pct: 34, color: "bg-violet-500 dark:bg-violet-400" },
  { label: "创意联想", pct: 18, color: "bg-amber-500 dark:bg-amber-400" },
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm backdrop-blur-sm p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
      {children}
    </p>
  );
}

export default function Overview() {
  const gameState = useStore((s) => s.gameState);
  const gs: GameState = gameState ?? {
    energy: { current: 100, max: 100, lastUpdated: "", log: [] },
    skills: {},
    achievements: [],
    level: 1,
    title: "初入江湖",
  };

  const energyPct = Math.min(100, Math.round((gs.energy.current / gs.energy.max) * 100));
  const ec = energyColor(energyPct);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Page header */}
        <div className="mb-6">
          <h2 className="font-heading text-2xl text-slate-800 dark:text-slate-100">
            今日总览
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Lv.{gs.level} · {gs.title}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* ── Energy card ─────────────────────────────────── */}
          <Card className="md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" aria-hidden />
                </div>
                <SectionLabel>精力值</SectionLabel>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ec.badge}`}>
                {ec.label}
              </span>
            </div>

            <div className="flex items-end gap-3 mb-3">
              <span className="font-heading text-4xl font-bold text-slate-800 dark:text-slate-100 leading-none">
                {gs.energy.current}
              </span>
              <span className="text-slate-400 dark:text-slate-500 text-lg mb-0.5">
                / {gs.energy.max}
              </span>
            </div>

            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${ec.bar}`}
                style={{ width: `${energyPct}%` }}
                role="progressbar"
                aria-valuenow={gs.energy.current}
                aria-valuemin={0}
                aria-valuemax={gs.energy.max}
                aria-label="精力值进度"
              />
            </div>
          </Card>

          {/* ── Today's tasks ─────────────────────────────────── */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
                <CheckSquare className="w-4 h-4 text-indigo-500 dark:text-indigo-400" aria-hidden />
              </div>
              <SectionLabel>今日任务</SectionLabel>
            </div>

            <ul className="flex flex-col gap-2.5">
              {PLACEHOLDER_TASKS.map((t) => (
                <li key={t.id} className="flex items-center gap-3 group cursor-pointer">
                  {t.done ? (
                    <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden />
                  ) : (
                    <Square className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 group-hover:text-slate-400 transition-colors" aria-hidden />
                  )}
                  <span className={`text-sm ${
                    t.done
                      ? "line-through text-slate-400 dark:text-slate-600"
                      : "text-slate-700 dark:text-slate-300"
                  }`}>
                    {t.label}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
              <span className="text-xs text-slate-400">
                {PLACEHOLDER_TASKS.filter(t => t.done).length}/{PLACEHOLDER_TASKS.length} 完成
              </span>
            </div>
          </Card>

          {/* ── Skill progress ────────────────────────────────── */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-violet-500 dark:text-violet-400" aria-hidden />
              </div>
              <SectionLabel>技能进度</SectionLabel>
            </div>

            <ul className="flex flex-col gap-4">
              {PLACEHOLDER_SKILLS.map((sk) => (
                <li key={sk.label}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{sk.label}</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">{sk.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${sk.color}`}
                      style={{ width: `${sk.pct}%` }}
                      role="progressbar"
                      aria-valuenow={sk.pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${sk.label} 进度`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* ── Recent achievement ─────────────────────────────── */}
          <Card className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-amber-500 dark:text-amber-400" aria-hidden />
              </div>
              <SectionLabel>最近成就</SectionLabel>
            </div>
            <div className="flex gap-3 flex-wrap">
              {["初窥门径", "勤奋学者"].map((badge) => (
                <div
                  key={badge}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40"
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" aria-hidden />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    {badge}
                  </span>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
