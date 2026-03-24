import { Sun, Moon, Trophy, BookOpen, CheckSquare, Square, Zap } from "lucide-react";
import { useStore, GameState } from "../../core/store";

function energyColor(current: number, max: number): string {
  const pct = (current / max) * 100;
  if (pct >= 80) return "bg-emerald-500 dark:bg-emerald-400";
  if (pct >= 50) return "bg-indigo-500 dark:bg-indigo-400";
  if (pct >= 20) return "bg-amber-500 dark:bg-amber-400";
  return "bg-red-500 dark:bg-red-400";
}

function energyLabel(current: number, max: number): string {
  const pct = (current / max) * 100;
  if (pct >= 80) return "高效模式";
  if (pct >= 50) return "正常模式";
  if (pct >= 20) return "疲惫模式";
  return "耗尽状态";
}

const PLACEHOLDER_TASKS = [
  { id: 1, label: "阅读 Vaswani 2017", done: true },
  { id: 2, label: "写实验报告", done: false },
  { id: 3, label: "组会准备", done: false },
];

const PLACEHOLDER_SKILLS = [
  { label: "文献阅读", pct: 67 },
  { label: "批判思维", pct: 34 },
];

export default function Sidebar() {
  const { gameState, darkMode, toggleDarkMode } = useStore();
  const gs: GameState = gameState ?? {
    energy: { current: 100, max: 100, lastUpdated: "", log: [] },
    skills: {},
    achievements: [],
    level: 1,
    title: "初入江湖",
  };

  const { current, max } = gs.energy;
  const energyPct = Math.round((current / max) * 100);

  return (
    <aside className="w-60 shrink-0 h-full flex flex-col bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-700">
      {/* ── Header: avatar + level/title ─────────────────────────── */}
      <div className="flex flex-col items-center gap-2 px-4 pt-6 pb-4">
        <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
          <BookOpen className="w-7 h-7 text-indigo-500 dark:text-indigo-400" aria-hidden />
        </div>
        <div className="text-center">
          <p className="font-heading text-base text-slate-800 dark:text-slate-100 leading-tight">
            Lv.{gs.level} {gs.title}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-4 px-4 pb-4">
        {/* ── Energy bar ───────────────────────────────────────────── */}
        <section aria-label="精力值">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" aria-hidden />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">精力值</span>
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-500">
              {current}/{max}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${energyColor(current, max)}`}
              style={{ width: `${energyPct}%` }}
              role="progressbar"
              aria-valuenow={current}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-label="精力值进度"
            />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            {energyLabel(current, max)}
          </p>
        </section>

        {/* ── Today's tasks ─────────────────────────────────────────── */}
        <section aria-label="今日任务">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
            今日任务
          </p>
          <ul className="flex flex-col gap-1.5">
            {PLACEHOLDER_TASKS.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                {t.done ? (
                  <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden />
                )}
                <span
                  className={`text-sm truncate ${
                    t.done
                      ? "line-through text-slate-400 dark:text-slate-600"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {t.label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Skill progress ────────────────────────────────────────── */}
        <section aria-label="活跃技能进度">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
            活跃技能
          </p>
          <ul className="flex flex-col gap-3">
            {PLACEHOLDER_SKILLS.map((sk) => (
              <li key={sk.label}>
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>{sk.label}</span>
                  <span>{sk.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 dark:bg-amber-400 transition-all duration-300"
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
        </section>

        {/* ── Recent achievement ─────────────────────────────────────── */}
        <section aria-label="最近成就">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
            最近成就
          </p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30">
            <Trophy className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" aria-hidden />
            <span className="text-sm text-amber-700 dark:text-amber-300 truncate">
              初窥门径
            </span>
          </div>
        </section>
      </div>

      {/* ── Footer: dark mode toggle ──────────────────────────────── */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={toggleDarkMode}
          aria-label={darkMode ? "切换到亮色模式" : "切换到暗色模式"}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {darkMode ? (
            <Sun className="w-4 h-4" aria-hidden />
          ) : (
            <Moon className="w-4 h-4" aria-hidden />
          )}
          {darkMode ? "亮色模式" : "暗色模式"}
        </button>
      </div>
    </aside>
  );
}
