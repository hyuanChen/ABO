import { BookOpen, Map, Bot } from "lucide-react";
import { useStore } from "../core/store";

const TABS = [
  { id: "literature" as const, label: "文献库", Icon: BookOpen },
  { id: "mindmap" as const, label: "思维导图", Icon: Map },
  { id: "claude" as const, label: "Claude", Icon: Bot },
];

export default function MainContent() {
  const { activeTab, setActiveTab } = useStore();

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
      {/* Tab bar */}
      <nav
        aria-label="主功能区"
        className="flex gap-1 px-4 pt-3 pb-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? "page" : undefined}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset ${
              activeTab === id
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <EmptyState tab={activeTab} />
      </div>
    </main>
  );
}

function EmptyState({ tab }: { tab: string }) {
  const info: Record<string, { icon: React.ReactNode; title: string; desc: string }> = {
    literature: {
      icon: <BookOpen className="w-10 h-10 text-indigo-400" aria-hidden />,
      title: "文献吃透引擎",
      desc: "Phase 2 实现 — 导入 PDF/DOI，分级吃透文献，FTS 全文搜索",
    },
    mindmap: {
      icon: <Map className="w-10 h-10 text-emerald-400" aria-hidden />,
      title: "Idea 思维导图",
      desc: "Phase 4 实现 — React Flow 无限画布，A+B 创意撞击",
    },
    claude: {
      icon: <Bot className="w-10 h-10 text-violet-400" aria-hidden />,
      title: "Claude 面板",
      desc: "Phase 3 实现 — WebSocket 流式对话，快捷指令，上下文注入",
    },
  };

  const { icon, title, desc } = info[tab] ?? info.literature;

  return (
    <div className="flex flex-col items-center gap-4 text-center max-w-sm">
      <div className="w-20 h-20 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
        {icon}
      </div>
      <div>
        <h2 className="font-heading text-xl text-slate-700 dark:text-slate-200 mb-1">
          {title}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{desc}</p>
      </div>
    </div>
  );
}
