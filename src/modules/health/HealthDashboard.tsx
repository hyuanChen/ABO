import { Heart, Moon, Dumbbell, Droplets, BarChart2 } from "lucide-react";

export default function HealthDashboard() {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      <div className="shrink-0 flex items-center gap-3 px-6 h-14 border-b border-slate-200 dark:border-slate-800">
        <Heart className="w-5 h-5 text-rose-500" aria-hidden />
        <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">健康管理</h1>
        <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800/40">
          Phase 8
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <Heart className="w-8 h-8 text-rose-500" aria-hidden />
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            健康数据追踪
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            每日快速记录睡眠、运动、专注时段和心情，数据自动写入 Journal/ 目录，
            并生成周 / 月趋势图，所有数据存储在你自己的 Vault 中。
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3 w-full max-w-sm">
          {[
            { Icon: Moon,      label: "睡眠" },
            { Icon: Dumbbell,  label: "运动" },
            { Icon: Droplets,  label: "饮水" },
            { Icon: BarChart2, label: "趋势图" },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <Icon className="w-5 h-5 text-slate-400" aria-hidden />
              <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
