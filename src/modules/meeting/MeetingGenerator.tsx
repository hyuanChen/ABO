import { MonitorPlay, FileText, Presentation } from "lucide-react";

export default function MeetingGenerator() {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      <div className="shrink-0 flex items-center gap-3 px-6 h-14 border-b border-slate-200 dark:border-slate-800">
        <MonitorPlay className="w-5 h-5 text-indigo-500" aria-hidden />
        <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">组会生成器</h1>
        <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/40">
          Phase 7
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <MonitorPlay className="w-8 h-8 text-indigo-500" aria-hidden />
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            一键生成组会汇报
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            从 Vault 选择文献笔记和想法作为素材，Claude 分析并生成结构化大纲，
            渲染为精美交互式 HTML 网页或标准 PPTX 文件，保存到 Meetings/ 目录。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          {[
            { Icon: FileText,      label: "HTML 交互汇报页" },
            { Icon: Presentation,  label: "PPTX 幻灯片" },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <Icon className="w-6 h-6 text-slate-400" aria-hidden />
              <span className="text-xs text-slate-500 dark:text-slate-400 text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
