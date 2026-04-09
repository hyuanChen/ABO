import { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Info,
  Moon,
  Sun,
  Keyboard,
  Palette,
  Zap,
  ChevronRight,
  Rss,
  Copy,
  Check,
  Bug,
  Database,
  Plus,
  Trash2,
  Loader2,
  Eye,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card } from "../../components/Layout";
import { api } from "../../core/api";
import { useStore } from "../../core/store";

// ── Types ─────────────────────────────────────────────────────────────────────

type SettingsTab = "general" | "developer" | "about";

interface SettingItemProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

// ── Components ────────────────────────────────────────────────────────────────

function SettingItem({ icon, title, description, children, onClick }: SettingItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "16px 20px",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-card)",
        border: "1px solid var(--border-light)",
        transition: "all 0.3s ease",
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translateX(4px)";
          e.currentTarget.style.borderColor = "var(--color-primary-light)";
          e.currentTarget.style.boxShadow = "var(--shadow-soft)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateX(0)";
        e.currentTarget.style.borderColor = "var(--border-light)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "var(--radius-md)",
          background: "linear-gradient(135deg, rgba(188, 164, 227, 0.15), rgba(255, 183, 178, 0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-primary)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)", marginBottom: description ? "4px" : 0 }}>
          {title}
        </h4>
        {description && (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{description}</p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        position: "relative",
        width: "48px",
        height: "26px",
        borderRadius: "var(--radius-full)",
        background: enabled
          ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
          : "var(--bg-hover)",
        border: "none",
        cursor: "pointer",
        transition: "all 0.3s ease",
        boxShadow: enabled ? "0 2px 8px rgba(188, 164, 227, 0.4)" : "inset 0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "3px",
          left: enabled ? "25px" : "3px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          transition: "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
    </button>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "14px 18px",
        borderRadius: "var(--radius-lg)",
        background: active ? "var(--bg-card)" : "transparent",
        border: active ? "1px solid var(--border-light)" : "1px solid transparent",
        color: active ? "var(--color-primary)" : "var(--text-secondary)",
        fontSize: "0.9375rem",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        boxShadow: active ? "var(--shadow-soft)" : "none",
        transform: active ? "scale(1.02)" : "scale(1)",
      }}
    >
      {icon}
      {label}
      {active && (
        <ChevronRight
          style={{ width: "16px", height: "16px", marginLeft: "auto", opacity: 0.6 }}
        />
      )}
    </button>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

interface RSSConfig {
  enabled: boolean;
  title: string;
  description: string;
  max_items: number;
  feed_url: string;
}

