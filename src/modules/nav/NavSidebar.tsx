import { useEffect } from "react";
import {
  LayoutDashboard, BookOpen, Network, Bot,
  Sun, Moon, Zap, GitBranch, Star, Settings as SettingsIcon,
} from "lucide-react";
import { useStore, ActiveTab, GameState } from "../../core/store";

const NAV_ITEMS: { id: ActiveTab; label: string; Icon: React.ElementType }[] = [
  { id: "overview",   label: "总览",    Icon: LayoutDashboard },
  { id: "literature", label: "文献库",  Icon: BookOpen },
  { id: "skilltree",  label: "技能树",  Icon: GitBranch },
  { id: "mindmap",    label: "思维导图", Icon: Network },
  { id: "claude",     label: "Claude",  Icon: Bot },
  { id: "settings",   label: "设置",    Icon: SettingsIcon },
];

// XP thresholds (must match abo/game/state.py LEVEL_XP_THRESHOLDS)
const LEVEL_XP_THRESHOLDS = [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 12000, 18000, 30000];

function getLevelProgress(totalXp: number, level: number) {
  const lvIdx = Math.min(level - 1, LEVEL_XP_THRESHOLDS.length - 1);
  const current = LEVEL_XP_THRESHOLDS[lvIdx] ?? 0;
  const next = LEVEL_XP_THRESHOLDS[lvIdx + 1];
  if (next === undefined) return { xpInLevel: totalXp - current, xpForNext: 1, pct: 100 };
  const xpInLevel = Math.max(0, totalXp - current);
  const xpForNext = next - current;
  return { xpInLevel, xpForNext, pct: Math.min(100, Math.round((xpInLevel / xpForNext) * 100)) };
}

function energyBarColor(current: number, max: number) {
  const pct = (current / max) * 100;
  if (pct >= 80) return "bg-emerald-400";
  if (pct >= 50) return "bg-indigo-400";
  if (pct >= 20) return "bg-amber-400";
  return "bg-red-400";
}

export default function NavSidebar() {
  const { activeTab, setActiveTab, darkMode, toggleDarkMode, gameState } = useStore();

  const gs: GameState = gameState ?? {
    energy: { current: 100, max: 100, lastUpdated: "", log: [] },
    skills: {},
    achievements: [],
    level: 1,
    title: "初入江湖",
    total_xp: 0,
    stats: {
      tasks_completed_total: 0,
      papers_imported: 0,
      papers_digested_lv2_plus: 0,
      ab_collisions: 0,
      claude_sessions: 0,
      active_days: [],
      monthly_tasks: {},
    },
  };

  const energyPct = Math.min(100, Math.round((gs.energy.current / gs.energy.max) * 100));
  const { xpInLevel, xpForNext, pct: xpPct } = getLevelProgress(gs.total_xp, gs.level);

  // Keyboard shortcuts: Cmd+1 through Cmd+6
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey) return;
      const tabIds: ActiveTab[] = ["overview", "literature", "skilltree", "mindmap", "claude", "settings"];
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < tabIds.length) {
        e.preventDefault();
        setActiveTab(tabIds[idx]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTab]);

  return (
    <aside className="w-52 shrink-0 h-full flex flex-col bg-slate-900 border-r border-slate-700/60">
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-3">
        <h1 className="font-heading text-lg font-semibold text-white tracking-wide">
          ABO
        </h1>
        <p className="text-xs text-slate-500 -mt-0.5">Academic Buddy OS</p>
      </div>

      {/* ── User card ─────────────────────────────────────────── */}
      <div className="mx-3 mb-3 rounded-xl bg-slate-800/60 border border-slate-700/50 px-3 py-3">
        {/* Avatar + title */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="w-8 h-8 rounded-full bg-indigo-500/30 border border-indigo-500/50 flex items-center justify-center shrink-0">
            <span className="text-indigo-300 font-heading text-xs font-bold">
              {gs.level}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate">{gs.title}</p>
            <p className="text-xs text-slate-500">Lv.{gs.level}</p>
          </div>
        </div>

        {/* Mini energy bar */}
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" aria-hidden />
              <span className="text-xs text-slate-400">精力</span>
            </div>
            <span className="text-xs text-slate-500">
              {gs.energy.current}/{gs.energy.max}
            </span>
          </div>
          <div className="h-1 rounded-full bg-slate-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${energyBarColor(gs.energy.current, gs.energy.max)}`}
              style={{ width: `${energyPct}%` }}
              role="progressbar"
              aria-valuenow={gs.energy.current}
              aria-valuemin={0}
              aria-valuemax={gs.energy.max}
              aria-label="精力值"
            />
          </div>
        </div>

        {/* XP progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400" aria-hidden />
              <span className="text-xs text-slate-400">XP</span>
            </div>
            <span className="text-xs text-slate-500">
              {xpInLevel}/{xpForNext}
            </span>
          </div>
          <div className="h-1 rounded-full bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-amber-500"
              style={{ width: `${xpPct}%` }}
              role="progressbar"
              aria-valuenow={xpPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`等级 ${gs.level} 经验进度`}
            />
          </div>
        </div>
      </div>

      {/* ── Nav items ─────────────────────────────────────────── */}
      <nav aria-label="主导航" className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, Icon }, i) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={active ? "page" : undefined}
              title={`${label} (⌘${i + 1})`}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 text-left ${
                active
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden />
              {label}
            </button>
          );
        })}
      </nav>

      {/* ── Footer: dark mode toggle ──────────────────────────── */}
      <div className="px-3 pb-4 pt-2 border-t border-slate-700/60 mt-2">
        <button
          onClick={toggleDarkMode}
          aria-label={darkMode ? "切换到亮色模式" : "切换到暗色模式"}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 border border-transparent"
        >
          {darkMode
            ? <Sun className="w-4 h-4 shrink-0" aria-hidden />
            : <Moon className="w-4 h-4 shrink-0" aria-hidden />
          }
          {darkMode ? "亮色模式" : "暗色模式"}
        </button>
      </div>
    </aside>
  );
}
