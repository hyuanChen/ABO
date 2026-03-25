import { TrendingUp, Rss, GitBranch, Newspaper } from "lucide-react";

export default function TrendTracker() {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      <div className="shrink-0 flex items-center gap-3 px-6 h-14 border-b border-slate-200 dark:border-slate-800">
        <TrendingUp className="w-5 h-5 text-violet-500" aria-hidden />
        <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">趋势追踪</h1>
        <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800/40">
          Phase 10
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-violet-500" aria-hidden />
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            每日 Trend 聚合
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            配置关键词和数据源（RSS Feed、GitHub Trending），每天自动聚合、
            去重，Claude 分析趋势并生成摘要报告，写入 Trends/ 目录。
            可一键将感兴趣的内容转化为 Idea 节点。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
          {[
            { Icon: Rss,       label: "RSS Feed" },
            { Icon: GitBranch, label: "GitHub Trending" },
            { Icon: Newspaper, label: "Claude 分析" },
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