function RSSSection() {
  const [config, setConfig] = useState<RSSConfig>({
    enabled: false,
    title: "ABO Intelligence Feed",
    description: "Aggregated intelligence from ABO modules",
    max_items: 50,
    feed_url: "",
  });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { addToast } = useStore();

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      const data = await api.get<RSSConfig>("/api/rss/config");
      setConfig(data);
    } catch (e) {
      console.error("Failed to load RSS config:", e);
      addToast({ kind: "error", title: "加载 RSS 配置失败" });
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(updates: Partial<RSSConfig>) {
    try {
      const newConfig = { ...config, ...updates };
      const data = await api.post<RSSConfig>("/api/rss/config", newConfig);
      setConfig(data);
      addToast({ kind: "success", title: "RSS 配置已保存" });
    } catch (e) {
      console.error("Failed to save RSS config:", e);
      addToast({ kind: "error", title: "保存 RSS 配置失败" });
    }
  }

  function copyFeedUrl() {
    if (config.feed_url) {
      navigator.clipboard.writeText(config.feed_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast({ kind: "success", title: "订阅链接已复制" });
    }
  }

  if (loading) {
    return (
      <Card title="RSS 订阅" icon={<Rss style={{ width: "18px", height: "18px" }} />}>
        <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
          加载中...
        </div>
      </Card>
    );
  }

  return (
    <Card title="RSS 订阅" icon={<Rss style={{ width: "18px", height: "18px" }} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Enable Toggle */}
        <SettingItem
          icon={<Rss style={{ width: "20px", height: "20px" }} />}
          title="启用 RSS Feed"
          description={config.enabled ? "外部可以通过 RSS 订阅你的情报" : "RSS feed 当前未启用"}
        >
          <Toggle
            enabled={config.enabled}
            onToggle={() => saveConfig({ enabled: !config.enabled })}
          />
        </SettingItem>

        {config.enabled && (
          <>
            {/* Feed URL */}
            <SettingItem
              icon={<Copy style={{ width: "20px", height: "20px" }} />}
              title="订阅链接"
              description="复制此链接到 RSS 阅读器"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <code
                  style={{
                    padding: "6px 12px",
                    background: "var(--bg-hover)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    color: "var(--text-secondary)",
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {config.feed_url || "未启用"}
                </code>
                <button
                  onClick={copyFeedUrl}
                  disabled={!config.feed_url}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-card)",
                    cursor: config.feed_url ? "pointer" : "not-allowed",
                    opacity: config.feed_url ? 1 : 0.5,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {copied ? (
                    <>
                      <Check style={{ width: "14px", height: "14px" }} />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy style={{ width: "14px", height: "14px" }} />
                      复制
                    </>
                  )}
                </button>
              </div>
            </SettingItem>

            {/* Title Input */}
            <SettingItem
              icon={<span style={{ fontSize: "16px" }}>T</span>}
              title="Feed 标题"
              description="RSS feed 的标题"
            >
              <input
                type="text"
                value={config.title}
                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                onBlur={() => saveConfig({ title: config.title })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  width: "200px",
                }}
              />
            </SettingItem>

            {/* Description Input */}
            <SettingItem
              icon={<span style={{ fontSize: "16px" }}>D</span>}
              title="Feed 描述"
              description="RSS feed 的描述"
            >
              <input
                type="text"
                value={config.description}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                onBlur={() => saveConfig({ description: config.description })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  width: "280px",
                }}
              />
            </SettingItem>

            {/* Max Items */}
            <SettingItem
              icon={<span style={{ fontSize: "16px" }}>#</span>}
              title="最大条目数"
              description="Feed 中最多显示的条目数量 (10-200)"
            >
              <input
                type="number"
                min={10}
                max={200}
                value={config.max_items}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 50;
                  setConfig({ ...config, max_items: val });
                }}
                onBlur={() => saveConfig({ max_items: config.max_items })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  width: "80px",
                }}
              />
            </SettingItem>
          </>
        )}
      </div>
    </Card>
  );
}

