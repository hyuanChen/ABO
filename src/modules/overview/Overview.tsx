import { useEffect, useState } from "react";
import {
  Zap, CheckSquare, Square, Trophy, TrendingUp,
  Plus, X, Trash2, Coffee, Dumbbell, Brain, Moon as MoonIcon, Bed,
} from "lucide-react";
import { api } from "../../core/api";
import { useStore, GameState, Task } from "../../core/store";

// ── helpers ──────────────────────────────────────────────────────────────────

function energyMeta(pct: number) {
  if (pct >= 80) return { bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", label: "高效模式 ×1.5 XP" };
  if (pct >= 50) return { bar: "bg-indigo-500",  badge: "bg-indigo-500/15  text-indigo-600  dark:text-indigo-300",  label: "正常模式 ×1.0 XP" };
  if (pct >= 20) return { bar: "bg-amber-500",   badge: "bg-amber-500/15   text-amber-600   dark:text-amber-300",   label: "疲惫模式 ×0.7 XP" };
  return            { bar: "bg-red-500",     badge: "bg-red-500/15     text-red-600     dark:text-red-300",     label: "耗尽状态 ×0.5 XP" };
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center">
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {children}
      </p>
    </div>
  );
}

// ── Energy recovery buttons ───────────────────────────────────────────────────

const RECOVERY_ACTIONS = [
  { type: "rest",       label: "午休",  delta: "+20", Icon: MoonIcon,  color: "text-indigo-500 dark:text-indigo-400" },
  { type: "exercise",   label: "运动",  delta: "+25", Icon: Dumbbell,  color: "text-emerald-500 dark:text-emerald-400" },
  { type: "meditation", label: "冥想",  delta: "+15", Icon: Brain,     color: "text-violet-500 dark:text-violet-400" },
  { type: "coffee",     label: "咖啡",  delta: "+15", Icon: Coffee,    color: "text-amber-500 dark:text-amber-400" },
  { type: "sleep",      label: "睡眠",  delta: "满",  Icon: Bed,       color: "text-slate-500 dark:text-slate-400" },
] as const;

// ── Main component ────────────────────────────────────────────────────────────

