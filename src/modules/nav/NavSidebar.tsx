import { useStore, ActiveTab } from "../../core/store";
import PixelAvatar from "../profile/PixelAvatar";
import {
  Inbox, BookOpen, Lightbulb, MessageSquare,
  Rss, Presentation, Heart, Headphones, TrendingUp,
  Settings, Zap, User,
} from "lucide-react";

type NavItem = { id: ActiveTab; label: string; Icon: React.FC<{ className?: string; "aria-hidden"?: boolean }> };

const MAIN: NavItem[] = [
  { id: "profile",    label: "角色",   Icon: User },
  { id: "overview",   label: "今日",   Icon: Inbox },
  { id: "literature", label: "文献库", Icon: BookOpen },
  { id: "ideas",      label: "Idea",   Icon: Lightbulb },
  { id: "claude",     label: "Claude", Icon: MessageSquare },
];

const AUTO: NavItem[] = [
  { id: "arxiv",   label: "arXiv",  Icon: Rss },
  { id: "meeting", label: "组会",   Icon: Presentation },
  { id: "health",  label: "健康",   Icon: Heart },
  { id: "podcast", label: "播客",   Icon: Headphones },
  { id: "trends",  label: "Trends", Icon: TrendingUp },
];

export default function NavSidebar() {
  const {
    activeTab, setActiveTab,
    unreadCounts, config,
    profileEnergy, profileSan, profileMotto,
  } = useStore();
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const vaultOk = Boolean(config?.vault_path);

  function NavBtn({ id, label, Icon }: NavItem) {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm
          transition-colors duration-150 cursor-pointer
          ${active
            ? "bg-slate-700 text-white"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">{label}</span>
        {id === "overview" && totalUnread > 0 && (
          <span className="text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5 leading-none">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <nav className="w-48 shrink-0 h-full bg-slate-900 flex flex-col py-4 px-3 gap-1">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 mb-3">
        <Zap className="w-5 h-5 text-indigo-400" aria-hidden />
        <span className="text-lg text-white font-semibold">ABO</span>
        <span className="text-xs text-slate-600 ml-auto">v1.0</span>
      </div>

      {/* Top summary card */}
      <button
        onClick={() => setActiveTab("profile")}
        className="flex items-center gap-2.5 w-full px-2 py-2.5 rounded-xl
          bg-slate-800 hover:bg-slate-700 transition-colors duration-150 cursor-pointer mb-2"
        aria-label="打开角色主页"
      >
        <div className="shrink-0">
          <PixelAvatar san={profileSan / 10} energy={profileEnergy} size={3} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Energy bar */}
          <div className="flex items-center gap-1 mb-1">
            <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${profileEnergy}%`,
                  backgroundColor:
                    profileEnergy >= 70 ? "#10B981"
                    : profileEnergy >= 40 ? "#F59E0B"
                    : "#EF4444",
                }}
              />
            </div>
            <span className="text-xs text-slate-500">{profileEnergy}%</span>
          </div>
          {/* Motto */}
          <p className="text-xs text-slate-400 truncate leading-tight">
            {profileMotto || "开始记录，见证成长"}
          </p>
        </div>
      </button>

      {/* Main nav */}
      {MAIN.map((item) => <NavBtn key={item.id} {...item} />)}

      {/* 自动化分组 */}
      <div className="mt-3 mb-1 px-3">
        <span className="text-xs text-slate-600 uppercase tracking-wider">自动化</span>
      </div>
      {AUTO.map((item) => <NavBtn key={item.id} {...item} />)}

      {/* 底部 */}
      <div className="mt-auto">
        <div className={`flex items-center gap-1.5 px-3 py-1 mb-2 text-xs
          ${vaultOk ? "text-emerald-500" : "text-amber-500"}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${vaultOk ? "bg-emerald-500" : "bg-amber-500"}`} />
          {vaultOk ? "Vault 已连接" : "请配置 Vault"}
        </div>
        <NavBtn id="settings" label="设置" Icon={Settings} />
      </div>
    </nav>
  );
}