function GeneralSection() {
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const [demoMode, setDemoMode] = useState(false);
  const { addToast } = useStore();

  // Load demo mode state from config
  useEffect(() => {
    api.get<Record<string, unknown>>("/api/config").then((cfg) => {
      setDemoMode(Boolean(cfg.demo_mode));
    }).catch(() => {});
  }, []);

  async function toggleDemoMode() {
    const newVal = !demoMode;
    try {
      await api.post("/api/config", { demo_mode: newVal });
      setDemoMode(newVal);
      addToast({
        kind: "success",
        title: newVal ? "展示模式已开启" : "展示模式已关闭",
        message: newVal ? "正在展示预设的人设数据" : "已切换回真实数据",
      });
      // Reload the page to refresh all data
      setTimeout(() => window.location.reload(), 500);
    } catch {
      addToast({ kind: "error", title: "切换失败" });
    }
  }

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("abo-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const shortcuts = [
    { label: "角色主页", shortcut: "⌘1" },
    { label: "今日情报", shortcut: "⌘2" },
    { label: "情报库", shortcut: "⌘3" },
    { label: "文献库", shortcut: "⌘4" },
    { label: "知识库", shortcut: "⌘5" },
    { label: "手记", shortcut: "⌘6" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Demo Mode */}
      <Card title="展示模式" icon={<Eye style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={<Eye style={{ width: "20px", height: "20px" }} />}
            title="展示模式"
            description={demoMode
              ? "正在展示预设的人设数据，用于宣传截图"
              : "关闭后使用真实数据，不会清空任何内容"
            }
          >
            <Toggle enabled={demoMode} onToggle={toggleDemoMode} />
          </SettingItem>
        </div>
      </Card>

      {/* Appearance */}
      <Card title="外观设置" icon={<Palette style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={darkMode ? <Moon style={{ width: "20px", height: "20px" }} /> : <Sun style={{ width: "20px", height: "20px" }} />}
            title="深色模式"
            description={darkMode ? "当前使用深色主题" : "当前使用浅色主题"}
          >
            <Toggle enabled={darkMode} onToggle={() => setDarkMode(!darkMode)} />
          </SettingItem>
        </div>
      </Card>

      {/* RSS Feed */}
      <RSSSection />

      {/* Keyboard Shortcuts */}
      <Card title="键盘快捷键" icon={<Keyboard style={{ width: "18px", height: "18px" }} />}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {shortcuts.map(({ label, shortcut }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
              }}
            >
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{label}</span>
              <kbd
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  color: "var(--text-muted)",
                  boxShadow: "0 2px 0 var(--border-light)",
                }}
              >
                {shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AboutSection() {
  const techStack = [
    { name: "Tauri", version: "2.x" },
    { name: "React", version: "19" },
    { name: "FastAPI", version: "latest" },
    { name: "Tailwind", version: "v4" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        {/* Logo */}
        <div
          style={{
            width: "80px",
            height: "80px",
            margin: "0 auto 24px",
            borderRadius: "var(--radius-xl)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 32px rgba(188, 164, 227, 0.4)",
          }}
        >
          <Zap style={{ width: "40px", height: "40px", color: "white" }} />
        </div>

        <h2
          style={{
            fontFamily: "'M PLUS Rounded 1c', sans-serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--text-main)",
            marginBottom: "8px",
          }}
        >
          ABO
        </h2>
        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
          Another Brain Odyssey
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Version 0.5.0 · Phase 5</p>
      </div>

      <Card title="关于" icon={<Info style={{ width: "18px", height: "18px" }} />}>
        <p
          style={{
            fontSize: "0.9375rem",
            color: "var(--text-secondary)",
            lineHeight: 1.8,
            textAlign: "center",
            padding: "8px 16px",
          }}
        >
          Obsidian 驱动的研究自动化伴侣。
          <br />
          本地优先，隐私保护，AI 赋能。
        </p>
      </Card>

      <Card title="技术栈" icon={<Zap style={{ width: "18px", height: "18px" }} />}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            justifyContent: "center",
          }}
        >
          {techStack.map(({ name, version }) => (
            <div
              key={name}
              style={{
                padding: "10px 18px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                {name}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--bg-card)",
                }}
              >
                {version}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ textAlign: "center", padding: "20px" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Built with ❤️ for researchers
        </p>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  loadingText,
  label,
  icon,
  variant = "primary",
}: {
  onClick: () => void;
  loading: boolean;
  loadingText: string;
  label: string;
  icon: React.ReactNode;
  variant?: "primary" | "danger";
}) {
  const styles =
    variant === "danger"
      ? {
          border: "1px solid rgba(255, 100, 100, 0.3)",
          background: "rgba(255, 100, 100, 0.1)",
          color: "#E85D5D",
        }
      : {
          border: "none",
          background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
          color: "white",
        };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 16px",
        borderRadius: "var(--radius-md)",
        fontSize: "0.8125rem",
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
        transition: "all 0.2s ease",
        ...styles,
      }}
    >
      {loading ? (
        <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
      ) : (
        icon
      )}
      {loading ? loadingText : label}
    </button>
  );
}

function DeveloperSection() {
  const [seedCount, setSeedCount] = useState(52);
  const [seedingCards, setSeedingCards] = useState(false);
  const [seedingAll, setSeedingAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { addToast } = useStore();

  async function handleSeedCards() {
    setSeedingCards(true);
    try {
      const r = await api.post<{ ok: boolean; inserted: number }>("/api/debug/seed-cards", { count: seedCount });
      addToast({ kind: "success", title: `已生成 ${r.inserted} 条演示卡片` });
    } catch {
      addToast({ kind: "error", title: "生成演示数据失败" });
    } finally {
      setSeedingCards(false);
    }
  }

  async function handleSeedAll() {
    setSeedingAll(true);
    try {
      const r = await api.post<{ ok: boolean; results: Record<string, unknown> }>("/api/debug/seed-all", { card_count: seedCount });
      const res = r.results;
      addToast({
        kind: "success",
        title: `已生成全部演示数据`,
        message: `卡片 ${res.cards} · 偏好 ${res.keyword_prefs} · 活动 ${res.activities} · 30天SAN/心情`,
      });
    } catch {
      addToast({ kind: "error", title: "生成演示数据失败" });
    } finally {
      setSeedingAll(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      const r = await api.delete<{ ok: boolean; deleted: number }>("/api/debug/cards");
      addToast({ kind: "success", title: `已清空 ${r.deleted} 条卡片` });
    } catch {
      addToast({ kind: "error", title: "清空数据失败" });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* One-click seed all */}
      <Card title="一键填充" icon={<Zap style={{ width: "18px", height: "18px" }} />}>
        <SettingItem
          icon={<Database style={{ width: "20px", height: "20px" }} />}
          title="生成全部演示数据"
          description="Feed 卡片 + 角色档案 + SAN/心情/精力历史 + 偏好 + 今日活动"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="number"
              min={1}
              max={200}
              value={seedCount}
              onChange={(e) => setSeedCount(Math.max(1, Math.min(200, parseInt(e.target.value) || 52)))}
              title="卡片数量"
              style={{
                width: "60px",
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                textAlign: "center",
              }}
            />
            <ActionButton
              onClick={handleSeedAll}
              loading={seedingAll}
              loadingText="生成中..."
              label="一键填充"
              icon={<Zap style={{ width: "14px", height: "14px" }} />}
            />
          </div>
        </SettingItem>
      </Card>

      {/* Fine-grained controls */}
      <Card title="精细控制" icon={<Database style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={<Plus style={{ width: "20px", height: "20px" }} />}
            title="仅生成 Feed 卡片"
            description={`向 Feed 追加 ${seedCount} 条模拟卡片 (7个模块均覆盖)`}
          >
            <ActionButton
              onClick={handleSeedCards}
              loading={seedingCards}
              loadingText="生成中..."
              label="生成卡片"
              icon={<Plus style={{ width: "14px", height: "14px" }} />}
            />
          </SettingItem>

          <SettingItem
            icon={<Trash2 style={{ width: "20px", height: "20px" }} />}
            title="清空所有卡片"
            description="删除 Feed 数据库中的全部卡片数据"
          >
            <ActionButton
              onClick={handleClear}
              loading={clearing}
              loadingText="清空中..."
              label="清空"
              icon={<Trash2 style={{ width: "14px", height: "14px" }} />}
              variant="danger"
            />
          </SettingItem>
        </div>
      </Card>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs = [
    { id: "general" as const, label: "通用", icon: <SettingsIcon style={{ width: "20px", height: "20px" }} /> },
    { id: "developer" as const, label: "开发调试", icon: <Bug style={{ width: "20px", height: "20px" }} /> },
    { id: "about" as const, label: "关于", icon: <Info style={{ width: "20px", height: "20px" }} /> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="设置"
        subtitle="自定义你的 ABO 体验"
        icon={SettingsIcon}
      />
      <PageContent maxWidth="1200px">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "48px",
            height: "100%",
          }}
        >
          {/* Sidebar Tabs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              height: "fit-content",
            }}
          >
            {tabs.map(({ id, label, icon }) => (
              <TabButton
                key={id}
                active={activeTab === id}
                onClick={() => setActiveTab(id)}
                icon={icon}
                label={label}
              />
            ))}
          </div>

          {/* Content Area */}
          <div style={{ minWidth: 0 }}>
            {activeTab === "general" && <GeneralSection />}
            {activeTab === "developer" && <DeveloperSection />}
            {activeTab === "about" && <AboutSection />}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