export default function Overview() {
  const { gameState, tasks, setGameState, setTasks } = useStore();
  const [energyLoading, setEnergyLoading] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const gs: GameState = gameState ?? {
    energy: { current: 100, max: 100, lastUpdated: "", log: [] },
    skills: {},
    achievements: [],
    level: 1,
    title: "初入江湖",
  };

  const energyPct = Math.min(100, Math.round((gs.energy.current / gs.energy.max) * 100));
  const em = energyMeta(energyPct);

  // Fetch tasks on mount
  useEffect(() => {
    api.get<{ tasks: Task[] }>("/api/tasks/today").then((r) => setTasks(r.tasks)).catch(() => {});
  }, [setTasks]);

  async function logEnergy(eventType: string) {
    setEnergyLoading(eventType);
    try {
      const updated = await api.post<GameState>("/api/energy/log", { event_type: eventType });
      setGameState(updated);
    } catch { /* ignore */ }
    finally { setEnergyLoading(null); }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    setAddingTask(true);
    try {
      const task = await api.post<Task>("/api/tasks", { label: newTask.trim(), xp: 20 });
      setTasks([...tasks, task]);
      setNewTask("");
      setShowAddForm(false);
    } catch { /* ignore */ }
    finally { setAddingTask(false); }
  }

  async function handleComplete(taskId: string) {
    try {
      await api.post(`/api/tasks/${taskId}/complete`, {});
      // Refresh tasks and game state
      const [tasksRes, stateRes] = await Promise.all([
        api.get<{ tasks: Task[] }>("/api/tasks/today"),
        api.get<GameState>("/api/game/state"),
      ]);
      setTasks(tasksRes.tasks);
      setGameState(stateRes);
    } catch { /* ignore */ }
  }

  async function handleDelete(taskId: string) {
    try {
      await api.delete(`/api/tasks/${taskId}`);
      setTasks(tasks.filter((t) => t.id !== taskId));
    } catch { /* ignore */ }
  }

  const doneTasks = tasks.filter((t) => t.done).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Page header */}
        <div className="mb-6">
          <h2 className="font-heading text-2xl text-slate-800 dark:text-slate-100">今日总览</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Lv.{gs.level} · {gs.title}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* ── Energy ───────────────────────────────────────────── */}
          <Card className="md:col-span-2">
            <SectionLabel icon={<Zap className="w-4 h-4 text-amber-500" />}>精力值</SectionLabel>

            <div className="flex items-end gap-3 mb-3">
              <span className="font-heading text-4xl font-bold text-slate-800 dark:text-slate-100 leading-none">
                {gs.energy.current}
              </span>
              <span className="text-slate-400 text-lg mb-0.5">/ {gs.energy.max}</span>
              <span className={`ml-auto text-xs px-2.5 py-1 rounded-full font-medium ${em.badge}`}>
                {em.label}
              </span>
            </div>

            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all duration-500 ${em.bar}`}
                style={{ width: `${energyPct}%` }}
                role="progressbar" aria-valuenow={gs.energy.current}
                aria-valuemin={0} aria-valuemax={gs.energy.max} aria-label="精力值"
              />
            </div>

            {/* Recovery buttons */}
            <div className="flex flex-wrap gap-2">
              {RECOVERY_ACTIONS.map(({ type, label, delta, Icon, color }) => (
                <button
                  key={type}
                  onClick={() => logEnergy(type)}
                  disabled={energyLoading !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/50 text-sm text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-white dark:hover:bg-slate-700 transition-all duration-150 cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {energyLoading === type
                    ? <span className="w-3.5 h-3.5 rounded-full border border-current border-t-transparent animate-spin" />
                    : <Icon className={`w-3.5 h-3.5 ${color}`} aria-hidden />
                  }
                  {label}
                  <span className="text-xs text-slate-400 dark:text-slate-500 ml-0.5">{delta}</span>
                </button>
              ))}
            </div>

            {/* Recent energy log */}
            {gs.energy.log.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">最近记录</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {gs.energy.log.slice(-5).reverse().map((entry, i) => (
                    <span key={i} className="text-xs text-slate-500 dark:text-slate-400">
                      {entry.time}&nbsp;
                      <span className={entry.delta >= 0 ? "text-emerald-500" : "text-red-400"}>
                        {entry.delta >= 0 ? "+" : ""}{entry.delta}
                      </span>
                      &nbsp;{entry.reason}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* ── Tasks ─────────────────────────────────────────────── */}
          <Card>
            <SectionLabel icon={<CheckSquare className="w-4 h-4 text-indigo-500" />}>今日任务</SectionLabel>

            <ul className="flex flex-col gap-2 mb-3">
              {tasks.length === 0 && (
                <li className="text-sm text-slate-400 dark:text-slate-500 py-2">暂无任务，添加一个吧</li>
              )}
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 group">
                  <button
                    onClick={() => !t.done && handleComplete(t.id)}
                    disabled={t.done}
                    aria-label={t.done ? "已完成" : "标记完成"}
                    className="shrink-0 cursor-pointer disabled:cursor-default focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                  >
                    {t.done
                      ? <CheckSquare className="w-4 h-4 text-emerald-500" aria-hidden />
                      : <Square className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors" aria-hidden />
                    }
                  </button>
                  <span className={`flex-1 text-sm ${t.done ? "line-through text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-300"}`}>
                    {t.label}
                  </span>
                  {!t.done && (
                    <span className="text-xs text-amber-500 dark:text-amber-400 shrink-0">{t.xp} XP</span>
                  )}
                  <button
                    onClick={() => handleDelete(t.id)}
                    aria-label="删除任务"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-slate-400 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>

            {/* Add task form */}
            {showAddForm ? (
              <form onSubmit={handleAddTask} className="flex gap-2 mt-1">
                <input
                  autoFocus
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="任务名称…"
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
                <button type="submit" disabled={addingTask}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 disabled:opacity-50 transition-colors cursor-pointer">
                  添加
                </button>
                <button type="button" onClick={() => { setShowAddForm(false); setNewTask(""); }}
                  aria-label="取消" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </form>
            ) : (
              <button onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                <Plus className="w-4 h-4" aria-hidden />
                添加任务
              </button>
            )}

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
              <span className="text-xs text-slate-400">{doneTasks}/{tasks.length} 完成</span>
            </div>
          </Card>

          {/* ── Skill progress snapshot ───────────────────────────── */}
          <Card>
            <SectionLabel icon={<TrendingUp className="w-4 h-4 text-violet-500" />}>技能快照</SectionLabel>
            <SkillSnapshot />
          </Card>

          {/* ── Achievements ──────────────────────────────────────── */}
          <Card className="md:col-span-2">
            <SectionLabel icon={<Trophy className="w-4 h-4 text-amber-500" />}>最近成就</SectionLabel>
            {gs.achievements.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">完成任务和文献阅读以解锁成就</p>
            ) : (
              <div className="flex gap-3 flex-wrap">
                {gs.achievements.map((badge) => (
                  <div key={badge} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
                    <Trophy className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" aria-hidden />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">{badge}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
}

function SkillSnapshot() {
  const skills = useStore((s) => s.skills);
  const setSkills = useStore((s) => s.setSkills);

  useEffect(() => {
    api.get<{ skills: import("../../core/store").SkillDef[] }>("/api/skills")
      .then((r) => setSkills(r.skills))
      .catch(() => {});
  }, [setSkills]);

  const unlocked = skills.filter((s) => s.unlocked).slice(0, 4);
  if (unlocked.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">前往技能树查看详情</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {unlocked.map((sk) => {
        const pct = Math.round((sk.xp_in_level / sk.xp_for_next) * 100);
        return (
          <li key={sk.id}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">{sk.name}</span>
              <span className="text-xs text-slate-400">Lv.{sk.level}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div className="h-full rounded-full bg-amber-500 dark:bg-amber-400 transition-all duration-500"
                style={{ width: `${pct}%` }}
                role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                aria-label={`${sk.name} Lv.${sk.level} 进度`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
