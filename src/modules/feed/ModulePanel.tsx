import { useEffect } from "react";
import { Play, Terminal } from "lucide-react";
import { api } from "../../core/api";
import { useStore, FeedModule } from "../../core/store";

interface Props {
  filterModuleId?: string;
}

export default function ModulePanel({ filterModuleId }: Props) {
  const { feedModules, setFeedModules, unreadCounts } = useStore();

  useEffect(() => {
    api.get<{ modules: FeedModule[] }>("/api/modules")
      .then((r) => setFeedModules(r.modules))
      .catch(() => {});
  }, [setFeedModules]);

  const modules = filterModuleId
    ? feedModules.filter((m) => m.id === filterModuleId)
    : feedModules;

  async function runNow(moduleId: string) {
    await api.post(`/api/modules/${moduleId}/run`, {}).catch(() => {});
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl text-slate-800 dark:text-slate-100 font-semibold">模块管理</h2>
          <button
            onClick={() => alert(
              "在终端运行 Claude Code，告诉它：\n\n" +
              "「帮我写一个 ABO 模块，放在 ~/.abo/modules/ 目录下，描述你想要的功能」\n\n" +
              "ABO 会自动检测并加载新模块。"
            )}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500
                       hover:bg-indigo-600 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden />
            + 新建模块
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {modules.map((mod) => {
            const unread = unreadCounts[mod.id] ?? 0;
            return (
              <div
                key={mod.id}
                className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-800/60
                           border border-slate-200 dark:border-slate-700/60"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${mod.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{mod.name}</p>
                    {unread > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30
                                       text-indigo-600 dark:text-indigo-400">
                        {unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {mod.schedule}
                    {mod.next_run && ` · 下次：${new Date(mod.next_run).toLocaleString("zh-CN", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                    })}`}
                  </p>
                </div>
                <button
                  onClick={() => runNow(mod.id)}
                  aria-label={`立即运行 ${mod.name}`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500
                             hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4" aria-hidden />
                </button>
              </div>
            );
          })}

          {modules.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">
              加载模块中…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
