import { useEffect } from "react";
import {
  LayoutDashboard, BookOpen, Bot, Settings as SettingsIcon,
  Sun, Moon, Rss, MonitorPlay, Lightbulb, Heart, Mic, TrendingUp,
} from "lucide-react";
import { useStore, ActiveTab } from "../../core/store";

const NAV_ITEMS: { id: ActiveTab; label: string; Icon: React.ElementType }[] = [
  { id: "overview",   label: "今日",    Icon: LayoutDashboard },
  { id: "literature", label: "文献库",  Icon: BookOpen },
  { id: "ideas",      label: "Idea工坊", Icon: Lightbulb },
  { id: "claude",     label: "Claude",  Icon: Bot },
];

const AUTO_ITEMS: { id: ActiveTab; label: string; Icon: React.ElementType }[] = [
  { id: "arxiv",    label: "ArXiv",  Icon: Rss },
  { id: "meeting",  label: "组会",   Icon: MonitorPlay },
  { id: "health",   label: "健康",   Icon: Heart },
  { id: "podcast",  label: "播客",   Icon: Mic },
  { id: "trends",   label: "趋势",   Icon: TrendingUp },
];

const ALL_TABS: ActiveTab[] = [
  "overview", "literature", "ideas", "claude",
  "arxiv", "meeting", "health", "podcast", "trends", "settings",
];

export default function NavSidebar() {
  const { activeTab, setActiveTab, darkMode, toggleDarkMode, config } = useStore();

  // Keyboard shortcuts: Cmd+1 through Cmd+0
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < ALL_TABS.length) {
        e.preventDefault();
        setActiveTab(ALL_TABS[idx]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTab]);

  function NavButton({
    id, label, Icon, shortcutIdx,
  }: { id: ActiveTab; label: string; Icon: React.ElementType; shortcutIdx?: number }) {
    const active = activeTab === id;
    return (
      <button
        key={id}
        onClick={() => setActiveTab(id)}
        aria-current={active ? "page" : undefined}
        title={shortcutIdx !== undefined ? `${label} (⌘${shortcutIdx + 1})` : label}
        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 text-left ${
          active
            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent"
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <aside className="w-52 shrink-0 h-full flex flex-col bg-slate-900 border-r border-slate-700/60">
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        <h1 className="font-heading text-lg font-semibold text-white tracking-wide">ABO</h1>
        <p className="text-xs text-slate-500 -mt-0.5">Academic Buddy OS</p>
      </div>

      {/* ── Vault status ──────────────────────────────────────── */}
      {config?.vault_path && (
        <div className="mx-3 mb-3 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50">
          <p className="text-xs text-slate-500 truncate" title={config.vault_path}>
            <span className="text-emerald-500">●</span>{" "}
            {config.vault_path.split("/").pop()}
          </p>
        </div>
      )}

      {/* ── Main nav ──────────────────────────────────────────── */}
      <nav aria-label="主导航" className="flex-1 px-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, Icon }, i) => (
          <NavButton key={id} id={id} label={label} Icon={Icon} shortcutIdx={i} />
        ))}

        {/* Automation section */}
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 px-3 pt-4 pb-1.5">
          自动化
        </p>
        {AUTO_ITEMS.map(({ id, label, Icon }) => (
          <NavButton key={id} id={id} label={label} Icon={Icon} />
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────────────── */}
      <div className="px-3 pb-4 pt-2 border-t border-slate-700/60 mt-2 flex flex-col gap-0.5">
        <NavButton id="settings" label="设置" Icon={SettingsIcon} />
        <button
          onClick={toggleDarkMode}
          aria-label={darkMode ? "切换到亮色模式" : "切换到暗色模式"}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 border border-transparent"
        >
          {darkMode
            ? <Sun className="w-4 h-4 shrink-0" aria-hidden />
            : <Moon className="w-4 h-4 shrink-0" aria-hidden />
          }
          {darkMode ? "亮色模式" : "暗色模式"}
        </button>
      </div>
    </aside>
  );
}
