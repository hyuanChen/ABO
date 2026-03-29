import { TrendingUp } from "lucide-react";
import ModulePanel from "../feed/ModulePanel";

export default function TrendTracker() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-500" aria-hidden />
          <h1 className="text-xl text-slate-800 dark:text-slate-100 font-semibold">Trend 追踪</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">聚合 RSS 和 GitHub Trending 生成日报</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <ModulePanel filterModuleId="rss-aggregator" />
      </div>
    </div>
  );
}
