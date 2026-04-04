import { useStore, ActiveTab } from "../../core/store";
import PixelAvatar from "../profile/PixelAvatar";
import {
  Inbox, BookOpen, FileText, MessageSquare,
  Rss, Heart, Settings, Zap, User, Menu, X, Moon, Sun, LayoutGrid, FolderOpen,
  ChevronDown, BookHeart
} from "lucide-react";
import { useState, useEffect } from "react";

type NavItem = { id: ActiveTab; label: string; Icon: React.FC<{ className?: string; "aria-hidden"?: boolean }> };

const MAIN: NavItem[] = [
  { id: "profile",    label: "角色主页",   Icon: User },
  { id: "overview",   label: "今日情报",   Icon: Inbox },
  { id: "vault",      label: "情报库",     Icon: FolderOpen },
  { id: "literature", label: "文献库",     Icon: BookOpen },
  { id: "journal",    label: "手记",       Icon: FileText },
  { id: "claude",     label: "Claude",     Icon: MessageSquare },
  { id: "chat",       label: "AI 对话",    Icon: MessageSquare },
];

export default function NavSidebar() {
  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const [modulesExpanded, setModulesExpanded] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) setIsOpen(false);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    // Sync with system preference on mount
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const hasStoredPreference = localStorage.getItem("abo-theme");
    if (!hasStoredPreference) {
      setIsDark(systemPrefersDark);
      document.documentElement.classList.toggle("dark", systemPrefersDark);
    }
  }, []);

  function toggleTheme() {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle("dark", newDark);
    localStorage.setItem("abo-theme", newDark ? "dark" : "light");
  }

  const {
    activeTab, setActiveTab,
    unreadCounts, config, feedModules,
    profileEnergy, profileSan, profileMotto,
    setModuleToConfigure,
  } = useStore();
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const vaultOk = Boolean(config?.vault_path);

  const getEnergyColor = (energy: number) => {
    if (energy >= 70) return "linear-gradient(135deg, #A8E6CF, #7DD3C0)";
    if (energy >= 40) return "linear-gradient(135deg, #FFE4B5, #F5C88C)";
    return "linear-gradient(135deg, #FFB7B2, #E89B96)";
  };

  function NavPill({ id, label, Icon }: NavItem) {
    const active = activeTab === id;
    return (
      <button
        onClick={() => {
          setActiveTab(id);
          if (isMobile) setIsOpen(false);
        }}
        style={{
          width: "100%",
          padding: "clamp(10px, 1.5vw, 12px) clamp(14px, 2vw, 16px)",
          borderRadius: "var(--radius-full)",
          background: active ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))" : "transparent",
          color: active ? "white" : "var(--text-secondary)",
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          border: active ? "none" : "1px solid transparent",
          boxShadow: active ? "0 4px 20px rgba(188, 164, 227, 0.4)" : "none",
          transform: active ? "scale(1.02)" : "scale(1)",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = "rgba(188, 164, 227, 0.1)";
            e.currentTarget.style.borderColor = "var(--border-color)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
          }
        }}
      >
        <div
          style={{
            width: "clamp(32px, 4vw, 36px)",
            height: "clamp(32px, 4vw, 36px)",
            borderRadius: "50%",
            background: active ? "rgba(255,255,255,0.2)" : "var(--bg-card)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: active ? "none" : "1px solid var(--border-light)",
            flexShrink: 0,
          }}
        >
          <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden />
        </div>

        <span style={{ fontWeight: 600, fontSize: "clamp(0.875rem, 1.2vw, 0.9375rem)", flex: 1, textAlign: "left" }}>
          {label}
        </span>

        {id === "overview" && totalUnread > 0 && (
          <span
            style={{
              background: "linear-gradient(135deg, #FFB7B2, #E89B96)",
              color: "white",
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: "var(--radius-full)",
              boxShadow: "0 2px 8px rgba(255, 183, 178, 0.4)",
              flexShrink: 0,
            }}
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
    );
  }

  function ModuleItem({ mod, isMobile, setIsOpen }: { mod: { id: string; name: string; enabled: boolean }; isMobile: boolean; setIsOpen: (v: boolean) => void }) {
    const unread = unreadCounts[mod.id] ?? 0;
    const { setModuleToConfigure, setActiveTab } = useStore();
    return (
      <button
        onClick={() => {
          const current = useStore.getState().moduleToConfigure;
          // If already on this module, force reset first to trigger change detection
          if (current === mod.id) {
            setModuleToConfigure(null);
            requestAnimationFrame(() => {
              setModuleToConfigure(mod.id);
            });
          } else {
            setModuleToConfigure(mod.id);
          }
          setActiveTab("modules");
          if (isMobile) setIsOpen(false);
        }}
        style={{
          width: "100%",
          padding: "10px 14px 10px 52px",
          borderRadius: "var(--radius-full)",
          background: "transparent",
          color: "var(--text-secondary)",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          border: "1px solid transparent",
          fontSize: "0.8125rem",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-hover)";
          e.currentTarget.style.color = "var(--text-main)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
      >
        <div
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: mod.enabled ? "#A8E6CF" : "var(--text-muted)",
            flexShrink: 0,
            boxShadow: mod.enabled ? "0 0 6px rgba(168, 230, 207, 0.6)" : "none",
          }}
        />
        <span style={{ flex: 1, textAlign: "left", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mod.name}
        </span>
        {unread > 0 && (
          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "var(--color-primary)",
              padding: "2px 8px",
              borderRadius: "var(--radius-full)",
              background: "rgba(188, 164, 227, 0.15)",
              flexShrink: 0,
            }}
          >
            {unread}
          </span>
        )}
      </button>
    );
  }

  const sidebarContent = (
    <>
      {/* Logo Section */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", padding: "0 8px", flexShrink: 0 }}>
        <div
          style={{
            width: "clamp(40px, 5vw, 44px)",
            height: "clamp(40px, 5vw, 44px)",
            borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(188, 164, 227, 0.35)",
            flexShrink: 0,
          }}
        >
          <Zap className="w-6 h-6 text-white" aria-hidden />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'M PLUS Rounded 1c', sans-serif",
              fontSize: "clamp(1.25rem, 2vw, 1.5rem)",
              fontWeight: 700,
              background: "linear-gradient(135deg, var(--color-primary-dark), var(--color-secondary))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            ABO
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 500 }}>
            Agent Boost OS
          </div>
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          style={{
            padding: "8px",
            borderRadius: "50%",
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.3s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-card)";
            e.currentTarget.style.transform = "scale(1)";
          }}
          title={isDark ? "切换浅色模式" : "切换深色模式"}
        >
          {isDark ? (
            <Sun className="w-4 h-4" style={{ color: "var(--color-warning)" }} />
          ) : (
            <Moon className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
          )}
        </button>

        {/* Close button for mobile */}
        {isMobile && (
          <button
            onClick={() => setIsOpen(false)}
            style={{ padding: "8px", borderRadius: "50%", background: "var(--bg-card)", flexShrink: 0 }}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Profile Summary Card */}
      <button
        onClick={() => {
          setActiveTab("profile");
          if (isMobile) setIsOpen(false);
        }}
        style={{
          background: "var(--bg-card)",
          backdropFilter: "blur(12px)",
          borderRadius: "var(--radius-md)",
          padding: "clamp(12px, 2vw, 16px)",
          border: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          cursor: "pointer",
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          marginBottom: "20px",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "var(--shadow-medium)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <div
          style={{
            position: "relative",
            padding: "3px",
            borderRadius: "50%",
            background: getEnergyColor(profileEnergy),
            flexShrink: 0,
          }}
        >
          <div style={{ background: "var(--bg-app)", borderRadius: "50%", padding: "2px" }}>
            <PixelAvatar san={profileSan / 10} energy={profileEnergy} size={3} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <div
              style={{
                flex: 1,
                height: "6px",
                background: "var(--bg-hover)",
                borderRadius: "var(--radius-full)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${profileEnergy}%`,
                  background: getEnergyColor(profileEnergy),
                  borderRadius: "var(--radius-full)",
                  transition: "width 0.7s ease",
                }}
              />
            </div>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>
              {profileEnergy}%
            </span>
          </div>

          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {profileMotto || "开始记录，见证成长"}
          </p>
        </div>
      </button>

      {/* Main Navigation */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
        {MAIN.map((item) => (
          <NavPill key={item.id} {...item} />
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "var(--border-light)", margin: "16px 8px", flexShrink: 0 }} />

      {/* Section Label */}
      <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 16px 8px", flexShrink: 0 }}>
        自动化模块
      </div>

      {/* Expandable Module Management */}
      <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
        {/* Module Management Header */}
        <button
          onClick={() => {
            setModuleToConfigure(null);  // Reset to list view
            setActiveTab("modules");
            if (isMobile) setIsOpen(false);
          }}
          style={{
            width: "100%",
            padding: "clamp(10px, 1.5vw, 12px) clamp(14px, 2vw, 16px)",
            borderRadius: "var(--radius-full)",
            background: activeTab === "modules"
              ? "linear-gradient(135deg, rgba(168, 230, 207, 0.4), rgba(168, 230, 207, 0.3))"
              : "linear-gradient(135deg, rgba(168, 230, 207, 0.2), rgba(168, 230, 207, 0.1))",
            color: "#5BA88C",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            border: activeTab === "modules" ? "1px solid rgba(168, 230, 207, 0.6)" : "1px solid rgba(168, 230, 207, 0.4)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            if (activeTab !== "modules") {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(168, 230, 207, 0.3), rgba(168, 230, 207, 0.2))";
            }
            e.currentTarget.style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            if (activeTab !== "modules") {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(168, 230, 207, 0.2), rgba(168, 230, 207, 0.1))";
            }
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <div
            style={{
              width: "clamp(32px, 4vw, 36px)",
              height: "clamp(32px, 4vw, 36px)",
              borderRadius: "50%",
              background: activeTab === "modules" ? "rgba(168, 230, 207, 0.4)" : "rgba(168, 230, 207, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <LayoutGrid className="w-[18px] h-[18px] shrink-0" style={{ color: "#5BA88C" }} aria-hidden />
          </div>
          <span style={{ fontWeight: 600, fontSize: "clamp(0.875rem, 1.2vw, 0.9375rem)", flex: 1, textAlign: "left" }}>
            模块管理
          </span>
          <div
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              setModulesExpanded(!modulesExpanded);
            }}
          >
            <ChevronDown
              className="w-5 h-5"
              style={{ color: "#5BA88C", transition: "transform 0.3s ease", transform: modulesExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </div>
        </button>

        {/* Expandable Module List */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            maxHeight: modulesExpanded ? "500px" : "0px",
            opacity: modulesExpanded ? 1 : 0,
            overflow: "hidden",
            transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            marginTop: modulesExpanded ? "8px" : "0px",
            paddingLeft: "4px",
          }}
        >
          {feedModules.map((mod) => (
            <ModuleItem key={mod.id} mod={mod} isMobile={isMobile} setIsOpen={setIsOpen} />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "var(--border-light)", margin: "16px 8px", flexShrink: 0 }} />

      {/* Section Label */}
      <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 16px 8px", flexShrink: 0 }}>
        主动工具
      </div>

      {/* Active Tools - arXiv & Health */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
        <button
          onClick={() => {
            setActiveTab("arxiv");
            if (isMobile) setIsOpen(false);
          }}
          style={{
            width: "100%",
            padding: "clamp(10px, 1.5vw, 12px) clamp(14px, 2vw, 16px)",
            borderRadius: "var(--radius-full)",
            background: activeTab === "arxiv"
              ? "linear-gradient(135deg, rgba(188, 164, 227, 0.25), rgba(188, 164, 227, 0.15))"
              : "linear-gradient(135deg, rgba(188, 164, 227, 0.15), rgba(188, 164, 227, 0.08))",
            color: "var(--color-primary-dark)",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            border: "1px solid rgba(188, 164, 227, 0.3)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            if (activeTab !== "arxiv") {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(188, 164, 227, 0.25), rgba(188, 164, 227, 0.15))";
            }
            e.currentTarget.style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            if (activeTab !== "arxiv") {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(188, 164, 227, 0.15), rgba(188, 164, 227, 0.08))";
            }
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <div
            style={{
              width: "clamp(32px, 4vw, 36px)",
              height: "clamp(32px, 4vw, 36px)",
              borderRadius: "50%",
              background: "rgba(188, 164, 227, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Rss className="w-[18px] h-[18px] shrink-0" style={{ color: "var(--color-primary-dark)" }} aria-hidden />
          </div>
          <span style={{ fontWeight: 600, fontSize: "clamp(0.875rem, 1.2vw, 0.9375rem)", flex: 1, textAlign: "left" }}>
            arXiv追踪
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("health");
            if (isMobile) setIsOpen(false);
          }}
          style={{
            width: "100%",
            padding: "clamp(10px, 1.5vw, 12px) clamp(14px, 2vw, 16px)",
            borderRadius: "var(--radius-full)",
            background: activeTab === "health"
              ? "linear-gradient(135deg, rgba(255, 183, 178, 0.3), rgba(255, 183, 178, 0.2))"
              : "linear-gradient(135deg, rgba(255, 183, 178, 0.2), rgba(255, 183, 178, 0.1))",
            color: "#D48984",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            border: "1px solid rgba(255, 183, 178, 0.4)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            if (activeTab !== "health") {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 183, 178, 0.3), rgba(255, 183, 178, 0.2))";
            }
            e.currentTarget.style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            if (activeTab !== "health") {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 183, 178, 0.2), rgba(255, 183, 178, 0.1))";
            }
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <div
            style={{
              width: "clamp(32px, 4vw, 36px)",
              height: "clamp(32px, 4vw, 36px)",
              borderRadius: "50%",
              background: "rgba(255, 183, 178, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Heart className="w-[18px] h-[18px] shrink-0" style={{ color: "#D48984" }} aria-hidden />
          </div>
          <span style={{ fontWeight: 600, fontSize: "clamp(0.875rem, 1.2vw, 0.9375rem)", flex: 1, textAlign: "left" }}>
            健康管理
          </span>
        </button>

        {/* Xiaohongshu Tool */}
        <button
          onClick={() => {
            setActiveTab("xiaohongshu");
            if (isMobile) setIsOpen(false);
          }}
          style={{
            width: "100%",
            padding: "clamp(10px, 1.5vw, 12px) clamp(14px, 2vw, 16px)",
            borderRadius: "var(--radius-full)",
            background: activeTab === "xiaohongshu"
              ? "linear-gradient(135deg, rgba(255, 107, 107, 0.3), rgba(255, 107, 107, 0.2))"
              : "linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(255, 107, 107, 0.1))",
            color: "#E85D5D",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            border: "1px solid rgba(255, 107, 107, 0.4)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            if (activeTab !== "xiaohongshu") {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 107, 107, 0.3), rgba(255, 107, 107, 0.2))";
            }
            e.currentTarget.style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            if (activeTab !== "xiaohongshu") {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(255, 107, 107, 0.1))";
            }
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <div
            style={{
              width: "clamp(32px, 4vw, 36px)",
              height: "clamp(32px, 4vw, 36px)",
              borderRadius: "50%",
              background: "rgba(255, 107, 107, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <BookHeart className="w-[18px] h-[18px] shrink-0" style={{ color: "#E85D5D" }} aria-hidden />
          </div>
          <span style={{ fontWeight: 600, fontSize: "clamp(0.875rem, 1.2vw, 0.9375rem)", flex: 1, textAlign: "left" }}>
            小红书工具
          </span>
        </button>
      </div>

      {/* Spacer to push bottom section down */}
      <div style={{ flex: 1, minHeight: "20px" }} />

      {/* Bottom Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            borderRadius: "var(--radius-full)",
            background: vaultOk ? "rgba(168, 230, 207, 0.15)" : "rgba(255, 183, 178, 0.15)",
            border: `1px solid ${vaultOk ? "rgba(168, 230, 207, 0.3)" : "rgba(255, 183, 178, 0.3)"}`,
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: vaultOk ? "#A8E6CF" : "#FFB7B2",
              boxShadow: vaultOk ? "0 0 8px rgba(168, 230, 207, 0.6)" : "0 0 8px rgba(255, 183, 178, 0.6)",
              animation: vaultOk ? "pulse-glow 2s infinite" : "none",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: vaultOk ? "#5BA88C" : "#D48984" }}>
            {vaultOk ? "库已连接" : "请配置情报库"}
          </span>
        </div>

        <NavPill id="settings" label="设置" Icon={Settings} />
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <nav
          style={{
            width: "clamp(240px, 22vw, 300px)",
            minWidth: "220px",
            maxWidth: "320px",
            height: "100vh",
            maxHeight: "100vh",
            background: "var(--bg-sidebar)",
            backdropFilter: "blur(24px) saturate(180%)",
            borderRight: "1px solid var(--border-color)",
            padding: "clamp(16px, 2vw, 24px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
            flexShrink: 0,
          }}
        >
          {/* Scrollable Content Area */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              gap: "8px",
              paddingRight: "4px",
              marginRight: "-4px",
            }}
          >
            {sidebarContent}
          </div>
        </nav>
      )}

      {/* Mobile Overlay */}
      {isMobile && isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 40,
            animation: "fadeIn 0.3s ease",
          }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      {isMobile && (
        <nav
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            width: "min(280px, 80vw)",
            maxHeight: "100vh",
            background: "var(--bg-sidebar)",
            backdropFilter: "blur(24px) saturate(180%)",
            borderRight: "1px solid var(--border-color)",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            zIndex: 50,
            transform: isOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            overflow: "hidden",
          }}
        >
          {/* Scrollable Content Area for Mobile */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              gap: "8px",
            }}
          >
            {sidebarContent}
          </div>
        </nav>
      )}

      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: "20px",
            left: "20px",
            zIndex: 30,
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
            boxShadow: "0 4px 20px rgba(188, 164, 227, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Menu className="w-6 h-6 text-white" />
        </button>
      )}
    </>
  );
}
