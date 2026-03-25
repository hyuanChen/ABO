import { useEffect, useState } from "react";
import {
  CheckSquare, Square, Plus, X, Trash2,
  PenLine, Rss, Heart, TrendingUp, Clock,
} from "lucide-react";
import { api } from "../../core/api";
import { useStore, Task } from "../../core/store";

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

function ComingSoonCard({
  icon,
  label,
  description,
  phase,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  phase: string;
}) {
  return (
    <Card className="flex items-start gap-4 opacity-70">
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500">
            {phase}
          </span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">{description}</p>
      </div>
    </Card>
  );
}

export default function Overview() {
  const { tasks, setTasks } = useStore();
  const [newTask, setNewTask] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [journalContent, setJournalContent] = useState("");
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalDate, setJournalDate] = useState("");

  useEffect(() => {
    api.get<{ tasks: Task[] }>("/api/tasks/today").then((r) => setTasks(r.tasks)).catch(() => {});
  }, [setTasks]);

  useEffect(() => {
    api.get<{ date: string; content: string }>("/api/journal/today")
      .then((r) => { setJournalContent(r.content); setJournalDate(r.date); })
      .catch(() => {});
  }, []);

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
      await api.patch(`/api/tasks/${taskId}/complete`, {});
      const { tasks: updated } = await api.get<{ tasks: Task[] }>("/api/tasks/today");
      setTasks(updated);
    } catch { /* ignore */ }
  }

  async function handleDelete(taskId: string) {
    try {
      await api.delete(`/api/tasks/${taskId}`);
      setTasks(tasks.filter((t) => t.id !== taskId));
    } catch { /* ignore */ }
  }

  async function handleSaveJournal() {
    setJournalSaving(true);
    try {
      await api.post("/api/journal/today", { content: journalContent });
    } catch { /* ignore */ }
    finally { setJournalSaving(false); }
  }

  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  const doneTasks = tasks.filter((t) => t.done).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="font-heading text-2xl text-slate-800 dark:text-slate-100">今日</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{today}</p>
        </div>

        <div className="flex flex-col gap-4">

          {/* ── Tasks ──────────────────────────────────────────── */}
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

          {/* ── Journal ────────────────────────────────────────── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center">
                  <PenLine className="w-4 h-4 text-emerald-500" aria-hidden />
                </div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">今日日志</p>
              </div>
              {journalDate && (
                <span className="text-xs text-slate-400 dark:text-slate-500">{journalDate}</span>
              )}
            </div>
            <textarea
              value={journalContent}
              onChange={(e) => setJournalContent(e.target.value)}
              placeholder="记录今日进展、想法、计划…"
              rows={6}
              aria-label="今日日志内容"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none leading-relaxed"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleSaveJournal}
                disabled={journalSaving}
                className="px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {journalSaving ? "保存中…" : "保存日志"}
              </button>
            </div>
          </Card>

          {/* ── Upcoming automation features ───────────────────── */}
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 pt-2">
            即将推出
          </p>

          <ComingSoonCard
            icon={<Rss className="w-5 h-5 text-orange-500" />}
            label="ArXiv 每日推送"
            description="订阅关键词，每天自动爬取新论文并生成相关性评分和摘要，写入 Literature/ 目录。"
            phase="Phase 6"
          />
          <ComingSoonCard
            icon={<TrendingUp className="w-5 h-5 text-violet-500" />}
            label="趋势摘要"
            description="聚合 RSS / GitHub Trending 等来源，每日生成领域动态摘要，写入 Trends/ 目录。"
            phase="Phase 10"
          />
          <ComingSoonCard
            icon={<Heart className="w-5 h-5 text-rose-500" />}
            label="健康快速打卡"
            description="记录睡眠、运动、专注时段和心情，自动写入每日 Journal 并生成周趋势图。"
            phase="Phase 8"
          />
          <ComingSoonCard
            icon={<Clock className="w-5 h-5 text-indigo-500" />}
            label="调度中心"
            description="查看所有自动化任务的运行状态、下次执行时间和历史日志。"
            phase="Phase 6+"
          />

        </div>
      </div>
    </div>
  );
}
