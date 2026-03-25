import { Rss, Calendar, Star } from "lucide-react";

export default function ArxivTracker() {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      <div className="shrink-0 flex items-center gap-3 px-6 h-14 border-b border-slate-200 dark:border-slate-800">
        <Rss className="w-5 h-5 text-orange-500" aria-hidden />
        <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">ArXiv 追踪器</h1>
        <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/40">
          Phase 6
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
          <Rss className="w-8 h-8 text-orange-500" aria-hidden />
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            ArXiv 自动追踪
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            订阅关键词和 arXiv 分类（如 cs.LG、cs.CV），每天定时自动爬取新论文，
            调用 Claude 生成摘要和相关性评分，高相关论文自动写入 Literature/ 目录。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
          {[
            { Icon: Calendar, label: "每日 06:00 自动执行" },
            { Icon: Star,     label: "Claude 相关性评分" },
            { Icon: Rss,      label: "多关键词订阅" },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <Icon className="w-5 h-5 text-slate-400" aria-hidden />
              <span className="text-xs text-slate-500 dark:text-slate-400 text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
