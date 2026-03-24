import { BookOpen, Network, Bot } from "lucide-react";
import { useStore, ActiveTab } from "../core/store";
import Overview from "./overview/Overview";
import SkillTree from "./skilltree/SkillTree";

function PlaceholderSection({
  tab,
}: {
  tab: Exclude<ActiveTab, "overview" | "skilltree">;
}) {
  const INFO = {
    literature: {
      Icon: BookOpen,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10 dark:bg-indigo-500/15",
      title: "文献吃透引擎",
      desc: "Phase 2 实现 — 导入 PDF / DOI，分级吃透文献（Lv.0-4），全文检索",
    },
    mindmap: {
      Icon: Network,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      title: "Idea 思维导图",
      desc: "Phase 4 实现 — React Flow 无限画布，A+B 创意撞击，canvas JSON 持久化",
    },
    claude: {
      Icon: Bot,
      color: "text-violet-400",
      bg: "bg-violet-500/10 dark:bg-violet-500/15",
      title: "Claude 面板",
      desc: "Phase 3 实现 — WebSocket 流式对话，快捷指令，上下文自动注入",
    },
  } satisfies Record<string, { Icon: React.ElementType; color: string; bg: string; title: string; desc: string }>;

  const { Icon, color, bg, title, desc } = INFO[tab];

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-5 text-center max-w-sm">
        <div className={`w-20 h-20 rounded-2xl ${bg} flex items-center justify-center`}>
          <Icon className={`w-9 h-9 ${color}`} aria-hidden />
        </div>
        <div>
          <h2 className="font-heading text-xl text-slate-700 dark:text-slate-200 mb-2">
            {title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {desc}
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden />
          <span className="text-xs text-slate-500 dark:text-slate-400">即将推出</span>
        </div>
      </div>
    </div>
  );
}

export default function MainContent() {
  const activeTab = useStore((s) => s.activeTab);

  return (
    <main className="flex-1 min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {activeTab === "overview"   && <Overview />}
      {activeTab === "skilltree"  && <SkillTree />}
      {activeTab === "literature" && <PlaceholderSection tab="literature" />}
      {activeTab === "mindmap"    && <PlaceholderSection tab="mindmap" />}
      {activeTab === "claude"     && <PlaceholderSection tab="claude" />}
    </main>
  );
}
